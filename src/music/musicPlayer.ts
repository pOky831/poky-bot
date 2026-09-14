import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
  entersState,
  type VoiceConnection,
  type AudioPlayer,
} from "@discordjs/voice";
import { lookupTrack, openAudioStream, type AudioDownload } from "./ytdlp.js";
import type { Guild, VoiceChannel, TextChannel } from "discord.js";

// ── Types ──

export interface Track {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  requestedBy: string;
  requestedByTag: string;
}

export interface GuildMusicState {
  queue: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;
  loopMode: "off" | "track" | "queue";
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  textChannelId: string | null;
  connection: VoiceConnection | null;
  player: AudioPlayer | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Running yt-dlp process, killed on skip/stop so it does not keep going. */
  download: AudioDownload | null;
  /** Guards against silently grinding through a queue of broken tracks. */
  consecutiveFailures: number;
}

export interface MusicStatus {
  currentTrack: Track | null;
  queue: Track[];
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;
  loopMode: string;
  voiceChannelName: string | null;
}

// ── Manager ──

class MusicManager {
  private guilds = new Map<string, GuildMusicState>();
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes idle before disconnect

  private getOrCreate(guildId: string): GuildMusicState {
    if (!this.guilds.has(guildId)) {
      this.guilds.set(guildId, {
        queue: [],
        currentTrack: null,
        isPlaying: false,
        isPaused: false,
        volume: 50,
        loopMode: "off",
        voiceChannelId: null,
        voiceChannelName: null,
        textChannelId: null,
        connection: null,
        player: null,
        idleTimer: null,
        download: null,
        consecutiveFailures: 0,
      });
    }
    return this.guilds.get(guildId)!;
  }

  getStatus(guildId: string): MusicStatus {
    const state = this.getOrCreate(guildId);
    return {
      currentTrack: state.currentTrack,
      queue: state.queue,
      isPlaying: state.isPlaying,
      isPaused: state.isPaused,
      volume: state.volume,
      loopMode: state.loopMode,
      voiceChannelName: state.voiceChannelName,
    };
  }

  getQueue(guildId: string): Track[] {
    return this.getOrCreate(guildId).queue;
  }

  // ── Join voice channel ──

  async joinChannel(
    guild: Guild,
    voiceChannelId: string,
    textChannelId: string
  ): Promise<VoiceConnection> {
    const state = this.getOrCreate(guild.id);
    const voiceChannel = guild.channels.cache.get(voiceChannelId) as VoiceChannel | undefined;
    if (!voiceChannel) throw new Error("Voice-Channel nicht gefunden.");

    // If already connected to this channel, reuse
    if (state.connection && state.voiceChannelId === voiceChannelId) {
      return state.connection;
    }

    // Destroy old connection if exists
    if (state.connection) {
      state.connection.destroy();
      state.connection = null;
    }

    const connection = joinVoiceChannel({
      guildId: guild.id,
      channelId: voiceChannelId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    state.connection = connection;
    state.voiceChannelId = voiceChannelId;
    state.voiceChannelName = voiceChannel.name;
    state.textChannelId = textChannelId;

    // Create or reuse audio player
    if (!state.player) {
      state.player = createAudioPlayer();
      connection.subscribe(state.player);
      this.setupPlayerListeners(guild, state);
    } else {
      connection.subscribe(state.player);
    }

    // Handle voice connection lifecycle
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        connection.destroy();
        state.connection = null;
        state.voiceChannelId = null;
        state.voiceChannelName = null;
      }
    });

