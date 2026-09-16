import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import { resolve } from "node:path";
import { Client, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import { client, stmts } from "../database/db.js";
import type { GuildSettings, ModLog, Ticket, GuildCacheEntry, Giveaway, MemberNote } from "../database/db.js";
import { timestampToDate, WARN_ROLE_NAMES, sendModLogEmbed } from "../utils/helpers.js";
import { musicManager } from "../music/musicPlayer.js";

let bots: Map<string, Client> = new Map();

const app = express();
app.set("trust proxy", 1);
const DEV_PORT = 3000;
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : (process.env.DASHBOARD_PORT ? parseInt(process.env.DASHBOARD_PORT, 10) : DEV_PORT);
const CALLBACK_URL = process.env.DASHBOARD_CALLBACK_URL ?? `http://localhost:${PORT}/auth/discord/callback`;

// EJS setup
app.disable("view cache");
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
    cookie: { maxAge: 1000 * 60 * 60 * 24 },
  })
);

app.use(passport.initialize());
app.use(passport.session());

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

// Extend express-session types to include selectedBot
declare module "express-session" {
  interface SessionData {
    selectedBot?: string;
  }
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

interface SessionWithBot {
  selectedBot?: string;
}

function getSession(req: express.Request): SessionWithBot {
  return req.session as unknown as SessionWithBot;
}

interface DiscordUser {
  id: string;
  username: string;
  avatar: string | null;
  guilds: DiscordGuild[];
}

function ensureAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

function getSelectedBot(_req: express.Request): Client | null {
  // Es gibt nur noch eine Bot-Instanz: immer die erste nutzen.
  return bots.values().next().value ?? null;
}

app.get(
  "/auth/discord/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/dashboard");
  }
);

app.get("/select-bot/:id", ensureAuth, (req, res) => {
  // Bot-Auswahl entfernt – immer direkt zum Dashboard.
  res.redirect("/dashboard");
});

app.get("/bot-select", ensureAuth, (req, res) => {
  // Bot-Auswahl wurde entfernt – immer direkt zum Dashboard.
  res.redirect("/dashboard");
});

app.get("/api/stats", async (req, res) => {
  try {
    const bot = getSelectedBot(req);
    if (!bot) {
      return res.json({ guildCount: 0, memberCount: 0, commandCount: 7, activeGiveaways: 0 });
    }
    const guildCount = bot.guilds.cache.size;
    let memberCount = 0;
    for (const guild of bot.guilds.cache.values()) {
      memberCount += guild.memberCount;
    }
    const activeGiveaways = await stmts.getActiveGiveaways();
    res.json({
      guildCount,
      memberCount,
      commandCount: 7,
      activeGiveaways: activeGiveaways.length,
    });
  } catch {
    res.json({ guildCount: 0, memberCount: 0, commandCount: 7, activeGiveaways: 0 });
  }
});

app.get("/", (req, res) => {
  res.render("index", { user: req.user as DiscordUser | undefined, clientId: process.env.CLIENT_ID });
});

app.get("/terms", (_req, res) => {
  res.render("terms");
});

app.get("/privacy", (_req, res) => {
  res.render("privacy");
});

app.get("/funktionen", (req, res) => {
  res.render("funktionen", { user: req.user as DiscordUser | undefined });
});

app.get("/login", passport.authenticate("discord"));

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

app.get("/dashboard", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).render("error", { message: "Bot ist nicht verbunden." });

  const botGuildIds = new Set(bot.guilds.cache.map((g) => g.id));

  const adminGuilds = user.guilds.filter((g) => {
    const perms = BigInt(g.permissions);
    const isAdmin = (perms & BigInt(0x8)) === BigInt(0x8) || g.owner;
    return isAdmin && botGuildIds.has(g.id);
  });

  const guilds = await Promise.all(
    adminGuilds.map(async (g) => {
      const cached = await stmts.getGuildCache(g.id);
      return {
        id: g.id,
        name: g.name,
        icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
        memberCount: cached?.member_count ?? null,
      };
    })
  );

  res.render("dashboard", {
    user,
    guilds,
    clientId: process.env.CLIENT_ID,
  });
});

