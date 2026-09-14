/**
 * Downloads the yt-dlp binary into ./bin.
 *
 * yt-dlp is what actually fetches YouTube audio: play-dl's Innertube client is
 * rejected with HTTP 400, and the URLs current clients get are capped to the
 * first ~1 MiB per URL, so neither can serve a whole song.
 *
 * Usage:
 *   npm run setup:ytdlp            # skip if already present
 *   npm run setup:ytdlp -- --force # re-download / update
 */
import { createWriteStream, existsSync, mkdirSync, chmodSync, unlinkSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN_DIR = path.join(PROJECT_ROOT, "bin");

const RELEASE = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";

function assetForPlatform() {
  if (process.platform === "win32") return { asset: "yt-dlp.exe", file: "yt-dlp.exe" };
  if (process.platform === "darwin") return { asset: "yt-dlp_macos", file: "yt-dlp" };
  return { asset: "yt-dlp_linux", file: "yt-dlp" };
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download fehlgeschlagen: HTTP ${response.status}`);
  }
  mkdirSync(BIN_DIR, { recursive: true });

  const temporary = `${destination}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    // node:fs rename over an existing file is fine, but on Windows it is not.
    if (existsSync(destination)) unlinkSync(destination);
    const { renameSync } = await import("node:fs");
    renameSync(temporary, destination);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }

  if (process.platform !== "win32") chmodSync(destination, 0o755);
}

async function main() {
  const force = process.argv.includes("--force");
  const { asset, file } = assetForPlatform();
  const destination = path.join(BIN_DIR, file);

  if (existsSync(destination) && !force) {
    console.log(`yt-dlp ist bereits vorhanden: ${destination}`);
    console.log("Zum Aktualisieren: npm run setup:ytdlp -- --force");
    return;
  }

  const url = `${RELEASE}/${asset}`;
  console.log(`Lade ${asset} herunter...`);
  await download(url, destination);
  console.log(`Fertig: ${destination}`);
}

main().catch((error) => {
  console.error(`yt-dlp konnte nicht eingerichtet werden: ${error.message}`);
  console.error("Alternativ den Pfad über die Umgebungsvariable YTDLP_PATH setzen.");
  process.exit(1);
});
