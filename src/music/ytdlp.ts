import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * yt-dlp wrapper — track lookup and audio streaming.
 *
 * This replaced play-dl's streaming entirely, because two things make the
 * JavaScript-only route impossible right now:
 *
 *  1. play-dl queries the Innertube player with an ANDROID client pinned to
 *     version 16.49. YouTube answers that with HTTP 400, and the 16.x line no
 *     longer receives format URLs at all — so `play.stream()` crashed on
 *     `new URL(undefined)`.
 *  2. The URLs that current mobile clients *do* receive carry `rqh=1`, which
 *     limits every URL to the first ~1 MiB of the file. Streaming a whole song
 *     from one is therefore impossible, no matter how the range header is set.
 *
 * yt-dlp handles both problems itself. It also writes the raw WebM/Opus bytes
 * to stdout, so the audio path still needs neither FFmpeg nor an Opus encoder
 * module — prism-media's pure JavaScript WebM demuxer is enough.
 */

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const BINARY_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";

/** WebM/Opus only, so the player never has to transcode. */
const AUDIO_FORMAT = "bestaudio[ext=webm][acodec=opus]/bestaudio[ext=webm]/bestaudio";

const METADATA_TIMEOUT_MS = 30_000;

export interface TrackInfo {
  title: string;
  url: string;
  durationRaw: string;
  thumbnail: string;
}

export interface AudioDownload {
  /** Raw WebM/Opus bytes. */
  stream: Readable;
  /** Kills the download. Call on skip/stop so yt-dlp does not keep running. */
  stop: () => void;
}

/** Prefers an explicit override, then the copy bundled in ./bin, then PATH. */
export function resolveBinary(): string {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const bundled = path.join(PROJECT_ROOT, "bin", BINARY_NAME);
  if (existsSync(bundled)) return bundled;
  // Fall back to whatever is on PATH.
  return BINARY_NAME;
}

/**
 * Kills yt-dlp and everything it spawned.
 *
 * The released yt-dlp binaries are PyInstaller one-file builds, so the process
 * we spawn is only a bootloader that immediately starts the real worker as a
 * child. Measured: two yt-dlp.exe processes run per download, and a plain
 * `child.kill()` leaves the worker alive — the full file kept arriving after
 * the kill. So the whole tree has to go.
 */
function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) return;

  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall through to the plain kill below.
    }
  } else {
    // Detached children lead their own process group, so the group can be killed.
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall through to the plain kill below.
    }
  }

  child.kill("SIGKILL");
}

function missingBinaryHint(error: NodeJS.ErrnoException): Error | null {
  if (error.code !== "ENOENT") return null;
  return new Error(
    "yt-dlp wurde nicht gefunden. Bitte einmalig 'npm run setup:ytdlp' ausführen " +
      "oder den Pfad über die Umgebungsvariable YTDLP_PATH setzen."
  );
}

function formatDuration(seconds: unknown): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "?";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** Accepts a search term or any YouTube URL and resolves it to a single track. */
export async function lookupTrack(query: string): Promise<TrackInfo> {
  const target = /^https?:\/\//i.test(query.trim()) ? query.trim() : `ytsearch1:${query.trim()}`;

  const args = [
    "--dump-json",
    "--skip-download",
    "--no-playlist",
    "--no-warnings",
    "--no-progress",
    target,
  ];

  const raw = await new Promise<string>((resolve, reject) => {
    let child;
    try {
      child = spawn(resolveBinary(), args, {
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
    } catch (error) {
      reject(missingBinaryHint(error as NodeJS.ErrnoException) ?? error);
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessTree(child);
      reject(new Error("Zeitüberschreitung bei der YouTube-Suche."));
    }, METADATA_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(missingBinaryHint(error) ?? error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `yt-dlp endete mit Code ${code}.`));
      }
    });
  });

  // --dump-json prints one JSON object per line; a search yields exactly one.
  const firstLine = raw.split("\n").find((line) => line.trim().startsWith("{"));
  if (!firstLine) throw new Error("Keine Suchtreffer gefunden.");

  let info: any;
  try {
    info = JSON.parse(firstLine);
  } catch {
    throw new Error("Antwort von yt-dlp konnte nicht gelesen werden.");
  }

  // A URL that points at a playlist still comes back as a wrapper object.
  if (Array.isArray(info?.entries) && info.entries.length > 0) {
    info = info.entries[0];
  }

  const url = typeof info?.webpage_url === "string" ? info.webpage_url : null;
  if (!url) throw new Error("Kein abspielbares Video gefunden.");

  return {
    title: typeof info.title === "string" ? info.title : "Unbekannter Titel",
    url,
    durationRaw: formatDuration(info.duration),
    thumbnail: typeof info.thumbnail === "string" ? info.thumbnail : "",
  };
}

/**
 * Downloads the audio for `url` as raw WebM/Opus.
 * `onError` fires for a failure that happens after the stream started, which
 * would otherwise look like the song simply ending.
 */
export function openAudioStream(url: string, onError: (message: string) => void): AudioDownload {
  const args = [
    "-f", AUDIO_FORMAT,
    "--no-playlist",
    "--no-progress",
    "--no-warnings",
    "-o", "-",
    url,
  ];

  const child = spawn(resolveBinary(), args, {
    stdio: ["ignore", "pipe", "pipe"],
    // Needed so the process group can be killed on POSIX.
    detached: process.platform !== "win32",
  });

  let stderr = "";
  let stopped = false;

  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

  child.on("error", (error: NodeJS.ErrnoException) => {
    if (stopped) return;
    onError(missingBinaryHint(error)?.message ?? error.message);
  });

  child.on("close", (code) => {
    // A kill from skip/stop is expected, not an error.
    if (stopped || code === 0) return;
    onError(stderr.trim() || `Download fehlgeschlagen (Code ${code}).`);
  });

  return {
    stream: child.stdout,
    stop: () => {
      if (stopped) return;
      stopped = true;
      killProcessTree(child);
    },
  };
}
