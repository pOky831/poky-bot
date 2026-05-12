import { Client, Events, GatewayIntentBits, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import * as pingCommand from "./commands/ping.js";
import * as welcomeCommand from "./commands/welcome.js";
import * as moderationCommand from "./commands/moderation.js";
import * as ticketCommand from "./commands/ticket.js";
import * as automodCommand from "./commands/automod.js";
import * as levelingCommand from "./commands/leveling.js";
import * as giveawayCommand from "./commands/giveaway.js";
import { handleReady } from "./events/ready.js";
import { handleGuildCreate } from "./events/guildCreate.js";
import { handleInteractionCreate } from "./events/interactionCreate.js";
import { handleMessageCreate } from "./events/messageCreate.js";

export interface Command {
  data: SlashCommandBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [
  pingCommand as unknown as Command,
  welcomeCommand as unknown as Command,
  moderationCommand as unknown as Command,
  ticketCommand as unknown as Command,
  automodCommand as unknown as Command,
  levelingCommand as unknown as Command,
  giveawayCommand as unknown as Command,
];

export function createBotClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, () => handleReady(client));
  client.on(Events.GuildCreate, handleGuildCreate);
  client.on(Events.InteractionCreate, (interaction) => {
    handleInteractionCreate(interaction);
  });
  client.on(Events.MessageCreate, handleMessageCreate);

  return client;
}