app.get("/dashboard/guild/:id", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).render("error", { message: "Bot ist nicht verbunden." });

  const guildId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!guildId) return res.redirect("/dashboard");

  const guild = user.guilds.find((g) => g.id === guildId);
  if (!guild) return res.status(403).render("error", { message: "Kein Zugriff auf diesen Server." });

  const perms = BigInt(guild.permissions);
  const isAdmin = (perms & BigInt(0x8)) === BigInt(0x8) || guild.owner;
  if (!isAdmin) return res.status(403).render("error", { message: "Admin-Rechte erforderlich." });

  const settings = await stmts.getGuildSettings(guildId);
  const modLogs = await stmts.getModLogs(guildId);
  const tickets = await stmts.getTickets(guildId);
  const modCount = (await stmts.getStats(guildId))?.count ?? 0;
  const ticketCount = (await stmts.getTicketCount(guildId))?.count ?? 0;
  const openTicketCount = (await stmts.getOpenTicketCount(guildId))?.count ?? 0;
  const ticketPanel = await stmts.getTicketPanel(guildId);
  const ticketPanelOptions = await stmts.getTicketPanelOptions(guildId);
  const ticketSupportRoles = await stmts.getTicketSupportRoles(guildId);
  const automodConfig = await stmts.getAutomodConfig(guildId) as Record<string, number> | undefined;
  const automodWords = await stmts.getAutomodWords(guildId);
  const levelRoles = await stmts.getLevelRoles(guildId);
  const levelChannelId = await stmts.getLevelChannel(guildId);
  const giveawaysRaw = await stmts.getGiveawaysByGuild(guildId);
  const giveaways = await Promise.all(
    giveawaysRaw.map(async (gw) => ({
      ...gw,
      entryCount: await stmts.getGiveawayEntryCount(gw.id),
      created_at_formatted: timestampToDate(gw.created_at),
    }))
  );

  const cached = await stmts.getGuildCache(guildId);

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
    ticketPanel: ticketPanel || null,
    ticketPanelOptions,
    ticketSupportRoles,
  });
});

// ═══════════════════════════════════════════
// API: Automod
// ═══════════════════════════════════════════

app.post("/api/guild/:id/automod/toggle", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const { enabled } = req.body;
  await stmts.setAutomodEnabled(guildId, enabled ? 1 : 0);
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/spam", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const { threshold } = req.body;
  await stmts.setAutomodSpam(guildId, Number(threshold));
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/linkfilter", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const { enabled } = req.body;
  await stmts.setAutomodLinkFilter(guildId, enabled ? 1 : 0);
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/mentioncap", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const { cap } = req.body;
  await stmts.setAutomodMentionCap(guildId, Number(cap));
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/words/add", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const { word } = req.body;
  if (!word || typeof word !== "string") {
    return res.status(400).json({ error: "Kein Wort angegeben." });
  }
  await stmts.addAutomodWord(guildId, word.toLowerCase());
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/words/remove", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const { word } = req.body;
  if (!word || typeof word !== "string") {
    return res.status(400).json({ error: "Kein Wort angegeben." });
  }
  await stmts.removeAutomodWord(guildId, word.toLowerCase());
  res.json({ success: true });
});

app.post("/api/guild/:id/automod/words/clear", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  await stmts.clearAutomodWords(guildId);
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// API: Leveling
// ═══════════════════════════════════════════

app.post("/api/guild/:id/leveling/channel", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;
  const { channelId } = req.body;
  await stmts.setLevelChannel(guildId, channelId || "");
  res.json({ success: true });
});

app.post("/api/guild/:id/leveling/role/add", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;
  const { level, roleId } = req.body;
  if (!level || !roleId) return res.status(400).json({ error: "Level und RoleId erforderlich." });
  await stmts.addLevelRole(guildId, Number(level), roleId);
  res.json({ success: true });
});

