import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  SlashCommandStringOption,
  SlashCommandIntegerOption,
  SlashCommandRoleOption,
} from "discord.js";
import { stmts } from "../database/db.js";

export const data = new SlashCommandBuilder()
  .setName("level")
  .setDescription("Leveling-System")
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub.setName("rank").setDescription("Zeigt dein Level und XP an")
      .addUserOption((opt) => opt.setName("nutzer").setDescription("Nutzer (optional)").setRequired(false))
  )
  .addSubcommand((sub) =>
    sub.setName("leaderboard").setDescription("XP-Rangliste des Servers")
  )
  .addSubcommand((sub) =>
    sub
      .setName("rolereward")
      .setDescription("Level-Rollen verwalten (Admin)")
      .addStringOption((opt: SlashCommandStringOption) =>
        opt.setName("aktion").setDescription("Aktion").setRequired(true)
          .addChoices(
            { name: "Rolle hinzufügen", value: "add" },
            { name: "Rolle entfernen", value: "remove" },
            { name: "Liste anzeigen", value: "list" },
            { name: "Alle löschen", value: "clear" }
          )
      )
      .addIntegerOption((opt: SlashCommandIntegerOption) =>
        opt.setName("level").setDescription("Level (für add/remove)").setRequired(false).setMinValue(1).setMaxValue(1000)
      )
      .addRoleOption((opt: SlashCommandRoleOption) =>
        opt.setName("rolle").setDescription("Rolle (für add)").setRequired(false)
      )
  );

function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

function levelFromXp(xp: number): number {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) {
    level++;
  }
  return level;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Nur auf einem Server nutzbar.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply();

  if (subcommand === "rank") {
    const user = interaction.options.getUser("nutzer") ?? interaction.user;
    const xpData = await stmts.getUserXp(interaction.guild.id, user.id);

    if (!xpData) {
      await interaction.editReply(`**${user.username}** hat noch keine XP gesammelt.`);
      return;
    }

    const nextLevelXp = xpForLevel(xpData.level + 1);
    const currentLevelXp = xpForLevel(xpData.level);
    const progress = xpData.xp - currentLevelXp;
    const needed = nextLevelXp - currentLevelXp;
    const barLength = 15;
    const filled = Math.min(barLength, Math.floor((progress / needed) * barLength));
    const bar = "█".repeat(filled) + "░".repeat(barLength - filled);

    const embed = new EmbedBuilder()
      .setTitle(`📊 Rang von ${user.username}`)
      .setColor(0xf799b9)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "Level", value: `${xpData.level}`, inline: true },
        { name: "XP", value: `${xpData.xp} / ${nextLevelXp}`, inline: true },
        { name: "Fortschritt", value: `\`${bar}\` ${Math.floor((progress / needed) * 100)}%` }
      );

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "leaderboard") {
    const board = await stmts.getLeaderboard(interaction.guild.id, 10);

    if (board.length === 0) {
      await interaction.editReply("Noch keine XP-Daten auf diesem Server.");
      return;
    }

    const lines = board.map((entry, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      return `${medal} <@${entry.user_id}> — Level ${entry.level} (${entry.xp} XP)`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🏆 XP-Rangliste")
      .setColor(0xf799b9)
      .setDescription(lines.join("\n"));

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "rolereward") {
    // Check permissions manually since per-subcommand setDefaultMemberPermissions is not available
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.editReply("❌ Du benötigst die `Server verwalten`-Berechtigung.");
      return;
    }

    const aktion = interaction.options.getString("aktion", true);

    if (aktion === "list") {
      const roles = await stmts.getLevelRoles(interaction.guild.id);
      if (roles.length === 0) {
        await interaction.editReply("Keine Level-Rollen konfiguriert.");
        return;
      }
      const list = roles.map((r) => `Level ${r.level} → <@&${r.role_id}>`).join("\n");
      await interaction.editReply(`📋 Level-Rollen:\n${list}`);
      return;
    }

    if (aktion === "clear") {
      await stmts.clearLevelRoles(interaction.guild.id);
      await interaction.editReply("Alle Level-Rollen gelöscht.");
      return;
    }

    const level = interaction.options.getInteger("level");
    if (!level) {
      await interaction.editReply("Bitte gib ein Level an.");
      return;
    }

    if (aktion === "add") {
      const role = interaction.options.getRole("rolle");
      if (!role) {
        await interaction.editReply("Bitte gib eine Rolle an.");
        return;
      }
      await stmts.addLevelRole(interaction.guild.id, level, role.id);
      await interaction.editReply(`✅ Level **${level}** → <@&${role.id}>`);
      return;
    }

    if (aktion === "remove") {
      await stmts.removeLevelRole(interaction.guild.id, level);
      await interaction.editReply(`🗑️ Level-Rolle für Level ${level} entfernt.`);
      return;
    }
  }
}
