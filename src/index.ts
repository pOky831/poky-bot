import "dotenv/config";
import { createBotClient } from "./bot.js";
import { startDashboard } from "./dashboard/server.js";
import { startOverview } from "./dashboard/overview.js";
import { client, initDatabase } from "./database/db.js";
import { Client } from "discord.js";

const instancesRaw = process.env.BOT_INSTANCES ?? "";
const instances: Array<{ id: string; token: string; name: string }> = instancesRaw
  .split(",")
  .filter(Boolean)
  .map((entry) => {
    const parts = entry.split(":");
    if (parts.length !== 2) throw new Error(`Invalid BOT_INSTANCES entry: ${entry}`);
    const [id, token] = parts;
    if (!id || !token) throw new Error(`Missing id or token in entry: ${entry}`);
    return { id, token, name: id };
  });

if (instances.length === 0) {
  throw new Error("BOT_INSTANCES must be configured in .env (format: id:token,id2:token2)");
}

let bots: Map<string, Client> = new Map();

function gracefulShutdown(signal: string): void {
  console.log(`\n${signal} received. Shutting down all bots...`);
  for (const bot of bots.values()) {
    bot.destroy();
  }
  client.close();
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

async function main(): Promise<void> {
  await initDatabase();
  bots = new Map<string, Client>();
  for (const instance of instances) {
    const bot = createBotClient();
    await bot.login(instance.token);
    bots.set(instance.id, bot);
  }
  startDashboard(bots, instances);
  startOverview();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
