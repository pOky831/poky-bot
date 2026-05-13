import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import { stmts } from "../database/db.js";

export const data = new SlashCommandBuilder()
  .setName("automod")
  .setDescription("Auto-Moderation konfigurieren")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("Zeigt die aktuellen Auto-Mod Einstellungen")
  )
  .addSubcommand((sub) =>
    sub
      .setName("toggle")
      .setDescription("Auto-Mod ein-/ausschalten")
      .addBooleanOption((opt) =>
        opt.setName("aktiviert").setDescription("An oder Aus").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("spam")
      .setDescription("Anti-Spam Schwelle setzen (0 = deaktiviert)")
      .addIntegerOption((opt) =>
        opt
          .setName("nachrichten")
          .setDescription("Max Nachrichten pro 5 Sekunden (2-10)")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(10)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("linkfilter")
      .setDescription("Link-Filter ein-/ausschalten")
      .addBooleanOption((opt) =>
        opt.setName("aktiviert").setDescription("An oder Aus").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("mentioncap")
      .setDescription("Maximale Mentions pro Nachricht (0 = deaktiviert)")
      .addIntegerOption((opt) =>
        opt
          .setName("anzahl")
          .setDescription("Max Mentions (1-50)")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(50)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("words")
      .setDescription("Bad-Word-Filter verwalten")
      .addStringOption((opt) =>
        opt
          .setName("aktion")
          .setDescription("Was möchtest du tun?")
          .setRequired(true)
          .addChoices(
            { name: "Wort hinzufügen", value: "add" },
            { name: "Wort entfernen", value: "remove" },
            { name: "Liste anzeigen", value: "list" },
            { name: "Alle löschen", value: "clear" }
          )
      )
      .addStringOption((opt) =>
        opt.setName("wort").setDescription("Das Wort (für add/remove)").setRequired(false)
      )
  );

type AutomodConfig = {
  automod_enabled: number;
  automod_spam_threshold: number;
  automod_link_filter: number;
  automod_mention_cap: number;
};

async function getConfig(guildId: string): Promise<AutomodConfig> {
  const row = await stmts.getAutomodConfig(guildId);
  return {
    automod_enabled: (row as { automod_enabled: number } | undefined)?.automod_enabled ?? 0,
    automod_spam_threshold: (row as { automod_spam_threshold: number } | undefined)?.automod_spam_threshold ?? 0,
    automod_link_filter: (row as { automod_link_filter: number } | undefined)?.automod_link_filter ?? 0,
    automod_mention_cap: (row as { automod_mention_cap: number } | undefined)?.automod_mention_cap ?? 0,
  };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Nur auf einem Server nutzbar.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  if (subcommand === "status") {
    const config = await getConfig(interaction.guild.id);
    const words = await stmts.getAutomodWords(interaction.guild.id) as string[];

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Auto-Mod Einstellungen")
      .setColor(0xf799b9)
      .addFields(
        { name: "Status", value: config.automod_enabled ? "✅ Aktiviert" : "❌ Deaktiviert", inline: true },
        { name: "Anti-Spam", value: config.automod_spam_threshold > 0 ? `${config.automod_spam_threshold} Nachrichten / 5s` : "Deaktiviert", inline: true },
        { name: "Link-Filter", value: config.automod_link_filter ? "✅ Aktiviert" : "❌ Deaktiviert", inline: true },
        { name: "Mention-Cap", value: config.automod_mention_cap > 0 ? `Max ${config.automod_mention_cap} Mentions` : "Deaktiviert", inline: true },
        { name: "Bad Words", value: words.length > 0 ? `${words.length} Wörter in Liste` : "Keine Wörter", inline: true }
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "toggle") {
    const enabled = interaction.options.getBoolean("aktiviert", true);
    await stmts.setAutomodEnabled(interaction.guild.id, enabled ? 1 : 0);
    await interaction.editReply(`🛡️ Auto-Mod **${enabled ? "aktiviert" : "deaktiviert"}**.`);
    return;
  }

  if (subcommand === "spam") {
    const threshold = interaction.options.getInteger("nachrichten", true);
    await stmts.setAutomodSpam(interaction.guild.id, threshold);
    await interaction.editReply(
      threshold > 0
        ? `🔁 Anti-Spam: Max **${threshold}** Nachrichten pro 5 Sekunden.`
        : `🔁 Anti-Spam deaktiviert.`
    );
    return;
  }

  if (subcommand === "linkfilter") {
    const enabled = interaction.options.getBoolean("aktiviert", true);
    await stmts.setAutomodLinkFilter(interaction.guild.id, enabled ? 1 : 0);
    await interaction.editReply(`🔗 Link-Filter **${enabled ? "aktiviert" : "deaktiviert"}**.`);
    return;
  }

  if (subcommand === "mentioncap") {
    const cap = interaction.options.getInteger("anzahl", true);
    await stmts.setAutomodMentionCap(interaction.guild.id, cap);
    await interaction.editReply(
      cap > 0
        ? `📢 Mention-Cap: Max **${cap}** Mentions pro Nachricht.`
        : `📢 Mention-Cap deaktiviert.`
    );
    return;
  }

  if (subcommand === "words") {
    const aktion = interaction.options.getString("aktion", true);
    const wort = interaction.options.getString("wort");

    if (aktion === "list") {
      const words = await stmts.getAutomodWords(interaction.guild.id) as string[];
      if (words.length === 0) {
        await interaction.editReply("📋 Keine Bad Words in der Liste.");
        return;
      }
      await interaction.editReply(`📋 Bad Words (${words.length}):\n\`\`\`${words.join(", ")}\`\`\``);
      return;
    }

    if (aktion === "clear") {
      await stmts.clearAutomodWords(interaction.guild.id);
      await interaction.editReply("🗑️ Alle Bad Words gelöscht.");
      return;
    }

    if (!wort) {
      await interaction.editReply("❌ Bitte gib ein Wort an.");
      return;
    }

    if (aktion === "add") {
      await stmts.addAutomodWord(interaction.guild.id, wort.toLowerCase());
      await interaction.editReply(`✅ \`${wort}\` zur Bad-Word-Liste hinzugefügt.`);
      return;
    }

    if (aktion === "remove") {
      await stmts.removeAutomodWord(interaction.guild.id, wort.toLowerCase());
      await interaction.editReply(`🗑️ \`${wort}\` aus der Bad-Word-Liste entfernt.`);
      return;
    }
  }
}
