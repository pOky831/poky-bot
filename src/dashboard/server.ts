import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import { resolve } from "node:path";
import { Client } from "discord.js";
import { db, stmts } from "../database/db.js";
import type { GuildSettings, ModLog, Ticket, GuildCacheEntry, Giveaway, MemberNote } from "../database/db.js";
import { timestampToDate } from "../utils/helpers.js";

let botClient: Client | null = null;

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (process.env.DASHBOARD_PORT ? parseInt(process.env.DASHBOARD_PORT, 10) : 3000);
const CALLBACK_URL = process.env.DASHBOARD_CALLBACK_URL ?? `http://localhost:${PORT}/auth/discord/callback`;

// EJS setup
app.set("view engine", "ejs");
app.set("views", resolve(process.cwd(), "src/dashboard/views"));
app.use(express.static(resolve(process.cwd(), "src/dashboard/public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? (() => { throw new Error("SESSION_SECRET environment variable is required"); })(),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // 1 day
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Passport Discord OAuth2
passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.CLIENT_ID ?? "",
      clientSecret: process.env.CLIENT_SECRET ?? "",
      callbackURL: CALLBACK_URL,
      scope: ["identify", "guilds"],
    },
    (accessToken, refreshToken, profile, done) => {
      done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj as Express.User));

// Types
interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
  guilds: DiscordGuild[];
}

// Auth middleware
function ensureAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// Routes
app.get("/", (req, res) => {
  res.render("index", { user: req.user as DiscordUser | undefined });
});

app.get("/login", passport.authenticate("discord"));

app.get(
  "/auth/discord/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/dashboard");
  }
);

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

app.get("/dashboard", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const adminGuilds = user.guilds.filter((g) => {
    const perms = BigInt(g.permissions);
    return (perms & BigInt(0x8)) === BigInt(0x8) || g.owner;
  });

  const guilds = adminGuilds.map((g) => {
    const cached = stmts.getGuildCache(g.id);
    return {
      id: g.id,
      name: g.name,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
      memberCount: cached?.member_count ?? null,
    };
  });

  res.render("dashboard", { user, guilds });
});

