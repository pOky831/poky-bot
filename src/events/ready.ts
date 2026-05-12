import { Client, REST, Routes } from "discord.js";
import { commands } from "../bot.js";
import { stmts } from "../database/db.js";
import { startGiveawayTimers } from "../commands/giveaway.js";

export async function handleReady(client: Client): Promise<void> {
  console.log(`✅ Bot online als ${client.user?.tag}`);
  console.log(`📊 Verbunden mit ${client.guilds.cache.size} Servern`);

  // Populate guild cache for dashboard
  for (const guild of client.guilds.cache.values()) {
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
      // silently skip guilds we can't fetch
    }
  }

  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) return;

  const rest = new REST({ version: "10" }).setToken(token);
  const guilds = [...client.guilds.cache.values()];

  if (guilds.length === 0) {
    console.warn("⚠️ Bot ist auf keinem Server. Registriere globale Commands (können bis zu 1h dauern).");
    await rest.put(Routes.applicationCommands(clientId), { body: commands.map((c) => c.data.toJSON()) });
    console.log("🌐 Globale Commands registriert.");
    return;
  }

  for (const guild of guilds) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guild.id), {
        body: commands.map((c) => c.data.toJSON()),
      });
      console.log(`📋 Commands registriert für ${guild.name}`);
    } catch (err) {
      console.warn(`⚠️ Konnte Commands nicht für ${guild.name} registrieren. Bot muss mit 'applications.commands' Scope eingeladen sein.`);
    }
  }

  // Restart giveaway timers for active giveaways
  startGiveawayTimers(client);
}
