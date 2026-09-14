import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  GuildMember,
  User,
} from "discord.js";
import { stmts } from "../database/db.js";
import { parseDuration, WARN_ROLE_NAMES, sendModLogEmbed } from "../utils/helpers.js";

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
      .setName("removewarn")
      .setDescription("Eine einzelne Verwarnung entfernen")
      .addUserOption((opt) => opt.setName("nutzer").setDescription("Der Nutzer").setRequired(true))
      .addIntegerOption((opt) =>
        opt.setName("id").setDescription("Die ID der Verwarnung (aus /moderation warns)").setRequired(true).setMinValue(1)
      )
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
): Promise<void> {
    await stmts.insertModLog(
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

async function logAndEmbed(
  guild: import("discord.js").Guild,
  target: User,
  moderator: User,
  action: string,
  reason: string | null,
  duration?: string | null,
  extraFields?: { name: string; value: string; inline?: boolean }[]
): Promise<void> {
  await logAction(guild.id, target, moderator, action, reason, duration);
  const settings = await stmts.getGuildSettings(guild.id);
  let extra = extraFields ?? [];
  if (duration) {
    extra = [...extra, { name: "Dauer", value: duration, inline: true }];
  }
  await sendModLogEmbed(
    guild,
    settings?.log_channel_id,
    action,
    target.tag,
    target.id,
    moderator.tag,
    moderator.id,
    reason,
    extra
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
    await logAndEmbed(interaction.guild, user, interaction.user, "Kick", reason);
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
    await logAndEmbed(interaction.guild, user, interaction.user, "Ban", reason, null, deleteDays > 0 ? [{ name: "Nachrichten gelöscht", value: `${deleteDays} Tag(e)`, inline: true }] : undefined);
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
    await logAndEmbed(interaction.guild, user, interaction.user, "Timeout", reason, durationStr);
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
    await logAndEmbed(interaction.guild, user, interaction.user, "Warn", reason);

    // Assign warn roles on Discord
    const member = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      const warns = await stmts.getWarns(interaction.guild.id, user.id);
      const warnCount = warns.length;
      const cycleIndex = (warnCount - 1) % 4;

      // Remove old warn roles first
      const rolesToRemove = member.roles.cache.filter((r) => WARN_ROLE_NAMES.includes(r.name));
      if (rolesToRemove.size > 0) {
        await member.roles.remove(rolesToRemove, "Warn-Rollen aktualisiert").catch(() => {});
      }

      if (cycleIndex < 3) {
        const roleName = WARN_ROLE_NAMES[cycleIndex];
        let role = interaction.guild.roles.cache.find((r) => r.name === roleName);
        if (!role) {
          try {
            role = await interaction.guild.roles.create({ name: roleName, color: 0xfaa81a, reason: "Warn-Rolle erstellt" });
          } catch { /* no perms */ }
        }
        if (role) {
          await member.roles.add(role, `Verwarnung ${warnCount} - ${roleName}`).catch(() => {});
        }
      } else {
        // 4th warn: timeout 2 weeks
        const twoWeeks = 14 * 24 * 60 * 60 * 1000;
        await member.timeout(twoWeeks, `4. Verwarnung - 2 Wochen Timeout: ${reason}`).catch(() => {});
      }
    }

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
      .map((w, i) => `${i + 1}. [#${w.id}] ${w.reason ?? "Kein Grund"} — <t:${w.created_at}:R>`)
      .join("\n");
    await interaction.editReply(`Verwarnungen für **${user.tag}** (${warns.length}):\n${list}\nNutze \`/moderation removewarn\` mit der \`[#ID]\` um eine Warnung zu löschen.`);
    return;
  }

  if (subcommand === "clearwarns") {
    const user = interaction.options.getUser("nutzer", true);
    const count = (await stmts.getWarns(interaction.guild.id, user.id)).length;
    await stmts.clearWarns(interaction.guild.id, user.id);
    await logAndEmbed(interaction.guild, user, interaction.user, "Warns gelöscht", `${count} Verwarnungen gelöscht`);
    await interaction.editReply(`✅ Alle Verwarnungen für **${user.tag}** gelöscht (${count} Stück).`);
    return;
  }

  if (subcommand === "removewarn") {
    const user = interaction.options.getUser("nutzer", true);
    const warnId = interaction.options.getInteger("id", true);

    const deleted = await stmts.removeWarn(warnId, interaction.guild.id);
    if (!deleted) {
      await interaction.editReply(`❌ Verwarnung mit ID **${warnId}** nicht gefunden (gehört sie zu **${user.tag}**?).\nTipp: Nutze \`/moderation warns\` um die IDs zu sehen.`);
      return;
    }

    // Recalculate warn roles on Discord
    const member = interaction.guild.members.cache.get(user.id) ?? await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      const warns = await stmts.getWarns(interaction.guild.id, user.id);
      const warnCount = warns.length;

      // Remove all warn roles first
      const rolesToRemove = member.roles.cache.filter((r) => WARN_ROLE_NAMES.includes(r.name));
      if (rolesToRemove.size > 0) {
        await member.roles.remove(rolesToRemove, "Warn-Rollen aktualisiert").catch(() => {});
      }

      if (warnCount > 0) {
        const cycleIndex = (warnCount - 1) % 4;
        if (cycleIndex < 3) {
          const roleName = WARN_ROLE_NAMES[cycleIndex];
          let role = interaction.guild.roles.cache.find((r) => r.name === roleName);
          if (!role) {
            try {
              role = await interaction.guild.roles.create({ name: roleName, color: 0xfaa81a, reason: "Warn-Rolle erstellt" });
            } catch { /* no perms */ }
          }
          if (role) {
            await member.roles.add(role, `Verwarnung ${warnCount} - ${roleName}`).catch(() => {});
          }
        }
      }

      // Remove timeout if warn count no longer at 4th+ strike
      if (warnCount % 4 !== 0 && member.communicationDisabledUntil) {
        await member.timeout(null).catch(() => {});
      }
    }

    await logAndEmbed(interaction.guild, user, interaction.user, "Warn entfernt", `Warn-ID #${warnId} entfernt`);
    await interaction.editReply(`🗑️ Verwarnung **#${warnId}** von **${user.tag}** wurde entfernt.`);
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
