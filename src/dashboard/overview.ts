import express from "express";
import { resolve } from "node:path";

const app = express();
const PORT = process.env.DASHBOARD_OVERVIEW_PORT ? parseInt(process.env.DASHBOARD_OVERVIEW_PORT, 10) : 3001;

// EJS setup
app.set("view engine", "ejs");
app.set("views", resolve(process.cwd(), "src/dashboard/views"));
app.use(express.static(resolve(process.cwd(), "src/dashboard/public")));

// Konfiguration der verfügbaren Dashboards (erweiterbar)
interface DashboardInfo {
  id: string;
  name: string;
  url: string;
  description: string;
  icon?: string;
}

const dashboards: DashboardInfo[] = [
  {
    id: "poky",
    name: "pOky Bot",
    url: "http://45.131.109.117:3000", // öffentlicher Link zum pOky Dashboard
    description: "All-in-One Discord Bot (Auto-Mod, Warnsystem, Tickets, Leveling, Giveaways, Musik)",
    icon: "/images/poky-icon.png", // optional, später anpassen
  },
  {
    id: "ncrp",
    name: "NCRP Admin Bot",
    url: "http://45.131.109.117:3002/dashboard", // Haupt-Dashboard des NCRP Admin Bots
    description: "Admin-Panel des NCRP Admin Bots (Tickets, Moderation, Roblox-Verifizierung)",
    icon: "/images/ncrp-icon.png", // optional, später anpassen
  },
];

// Startseite der Übersichtsseite
app.get("/", (req, res) => {
  res.render("overview", { dashboards });
});

// API: Liste der Dashboards (optional, für zukünftige Erweiterungen)
app.get("/api/dashboards", (req, res) => {
  res.json(dashboards);
});

export function startOverview(): void {
  app.listen(PORT, () => {
    console.log(`🌐 Übersichts-Dashboard läuft auf http://localhost:${PORT}`);
  });
}

export { app, dashboards };
