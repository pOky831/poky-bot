import type { VoiceState } from "discord.js";
import { musicManager } from "../music/musicPlayer.js";

export function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState
): void {
  // Only care about changes on the guild the bot is connected to
  const guild = oldState.guild ?? newState.guild;
  if (!guild) return;

  // Check if the bot is in a voice channel in this guild
  if (!musicManager.isInVoiceChannel(guild.id)) return;

  const botChannelId = musicManager.getVoiceChannelId(guild.id);
  if (!botChannelId) return;

  // If a non-bot member left the bot's VC
  if (oldState.channelId === botChannelId && !oldState.member?.user.bot) {
    // Small delay to let Discord update the member count
    setTimeout(() => {
      musicManager.handleVoiceStateUpdate(guild);
    }, 1000);
  }
}
