import "dotenv/config";
import { createBotClient } from "./bot.js";
import { startDashboard } from "./dashboard/server.js";
import { db } from "./database/db.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  throw new Error("Missing env vars: DISCORD_TOKEN, CLIENT_ID");
}

// Cleanup DB on exit
function gracefulShutdown(signal: string): void {
  console.log(`\n${signal} received. Closing database...`);
  db.close();
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

async function main(): Promise<void> {
  const client = createBotClient();
  await client.login(token);
  startDashboard(client);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
