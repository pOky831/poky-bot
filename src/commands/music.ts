import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  type VoiceChannel,
} from "discord.js";
import { musicManager, type Track } from "../music/musicPlayer.js";

// ── Slash Command Builder ──

export const data = new SlashCommandBuilder()
  .setName("musik")
  .setDescription("🎵 Musik-Player – spiele YouTube-Songs ab")
  .addSubcommand((sub) =>
    sub
      .setName("play")
      .setDescription("Einen Song abspielen oder zur Warteschlange hinzufügen")
      .addStringOption((opt) =>
        opt
          .setName("suche")
          .setDescription("Song-Name oder YouTube-URL")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("skip").setDescription("Aktuellen Song überspringen")
  )
  .addSubcommand((sub) =>
    sub.setName("stop").setDescription("Wiedergabe stoppen & Bot disconnecten")
  )
  .addSubcommand((sub) =>
    sub.setName("pause").setDescription("Wiedergabe pausieren")
  )
  .addSubcommand((sub) =>
    sub.setName("resume").setDescription("Wiedergabe fortsetzen")
  )
  .addSubcommand((sub) =>
    sub.setName("queue").setDescription("Die aktuelle Warteschlange anzeigen")
  )
  .addSubcommand((sub) =>
    sub
      .setName("nowplaying")
      .setDescription("Aktuellen Song anzeigen")
  )
  .addSubcommand((sub) =>
    sub
      .setName("volume")
      .setDescription("Lautstärke einstellen (0-100)")
      .addIntegerOption((opt) =>
        opt
          .setName("wert")
          .setDescription("Lautstärke in Prozent (0-100)")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(100)
      )
  );

// ── Helper: find voice channel of the user ──

function getUserVoiceChannel(
  interaction: ChatInputCommandInteraction
): { voiceChannel: VoiceChannel; voiceChannelId: string } | null {
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  if (!member) return null;

  const voiceChannel = member.voice.channel;
  if (!voiceChannel) return null;

  if (voiceChannel.type !== ChannelType.GuildVoice) return null;

  return {
    voiceChannel: voiceChannel as VoiceChannel,
    voiceChannelId: voiceChannel.id,
  };
}

// ── Helper: build track embed ──

function buildTrackEmbed(track: Track, status: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff5e8a)
    .setTitle(status)
    .setDescription(`[${track.title}](${track.url})`)
    .addFields(
      { name: "Dauer", value: track.duration, inline: true },
      { name: "Angefordert von", value: track.requestedByTag, inline: true }
    )
    .setThumbnail(track.thumbnail || null)
    .setFooter({ text: "pOky Musik-Player" })
    .setTimestamp();
}

// ── Execute ──

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "Dieser Befehl kann nur auf einem Server verwendet werden.",
      ephemeral: true,
    });
    return;
  }

  switch (subcommand) {
    case "play": {
      const query = interaction.options.getString("suche", true);

      const voiceInfo = getUserVoiceChannel(interaction);
      if (!voiceInfo) {
        await interaction.reply({
          content: "❌ Du musst in einem Voice-Channel sein!",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferReply();

      try {
        const track = await musicManager.play(
          guild,
          query,
          voiceInfo.voiceChannelId,
          interaction.channelId,
          interaction.user.id,
          interaction.user.tag
        );

        const isFirst = !musicManager.getStatus(guild.id).queue.length;
        const embed = buildTrackEmbed(
          track,
          isFirst ? "🎵 Spiele jetzt" : "📋 Zur Warteschlange hinzugefügt"
        );

        await interaction.editReply({ embeds: [embed] });
      } catch (err: any) {
        await interaction.editReply({
          content: `❌ Fehler: ${err.message || "Unbekannter Fehler"}`,
        });
      }
      break;
    }

    case "skip": {
      const skipped = musicManager.skip(guild);
      if (!skipped) {
        await interaction.reply({
          content: "❌ Es läuft kein Song.",
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle("⏭️ Übersprungen")
        .setDescription(`[${skipped.title}](${skipped.url})`)
        .setFooter({ text: "pOky Musik-Player" });

      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "stop": {
      musicManager.stop(guild);
      await interaction.reply({
        content: "⏹️ Wiedergabe gestoppt & Bot disconnected.",
      });
      break;
    }

    case "pause": {
      const paused = musicManager.pause(guild);
      await interaction.reply({
        content: paused
          ? "⏸️ Wiedergabe pausiert."
          : "❌ Es läuft kein Song oder ist bereits pausiert.",
        ephemeral: !paused,
      });
      break;
    }

    case "resume": {
      const resumed = musicManager.resume(guild);
      await interaction.reply({
        content: resumed
          ? "▶️ Wiedergabe fortgesetzt."
          : "❌ Kein Song pausiert.",
        ephemeral: !resumed,
      });
      break;
    }

    case "queue": {
      const status = musicManager.getStatus(guild.id);
      const current = status.currentTrack;
      const queue = status.queue;

      if (!current) {
        await interaction.reply({
          content: "📭 Die Warteschlange ist leer.",
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xff5e8a)
        .setTitle("🎵 Musik-Warteschlange")
        .setFooter({ text: "pOky Musik-Player" })
        .setTimestamp();

      let desc = `**▶️ Jetzt:** [${current.title}](${current.url}) · \`${current.duration}\` · ${current.requestedByTag}\n\n`;

      if (queue.length === 0) {
        desc += "*Keine weiteren Songs in der Warteschlange.*";
      } else {
        desc += `**📋 Nächste ${queue.length} Songs:**\n`;
        queue.forEach((track, i) => {
          desc += `\`${i + 1}.\` [${track.title}](${track.url}) · \`${track.duration}\` · ${track.requestedByTag}\n`;
        });
      }

      embed.setDescription(desc);
      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "nowplaying": {
      const status = musicManager.getStatus(guild.id);
      const track = status.currentTrack;

      if (!track) {
        await interaction.reply({
          content: "❌ Es läuft kein Song.",
          ephemeral: true,
        });
        return;
      }

      const embed = buildTrackEmbed(track, "▶️ Jetzt läuft");
      embed.addFields(
        {
          name: "Lautstärke",
          value: `${status.volume}%`,
          inline: true,
        },
        {
          name: "Status",
          value: status.isPaused ? "⏸️ Pausiert" : "▶️ Spielt",
          inline: true,
        },
        {
          name: "Queue",
          value: `${status.queue.length} weitere Songs`,
          inline: true,
        }
      );

      await interaction.reply({ embeds: [embed] });
      break;
    }

    case "volume": {
      const value = interaction.options.getInteger("wert", true);
      const newVol = musicManager.setVolume(guild, value);
      await interaction.reply({
        content: `🔊 Lautstärke auf **${newVol}%** gesetzt.`,
      });
      break;
    }
  }
}