app.get("/dashboard/guild/:id", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const guild = user.guilds.find((g) => g.id === guildId);
  if (!guild) return res.status(403).render("error", { message: "Kein Zugriff auf diesen Server." });

  const perms = BigInt(guild.permissions);
  const isAdmin = (perms & BigInt(0x8)) === BigInt(0x8) || guild.owner;
  if (!isAdmin) return res.status(403).render("error", { message: "Admin-Rechte erforderlich." });

  const settings = stmts.getGuildSettings(guildId);
  const modLogs = stmts.getModLogs(guildId);
  const tickets = stmts.getTickets(guildId);
  const modCount = stmts.getStats(guildId)?.count ?? 0;
  const ticketCount = stmts.getTicketCount(guildId)?.count ?? 0;
  const openTicketCount = stmts.getOpenTicketCount(guildId)?.count ?? 0;
  const automodConfig = stmts.getAutomodConfig(guildId) as Record<string, number> | undefined;
  const automodWords = stmts.getAutomodWords(guildId);
  const levelRoles = stmts.getLevelRoles(guildId);
  const levelChannelId = stmts.getLevelChannel(guildId);
  const giveaways = stmts.getGiveawaysByGuild(guildId).map((gw) => ({
    ...gw,
    entryCount: stmts.getGiveawayEntryCount(gw.id),
    created_at_formatted: timestampToDate(gw.created_at),
  }));

  const cached = stmts.getGuildCache(guildId);

  res.render("guild", {
    user,
    guild: {
      id: guildId,
      name: guild.name,
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.png` : null,
      memberCount: cached?.member_count ?? null,
    },
    settings,
    modLogs: modLogs.slice(0, 50).map((log) => ({
      ...log,
      created_at_formatted: timestampToDate(log.created_at),
    })),
    tickets: tickets.slice(0, 50).map((t) => ({
      ...t,
      created_at_formatted: timestampToDate(t.created_at),
      closed_at_formatted: t.closed_at ? timestampToDate(t.closed_at) : null,
    })),
    stats: {
      modCount,
      ticketCount,
      openTicketCount,
    },
    automod: {
      enabled: automodConfig?.automod_enabled ?? 0,
      spamThreshold: automodConfig?.automod_spam_threshold ?? 0,
      linkFilter: automodConfig?.automod_link_filter ?? 0,
      mentionCap: automodConfig?.automod_mention_cap ?? 0,
      words: automodWords,
    },
    leveling: {
      levelRoles,
      levelChannelId,
    },
    giveaways,
  });
});

// API: Automod settings
app.post("/api/guild/:id/automod/toggle", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const { enabled } = req.body;
  stmts.setAutomodEnabled(guildId, enabled ? 1 : 0);
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/spam", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const { threshold } = req.body;
  stmts.setAutomodSpam(guildId, Number(threshold));
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/linkfilter", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const { enabled } = req.body;
  stmts.setAutomodLinkFilter(guildId, enabled ? 1 : 0);
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/mentioncap", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const { cap } = req.body;
  stmts.setAutomodMentionCap(guildId, Number(cap));
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/words/add", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const { word } = req.body;
  if (!word || typeof word !== "string") {
    return res.status(400).json({ error: "Kein Wort angegeben." });
  }
  stmts.addAutomodWord(guildId, word.toLowerCase());
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/words/remove", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const { word } = req.body;
  if (!word || typeof word !== "string") {
    return res.status(400).json({ error: "Kein Wort angegeben." });
  }
  stmts.removeAutomodWord(guildId, word.toLowerCase());
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/words/clear", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  stmts.clearAutomodWords(guildId);
  res.json({ success: true });
});

function validateGuildAccess(req: express.Request, res: express.Response, user: DiscordUser): string | null {
  const guildId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const guild = user.guilds.find((g) => g.id === guildId);
  if (!guild) {
    res.status(403).json({ error: "No access" });
    return null;
  }
  const perms = BigInt(guild.permissions);
  const isAdmin = (perms & BigInt(0x8)) === BigInt(0x8) || guild.owner;
  if (!isAdmin) {
    res.status(403).json({ error: "No access" });
    return null;
  }
  return guildId;
}

// API: Leveling
app.post("/api/guild/:id/leveling/channel", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;
  const { channelId } = req.body;
  stmts.setLevelChannel(guildId, channelId || "");
  res.json({ success: true });
});

app.post("/api/guild/:id/leveling/role/add", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;
  const { level, roleId } = req.body;
  if (!level || !roleId) return res.status(400).json({ error: "Level und RoleId erforderlich." });
  stmts.addLevelRole(guildId, Number(level), roleId);
  res.json({ success: true });
});

app.post("/api/guild/:id/leveling/role/remove", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;
  const { level } = req.body;
  if (!level) return res.status(400).json({ error: "Level erforderlich." });
  stmts.removeLevelRole(guildId, Number(level));
  res.json({ success: true });
});

app.post("/api/guild/:id/leveling/role/clear", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;
  stmts.clearLevelRoles(guildId);
  res.json({ success: true });
});

// API routes for the dashboard
app.get("/api/guild/:id/stats", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const guild = user.guilds.find((g) => g.id === guildId);
  if (!guild) return res.status(403).json({ error: "No access" });

  const modCount = stmts.getStats(guildId)?.count ?? 0;
  const ticketCount = stmts.getTicketCount(guildId)?.count ?? 0;
  const openTicketCount = stmts.getOpenTicketCount(guildId)?.count ?? 0;

  res.json({ modCount, ticketCount, openTicketCount });
});

// API: Members list
app.get("/api/guild/:id/members", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  if (!botClient) return res.status(500).json({ error: "Bot nicht verbunden." });

  try {
    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });

    const members = await guild.members.fetch();
    const memberList = members
      .filter((m) => !m.user.bot)
      .map((m) => {
        const warns = stmts.getWarns(guildId, m.user.id);
        return {
          id: m.user.id,
          tag: m.user.tag,
          username: m.user.username,
          displayName: m.displayName,
          avatar: m.user.avatar
            ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
            : null,
          joinedAt: m.joinedAt?.toISOString() ?? null,
          roles: m.roles.cache
            .filter((r) => r.id !== guildId)
            .map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
          warnCount: warns.length,
        };
      });

    res.json(memberList);
  } catch (err) {
    console.error("Fehler beim Abrufen der Mitglieder:", err);
    res.status(500).json({ error: "Fehler beim Abrufen der Mitglieder." });
  }
});

// API: Member detail
app.get("/api/guild/:id/members/:userId", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  if (!botClient) return res.status(500).json({ error: "Bot nicht verbunden." });

  try {
    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ error: "Mitglied nicht gefunden." });

    const warns = stmts.getWarns(guildId, userId);
    const modLogs = stmts.getModLogsForUser(guildId, userId);

    res.json({
      id: member.user.id,
      tag: member.user.tag,
      username: member.user.username,
      displayName: member.displayName,
      avatar: member.user.avatar
        ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png`
        : null,
      joinedAt: member.joinedAt?.toISOString() ?? null,
      createdAt: member.user.createdAt.toISOString(),
      roles: member.roles.cache
        .filter((r) => r.id !== guildId)
        .map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
      warnCount: warns.length,
      warns: warns.map((w) => ({
        ...w,
        created_at_formatted: timestampToDate(w.created_at),
      })),
      modLogs: modLogs.slice(0, 20).map((log) => ({
        ...log,
        created_at_formatted: timestampToDate(log.created_at),
      })),
      communicationDisabledUntil: member.communicationDisabledUntil?.toISOString() ?? null,
      notes: stmts.getMemberNotes(guildId, userId).map((n: MemberNote) => ({
        ...n,
        created_at_formatted: timestampToDate(n.created_at),
        updated_at_formatted: n.updated_at !== n.created_at ? timestampToDate(n.updated_at) : null,
      })),
    });
  } catch (err) {
    console.error("Fehler beim Abrufen des Mitglieds:", err);
    res.status(500).json({ error: "Fehler beim Abrufen des Mitglieds." });
  }
});

