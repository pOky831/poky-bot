import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  GuildMember,
  User,
} from "discord.js";
import { stmts } from "../database/db.js";
import { parseDuration } from "../utils/helpers.js";

export const data = new SlashCommandBuilder()
  .setName("moderation")
  .setDescription("Moderations-Befehle")
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers | PermissionFlagsBits.BanMembers | PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("kick")
      .setDescription("Einen Nutzer kicken")
      .addUserOption((opt) => opt.setName("nutzer").setDescription("Der zu kickende Nutzer").setRequired(true))
      .addStringOption((opt) => opt.setName("grund").setDescription("Grund für den Kick"))
  )
  .addSubcommand((sub) =>
    sub
      .setName("ban")
      .setDescription("Einen Nutzer bannen")
      .addUserOption((opt) => opt.setName("nutzer").setDescription("Der zu bannende Nutzer").setRequired(true))
      .addStringOption((opt) => opt.setName("grund").setDescription("Grund für den Ban"))
      .addIntegerOption((opt) =>
        opt
          .setName("nachrichten_loeschen")
          .setDescription("Nachrichten der letzten X Tage löschen")
          .setChoices(
            { name: "Nicht löschen", value: 0 },
            { name: "Letzte 24 Stunden", value: 1 },
            { name: "Letzte 7 Tage", value: 7 }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("timeout")
      .setDescription("Einen Nutzer timeouten")
      .addUserOption((opt) => opt.setName("nutzer").setDescription("Der zu timeoutende Nutzer").setRequired(true))
      .addStringOption((opt) => opt.setName("dauer").setDescription("Dauer z.B. 10m, 1h, 1d").setRequired(true))
      .addStringOption((opt) => opt.setName("grund").setDescription("Grund für den Timeout"))
  )
  .addSubcommand((sub) =>
    sub
      .setName("warn")
      .setDescription("Einen Nutzer verwarnen")
      .addUserOption((opt) => opt.setName("nutzer").setDescription("Der zu verwarnende Nutzer").setRequired(true))
      .addStringOption((opt) => opt.setName("grund").setDescription("Grund für die Verwarnung"))
  )
  .addSubcommand((sub) =>
    sub
      .setName("warns")
      .setDescription("Verwarnungen eines Nutzers anzeigen")
      .addUserOption((opt) => opt.setName("nutzer").setDescription("Der Nutzer").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName("clearwarns")
      .setDescription("Alle Verwarnungen eines Nutzers löschen")
      .addUserOption((opt) => opt.setName("nutzer").setDescription("Der Nutzer").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName("logs")
      .setDescription("Moderations-Logs anzeigen")
      .addUserOption((opt) => opt.setName("nutzer").setDescription("Logs für einen bestimmten Nutzer filtern"))
  );

async function logAction(
  guildId: string,
  target: User,
  moderator: User,
  action: string,
  reason: string | null,
  duration?: string | null
): Promise<void> {    await stmts.insertModLog(
      guildId,
      target.id,
      target.tag,
      moderator.id,
      moderator.tag,
      action,
      reason ?? null,
      duration ?? null
    );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Nur auf einem Server nutzbar.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  if (subcommand === "kick") {
    const user = interaction.options.getUser("nutzer", true);
    const reason = interaction.options.getString("grund") ?? "Kein Grund angegeben";
    const member = interaction.guild.members.cache.get(user.id) ?? (await interaction.guild.members.fetch(user.id).catch(() => null));

    if (!member) {
      await interaction.editReply("Nutzer nicht gefunden.");
      return;
    }
    if (!member.kickable) {
      await interaction.editReply("Ich kann diesen Nutzer nicht kicken (fehlende Rechte oder höhere Rolle).");
      return;
    }

    await member.kick(reason);
    await logAction(interaction.guild.id, user, interaction.user, "Kick", reason);
    await interaction.editReply(`🔨 **${user.tag}** wurde gekickt.\nGrund: ${reason}`);
    return;
  }

  if (subcommand === "ban") {
    const user = interaction.options.getUser("nutzer", true);
    const reason = interaction.options.getString("grund") ?? "Kein Grund angegeben";
    const deleteDays = interaction.options.getInteger("nachrichten_loeschen") ?? 0;

    const member = interaction.guild.members.cache.get(user.id) ?? (await interaction.guild.members.fetch(user.id).catch(() => null));
    if (member && !member.bannable) {
      await interaction.editReply("Ich kann diesen Nutzer nicht bannen (fehlende Rechte oder höhere Rolle).");
      return;
    }

    await interaction.guild.members.ban(user, { deleteMessageSeconds: deleteDays * 24 * 60 * 60, reason });
    await logAction(interaction.guild.id, user, interaction.user, "Ban", reason);
    await interaction.editReply(`🔨 **${user.tag}** wurde gebannt.\nGrund: ${reason}`);
    return;
  }

  if (subcommand === "timeout") {
    const user = interaction.options.getUser("nutzer", true);
    const durationStr = interaction.options.getString("dauer", true);
    const reason = interaction.options.getString("grund") ?? "Kein Grund angegeben";
    const durationMs = parseDuration(durationStr);

    if (!durationMs || durationMs > 28 * 24 * 60 * 60 * 1000) {
      await interaction.editReply("Ungültige Dauer. Maximal 28 Tage. Beispiele: `10m`, `1h`, `1d`.");
      return;
    }

    const member = interaction.guild.members.cache.get(user.id) ?? (await interaction.guild.members.fetch(user.id).catch(() => null));
    if (!member) {
      await interaction.editReply("Nutzer nicht gefunden.");
      return;
    }
    if (!member.moderatable) {
      await interaction.editReply("Ich kann diesen Nutzer nicht timeouten.");
      return;
    }

    await member.timeout(durationMs, reason);
    await logAction(interaction.guild.id, user, interaction.user, "Timeout", reason, durationStr);
    await interaction.editReply(`⏱️ **${user.tag}** wurde für ${durationStr} getimeoutet.\nGrund: ${reason}`);
    return;
  }

  if (subcommand === "warn") {
    const user = interaction.options.getUser("nutzer", true);
    const reason = interaction.options.getString("grund") ?? "Kein Grund angegeben";

    await stmts.insertWarn(
      interaction.guild.id,
      user.id,
      user.tag,
      interaction.user.id,
      interaction.user.tag,
      reason
    );
    await logAction(interaction.guild.id, user, interaction.user, "Warn", reason);

    const warnCount = (await stmts.getWarns(interaction.guild.id, user.id)).length;
    await interaction.editReply(`⚠️ **${user.tag}** wurde verwarnt.\nGrund: ${reason}\nVerwarnungen: ${warnCount}`);
    return;
  }

  if (subcommand === "warns") {
    const user = interaction.options.getUser("nutzer", true);
    const warns = await stmts.getWarns(interaction.guild.id, user.id);

    if (warns.length === 0) {
      await interaction.editReply(`**${user.tag}** hat keine Verwarnungen.`);
      return;
    }

    const list = warns
      .map((w, i) => `${i + 1}. ${w.reason ?? "Kein Grund"} — <t:${w.created_at}:R>`)
      .join("\n");
    await interaction.editReply(`Verwarnungen für **${user.tag}** (${warns.length}):\n${list}`);
    return;
  }

  if (subcommand === "clearwarns") {
    const user = interaction.options.getUser("nutzer", true);
    const count = (await stmts.getWarns(interaction.guild.id, user.id)).length;
    await stmts.clearWarns(interaction.guild.id, user.id);
    await interaction.editReply(`✅ Alle Verwarnungen für **${user.tag}** gelöscht (${count} Stück).`);
    return;
  }

  if (subcommand === "logs") {
    const user = interaction.options.getUser("nutzer");
    let logs;
    if (user) {
      logs = await stmts.getModLogsForUser(interaction.guild.id, user.id);
    } else {
      logs = await stmts.getModLogs(interaction.guild.id);
    }

    if (logs.length === 0) {
      await interaction.editReply("Keine Moderations-Logs gefunden.");
      return;
    }

    const list = logs
      .slice(0, 10)        .map((log) =>
        `\`${log.action}\` → **${log.target_tag ?? "Unbekannt"}** von ${log.moderator_tag ?? "Unbekannt"} — ${log.reason ?? "Kein Grund"} — <t:${log.created_at}:R>`
      )
      .join("\n");

    await interaction.editReply(`Moderations-Logs${user ? ` für **${user.tag}**` : ""}:\n${list}`);
    return;
  }
}