app.post("/api/guild/:id/leveling/role/remove", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;
  const { level } = req.body;
  if (!level) return res.status(400).json({ error: "Level erforderlich." });
  await stmts.removeLevelRole(guildId, Number(level));
  res.json({ success: true });
});

app.post("/api/guild/:id/leveling/role/clear", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  await stmts.clearLevelRoles(guildId);
  res.json({ success: true });
});

// API: Stats
app.get("/api/guild/:id/stats", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const modCount = (await stmts.getStats(guildId))?.count ?? 0;
  const ticketCount = (await stmts.getTicketCount(guildId))?.count ?? 0;
  const openTicketCount = (await stmts.getOpenTicketCount(guildId))?.count ?? 0;

  res.json({ modCount, ticketCount, openTicketCount });
});

// API: Members list
app.get("/api/guild/:id/members", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });

    const members = await guild.members.fetch();
    const memberList = await Promise.all(
      members
        .filter((m) => !m.user.bot)
        .map(async (m) => {
          const warns = await stmts.getWarns(guildId, m.user.id);
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
        })
    );

    res.json(memberList);
  } catch (err) {
    console.error("Fehler beim Abrufen der Mitglieder:", err);
    res.status(500).json({ error: "Fehler beim Abrufen der Mitglieder." });
  }
});

// API: Member detail
app.get("/api/guild/:id/members/:userId", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  if (!bot) return res.status(500).json({ error: "Bot nicht verbunden." });

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ error: "Mitglied nicht gefunden." });

    const warns = await stmts.getWarns(guildId, userId);
    const modLogs = await stmts.getModLogsForUser(guildId, userId);
    const notes = await stmts.getMemberNotes(guildId, userId);

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
      notes: notes.map((n: MemberNote) => ({
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

// API: Timeout
app.post("/api/guild/:id/members/:userId/timeout", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { duration, reason } = req.body;
  const timeoutReason = reason?.trim() || "Kein Grund angegeben";
  const maxDurationMs = 28 * 24 * 60 * 60 * 1000;
  let durationMs = Number(duration) || 60000;
  if (durationMs > maxDurationMs) {
    return res.status(400).json({ error: "Timeout darf maximal 28 Tage betragen." });
  }
  if (durationMs < 1000) durationMs = 60000;

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ error: "Mitglied nicht gefunden." });

    await member.timeout(durationMs, timeoutReason);
    await stmts.insertModLog(guildId, userId, member.user.tag, user.id, user.username, "Timeout", timeoutReason, `${Math.round(durationMs / 1000)}s`);
    const timeoutSettings = await stmts.getGuildSettings(guildId);
    await sendModLogEmbed(guild, timeoutSettings?.log_channel_id, "Timeout", member.user.tag, userId, user.username, user.id, timeoutReason, [{ name: "Dauer", value: `${Math.round(durationMs / 60000)} Minuten`, inline: true }]);

    res.json({ success: true, until: new Date(Date.now() + durationMs).toISOString() });
  } catch (err) {
    console.error("Fehler beim Timeout:", err);
    res.status(500).json({ error: "Fehler beim Timeout." });
  }
});

// API: Untimeout
app.post("/api/guild/:id/members/:userId/untimeout", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ error: "Mitglied nicht gefunden." });

    await member.timeout(null);
    await stmts.insertModLog(guildId, userId, member.user.tag, user.id, user.username, "Untimeout", "Timeout aufgehoben", null);
    const untimeoutSettings = await stmts.getGuildSettings(guildId);
    await sendModLogEmbed(guild, untimeoutSettings?.log_channel_id, "Untimeout", member.user.tag, userId, user.username, user.id, "Timeout aufgehoben");

    res.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Entfernen des Timeouts:", err);
    res.status(500).json({ error: "Fehler beim Entfernen des Timeouts." });
  }
});

// API: Member notes
app.get("/api/guild/:id/members/:userId/notes", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const notes = await stmts.getMemberNotes(guildId, userId);
  res.json(
    notes.map((n: MemberNote) => ({
      ...n,
      created_at_formatted: timestampToDate(n.created_at),
      updated_at_formatted: n.updated_at !== n.created_at ? timestampToDate(n.updated_at) : null,
    }))
  );
});

