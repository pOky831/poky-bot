import { EmbedBuilder, TextChannel, Guild, userMention, AttachmentBuilder, type GuildTextBasedChannel } from "discord.js";
import { stmts } from "../database/db.js";

export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export const WARN_ROLE_NAMES = ["1-Warn", "2-Warn", "3-Warn"];

export function parseDuration(input: string): number | null {
  const match = input.match(/^(\d+)([smhd])$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

export function timestampToDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString("de-DE");
}

// ═══════════════════════════════════════════
// Mod-Log Embed Sender
// ═══════════════════════════════════════════

const ACTION_COLORS: Record<string, number> = {
  Kick: 0xfaa81a,
  Ban: 0xed4245,
  Timeout: 0xff5e8a,
  Untimeout: 0x4ade80,
  Warn: 0xfaa81a,
  "Warn entfernt": 0x4ade80,
  "Warns gelöscht": 0x4ade80,
};

const ACTION_ICONS: Record<string, string> = {
  Kick: "🔨",
  Ban: "🚫",
  Timeout: "⏱️",
  Untimeout: "✅",
  Warn: "⚠️",
  "Warn entfernt": "🗑️",
  "Warns gelöscht": "🧹",
};

/**
 * Sendet einen Embed an den mod_log_channel_id (aus guild_settings),
 * falls konfiguriert.
 */
export async function sendModLogEmbed(
  guild: Guild,
  logChannelId: string | null | undefined,
  action: string,
  targetTag: string,
  targetId: string,
  moderatorTag: string,
  moderatorId: string,
  reason: string | null,
  extraFields?: { name: string; value: string; inline?: boolean }[]
): Promise<void> {
  if (!logChannelId) return;

  const channel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
  if (!channel?.send) return;

  const color = ACTION_COLORS[action] ?? 0x5865f2;
  const icon = ACTION_ICONS[action] ?? "📋";

  const embed = new EmbedBuilder()
    .setTitle(`${icon} ${action}`)
    .setColor(color)
    .addFields(
      { name: "Betroffener Nutzer", value: `${userMention(targetId)} (${targetTag})`, inline: true },
      { name: "Moderator", value: `${userMention(moderatorId)} (${moderatorTag})`, inline: true },
      { name: "Grund", value: reason || "Kein Grund angegeben", inline: false }
    )
    .setTimestamp();

  if (extraFields) {
    embed.addFields(extraFields);
  }

  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error("Fehler beim Senden des Mod-Log-Embeds:", e);
  }
}

/**
 * Builds a ticket transcript string from a channel's messages.
 * Returns the transcript content as a string.
 */
export async function buildTicketTranscript(
  channel: GuildTextBasedChannel,
  channelId: string,
  closerTag: string,
  closeReason: string
): Promise<string> {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].reverse();
    let content = `📝 **Ticket-Transkript** — <#${channelId}>
Geschlossen von: **${closerTag}**
Grund: ${closeReason}
Datum: ${new Date().toLocaleString("de-DE")}
${"═".repeat(40)}

`;
    for (const msg of sorted) {
      const time = msg.createdAt.toLocaleString("de-DE");
      content += `[${time}] ${msg.author.tag} (${msg.author.id})
${msg.content || "[Kein Text]"}
`;
      if (msg.attachments.size > 0) {
        content += `  📎 Anhänge: ${msg.attachments.map((a) => a.url).join(", ")}
`;
      }
      if (msg.embeds.length > 0) {
        content += `  🖼️ Embeds: ${msg.embeds.length}
`;
      }
      content += `\n`;
    }
    return content;
  } catch (e) {
    console.error("Fehler beim Erstellen des Transkripts:", e);
    return "(Transkript konnte nicht erstellt werden)";
  }
}

/**
 * Sends a transcript to the ticket log channel, as a file if too long.
 */
export async function sendTranscriptToLog(
  guild: Guild,
  logChannelId: string | null | undefined,
  transcriptContent: string,
  channelId: string,
  closerTag: string,
  closeReason: string
): Promise<void> {
  if (!logChannelId) return;
  const logChannel = guild.channels.cache.get(logChannelId) as TextChannel | undefined;
  if (!logChannel?.send) return;

  try {
    if (transcriptContent.length > 1900) {
      const buffer = Buffer.from(transcriptContent, "utf-8");
      const attachment = new AttachmentBuilder(buffer, {
        name: `transcript-${channelId}.txt`,
        description: "Ticket-Transkript",
      });
      await logChannel.send({
        content: `🔒 **Ticket geschlossen** — <#${channelId}> von **${closerTag}**\nGrund: ${closeReason}\n📎 Transkript als Anhang:`,
        files: [attachment],
      });
    } else {
      await logChannel.send({ content: transcriptContent });
    }
  } catch (e) {
    console.error("Fehler beim Senden des Transkripts:", e);
  }
}

