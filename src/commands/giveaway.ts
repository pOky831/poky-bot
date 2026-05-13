import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
  TextChannel,
  SlashCommandChannelOption,
  SlashCommandStringOption,
  SlashCommandIntegerOption,
} from "discord.js";
import { stmts, Giveaway } from "../database/db.js";

export const data = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("Giveaways verwalten")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Starte ein neues Giveaway")
      .addStringOption((opt: SlashCommandStringOption) =>
        opt.setName("preis").setDescription("Was wird verlost?").setRequired(true)
      )
      .addIntegerOption((opt: SlashCommandIntegerOption) =>
        opt
          .setName("dauer")
          .setDescription("Dauer in Minuten")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(10080)
      )
      .addIntegerOption((opt: SlashCommandIntegerOption) =>
        opt
          .setName("gewinner")
          .setDescription("Anzahl der Gewinner")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(20)
      )
      .addChannelOption((opt: SlashCommandChannelOption) =>
        opt
          .setName("kanal")
          .setDescription("Kanal für das Giveaway (Standard: aktueller Kanal)")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("end")
      .setDescription("Ein Giveaway vorzeitig beenden")
      .addStringOption((opt: SlashCommandStringOption) =>
        opt
          .setName("nachrichten_id")
          .setDescription("Die Nachrichten-ID des Giveaways")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("reroll")
      .setDescription("Gewinner eines beendeten Giveaways neu auslosen")
      .addStringOption((opt: SlashCommandStringOption) =>
        opt
          .setName("nachrichten_id")
          .setDescription("Die Nachrichten-ID des Giveaways")
          .setRequired(true)
      )
  );

// Active giveaway timers: Map<giveawayId, Timeout>
const activeTimers = new Map<number, NodeJS.Timeout>();

function createGiveawayEmbed(giveaway: Giveaway, entryCount: number): EmbedBuilder {
  const endsAt = new Date(giveaway.ends_at * 1000);
  return new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY 🎉")
    .setColor(0xf799b9)
    .setDescription(
      `**Preis:** ${giveaway.prize}\n` +
        `**Gewinner:** ${giveaway.winner_count}\n` +
        `**Teilnehmer:** ${entryCount}\n` +
        `**Endet:** <t:${giveaway.ends_at}:R> (<t:${giveaway.ends_at}:f>)\n\n` +
        `Klicke auf den Button, um teilzunehmen!`
    )
    .setFooter({ text: `Giveaway-ID: ${giveaway.id}` })
    .setTimestamp(endsAt);
}

function createGiveawayEndedEmbed(giveaway: Giveaway, winners: string[], entryCount: number): EmbedBuilder {
  const winnerMentions = winners.length > 0 ? winners.map((id) => `<@${id}>`).join(", ") : "Keine Teilnehmer";
  return new EmbedBuilder()
    .setTitle("🎉 GIVEAWAY BEENDET 🎉")
    .setColor(0x808080)
    .setDescription(
      `**Preis:** ${giveaway.prize}\n` +
        `**Gewinner:** ${winnerMentions}\n` +
        `**Teilnehmer:** ${entryCount}\n\n` +
        `Herzlichen Glückwunsch! 🥳`
    )
    .setFooter({ text: `Giveaway-ID: ${giveaway.id}` })
    .setTimestamp();
}

function pickWinners(entries: string[], count: number): string[] {
  if (entries.length === 0) return [];
  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

async function endGiveaway(giveaway: Giveaway, client: import("discord.js").Client): Promise<string[]> {
  if (giveaway.status !== "active") return [];

  const channel = (await client.channels.fetch(giveaway.channel_id).catch(() => null)) as TextChannel | null;
  if (!channel || !giveaway.message_id) {
    await stmts.endGiveaway(giveaway.id);
    return [];
  }

  const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
  const entries = await stmts.getGiveawayEntries(giveaway.id);
  const winners = pickWinners(entries, giveaway.winner_count);

  // Clear timer first
  const timer = activeTimers.get(giveaway.id);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(giveaway.id);
  }

  // Update the giveaway message before marking as ended in DB
  if (message) {
    const endedEmbed = createGiveawayEndedEmbed(giveaway, winners, entries.length);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("giveaway_ended")
        .setLabel("Giveaway beendet")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await message.edit({ embeds: [endedEmbed], components: [row] }).catch(() => {});
  }

  // Now mark as ended in DB
  await stmts.endGiveaway(giveaway.id);

  // Announce winners
  if (winners.length > 0) {
    await channel.send(`🎉 **Glückwunsch** ${winners.map((id) => `<@${id}>`).join(", ")}! Du hast **${giveaway.prize}** gewonnen!`).catch(() => {});
  } else {
    await channel.send(`😕 Keine Teilnehmer für **${giveaway.prize}** – das Giveaway wurde beendet.`).catch(() => {});
  }

  return winners;
}

async function rerollGiveaway(giveaway: Giveaway, client: import("discord.js").Client): Promise<string[]> {
  if (giveaway.status !== "ended") return [];

  const channel = (await client.channels.fetch(giveaway.channel_id).catch(() => null)) as TextChannel | null;
  if (!channel || !giveaway.message_id) return [];

  const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
  const entries = await stmts.getGiveawayEntries(giveaway.id);
  const winners = pickWinners(entries, giveaway.winner_count);

  // Update the giveaway message
  if (message) {
    const endedEmbed = createGiveawayEndedEmbed(giveaway, winners, entries.length);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("giveaway_ended")
        .setLabel("Giveaway beendet")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
    await message.edit({ embeds: [endedEmbed], components: [row] }).catch(() => {});
  }

  if (winners.length > 0) {
    await channel.send(`🔄 **Reroll!** ${winners.map((id) => `<@${id}>`).join(", ")} – neue Gewinner für **${giveaway.prize}**!`).catch(() => {});
  } else {
    await channel.send(`😕 Keine Teilnehmer für **${giveaway.prize}** – kein Reroll möglich.`).catch(() => {});
  }

  return winners;
}

// Exported for interactionCreate
export async function handleGiveawayButton(interaction: ButtonInteraction): Promise<void> {
  const giveawayId = Number(interaction.customId.replace("giveaway_enter_", ""));
  if (isNaN(giveawayId)) return;

  const giveaway = await stmts.getGiveaway(giveawayId);
  if (!giveaway || giveaway.status !== "active") {
    await interaction.reply({ content: "Dieses Giveaway ist nicht mehr aktiv.", ephemeral: true });
    return;
  }

  if (Date.now() / 1000 > giveaway.ends_at) {
    // Giveaway expired but not yet ended — end it now
    await endGiveaway(giveaway, interaction.client);
    await interaction.reply({ content: "Dieses Giveaway ist abgelaufen und wurde beendet.", ephemeral: true });
    return;
  }

  await stmts.addGiveawayEntry(giveawayId, interaction.user.id);
  const entryCount = await stmts.getGiveawayEntryCount(giveawayId);

  // Update the embed with new participant count
  const channel = interaction.channel as TextChannel | null;
  if (channel && giveaway.message_id) {
    const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
    if (message) {
      const embed = createGiveawayEmbed(giveaway, entryCount);
      await message.edit({ embeds: [embed] }).catch(() => {});
    }
  }

  await interaction.reply({
    content: `✅ Du nimmst jetzt am Giveaway für **${giveaway.prize}** teil! (${entryCount} Teilnehmer)`,
    ephemeral: true,
  });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Nur auf einem Server nutzbar.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "start") {
    await interaction.deferReply({ ephemeral: true });
    const prize = interaction.options.getString("preis", true);
    const durationMinutes = interaction.options.getInteger("dauer", true);
    const winnerCount = interaction.options.getInteger("gewinner") ?? 1;
    const targetChannel =
      (interaction.options.getChannel("kanal") as TextChannel | null) ?? (interaction.channel as TextChannel);

    if (!targetChannel || !("send" in targetChannel)) {
      await interaction.editReply("❌ Konnte den Channel nicht finden.");
      return;
    }

    const endsAt = Math.floor(Date.now() / 1000) + durationMinutes * 60;
    const giveawayId = await stmts.createGiveaway(
      interaction.guild.id,
      targetChannel.id,
      prize,
      winnerCount,
      endsAt,
      interaction.user.id
    );

    const giveaway = (await stmts.getGiveaway(giveawayId))!;
    const embed = createGiveawayEmbed(giveaway, 0);

    const button = new ButtonBuilder()
      .setCustomId(`giveaway_enter_${giveawayId}`)
      .setLabel("🎉 Teilnehmen")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    const message = await targetChannel.send({ embeds: [embed], components: [row] });
    await stmts.setGiveawayMessage(giveawayId, message.id);

    // Set auto-end timer
    const timeUntilEnd = (endsAt - Math.floor(Date.now() / 1000)) * 1000;
    const client = interaction.client;
    const timer = setTimeout(async () => {
      try {
        const gw = await stmts.getGiveaway(giveawayId);
        if (gw && gw.status === "active") {
          endGiveaway(gw, client).catch((err) => console.error("Giveaway auto-end error:", err));
        }
      } catch (err) {
        console.error("Giveaway timer error:", err);
      }
      activeTimers.delete(giveawayId);
    }, timeUntilEnd);
    activeTimers.set(giveawayId, timer);

    await interaction.editReply(
      `✅ Giveaway für **${prize}** gestartet in ${targetChannel}! (${winnerCount} Gewinner, endet <t:${endsAt}:R>)`
    );
    return;
  }

  if (subcommand === "end") {
    const messageId = interaction.options.getString("nachrichten_id", true);
    const giveaway = await stmts.getGiveawayByMessage(messageId);

    if (!giveaway) {
      await interaction.reply({ content: "❌ Kein Giveaway mit dieser Nachrichten-ID gefunden.", ephemeral: true });
      return;
    }

    if (giveaway.status !== "active") {
      await interaction.reply({ content: "❌ Dieses Giveaway ist bereits beendet.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const winners = await endGiveaway(giveaway, interaction.client);
    await interaction.editReply(
      `✅ Giveaway für **${giveaway.prize}** wurde beendet. ${winners.length} Gewinner: ${winners.map((id) => `<@${id}>`).join(", ") || "Keine"}`
    );
    return;
  }

  if (subcommand === "reroll") {
    const messageId = interaction.options.getString("nachrichten_id", true);
    const giveaway = await stmts.getGiveawayByMessage(messageId);

    if (!giveaway) {
      await interaction.reply({ content: "❌ Kein Giveaway mit dieser Nachrichten-ID gefunden.", ephemeral: true });
      return;
    }

    if (giveaway.status !== "ended") {
      await interaction.reply({ content: "❌ Dieses Giveaway ist noch aktiv. Beende es zuerst mit `/giveaway end`.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const winners = await rerollGiveaway(giveaway, interaction.client);
    await interaction.editReply(
      `🔄 Reroll für **${giveaway.prize}**: ${winners.length} neue Gewinner ausgelost!`
    );
    return;
  }
}

// Restart active giveaway timers (called from ready.ts)
export async function startGiveawayTimers(client: import("discord.js").Client): Promise<void> {
  const activeGiveaways = await stmts.getActiveGiveaways();
  for (const giveaway of activeGiveaways) {
    const timeUntilEnd = (giveaway.ends_at - Math.floor(Date.now() / 1000)) * 1000;
    if (timeUntilEnd <= 0) {
      endGiveaway(giveaway, client).catch((err) => console.error("Giveaway auto-end error:", err));
      continue;
    }
    const timer = setTimeout(async () => {
      try {
        const gw = await stmts.getGiveaway(giveaway.id);
        if (gw && gw.status === "active") {
          endGiveaway(gw, client).catch((err) => console.error("Giveaway auto-end error:", err));
        }
      } catch (err) {
        console.error("Giveaway timer error:", err);
      }
      activeTimers.delete(giveaway.id);
    }, timeUntilEnd);
    activeTimers.set(giveaway.id, timer);
  }
}
