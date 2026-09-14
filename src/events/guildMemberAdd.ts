import { GuildMember, EmbedBuilder, TextChannel } from "discord.js";
import { stmts } from "../database/db.js";

export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  const guild = member.guild;
  const settings = await stmts.getGuildSettings(guild.id);

  if (!settings?.welcome_channel_id) return;

  const channel = guild.channels.cache.get(settings.welcome_channel_id) as TextChannel | undefined;
  if (!channel?.send) return;

  const embed = new EmbedBuilder()
    .setTitle("👋 Willkommen!")
    .setColor(0xf799b9)
    .setDescription(
      `Herzlich willkommen **${member.user.username}** auf **${guild.name}**! 🎉\n` +
      `Du bist unser **${guild.memberCount + 1}.** Mitglied.`
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      {
        name: "Account erstellt",
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      {
        name: "Mitglieds-ID",
        value: `\`${member.user.id}\``,
        inline: true,
      }
    )
    .setFooter({ text: "pOky Bot • Willkommenssystem" })
    .setTimestamp();

  try {
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error("Fehler beim Senden der Willkommensnachricht:", e);
  }
}
