import { ChatInputCommandInteraction, ButtonInteraction, Interaction, MessageFlags } from "discord.js";
import { commands } from "../bot.js";
import { handleGiveawayButton } from "../commands/giveaway.js";

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
    return;
  }
}
