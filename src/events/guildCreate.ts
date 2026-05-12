import { Guild, REST, Routes } from "discord.js";
import { commands } from "../bot.js";
import { stmts } from "../database/db.js";

export async function handleGuildCreate(guild: Guild): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) return;

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guild.id), {
      body: commands.map((c) => c.data.toJSON()),
    });
    console.log(`📋 Commands registriert für neuen Server: ${guild.name}`);
  } catch {
    console.warn(`⚠️ Konnte Commands nicht für ${guild.name} registrieren.`);
  }

  // Cache guild for dashboard
  try {
    const fullGuild = await guild.fetch();
    stmts.upsertGuildCache(
      fullGuild.id,
      fullGuild.name,
      fullGuild.icon,
      fullGuild.memberCount,
      fullGuild.ownerId
    );
  } catch {
    // silently skip
  }
}
