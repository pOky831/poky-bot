import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Zeigt die Bot-Latenz an");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const response = await interaction.reply({ content: "Pong!", withResponse: true });
  const latency = (response.resource?.message?.createdTimestamp ?? Date.now()) - interaction.createdTimestamp;
  await interaction.editReply(`Pong! 🏓\nBot-Latenz: ${latency}ms\nAPI-Latenz: ${interaction.client.ws.ping}ms`);
}
