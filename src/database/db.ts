import Database from "better-sqlite3";
import { resolve } from "node:path";

const dbPath = resolve(process.cwd(), "bot-data.sqlite");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

// Guild settings
db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    welcome_channel_id TEXT,
    ticket_category_id TEXT,
    ticket_log_channel_id TEXT,
    mod_role_id TEXT,
    log_channel_id TEXT,
    automod_enabled INTEGER DEFAULT 0,
    automod_spam_threshold INTEGER DEFAULT 0,
    automod_link_filter INTEGER DEFAULT 0,
    automod_mention_cap INTEGER DEFAULT 0,
    level_channel_id TEXT
  )
`);

// Migrations: add columns to guild_settings if missing (for DBs created with older schemas)
const guildSettingsCols = [
  { name: "automod_spam_threshold", type: "INTEGER DEFAULT 0" },
  { name: "automod_link_filter", type: "INTEGER DEFAULT 0" },
  { name: "automod_mention_cap", type: "INTEGER DEFAULT 0" },
  { name: "level_channel_id", type: "TEXT" },
];
for (const col of guildSettingsCols) {
  try {
    db.exec(`ALTER TABLE guild_settings ADD COLUMN ${col.name} ${col.type}`);
  } catch {
    // Column already exists
  }
}

// Moderation logs
db.exec(`
  CREATE TABLE IF NOT EXISTS mod_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_tag TEXT,
    moderator_id TEXT NOT NULL,
    moderator_tag TEXT,
    action TEXT NOT NULL,
    reason TEXT,
    duration TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

// Tickets
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    creator_tag TEXT,
    status TEXT DEFAULT 'open',
    reason TEXT,
    closed_by TEXT,
    closed_by_tag TEXT,
    close_reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    closed_at INTEGER
  )
`);

// Warns
db.exec(`
  CREATE TABLE IF NOT EXISTS warns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_tag TEXT,
    moderator_id TEXT NOT NULL,
    moderator_tag TEXT,
    reason TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