    return connection;
  }

  // ── Play ──

  async play(
    guild: Guild,
    query: string,
    voiceChannelId: string,
    textChannelId: string,
    requestedBy: string,
    requestedByTag: string
  ): Promise<Track> {
    const state = this.getOrCreate(guild.id);

    // Join channel if needed
    if (!state.connection || state.voiceChannelId !== voiceChannelId) {
      await this.joinChannel(guild, voiceChannelId, textChannelId);
    }

    const info = await lookupTrack(query);
    const track: Track = {
      title: info.title,
      url: info.url,
      duration: info.durationRaw,
      thumbnail: info.thumbnail,
      requestedBy,
      requestedByTag,
    };

    state.queue.push(track);

    // If nothing is playing, start right away.
    if (!state.isPlaying) {
      await this.playNext(guild);
    }

    return track;
  }

  private async playNext(guild: Guild): Promise<void> {
    const state = this.getOrCreate(guild.id);

    if (!state.player || !state.connection) {
      state.isPlaying = false;
      state.currentTrack = null;
      return;
    }

    // Handle loop modes
    if (state.loopMode === "track" && state.currentTrack) {
      state.queue.unshift(state.currentTrack);
    } else if (state.loopMode === "queue" && state.currentTrack) {
      state.queue.push(state.currentTrack);
    }

    const next = state.queue.shift();

    if (!next) {
      state.isPlaying = false;
      state.currentTrack = null;
      this.startIdleTimer(guild);
      return;
    }

    this.clearIdleTimer(guild);
    this.stopDownload(state);

    try {
      const download = openAudioStream(next.url, (message) => {
        // A failure after the stream started would otherwise look like the
        // track simply ending.
        this.handleTrackFailure(guild, next.title, message);
      });
      state.download = download;

      // WebM/Opus runs straight through prism-media's pure JavaScript demuxer.
      // Do NOT pass inlineVolume here: that forces the volume transformer, and
      // the cheapest pipeline for it needs FFmpeg plus an Opus encoder module.
      // Plain playback needs neither.
      const resource = createAudioResource(download.stream, {
        inputType: StreamType.WebmOpus,
      });

      state.player.play(resource);
      state.currentTrack = next;
      state.isPlaying = true;
      state.isPaused = false;
      state.consecutiveFailures = 0;
    } catch (err: any) {
      this.handleTrackFailure(guild, next.title, err?.message ?? String(err));
    }
  }

  /**
   * Reports a broken track and moves on — but stops after a few in a row
   * instead of quietly working through the whole queue and playing nothing,
   * which is what made the original failure look like "the bot just sits there".
   */
  private handleTrackFailure(guild: Guild, title: string, message: string): void {
    const state = this.getOrCreate(guild.id);
    state.consecutiveFailures += 1;

    this.reportError(guild, `"${title}" – ${message}`);

    if (state.consecutiveFailures >= 3) {
      this.reportError(guild, "Mehrere Titel hintereinander fehlgeschlagen – Wiedergabe gestoppt.");
      this.stop(guild);
      return;
    }

    // Stopping the player triggers Idle, which advances to the next track.
    state.player?.stop(true);
  }

  private reportError(guild: Guild, message: string): void {
    console.error("Musik-Fehler:", message);

    const state = this.getOrCreate(guild.id);
    if (!state.textChannelId) return;

    const channel = guild.channels.cache.get(state.textChannelId);
    if (!channel || !channel.isTextBased()) return;

    (channel as TextChannel).send(`❌ Musik-Fehler: ${message}`).catch(() => {
      // The channel may be gone or unwritable; the console log already covers it.
    });
  }

  private stopDownload(state: GuildMusicState): void {
    if (!state.download) return;
    state.download.stop();
    state.download = null;
  }

  private setupPlayerListeners(guild: Guild, state: GuildMusicState): void {
    if (!state.player) return;

    state.player.on(AudioPlayerStatus.Idle, () => {
      if (state.isPlaying && !state.isPaused) {
        this.playNext(guild);
      }
    });

    state.player.on("error", (err) => {
      this.handleTrackFailure(guild, state.currentTrack?.title ?? "Unbekannt", err.message);
    });
  }

  // ── Controls ──

  skip(guild: Guild): Track | null {
    const state = this.getOrCreate(guild.id);
    if (!state.isPlaying || !state.player) return null;

    const skipped = state.currentTrack;
    this.stopDownload(state);
    state.player.stop(true); // force stop triggers Idle -> playNext
    return skipped;
  }

  pause(guild: Guild): boolean {
    const state = this.getOrCreate(guild.id);
    if (!state.isPlaying || !state.player || state.isPaused) return false;

    state.player.pause();
    state.isPaused = true;
    return true;
  }

  resume(guild: Guild): boolean {
    const state = this.getOrCreate(guild.id);
    if (!state.isPaused || !state.player) return false;

    state.player.unpause();
    state.isPaused = false;
    return true;
  }

  stop(guild: Guild): void {
    const state = this.getOrCreate(guild.id);

    this.clearIdleTimer(guild);
    this.stopDownload(state);

    state.queue = [];
    state.currentTrack = null;
    state.isPlaying = false;
    state.isPaused = false;
    state.loopMode = "off";
    state.consecutiveFailures = 0;

    if (state.player) {
      state.player.stop(true);
    }

    if (state.connection) {
      state.connection.destroy();
      state.connection = null;
      state.voiceChannelId = null;
      state.voiceChannelName = null;
    }
  }

  /**
   * Stores and reports the volume, but it no longer changes the output:
   * adjusting the audio would need the inline volume transformer, whose
   * cheapest pipeline path requires FFmpeg (see playNext). Kept so the
   * dashboard and the slash command stay consistent.
   */
  setVolume(guild: Guild, volume: number): number {
    const state = this.getOrCreate(guild.id);
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    state.volume = clamped;
    return clamped;
  }

  removeFromQueue(guildId: string, index: number): Track | null {
    const state = this.getOrCreate(guildId);
    if (index < 0 || index >= state.queue.length) return null;

    const removed = state.queue.splice(index, 1)[0];
    return removed;
  }

  clearQueue(guildId: string): void {
    const state = this.getOrCreate(guildId);
    state.queue = [];
  }

  setLoopMode(guildId: string, mode: "off" | "track" | "queue"): string {
    const state = this.getOrCreate(guildId);
    state.loopMode = mode;
    return mode;
  }

  // ── Idle Timer ──

  private startIdleTimer(guild: Guild): void {
    const state = this.getOrCreate(guild.id);
    this.clearIdleTimer(guild);

    state.idleTimer = setTimeout(() => {
      if (!state.isPlaying && state.connection) {
        this.stopDownload(state);
        state.connection.destroy();
        state.connection = null;
        state.voiceChannelId = null;
        state.voiceChannelName = null;
        state.player?.stop(true);
        state.player = null;
      }
    }, this.IDLE_TIMEOUT);
  }

  private clearIdleTimer(guild: Guild): void {
    const state = this.getOrCreate(guild.id);
    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
  }

  // ── Public check: is bot in a voice channel? ──

  isInVoiceChannel(guildId: string): boolean {
    const state = this.guilds.get(guildId);
    return !!(state?.connection && state.voiceChannelId);
  }

  getVoiceChannelId(guildId: string): string | null {
    const state = this.guilds.get(guildId);
    return state?.voiceChannelId ?? null;
  }

  // ── Voice State Update (auto-leave when empty) ──

  handleVoiceStateUpdate(guild: Guild): void {
    const state = this.guilds.get(guild.id);
    if (!state?.connection || !state.voiceChannelId) return;

    const channel = guild.channels.cache.get(state.voiceChannelId) as VoiceChannel | undefined;
    if (!channel) return;

    // Count non-bot members in the voice channel
    const humanMembers = channel.members.filter((m) => !m.user.bot);
    if (humanMembers.size === 0) {
      // Everyone left – disconnect
      this.clearIdleTimer(guild);
      this.stopDownload(state);
      state.connection.destroy();
      state.connection = null;
      state.voiceChannelId = null;
      state.voiceChannelName = null;
      state.player?.stop(true);
      state.player = null;
      state.queue = [];
      state.consecutiveFailures = 0;
      state.currentTrack = null;
      state.isPlaying = false;
      state.isPaused = false;
    }
  }

  // ── Cleanup ──

  getVoiceChannels(guild: Guild): { id: string; name: string; memberCount: number }[] {
    return guild.channels.cache
      .filter((ch) => ch.isVoiceBased())
      .map((ch) => ({
        id: ch.id,
        name: ch.name,
        memberCount: (ch as VoiceChannel).members?.size ?? 0,
      }));
  }
}

export const musicManager = new MusicManager();
