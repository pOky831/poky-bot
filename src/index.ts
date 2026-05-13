import "dotenv/config";
import { createBotClient } from "./bot.js";
import { startDashboard } from "./dashboard/server.js";
import { client, initDatabase } from "./database/db.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  throw new Error("Missing env vars: DISCORD_TOKEN, CLIENT_ID");
}

// Cleanup DB on exit
function gracefulShutdown(signal: string): void {
  console.log(`\n${signal} received. Closing database...`);
  client.close();
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

async function main(): Promise<void> {
  await initDatabase();
  const bot = createBotClient();
  await bot.login(token);
  startDashboard(bot);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