// API: Timeout a member from dashboard
app.post("/api/guild/:id/members/:userId/timeout", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { duration, reason } = req.body;
  const timeoutReason = reason?.trim() || "Kein Grund angegeben";
  const maxDurationMs = 28 * 24 * 60 * 60 * 1000; // Discord max: 28 days
  let durationMs = Number(duration) || 60000;
  if (durationMs > maxDurationMs) {
    return res.status(400).json({ error: "Timeout darf maximal 28 Tage betragen." });
  }
  if (durationMs < 1000) durationMs = 60000;

  if (!botClient) return res.status(500).json({ error: "Bot nicht verbunden." });

  try {
    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ error: "Mitglied nicht gefunden." });

    await member.timeout(durationMs, timeoutReason);
    stmts.insertModLog(guildId, userId, member.user.tag, user.id, user.username, "Timeout", timeoutReason, `${Math.round(durationMs / 1000)}s`);

    res.json({ success: true, until: new Date(Date.now() + durationMs).toISOString() });
  } catch (err) {
    console.error("Fehler beim Timeout:", err);
    res.status(500).json({ error: "Fehler beim Timeout." });
  }
});

// API: Remove timeout from a member
app.post("/api/guild/:id/members/:userId/untimeout", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  if (!botClient) return res.status(500).json({ error: "Bot nicht verbunden." });

  try {
    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ error: "Mitglied nicht gefunden." });

    await member.timeout(null);
    stmts.insertModLog(guildId, userId, member.user.tag, user.id, user.username, "Untimeout", "Timeout aufgehoben", null);

    res.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Entfernen des Timeouts:", err);
    res.status(500).json({ error: "Fehler beim Entfernen des Timeouts." });
  }
});

// API: Member notes
app.get("/api/guild/:id/members/:userId/notes", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const notes = stmts.getMemberNotes(guildId, userId).map((n: MemberNote) => ({
    ...n,
    created_at_formatted: timestampToDate(n.created_at),
    updated_at_formatted: n.updated_at !== n.created_at ? timestampToDate(n.updated_at) : null,
  }));
  res.json(notes);
});

