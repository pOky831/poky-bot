import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { stmts } from "../database/db.js";

export const data = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Willkommensnachrichten konfigurieren")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Willkommenskanal festlegen")
      .addChannelOption((opt) =>
        opt.setName("kanal").setDescription("Kanal für Willkommensnachrichten").setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName("off").setDescription("Willkommensnachrichten deaktivieren"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Nur auf einem Server nutzbar.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const existing = await stmts.getGuildSettings(interaction.guildId);

  if (subcommand === "set") {
    const channel = interaction.options.getChannel("kanal", true);
    if (!("send" in channel)) {
      await interaction.reply({ content: "Bitte einen Textkanal wählen.", ephemeral: true });
      return;
    }

    await stmts.setGuildSettings(
      interaction.guildId,
      channel.id,
      existing?.ticket_category_id ?? null,
      existing?.ticket_log_channel_id ?? null,
      existing?.mod_role_id ?? null,
      existing?.log_channel_id ?? null,
      existing?.automod_enabled ?? 0
    );

    await interaction.reply({ content: `Willkommenskanal gesetzt: <#${channel.id}>`, ephemeral: true });
  } else if (subcommand === "off") {
    await stmts.setGuildSettings(
      interaction.guildId,
      null,
      existing?.ticket_category_id ?? null,
      existing?.ticket_log_channel_id ?? null,
      existing?.mod_role_id ?? null,
      existing?.log_channel_id ?? null,
      existing?.automod_enabled ?? 0
    );

    await interaction.reply({ content: "Willkommensnachrichten deaktiviert.", ephemeral: true });
  }
}
