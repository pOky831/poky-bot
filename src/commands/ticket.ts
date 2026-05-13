import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  OverwriteType,
} from "discord.js";
import { stmts } from "../database/db.js";

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Ticket-System")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Ein neues Ticket erstellen")
      .addStringOption((opt) => opt.setName("grund").setDescription("Grund für das Ticket"))
  )
  .addSubcommand((sub) =>
    sub
      .setName("close")
      .setDescription("Das aktuelle Ticket schließen")
      .addStringOption((opt) => opt.setName("grund").setDescription("Grund für das Schließen"))
  )
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Ticket-System einrichten (Admin)")
      .addChannelOption((opt) =>
        opt
          .setName("kategorie")
          .setDescription("Kategorie für neue Tickets")
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(true)
      )
      .addChannelOption((opt) =>
        opt
          .setName("log_kanal")
          .setDescription("Kanal für Ticket-Logs")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Nur auf einem Server nutzbar.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "create") {
    const settings = await stmts.getGuildSettings(interaction.guild.id);
    if (!settings?.ticket_category_id) {
      await interaction.reply({ content: "Ticket-System ist nicht eingerichtet. Ein Admin muss `/ticket setup` ausführen.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Check if user already has an open ticket
    const openTickets = await stmts.getOpenTickets(interaction.guild.id);
    const existing = openTickets.find((t) => t.creator_id === interaction.user.id);
    if (existing) {
      await interaction.editReply(`Du hast bereits ein offenes Ticket: <#${existing.channel_id}>`);
      return;
    }

    const reason = interaction.options.getString("grund") ?? "Kein Grund angegeben";
    const category = await interaction.guild.channels.fetch(settings.ticket_category_id).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      await interaction.editReply("Ticket-Kategorie nicht gefunden. Bitte neu einrichten.");
      return;
    }

    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
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
      ],
    });

    await stmts.insertTicket(interaction.guild.id, ticketChannel.id, interaction.user.id, interaction.user.tag, reason);

    await ticketChannel.send({
      content: `Hallo <@${interaction.user.id}>!\nEin Team-Mitglied wird sich gleich um dich kümmern.\n**Grund:** ${reason}`,
    });

    await interaction.editReply(`Ticket erstellt: <#${ticketChannel.id}>`);

    // Log
    if (settings.ticket_log_channel_id) {
      const logChannel = interaction.guild.channels.cache.get(settings.ticket_log_channel_id) as TextChannel | undefined;
      if (logChannel?.send) {
        await logChannel.send(
          `🎫 Ticket erstellt von **${interaction.user.tag}** — <#${ticketChannel.id}> — Grund: ${reason}`
        );
      }
    }
    return;
  }

  if (subcommand === "close") {
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "Dies ist kein Textkanal.", ephemeral: true });
      return;
    }

    const ticket = await stmts.getTicketByChannel(channel.id);
    if (!ticket) {
      await interaction.reply({ content: "Dies ist kein Ticket-Kanal.", ephemeral: true });
      return;
    }

    if (ticket.status === "closed") {
      await interaction.reply({ content: "Dieses Ticket ist bereits geschlossen.", ephemeral: true });
      return;
    }

    const closeReason = interaction.options.getString("grund") ?? "Kein Grund angegeben";
    await stmts.closeTicket(interaction.user.id, interaction.user.tag, closeReason, channel.id);

    await interaction.reply({ content: `Ticket wird geschlossen... Grund: ${closeReason}` });

    const settings = await stmts.getGuildSettings(interaction.guild.id);
    if (settings?.ticket_log_channel_id) {
      const logChannel = interaction.guild.channels.cache.get(settings.ticket_log_channel_id) as TextChannel | undefined;
      if (logChannel?.send) {
        await logChannel.send(
          `🔒 Ticket <#${channel.id}> geschlossen von **${interaction.user.tag}** — Grund: ${closeReason}`
        );
      }
    }

    // Archive: rename and lock
    await channel.edit({
      name: `closed-${channel.name.replace(/^ticket-/, "")}`,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.client.user.id,
          type: OverwriteType.Member,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
        },
      ],
    });

    await channel.send("Dieses Ticket wurde geschlossen.");
    return;
  }

  if (subcommand === "setup") {
    const category = interaction.options.getChannel("kategorie", true);
    const logChannel = interaction.options.getChannel("log_kanal", true);
    const existing = await stmts.getGuildSettings(interaction.guild.id);

    await stmts.setGuildSettings(
      interaction.guild.id,
      existing?.welcome_channel_id ?? null,
      category.id,
      logChannel.id,
      existing?.mod_role_id ?? null,
      existing?.log_channel_id ?? null,
      existing?.automod_enabled ?? 0
    );

    await interaction.reply({
      content: `Ticket-System eingerichtet!\nKategorie: **${category.name}**\nLog-Kanal: <#${logChannel.id}>`,
      ephemeral: true,
    });
    return;
  }
}