// Member notes
db.exec(`
  CREATE TABLE IF NOT EXISTS member_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_tag TEXT,
    moderator_id TEXT NOT NULL,
    moderator_tag TEXT,
    note TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

// Guild cache for dashboard
db.exec(`
  CREATE TABLE IF NOT EXISTS guild_cache (
    guild_id TEXT PRIMARY KEY,
    name TEXT,
    icon TEXT,
    member_count INTEGER,
    owner_id TEXT,
    updated_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

// Automod bad words
db.exec(`
  CREATE TABLE IF NOT EXISTS automod_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    word TEXT NOT NULL
  )
`);

// Leveling system
db.exec(`
  CREATE TABLE IF NOT EXISTS user_xp (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    PRIMARY KEY (guild_id, user_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS level_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    role_id TEXT NOT NULL
  )
`);

// Giveaways system
db.exec(`
  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    prize TEXT NOT NULL,
    winner_count INTEGER DEFAULT 1,
    ends_at INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    created_by TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS giveaway_entries (
    giveaway_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (giveaway_id, user_id)
  )
`);

export interface GuildSettings {
  guild_id: string;
  welcome_channel_id: string | null;
  ticket_category_id: string | null;
  ticket_log_channel_id: string | null;
  mod_role_id: string | null;
  log_channel_id: string | null;
  automod_enabled: number;
  automod_spam_threshold: number;
  automod_link_filter: number;
  automod_mention_cap: number;
  level_channel_id: string | null;
}

export interface ModLog {
  id: number;
  guild_id: string;
  target_id: string;
  target_tag: string | null;
  moderator_id: string;
  moderator_tag: string | null;
  action: string;
  reason: string | null;
  duration: string | null;
  created_at: number;
}

export interface Ticket {
  id: number;
  guild_id: string;
  channel_id: string;
  creator_id: string;
  creator_tag: string | null;
  status: string;
  reason: string | null;
  closed_by: string | null;
  closed_by_tag: string | null;
  close_reason: string | null;
  created_at: number;
  closed_at: number | null;
}

export interface WarnEntry {
  id: number;
  guild_id: string;
  user_id: string;
  user_tag: string | null;
  moderator_id: string;
  moderator_tag: string | null;
  reason: string | null;
  created_at: number;
}

export interface MemberNote {
  id: number;
  guild_id: string;
  user_id: string;
  user_tag: string | null;
  moderator_id: string;
  moderator_tag: string | null;
  note: string;
  created_at: number;
  updated_at: number;
}

export interface GuildCacheEntry {
  guild_id: string;
  name: string;
  icon: string | null;
  member_count: number;
  owner_id: string;
  updated_at: number;
}

export interface UserXp {
  guild_id: string;
  user_id: string;
  xp: number;
  level: number;
}

export interface LevelRole {
  id: number;
  guild_id: string;
  level: number;
  role_id: string;
}

export interface Giveaway {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  prize: string;
  winner_count: number;
  ends_at: number;
  status: string;
  created_by: string | null;
  created_at: number;
}

export interface GiveawayEntry {
  giveaway_id: number;
  user_id: string;
}

// Raw prepared statements
const _getGuildSettings = db.prepare("SELECT * FROM guild_settings WHERE guild_id = ?");
const _setGuildSettings = db.prepare(
  `INSERT INTO guild_settings (guild_id, welcome_channel_id, ticket_category_id, ticket_log_channel_id, mod_role_id, log_channel_id, automod_enabled)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(guild_id) DO UPDATE SET
     welcome_channel_id = excluded.welcome_channel_id,
     ticket_category_id = excluded.ticket_category_id,
     ticket_log_channel_id = excluded.ticket_log_channel_id,
     mod_role_id = excluded.mod_role_id,
     log_channel_id = excluded.log_channel_id,
     automod_enabled = excluded.automod_enabled`
);
const _insertModLog = db.prepare(
  "INSERT INTO mod_logs (guild_id, target_id, target_tag, moderator_id, moderator_tag, action, reason, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
const _getModLogs = db.prepare("SELECT * FROM mod_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100");
const _getModLogsForUser = db.prepare("SELECT * FROM mod_logs WHERE guild_id = ? AND target_id = ? ORDER BY created_at DESC LIMIT 100");
const _insertTicket = db.prepare("INSERT INTO tickets (guild_id, channel_id, creator_id, creator_tag, reason) VALUES (?, ?, ?, ?, ?)");
const _getTickets = db.prepare("SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100");
const _getOpenTickets = db.prepare("SELECT * FROM tickets WHERE guild_id = ? AND status = 'open'");
const _closeTicket = db.prepare("UPDATE tickets SET status = 'closed', closed_by = ?, closed_by_tag = ?, close_reason = ?, closed_at = strftime('%s','now') WHERE channel_id = ?");
const _getTicketByChannel = db.prepare("SELECT * FROM tickets WHERE channel_id = ?");
const _insertWarn = db.prepare("INSERT INTO warns (guild_id, user_id, user_tag, moderator_id, moderator_tag, reason) VALUES (?, ?, ?, ?, ?, ?)");
const _getWarns = db.prepare("SELECT * FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC");
const _clearWarns = db.prepare("DELETE FROM warns WHERE guild_id = ? AND user_id = ?");
const _getMemberNotes = db.prepare("SELECT * FROM member_notes WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC");
const _insertMemberNote = db.prepare("INSERT INTO member_notes (guild_id, user_id, user_tag, moderator_id, moderator_tag, note) VALUES (?, ?, ?, ?, ?, ?)");
const _updateMemberNote = db.prepare("UPDATE member_notes SET note = ?, updated_at = strftime('%s','now') WHERE id = ? AND guild_id = ?");
const _deleteMemberNote = db.prepare("DELETE FROM member_notes WHERE id = ? AND guild_id = ?");
const _getStats = db.prepare("SELECT COUNT(*) as count FROM mod_logs WHERE guild_id = ?");
const _getTicketCount = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ?");
const _getOpenTicketCount = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND status = 'open'");
const _getGuildCache = db.prepare("SELECT * FROM guild_cache WHERE guild_id = ?");
const _upsertGuildCache = db.prepare(
  `INSERT INTO guild_cache (guild_id, name, icon, member_count, owner_id)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(guild_id) DO UPDATE SET
     name = excluded.name,
     icon = excluded.icon,
     member_count = excluded.member_count,
     owner_id = excluded.owner_id,
     updated_at = strftime('%s','now')`
);

// Automod prepared statements
const _getAutomodConfig = db.prepare(
  "SELECT automod_enabled, automod_spam_threshold, automod_link_filter, automod_mention_cap FROM guild_settings WHERE guild_id = ?"
);
const _setAutomodEnabled = db.prepare(
  "INSERT INTO guild_settings (guild_id, automod_enabled) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET automod_enabled = excluded.automod_enabled"
);
const _setAutomodSpam = db.prepare(
  "INSERT INTO guild_settings (guild_id, automod_spam_threshold) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET automod_spam_threshold = excluded.automod_spam_threshold"
);
const _setAutomodLinkFilter = db.prepare(
  "INSERT INTO guild_settings (guild_id, automod_link_filter) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET automod_link_filter = excluded.automod_link_filter"
);
const _setAutomodMentionCap = db.prepare(
  "INSERT INTO guild_settings (guild_id, automod_mention_cap) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET automod_mention_cap = excluded.automod_mention_cap"
);
const _addAutomodWord = db.prepare("INSERT OR IGNORE INTO automod_words (guild_id, word) VALUES (?, ?)");
const _removeAutomodWord = db.prepare("DELETE FROM automod_words WHERE guild_id = ? AND word = ?");
const _getAutomodWords = db.prepare("SELECT word FROM automod_words WHERE guild_id = ?");
const _clearAutomodWords = db.prepare("DELETE FROM automod_words WHERE guild_id = ?");

// Leveling prepared statements
const _getUserXp = db.prepare("SELECT * FROM user_xp WHERE guild_id = ? AND user_id = ?");
const _upsertUserXp = db.prepare(
  "INSERT INTO user_xp (guild_id, user_id, xp, level) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = xp + excluded.xp, level = excluded.level"
);
const _getLeaderboard = db.prepare(
  "SELECT user_id, xp, level FROM user_xp WHERE guild_id = ? ORDER BY xp DESC LIMIT ?"
);
const _addLevelRole = db.prepare("INSERT INTO level_roles (guild_id, level, role_id) VALUES (?, ?, ?)");
const _removeLevelRole = db.prepare("DELETE FROM level_roles WHERE guild_id = ? AND level = ?");
const _getLevelRoles = db.prepare("SELECT * FROM level_roles WHERE guild_id = ? ORDER BY level ASC");
const _clearLevelRoles = db.prepare("DELETE FROM level_roles WHERE guild_id = ?");
const _setLevelChannel = db.prepare(
  "INSERT INTO guild_settings (guild_id, level_channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET level_channel_id = excluded.level_channel_id"
);
const _getLevelChannel = db.prepare("SELECT level_channel_id FROM guild_settings WHERE guild_id = ?");

// Giveaway prepared statements
const _createGiveaway = db.prepare(
  "INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winner_count, ends_at, status, created_by) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)"
);
const _getGiveaway = db.prepare("SELECT * FROM giveaways WHERE id = ?");
const _getGiveawayByMessage = db.prepare("SELECT * FROM giveaways WHERE message_id = ?");
const _getActiveGiveaways = db.prepare("SELECT * FROM giveaways WHERE status = 'active'");
const _getGiveawaysByGuild = db.prepare("SELECT * FROM giveaways WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50");
const _endGiveaway = db.prepare("UPDATE giveaways SET status = 'ended' WHERE id = ?");
const _setGiveawayMessage = db.prepare("UPDATE giveaways SET message_id = ? WHERE id = ?");
const _addGiveawayEntry = db.prepare("INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)");
const _getGiveawayEntries = db.prepare("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?");
const _getGiveawayEntryCount = db.prepare("SELECT COUNT(*) as count FROM giveaway_entries WHERE giveaway_id = ?");
const _deleteGiveawayEntries = db.prepare("DELETE FROM giveaway_entries WHERE giveaway_id = ?");

// Typed wrapper functions
export const stmts = {
  getGuildSettings(guildId: string): GuildSettings | undefined {
    return _getGuildSettings.get(guildId) as GuildSettings | undefined;
  },
  setGuildSettings(...params: unknown[]): void {
    _setGuildSettings.run(...params);
  },
  insertModLog(...params: unknown[]): void {
    _insertModLog.run(...params);
  },
  getModLogs(guildId: string): ModLog[] {
    return _getModLogs.all(guildId) as ModLog[];
  },
  getModLogsForUser(guildId: string, userId: string): ModLog[] {
    return _getModLogsForUser.all(guildId, userId) as ModLog[];
  },
  insertTicket(...params: unknown[]): void {
    _insertTicket.run(...params);
  },
  getTickets(guildId: string): Ticket[] {
    return _getTickets.all(guildId) as Ticket[];
  },
  getOpenTickets(guildId: string): Ticket[] {
    return _getOpenTickets.all(guildId) as Ticket[];
  },
  closeTicket(...params: unknown[]): void {
    _closeTicket.run(...params);
  },
  getTicketByChannel(channelId: string): Ticket | undefined {
    return _getTicketByChannel.get(channelId) as Ticket | undefined;
  },
  insertWarn(...params: unknown[]): void {
    _insertWarn.run(...params);
  },
  getWarns(guildId: string, userId: string): WarnEntry[] {
    return _getWarns.all(guildId, userId) as WarnEntry[];
  },
  clearWarns(guildId: string, userId: string): void {
    _clearWarns.run(guildId, userId);
  },
  getMemberNotes(guildId: string, userId: string): MemberNote[] {
    return _getMemberNotes.all(guildId, userId) as MemberNote[];
  },
  insertMemberNote(guildId: string, userId: string, userTag: string, moderatorId: string, moderatorTag: string, note: string): number {
    const result = _insertMemberNote.run(guildId, userId, userTag, moderatorId, moderatorTag, note);
    return Number(result.lastInsertRowid);
  },
  updateMemberNote(id: number, guildId: string, note: string): void {
    _updateMemberNote.run(note, id, guildId);
  },
  deleteMemberNote(id: number, guildId: string): void {
    _deleteMemberNote.run(id, guildId);
  },
  getStats(guildId: string): { count: number } | undefined {
    return _getStats.get(guildId) as { count: number } | undefined;
  },
  getTicketCount(guildId: string): { count: number } | undefined {
    return _getTicketCount.get(guildId) as { count: number } | undefined;
  },
  getOpenTicketCount(guildId: string): { count: number } | undefined {
    return _getOpenTicketCount.get(guildId) as { count: number } | undefined;
  },
  getGuildCache(guildId: string): GuildCacheEntry | undefined {
    return _getGuildCache.get(guildId) as GuildCacheEntry | undefined;
  },
  upsertGuildCache(...params: unknown[]): void {
    _upsertGuildCache.run(...params);
  },
  // Automod functions
  getAutomodConfig(guildId: string): object | undefined {
    return _getAutomodConfig.get(guildId) as object | undefined;
  },
  setAutomodEnabled(guildId: string, enabled: number): void {
    _setAutomodEnabled.run(guildId, enabled);
  },
  setAutomodSpam(guildId: string, threshold: number): void {
    _setAutomodSpam.run(guildId, threshold);
  },
  setAutomodLinkFilter(guildId: string, enabled: number): void {
    _setAutomodLinkFilter.run(guildId, enabled);
  },
  setAutomodMentionCap(guildId: string, cap: number): void {
    _setAutomodMentionCap.run(guildId, cap);
  },
  addAutomodWord(guildId: string, word: string): void {
    _addAutomodWord.run(guildId, word);
  },
  removeAutomodWord(guildId: string, word: string): void {
    _removeAutomodWord.run(guildId, word);
  },
  getAutomodWords(guildId: string): string[] {
    const rows = _getAutomodWords.all(guildId) as { word: string }[];
    return rows.map((r) => r.word);
  },
  clearAutomodWords(guildId: string): void {
    _clearAutomodWords.run(guildId);
  },
  // Leveling functions
  getUserXp(guildId: string, userId: string): UserXp | undefined {
    return _getUserXp.get(guildId, userId) as UserXp | undefined;
  },
  addUserXp(guildId: string, userId: string, xp: number, level: number): void {
    _upsertUserXp.run(guildId, userId, xp, level);
  },
  getLeaderboard(guildId: string, limit: number): { user_id: string; xp: number; level: number }[] {
    return _getLeaderboard.all(guildId, limit) as { user_id: string; xp: number; level: number }[];
  },
  addLevelRole(guildId: string, level: number, roleId: string): void {
    _addLevelRole.run(guildId, level, roleId);
  },
  removeLevelRole(guildId: string, level: number): void {
    _removeLevelRole.run(guildId, level);
  },
  getLevelRoles(guildId: string): LevelRole[] {
    return _getLevelRoles.all(guildId) as LevelRole[];
  },
  clearLevelRoles(guildId: string): void {
    _clearLevelRoles.run(guildId);
  },
  setLevelChannel(guildId: string, channelId: string): void {
    _setLevelChannel.run(guildId, channelId);
  },
  getLevelChannel(guildId: string): string | null {
    const row = _getLevelChannel.get(guildId) as { level_channel_id: string | null } | undefined;
    return row?.level_channel_id ?? null;
  },
  // Giveaway functions
  createGiveaway(guildId: string, channelId: string, prize: string, winnerCount: number, endsAt: number, createdBy: string): number {
    const result = _createGiveaway.run(guildId, channelId, null, prize, winnerCount, endsAt, createdBy);
    return Number(result.lastInsertRowid);
  },
  getGiveaway(id: number): Giveaway | undefined {
    return _getGiveaway.get(id) as Giveaway | undefined;
  },
  getGiveawayByMessage(messageId: string): Giveaway | undefined {
    return _getGiveawayByMessage.get(messageId) as Giveaway | undefined;
  },
  getActiveGiveaways(): Giveaway[] {
    return _getActiveGiveaways.all() as Giveaway[];
  },
  getGiveawaysByGuild(guildId: string): Giveaway[] {
    return _getGiveawaysByGuild.all(guildId) as Giveaway[];
  },
  endGiveaway(id: number): void {
    _endGiveaway.run(id);
  },
  setGiveawayMessage(id: number, messageId: string): void {
    _setGiveawayMessage.run(messageId, id);
  },
  addGiveawayEntry(giveawayId: number, userId: string): void {
    _addGiveawayEntry.run(giveawayId, userId);
  },
  getGiveawayEntries(giveawayId: number): string[] {
    const rows = _getGiveawayEntries.all(giveawayId) as { user_id: string }[];
    return rows.map((r) => r.user_id);
  },
  getGiveawayEntryCount(giveawayId: number): number {
    const row = _getGiveawayEntryCount.get(giveawayId) as { count: number } | undefined;
    return row?.count ?? 0;
  },
  deleteGiveawayEntries(giveawayId: number): void {
    _deleteGiveawayEntries.run(giveawayId);
  },
};
