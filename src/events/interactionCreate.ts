import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  Interaction,
  MessageFlags,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
  TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} from "discord.js";
import { commands } from "../bot.js";
import { handleGiveawayButton } from "../commands/giveaway.js";
import { stmts } from "../database/db.js";
import { buildTicketTranscript, sendTranscriptToLog } from "../utils/helpers.js";

export async function handleInteractionCreate(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand()) {
    const command = commands.find((c) => c.data.name === interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Fehler bei /${interaction.commandName}:`, error);
      const reply = { content: "Ein Fehler ist aufgetreten.", flags: MessageFlags.Ephemeral as number };
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply(reply);
      }
    }
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith("giveaway_enter_")) {
      try {
        await handleGiveawayButton(interaction);
      } catch (error) {
        console.error("❌ Fehler bei Giveaway-Button:", error);
        const reply = { content: "Ein Fehler ist aufgetreten.", flags: MessageFlags.Ephemeral as number };
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    }

    if (interaction.customId.startsWith("ticket_close_")) {
      try {
        await handleTicketCloseButton(interaction);
      } catch (error) {
        console.error("❌ Fehler bei Ticket-Close-Button:", error);
        const reply = { content: "Ein Fehler ist aufgetreten.", flags: MessageFlags.Ephemeral as number };
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "ticket_open") {
      try {
        await handleTicketSelect(interaction);
      } catch (error) {
        console.error("❌ Fehler bei Ticket-Select:", error);
        const reply = { content: "Ein Fehler ist aufgetreten.", flags: MessageFlags.Ephemeral as number };
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("ticket_close_modal_")) {
      try {
        await handleTicketCloseModal(interaction);
      } catch (error) {
        console.error("❌ Fehler bei Ticket-Close-Modal:", error);
        const reply = { content: "Ein Fehler ist aufgetreten.", flags: MessageFlags.Ephemeral as number };
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    }
    return;
  }
}

async function handleTicketCloseButton(interaction: ButtonInteraction): Promise<void> {
  const channelId = interaction.customId.replace("ticket_close_", "");
  const channel = interaction.channel as TextChannel | null;

  if (!channel || channel.id !== channelId) {
    await interaction.reply({ content: "Dieser Button gehört nicht zu diesem Kanal.", ephemeral: true });
    return;
  }

  const ticket = await stmts.getTicketByChannel(channelId);
  if (!ticket) {
    await interaction.reply({ content: "Dies ist kein Ticket-Kanal.", ephemeral: true });
    return;
  }

  if (ticket.status === "closed") {
    await interaction.reply({ content: "Dieses Ticket ist bereits geschlossen.", ephemeral: true });
    return;
  }

  // Show modal to ask for close reason
  const modal = new ModalBuilder()
    .setCustomId(`ticket_close_modal_${channelId}`)
    .setTitle("Ticket schließen");

  const reasonInput = new TextInputBuilder()
    .setCustomId("close_reason")
    .setLabel("Grund für das Schließen")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Optional: Grund für das Schließen angeben...")
    .setRequired(false)
    .setMaxLength(500);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleTicketCloseModal(interaction: ModalSubmitInteraction): Promise<void> {
  const channelId = interaction.customId.replace("ticket_close_modal_", "");
  const channel = interaction.channel as TextChannel | null;
  const guild = interaction.guild;

  if (!channel || !guild) {
    await interaction.reply({ content: "Kanal nicht gefunden.", ephemeral: true });
    return;
  }

  const closeReason = interaction.fields.getTextInputValue("close_reason").trim() || "Kein Grund angegeben";

  // Save transcript before closing
  const transcriptContent = await buildTicketTranscript(
    channel,
    channelId,
    interaction.user.tag,
    closeReason
  );

  // Send transcript to log channel if configured
  const settings = await stmts.getGuildSettings(guild.id);
  await sendTranscriptToLog(
    guild,
    settings?.ticket_log_channel_id ?? null,
    transcriptContent,
    channelId,
    interaction.user.tag,
    closeReason
  );

  await stmts.closeTicket(interaction.user.id, interaction.user.tag, closeReason, channelId);

  await interaction.reply({ content: "🔒 Ticket wird gelöscht...", ephemeral: true });

  setTimeout(() => {
    channel?.delete().catch(() => {});
  }, 3000);
}

async function handleTicketSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Nur auf einem Server nutzbar.", ephemeral: true });
    return;
  }

  const selectedOption = interaction.values[0];

  // Bestimme die Ticket-Kategorie:
  // 1) guild_settings.ticket_category_id (vom /ticket setup Befehl)
  // 2) Fallback: Parent-Kategorie des Ticket-Panel-Kanals
  const settings = await stmts.getGuildSettings(guild.id);
  let categoryId: string | null = settings?.ticket_category_id ?? null;

  if (!categoryId) {
    // Fallback: Ticket-Panel-Kanal ermitteln und dessen Parent nutzen
    const panel = await stmts.getTicketPanel(guild.id);
    if (panel) {
      const panelChannel = await guild.channels.fetch(panel.channel_id).catch(() => null);
      if (panelChannel && "parentId" in panelChannel && panelChannel.parentId) {
        categoryId = panelChannel.parentId;
      }
    }
  }

  if (!categoryId) {
    await interaction.reply({ content: "Ticket-System ist nicht eingerichtet. Ein Admin muss es über das Dashboard oder `/ticket setup` konfigurieren.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Check if user already has an open ticket
  const openTickets = await stmts.getOpenTickets(guild.id);
  const existing = openTickets.find((t) => t.creator_id === interaction.user.id);
  if (existing) {
    await interaction.editReply(`Du hast bereits ein offenes Ticket: <#${existing.channel_id}>`);
    return;
  }

  const category = await guild.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    await interaction.editReply("Ticket-Kategorie nicht gefunden. Bitte neu einrichten.");
    return;
  }

  // Build permission overwrites with support roles
  const supportRoles = await stmts.getTicketSupportRoles(guild.id);
  const permissionOverwrites = [
    {
      id: guild.id,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: interaction.user.id,
      type: OverwriteType.Member,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    {
      id: interaction.client.user.id,
      type: OverwriteType.Member,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
    },
  ];

  for (const sr of supportRoles) {
    permissionOverwrites.push({
      id: sr.role_id,
      type: OverwriteType.Role,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
  });

  await stmts.insertTicket(guild.id, ticketChannel.id, interaction.user.id, interaction.user.tag, selectedOption);

  await ticketChannel.send({
    content: `Hallo <@${interaction.user.id}>!\nEin Team-Mitglied wird sich gleich um dich kümmern.\n**Grund:** ${selectedOption}`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_close_${ticketChannel.id}`)
          .setLabel("🔒 Ticket schließen")
          .setStyle(ButtonStyle.Danger)
      ),
    ],
  });

  await interaction.editReply(`Ticket erstellt: <#${ticketChannel.id}>`);

  // Log
  if (settings?.ticket_log_channel_id) {
    const logChannel = guild.channels.cache.get(settings.ticket_log_channel_id) as TextChannel | undefined;
    if (logChannel?.send) {
      await logChannel.send(
        `🎫 Ticket erstellt von **${interaction.user.tag}** — <#${ticketChannel.id}> — Grund: ${selectedOption}`
      );
    }
  }
}