app.post("/api/guild/:id/members/:userId/notes", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { note } = req.body;
  if (!note || typeof note !== "string" || !note.trim()) {
    return res.status(400).json({ error: "Notiztext erforderlich." });
  }

  const guild = bot.guilds.cache.get(guildId);
  const memberTag = guild?.members.cache.get(userId)?.user.tag ?? userId;

  const noteId = await stmts.insertMemberNote(guildId, userId, memberTag, user.id, user.username, note.trim());
  res.json({ success: true, id: noteId });
});

app.post("/api/guild/:id/members/:userId/notes/:noteId", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  const { note } = req.body;
  if (!note || typeof note !== "string" || !note.trim()) {
    return res.status(400).json({ error: "Notiztext erforderlich." });
  }

  await stmts.updateMemberNote(noteId, guildId, note.trim());
  res.json({ success: true });
});

app.delete("/api/guild/:id/members/:userId/notes/:noteId", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const noteId = parseInt(Array.isArray(req.params.noteId) ? req.params.noteId[0] : req.params.noteId, 10);
  if (isNaN(noteId)) return res.status(400).json({ error: "Ungültige Notiz-ID." });
  await stmts.deleteMemberNote(noteId, guildId);
  res.json({ success: true });
});

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

app.delete("/api/guild/:id/members/:userId/warns/:warnId", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const warnId = parseInt(Array.isArray(req.params.warnId) ? req.params.warnId[0] : req.params.warnId, 10);
  if (isNaN(warnId)) return res.status(400).json({ error: "Ungültige Warn-ID." });

  const deleted = await stmts.removeWarn(warnId, guildId);
  if (!deleted) return res.status(404).json({ error: "Warn nicht gefunden." });

  try {
    const discGuild = bot.guilds.cache.get(guildId);
    if (discGuild) {
      const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
      const member = await discGuild.members.fetch(userId).catch(() => null);
      if (member) {
        const warns = await stmts.getWarns(guildId, userId);
        const warnCount = warns.length;
        await removeAllWarnRoles(member);
        if (warnCount > 0) {
          const cycleIndex = (warnCount - 1) % 4;
          if (cycleIndex < 3) {
            const roleName = WARN_ROLE_NAMES[cycleIndex];
            const role = await findOrCreateWarnRole(discGuild, roleName);
            if (role) {
              await member.roles.add(role, `Verwarnung ${warnCount} - ${roleName}`).catch(() => {});
            }
          }
        }
        if (warnCount % 4 !== 0 && member.communicationDisabledUntil) {
          await member.timeout(null).catch(() => {});
        }
        const warnRmSettings = await stmts.getGuildSettings(guildId);
        await sendModLogEmbed(discGuild, warnRmSettings?.log_channel_id, "Warn entfernt", member.user.tag, userId, user.username, user.id, `Warn-ID #${warnId} entfernt`);
      }
    }
  } catch (e) {
    console.error("Fehler beim Rekalibrieren der Warn-Rollen:", e);
  }

  res.json({ success: true });
});

app.post("/api/guild/:id/members/:userId/warn", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const { reason } = req.body;
  const warnReason = reason?.trim() || "Kein Grund angegeben";

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ error: "Mitglied nicht gefunden." });

    await stmts.insertWarn(guildId, userId, member.user.tag, user.id, user.username, warnReason);
    await stmts.insertModLog(guildId, userId, member.user.tag, user.id, user.username, "Warn", warnReason, null);
    const warnSettings = await stmts.getGuildSettings(guildId);
    await sendModLogEmbed(guild, warnSettings?.log_channel_id, "Warn", member.user.tag, userId, user.username, user.id, warnReason);

    const warnCount = (await stmts.getWarns(guildId, userId)).length;
    const cycleIndex = (warnCount - 1) % 4;

    let actionTaken = "";

    if (cycleIndex < 3) {
      const roleName = WARN_ROLE_NAMES[cycleIndex];
      const role = await findOrCreateWarnRole(guild, roleName);
      if (role) {
        await removeAllWarnRoles(member);
        await member.roles.add(role, `Verwarnung ${warnCount} - ${roleName}`);
      }
      actionTaken = `${roleName} Rolle zugewiesen`;
    } else {
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

app.get("/api/guild/:id/tickets/channels", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return res.json([]);
  try {
    const discordGuild = bot.guilds.cache.get(guildId);
    if (!discordGuild) return res.json([]);
    const channels = discordGuild.channels.cache
      .filter((c) => c.type === 0)
      .map((c) => ({ id: c.id, name: c.name }));
    res.json(channels);
  } catch { res.json([]); }
});