app.post("/api/guild/:id/members/:userId/notes", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { note } = req.body;
  if (!note || typeof note !== "string" || !note.trim()) {
    return res.status(400).json({ error: "Notiztext erforderlich." });
  }

  if (!botClient) return res.status(500).json({ error: "Bot nicht verbunden." });
  const guild = botClient.guilds.cache.get(guildId);
  const memberTag = guild?.members.cache.get(userId)?.user.tag ?? userId;

  const noteId = stmts.insertMemberNote(guildId, userId, memberTag, user.id, user.username, note.trim());
  res.json({ success: true, id: noteId });
});

app.post("/api/guild/:id/members/:userId/notes/:noteId", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  const { note } = req.body;
  if (!note || typeof note !== "string" || !note.trim()) {
    return res.status(400).json({ error: "Notiztext erforderlich." });
  }

  stmts.updateMemberNote(noteId, guildId, note.trim());
  res.json({ success: true });
});

app.delete("/api/guild/:id/members/:userId/notes/:noteId", ensureAuth, (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  if (isNaN(noteId)) return res.status(400).json({ error: "Ungültige Notiz-ID." });
  stmts.deleteMemberNote(noteId, guildId);
  res.json({ success: true });
});

// Warn-Rollen Namen
const WARN_ROLE_NAMES = ["1-Warn", "2-Warn", "3-Warn"];

async function findOrCreateWarnRole(guild: import("discord.js").Guild, roleName: string): Promise<import("discord.js").Role | null> {
  let role = guild.roles.cache.find((r) => r.name === roleName);
  if (!role) {
    try {
      role = await guild.roles.create({
        name: roleName,
        color: 0xfaa81a,
        reason: "Warn-Rolle erstellt",
      });
    } catch {
      return null;
    }
  }
  return role;
}

async function removeAllWarnRoles(member: import("discord.js").GuildMember): Promise<void> {
  const rolesToRemove = member.roles.cache.filter((r) =>
    WARN_ROLE_NAMES.includes(r.name)
  );
  if (rolesToRemove.size > 0) {
    await member.roles.remove(rolesToRemove, "Warn-Rollen entfernt").catch(() => {});
  }
}

// API: Warn a member from dashboard
app.post("/api/guild/:id/members/:userId/warn", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const guildId = validateGuildAccess(req, res, user);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { reason } = req.body;
  const warnReason = reason?.trim() || "Kein Grund angegeben";

  if (!botClient) return res.status(500).json({ error: "Bot nicht verbunden." });

  try {
    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ error: "Mitglied nicht gefunden." });

    // Insert warn into DB
    stmts.insertWarn(guildId, userId, member.user.tag, user.id, user.username, warnReason);
    stmts.insertModLog(guildId, userId, member.user.tag, user.id, user.username, "Warn", warnReason, null);

    const warnCount = stmts.getWarns(guildId, userId).length;
    const cycleIndex = (warnCount - 1) % 4; // 0,1,2,3

    let actionTaken = "";

    if (cycleIndex < 3) {
      // Assign warn role (1-Warn, 2-Warn, 3-Warn)
      const roleName = WARN_ROLE_NAMES[cycleIndex];
      const role = await findOrCreateWarnRole(guild, roleName);
      if (role) {
        // Remove old warn roles first
        await removeAllWarnRoles(member);
        await member.roles.add(role, `Verwarnung ${warnCount} - ${roleName}`);
      }
      actionTaken = `${roleName} Rolle zugewiesen`;
    } else {
      // 4th warn: timeout 2 weeks + remove warn roles
      await removeAllWarnRoles(member);
      const twoWeeks = 14 * 24 * 60 * 60 * 1000;
      await member.timeout(twoWeeks, `4. Verwarnung - 2 Wochen Timeout: ${warnReason}`);
      actionTaken = "2 Wochen Timeout";
    }

    res.json({ success: true, warnCount, actionTaken });
  } catch (err) {
    console.error("Fehler beim Verwarnen:", err);
    res.status(500).json({ error: "Fehler beim Verwarnen." });
  }
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Dashboard error:", err);
  res.status(500).render("error", { message: "Ein interner Fehler ist aufgetreten." });
});

export function startDashboard(client: Client): void {
  botClient = client;
  app.listen(PORT, () => {
    console.log(`🌐 Dashboard läuft auf http://localhost:${PORT}`);
  });
}

export { app };
