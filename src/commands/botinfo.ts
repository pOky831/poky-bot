import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  version as djsVersion,
} from "discord.js";
import { stmts } from "../database/db.js";

export const data = new SlashCommandBuilder()
  .setName("botinfo")
  .setDescription("Informationen über den Bot");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const client = interaction.client;
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);

  const uptimeStr = [
    days > 0 ? `${days}d` : "",
    hours > 0 ? `${hours}h` : "",
    `${minutes}m`,
    `${seconds}s`,
  ]
    .filter(Boolean)
    .join(" ");

  let memberCount = 0;
  for (const guild of client.guilds.cache.values()) {
    memberCount += guild.memberCount;
  }

  const activeGiveaways = await stmts.getActiveGiveaways();
  const totalTickets = await stmts.getTotalTicketCount();
  const commandCount = 8; // ping, welcome, moderation, ticket, automod, leveling, giveaway, botinfo

  const embed = new EmbedBuilder()
    .setTitle("🤖 pOky Bot — Informationen")
    .setColor(0xf799b9)
    .setThumbnail(client.user?.displayAvatarURL({ size: 256 }) ?? null)
    .addFields(
      { name: "📋 Bot-Name", value: client.user?.username ?? "Unbekannt", inline: true },
      { name: "🆔 Bot-ID", value: `\`${client.user?.id ?? "—"}\``, inline: true },
      { name: "⏱️ Uptime", value: uptimeStr, inline: true },
      { name: "🖥️ Server", value: `${client.guilds.cache.size}`, inline: true },
      { name: "👥 Mitglieder", value: `${memberCount}`, inline: true },
      { name: "⚙️ Befehle", value: `${commandCount}`, inline: true },
      { name: "🎉 Aktive Giveaways", value: `${activeGiveaways.length}`, inline: true },
      { name: "🎫 Tickets (total)", value: `${totalTickets?.count ?? 0}`, inline: true },
      { name: "📡 API-Latenz", value: `${client.ws.ping}ms`, inline: true },
      { name: "🔧 Discord.js", value: `v${djsVersion}`, inline: true },
      { name: "🟢 Node.js", value: process.version, inline: true },
    )
    .setFooter({ text: "pOky Bot • Made with ❤️" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