app.get("/api/guild/:id/tickets/roles", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return res.json([]);
  try {
    const discordGuild = bot.guilds.cache.get(guildId);
    if (!discordGuild) return res.json([]);
    const roles = discordGuild.roles.cache
      .filter((r) => r.name !== "@everyone" && !r.managed)
      .map((r) => ({ id: r.id, name: r.name, color: r.hexColor }));
    res.json(roles);
  } catch { res.json([]); }
});

app.get("/api/guild/:id/tickets/panel", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;
  const panel = await stmts.getTicketPanel(guildId);
  const options = await stmts.getTicketPanelOptions(guildId);
  const supportRoles = await stmts.getTicketSupportRoles(guildId);
  res.json({ panel: panel || null, options, supportRoles });
});

app.post("/api/guild/:id/tickets/panel", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return;
  const { channelId, options } = req.body as { channelId: string; options: { label: string; emoji: string }[] };
  if (!channelId || !options?.length) return res.status(400).json({ error: "channelId und options benötigt." });

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(500).json({ error: "Guild nicht gefunden." });

    await stmts.setTicketPanel(guildId, channelId, null);
    await stmts.setTicketPanelOptions(guildId, options);

    const panelChannel = guild.channels.cache.get(channelId);
    if (panelChannel && "parentId" in panelChannel && panelChannel.parentId) {
      const existingSettings = await stmts.getGuildSettings(guildId);
      await stmts.setGuildSettings(
        guildId,
        existingSettings?.welcome_channel_id ?? null,
        panelChannel.parentId,
        existingSettings?.ticket_log_channel_id ?? null,
        existingSettings?.mod_role_id ?? null,
        existingSettings?.log_channel_id ?? null,
        existingSettings?.automod_enabled ?? 0
      );
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased() || "send" in channel === false) {
      return res.status(500).json({ error: "Kanal nicht gefunden." });
    }

    const selectOpts = options.map((opt) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(opt.label)
        .setEmoji(opt.emoji)
        .setValue(opt.label)
    );

    const select = new StringSelectMenuBuilder()
      .setCustomId("ticket_open")
      .setPlaceholder("Wähle einen Ticket-Grund...")
      .addOptions(selectOpts);

    const row = new ActionRowBuilder().addComponents(select);

    const embed = new EmbedBuilder()
      .setTitle("🎫 Ticket-System")
      .setDescription("Wähle unten eine Option aus, um ein Ticket zu öffnen!")
      .setColor(0xf799b9)
      .setFooter({ text: "pOky Ticket-System" });

    const existingPanel = await stmts.getTicketPanel(guildId);
    if (existingPanel?.message_id) {
      try {
        const oldMsg = await (channel as any).messages.fetch(existingPanel.message_id);
        if (oldMsg) await oldMsg.edit({ embeds: [embed], components: [row] });
      } catch {
        const msg = await (channel as any).send({ embeds: [embed], components: [row] });
        await stmts.setTicketPanel(guildId, channelId, msg.id);
      }
    } else {
      const msg = await (channel as any).send({ embeds: [embed], components: [row] });
      await stmts.setTicketPanel(guildId, channelId, msg.id);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Senden des Ticket-Panels:", err);
    res.status(500).json({ error: "Fehler beim Senden." });
  }
});

app.post("/api/guild/:id/tickets/support-role/add", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;
  const { roleId } = req.body as { roleId: string };
  if (!roleId) return res.status(400).json({ error: "roleId benötigt." });
  await stmts.addTicketSupportRole(guildId, roleId);
  res.json({ success: true });
});

app.post("/api/guild/:id/tickets/support-role/remove", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;
  const { roleId } = req.body as { roleId: string };
  if (!roleId) return res.status(400).json({ error: "roleId benötigt." });
  await stmts.removeTicketSupportRole(guildId, roleId);
  res.json({ success: true });
});

app.get("/api/guild/:id/tickets/:channelId/messages", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const guild = user.guilds.find((g) => g.id === guildId);
  if (!guild) return res.status(403).json({ error: "Kein Zugriff." });

  const channelId = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });

  try {
    const ticket = await stmts.getTicketByChannel(channelId);
    if (!ticket || ticket.guild_id !== guildId) {
      return res.status(404).json({ error: "Ticket nicht gefunden." });
    }

    const discordGuild = bot.guilds.cache.get(guildId);
    if (!discordGuild) return res.status(404).json({ error: "Server nicht gefunden." });

    const channel = discordGuild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      return res.status(404).json({ error: "Ticket-Kanal nicht gefunden." });
    }

    const messages = await channel.messages.fetch({ limit: 100 });
    const formatted = messages
      .reverse()
      .map((msg) => ({
        id: msg.id,
        author: msg.author.tag,
        authorId: msg.author.id,
        avatar: msg.author.avatar
          ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png?size=80`
          : null,
        isBot: msg.author.bot,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
        createdAtFormatted: msg.createdAt.toLocaleString("de-DE"),
        attachments: msg.attachments.map((att) => ({
          name: att.name,
          url: att.url,
          size: att.size,
        })),
        embeds: msg.embeds.map((emb) => ({
          title: emb.title,
          description: emb.description,
          url: emb.url,
        })),
      }));

    res.json({ success: true, messages: formatted, channelName: channel.name });
  } catch (err) {
    console.error("Fehler beim Abrufen der Ticket-Nachrichten:", err);
    res.status(500).json({ error: "Nachrichten konnten nicht geladen werden." });
  }
});

app.post("/api/guild/:id/modlog-channel", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;
  const { channelId } = req.body as { channelId: string };
  const existing = await stmts.getGuildSettings(guildId);
  await stmts.setGuildSettings(
    guildId,
    existing?.welcome_channel_id ?? null,
    existing?.ticket_category_id ?? null,
    existing?.ticket_log_channel_id ?? null,
    existing?.mod_role_id ?? null,
    channelId || null,
    existing?.automod_enabled ?? 0
  );
  res.json({ success: true });
});

app.get("/api/guild/:id/channels", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;
  if (!bot) return res.json([]);
  try {
    const discordGuild = bot.guilds.cache.get(guildId);
    if (!discordGuild) return res.json([]);
    const channels = discordGuild.channels.cache
      .filter((c) => c.isTextBased() && !c.isThread())
      .map((c) => ({ id: c.id, name: c.name }));
    res.json(channels);
  } catch { res.json([]); }
});

app.post("/api/guild/:id/messages/send", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return res.status(500).json({ error: "Bot nicht ausgewählt." });

  const { channelId, title, description, color, imageUrl, footerText } = req.body as {
    channelId: string;
    title?: string;
    description?: string;
    color?: string;
    imageUrl?: string;
    footerText?: string;
  };

  if (!channelId) return res.status(400).json({ error: "channelId benötigt." });
  if (!title?.trim() && !description?.trim()) return res.status(400).json({ error: "Titel oder Beschreibung benötigt." });

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) return res.status(404).json({ error: "Kanal nicht gefunden." });
    if (!("send" in channel)) return res.status(500).json({ error: "Keine Schreibrechte im Kanal." });

    const embed = new EmbedBuilder();
    if (title?.trim()) embed.setTitle(title.trim());
    if (description?.trim()) embed.setDescription(description.trim());
    if (color) embed.setColor(parseInt(color.replace("#", ""), 16) || 0xff5e8a);
    if (imageUrl?.trim()) embed.setImage(imageUrl.trim());
    if (footerText?.trim()) embed.setFooter({ text: footerText.trim() });
    embed.setTimestamp();

    await (channel as any).send({ embeds: [embed] });
    res.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Senden der Nachricht:", err);
    res.status(500).json({ error: "Fehler beim Senden." });
  }
});

// ═══════════════════════════════════════════
// API: Music
// ═══════════════════════════════════════════

app.get("/api/guild/:id/music/status", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return;
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return;

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });
    const status = musicManager.getStatus(guildId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/guild/:id/music/channels", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return;
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return;

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });
    const channels = musicManager.getVoiceChannels(guild);
    res.json(channels);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/guild/:id/music/play", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return;
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return;

  const { query, voiceChannelId } = req.body as { query: string; voiceChannelId: string };
  if (!query?.trim() || !voiceChannelId?.trim()) {
    return res.status(400).json({ error: "query und voiceChannelId benötigt." });
  }

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });

    const track = await musicManager.play(
      guild,
      query.trim(),
      voiceChannelId,
      "",
      user.id,
      user.username
    );
    res.json({ success: true, track });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Fehler beim Abspielen." });
  }
});

app.post("/api/guild/:id/music/skip", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return;
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return;

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });
    const skipped = musicManager.skip(guild);
    res.json({ success: true, skipped });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/guild/:id/music/stop", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return;
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return;

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });
    musicManager.stop(guild);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/guild/:id/music/pause", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return;
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return;

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });
    musicManager.pause(guild);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/guild/:id/music/resume", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return;
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return;

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });
    musicManager.resume(guild);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/guild/:id/music/volume", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return;
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId || !bot) return;

  const { volume } = req.body as { volume: number };
  if (typeof volume !== "number" || isNaN(volume)) {
    return res.status(400).json({ error: "volume muss eine Zahl sein." });
  }

  try {
    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: "Server nicht gefunden." });
    const newVol = musicManager.setVolume(guild, volume);
    res.json({ success: true, volume: newVol });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/guild/:id/music/queue/remove", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return;
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  const { index } = req.body as { index: number };
  if (typeof index !== "number" || index < 0) {
    return res.status(400).json({ error: "Ungültiger Index." });
  }

  const removed = musicManager.removeFromQueue(guildId, index);
  res.json({ success: !!removed });
});

app.post("/api/guild/:id/music/queue/clear", ensureAuth, async (req, res) => {
  const user = req.user as DiscordUser;
  const bot = getSelectedBot(req);
  if (!bot) return;
  const guildId = validateGuildAccess(req, res, user, bot);
  if (!guildId) return;

  musicManager.clearQueue(guildId);
  res.json({ success: true });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Dashboard error:", err);
  res.status(500).render("error", { message: "Ein interner Fehler ist aufgetreten." });
});

export function startDashboard(botMap: Map<string, Client>, _instances: Array<{ id: string; name: string }>): void {
  bots = botMap;
  app.listen(PORT, () => {
    console.log(`🌐 Dashboard läuft auf http://localhost:${PORT}`);
  });
}

export { app };

function validateGuildAccess(req: express.Request, res: express.Response, user: DiscordUser, bot: Client): string | null {
  const guildId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const guild = user.guilds.find((g) => g.id === guildId);
  if (!guild) {
    res.status(403).json({ error: "Kein Zugriff auf diesen Server." });
    return null;
  }
  const perms = BigInt(guild.permissions);
  const isAdmin = (perms & BigInt(0x8)) === BigInt(0x8) || guild.owner;
  if (!isAdmin) {
    res.status(403).json({ error: "Admin-Rechte erforderlich." });
    return null;
  }
  if (!bot.guilds.cache.has(guildId)) {
    res.status(403).json({ error: "Der ausgewählte Bot ist nicht auf diesem Server." });
    return null;
  }
  return guildId;
}
