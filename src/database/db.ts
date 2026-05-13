import { createClient, type Client } from "@libsql/client";

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

// Turso Cloud optional. Defaults to local SQLite (bot-data.sqlite) if TURSO_DATABASE_URL is not set.
export const client: Client = tursoUrl
  ? createClient({ url: tursoUrl, authToken: tursoToken })
  : createClient({ url: "file:bot-data.sqlite" });

export async function initDatabase(): Promise<void> {
  // Guild settings
  await client.execute(`
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

  // Migrations: add columns to guild_settings if missing
  const guildSettingsCols = [
    { name: "automod_spam_threshold", type: "INTEGER DEFAULT 0" },
    { name: "automod_link_filter", type: "INTEGER DEFAULT 0" },
    { name: "automod_mention_cap", type: "INTEGER DEFAULT 0" },
    { name: "level_channel_id", type: "TEXT" },
  ];
  for (const col of guildSettingsCols) {
    try {
      await client.execute(`ALTER TABLE guild_settings ADD COLUMN ${col.name} ${col.type}`);
    } catch {
      // Column already exists
    }
  }

  // Moderation logs
  await client.execute(`
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
  await client.execute(`
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
  await client.execute(`
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
  await client.execute(`
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
  await client.execute(`
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
  await client.execute(`
    CREATE TABLE IF NOT EXISTS automod_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      word TEXT NOT NULL
    )
  `);

  // Leveling system
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user_xp (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS level_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      level INTEGER NOT NULL,
      role_id TEXT NOT NULL
    )
  `);

  // Giveaways system
  await client.execute(`
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

  await client.execute(`
    CREATE TABLE IF NOT EXISTS giveaway_entries (
      giveaway_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (giveaway_id, user_id)
    )
  `);

  // Ticket panel system
  await client.execute(`
    CREATE TABLE IF NOT EXISTS ticket_panels (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ticket_panel_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      label TEXT NOT NULL,
      emoji TEXT DEFAULT '🎫'
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ticket_support_roles (
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, role_id)
    )
  `);
}

// ═══════════════════════════════════════════
// Interfaces
// ═══════════════════════════════════════════

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

export interface TicketPanel {
  guild_id: string;
  channel_id: string;
  message_id: string | null;
}

export interface TicketPanelOption {
  id: number;
  guild_id: string;
  label: string;
  emoji: string;
}

export interface TicketSupportRole {
  guild_id: string;
  role_id: string;
}

// ═══════════════════════════════════════════
// Typed async wrapper functions
// ═══════════════════════════════════════════

export const stmts = {
  // ── Guild Settings ──

  async getGuildSettings(guildId: string): Promise<GuildSettings | undefined> {
    const result = await client.execute({
      sql: "SELECT * FROM guild_settings WHERE guild_id = ?",
      args: [guildId],
    });
    return result.rows[0] as unknown as GuildSettings | undefined;
  },

  async setGuildSettings(
    guildId: string,
    welcomeChannelId: string | null,
    ticketCategoryId: string | null,
    ticketLogChannelId: string | null,
    modRoleId: string | null,
    logChannelId: string | null,
    automodEnabled: number
  ): Promise<void> {
    await client.execute({
      sql: `INSERT INTO guild_settings (guild_id, welcome_channel_id, ticket_category_id, ticket_log_channel_id, mod_role_id, log_channel_id, automod_enabled)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET
              welcome_channel_id = excluded.welcome_channel_id,
              ticket_category_id = excluded.ticket_category_id,
              ticket_log_channel_id = excluded.ticket_log_channel_id,
              mod_role_id = excluded.mod_role_id,
              log_channel_id = excluded.log_channel_id,
              automod_enabled = excluded.automod_enabled`,
      args: [guildId, welcomeChannelId, ticketCategoryId, ticketLogChannelId, modRoleId, logChannelId, automodEnabled],
    });
  },

  // ── Mod Logs ──

  async insertModLog(
    guildId: string,
    targetId: string,
    targetTag: string | null,
    moderatorId: string,
    moderatorTag: string | null,
    action: string,
    reason: string | null,
    duration: string | null
  ): Promise<void> {
    await client.execute({
      sql: "INSERT INTO mod_logs (guild_id, target_id, target_tag, moderator_id, moderator_tag, action, reason, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      args: [guildId, targetId, targetTag, moderatorId, moderatorTag, action, reason, duration],
    });
  },

  async getModLogs(guildId: string): Promise<ModLog[]> {
    const result = await client.execute({
      sql: "SELECT * FROM mod_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100",
      args: [guildId],
    });
    return result.rows as unknown as ModLog[];
  },

  async getModLogsForUser(guildId: string, userId: string): Promise<ModLog[]> {
    const result = await client.execute({
      sql: "SELECT * FROM mod_logs WHERE guild_id = ? AND target_id = ? ORDER BY created_at DESC LIMIT 100",
      args: [guildId, userId],
    });
    return result.rows as unknown as ModLog[];
  },

  // ── Tickets ──

  async insertTicket(
    guildId: string,
    channelId: string,
    creatorId: string,
    creatorTag: string | null,
    reason: string | null
  ): Promise<void> {
    await client.execute({
      sql: "INSERT INTO tickets (guild_id, channel_id, creator_id, creator_tag, reason) VALUES (?, ?, ?, ?, ?)",
      args: [guildId, channelId, creatorId, creatorTag, reason],
    });
  },

  async getTickets(guildId: string): Promise<Ticket[]> {
    const result = await client.execute({
      sql: "SELECT * FROM tickets WHERE guild_id = ? ORDER BY created_at DESC LIMIT 100",
      args: [guildId],
    });
    return result.rows as unknown as Ticket[];
  },

  async getOpenTickets(guildId: string): Promise<Ticket[]> {
    const result = await client.execute({
      sql: "SELECT * FROM tickets WHERE guild_id = ? AND status = 'open'",
      args: [guildId],
    });
    return result.rows as unknown as Ticket[];
  },

  async closeTicket(closedBy: string, closedByTag: string, closeReason: string, channelId: string): Promise<void> {
    await client.execute({
      sql: "UPDATE tickets SET status = 'closed', closed_by = ?, closed_by_tag = ?, close_reason = ?, closed_at = strftime('%s','now') WHERE channel_id = ?",
      args: [closedBy, closedByTag, closeReason, channelId],
    });
  },

  async getTicketByChannel(channelId: string): Promise<Ticket | undefined> {
    const result = await client.execute({
      sql: "SELECT * FROM tickets WHERE channel_id = ?",
      args: [channelId],
    });
    return result.rows[0] as unknown as Ticket | undefined;
  },

  // ── Warns ──

  async insertWarn(
    guildId: string,
    userId: string,
    userTag: string | null,
    moderatorId: string,
    moderatorTag: string | null,
    reason: string | null
  ): Promise<void> {
    await client.execute({
      sql: "INSERT INTO warns (guild_id, user_id, user_tag, moderator_id, moderator_tag, reason) VALUES (?, ?, ?, ?, ?, ?)",
      args: [guildId, userId, userTag, moderatorId, moderatorTag, reason],
    });
  },

  async getWarns(guildId: string, userId: string): Promise<WarnEntry[]> {
    const result = await client.execute({
      sql: "SELECT * FROM warns WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC",
      args: [guildId, userId],
    });
    return result.rows as unknown as WarnEntry[];
  },

  async clearWarns(guildId: string, userId: string): Promise<void> {
    await client.execute({
      sql: "DELETE FROM warns WHERE guild_id = ? AND user_id = ?",
      args: [guildId, userId],
    });
  },

  // ── Member Notes ──

  async getMemberNotes(guildId: string, userId: string): Promise<MemberNote[]> {
    const result = await client.execute({
      sql: "SELECT * FROM member_notes WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC",
      args: [guildId, userId],
    });
    return result.rows as unknown as MemberNote[];
  },

  async insertMemberNote(
    guildId: string,
    userId: string,
    userTag: string,
    moderatorId: string,
    moderatorTag: string,
    note: string
  ): Promise<number> {
    const result = await client.execute({
      sql: "INSERT INTO member_notes (guild_id, user_id, user_tag, moderator_id, moderator_tag, note) VALUES (?, ?, ?, ?, ?, ?)",
      args: [guildId, userId, userTag, moderatorId, moderatorTag, note],
    });
    return Number(result.lastInsertRowid);
  },

  async updateMemberNote(id: number, guildId: string, note: string): Promise<void> {
    await client.execute({
      sql: "UPDATE member_notes SET note = ?, updated_at = strftime('%s','now') WHERE id = ? AND guild_id = ?",
      args: [note, id, guildId],
    });
  },

  async deleteMemberNote(id: number, guildId: string): Promise<void> {
    await client.execute({
      sql: "DELETE FROM member_notes WHERE id = ? AND guild_id = ?",
      args: [id, guildId],
    });
  },

  // ── Stats ──

  async getStats(guildId: string): Promise<{ count: number } | undefined> {
    const result = await client.execute({
      sql: "SELECT COUNT(*) as count FROM mod_logs WHERE guild_id = ?",
      args: [guildId],
    });
    return result.rows[0] as unknown as { count: number } | undefined;
  },

  async getTicketCount(guildId: string): Promise<{ count: number } | undefined> {
    const result = await client.execute({
      sql: "SELECT COUNT(*) as count FROM tickets WHERE guild_id = ?",
      args: [guildId],
    });
    return result.rows[0] as unknown as { count: number } | undefined;
  },

  async getOpenTicketCount(guildId: string): Promise<{ count: number } | undefined> {
    const result = await client.execute({
      sql: "SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND status = 'open'",
      args: [guildId],
    });
    return result.rows[0] as unknown as { count: number } | undefined;
  },

  // ── Guild Cache ──

  async getGuildCache(guildId: string): Promise<GuildCacheEntry | undefined> {
    const result = await client.execute({
      sql: "SELECT * FROM guild_cache WHERE guild_id = ?",
      args: [guildId],
    });
    return result.rows[0] as unknown as GuildCacheEntry | undefined;
  },

  async upsertGuildCache(
    guildId: string,
    name: string,
    icon: string | null,
    memberCount: number,
    ownerId: string
  ): Promise<void> {
    await client.execute({
      sql: `INSERT INTO guild_cache (guild_id, name, icon, member_count, owner_id)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET
              name = excluded.name,
              icon = excluded.icon,
              member_count = excluded.member_count,
              owner_id = excluded.owner_id,
              updated_at = strftime('%s','now')`,
      args: [guildId, name, icon, memberCount, ownerId],
    });
  },

  // ── Automod ──

  async getAutomodConfig(guildId: string): Promise<Record<string, number> | undefined> {
    const result = await client.execute({
      sql: "SELECT automod_enabled, automod_spam_threshold, automod_link_filter, automod_mention_cap FROM guild_settings WHERE guild_id = ?",
      args: [guildId],
    });
    return result.rows[0] as unknown as Record<string, number> | undefined;
  },

  async setAutomodEnabled(guildId: string, enabled: number): Promise<void> {
    await client.execute({
      sql: "INSERT INTO guild_settings (guild_id, automod_enabled) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET automod_enabled = excluded.automod_enabled",
      args: [guildId, enabled],
    });
  },

  async setAutomodSpam(guildId: string, threshold: number): Promise<void> {
    await client.execute({
      sql: "INSERT INTO guild_settings (guild_id, automod_spam_threshold) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET automod_spam_threshold = excluded.automod_spam_threshold",
      args: [guildId, threshold],
    });
  },

  async setAutomodLinkFilter(guildId: string, enabled: number): Promise<void> {
    await client.execute({
      sql: "INSERT INTO guild_settings (guild_id, automod_link_filter) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET automod_link_filter = excluded.automod_link_filter",
      args: [guildId, enabled],
    });
  },

  async setAutomodMentionCap(guildId: string, cap: number): Promise<void> {
    await client.execute({
      sql: "INSERT INTO guild_settings (guild_id, automod_mention_cap) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET automod_mention_cap = excluded.automod_mention_cap",
      args: [guildId, cap],
    });
  },

  async addAutomodWord(guildId: string, word: string): Promise<void> {
    await client.execute({
      sql: "INSERT OR IGNORE INTO automod_words (guild_id, word) VALUES (?, ?)",
      args: [guildId, word],
    });
  },

  async removeAutomodWord(guildId: string, word: string): Promise<void> {
    await client.execute({
      sql: "DELETE FROM automod_words WHERE guild_id = ? AND word = ?",
      args: [guildId, word],
    });
  },

  async getAutomodWords(guildId: string): Promise<string[]> {
    const result = await client.execute({
      sql: "SELECT word FROM automod_words WHERE guild_id = ?",
      args: [guildId],
    });
    return (result.rows as unknown as { word: string }[]).map((r) => r.word);
  },

  async clearAutomodWords(guildId: string): Promise<void> {
    await client.execute({
      sql: "DELETE FROM automod_words WHERE guild_id = ?",
      args: [guildId],
    });
  },

  // ── Leveling ──

  async getUserXp(guildId: string, userId: string): Promise<UserXp | undefined> {
    const result = await client.execute({
      sql: "SELECT * FROM user_xp WHERE guild_id = ? AND user_id = ?",
      args: [guildId, userId],
    });
    return result.rows[0] as unknown as UserXp | undefined;
  },

  async addUserXp(guildId: string, userId: string, xp: number, level: number): Promise<void> {
    await client.execute({
      sql: "INSERT INTO user_xp (guild_id, user_id, xp, level) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = xp + excluded.xp, level = excluded.level",
      args: [guildId, userId, xp, level],
    });
  },

  async getLeaderboard(guildId: string, limit: number): Promise<{ user_id: string; xp: number; level: number }[]> {
    const result = await client.execute({
      sql: "SELECT user_id, xp, level FROM user_xp WHERE guild_id = ? ORDER BY xp DESC LIMIT ?",
      args: [guildId, limit],
    });
    return result.rows as unknown as { user_id: string; xp: number; level: number }[];
  },

  async addLevelRole(guildId: string, level: number, roleId: string): Promise<void> {
    await client.execute({
      sql: "INSERT INTO level_roles (guild_id, level, role_id) VALUES (?, ?, ?)",
      args: [guildId, level, roleId],
    });
  },

  async removeLevelRole(guildId: string, level: number): Promise<void> {
    await client.execute({
      sql: "DELETE FROM level_roles WHERE guild_id = ? AND level = ?",
      args: [guildId, level],
    });
  },

  async getLevelRoles(guildId: string): Promise<LevelRole[]> {
    const result = await client.execute({
      sql: "SELECT * FROM level_roles WHERE guild_id = ? ORDER BY level ASC",
      args: [guildId],
    });
    return result.rows as unknown as LevelRole[];
  },

  async clearLevelRoles(guildId: string): Promise<void> {
    await client.execute({
      sql: "DELETE FROM level_roles WHERE guild_id = ?",
      args: [guildId],
    });
  },

  async setLevelChannel(guildId: string, channelId: string): Promise<void> {
    await client.execute({
      sql: "INSERT INTO guild_settings (guild_id, level_channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET level_channel_id = excluded.level_channel_id",
      args: [guildId, channelId],
    });
  },

  async getLevelChannel(guildId: string): Promise<string | null> {
    const result = await client.execute({
      sql: "SELECT level_channel_id FROM guild_settings WHERE guild_id = ?",
      args: [guildId],
    });
    const row = result.rows[0] as unknown as { level_channel_id: string | null } | undefined;
    return row?.level_channel_id ?? null;
  },

  // ── Giveaways ──

  async createGiveaway(
    guildId: string,
    channelId: string,
    prize: string,
    winnerCount: number,
    endsAt: number,
    createdBy: string
  ): Promise<number> {
    const result = await client.execute({
      sql: "INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winner_count, ends_at, status, created_by) VALUES (?, ?, NULL, ?, ?, ?, 'active', ?)",
      args: [guildId, channelId, prize, winnerCount, endsAt, createdBy],
    });
    return Number(result.lastInsertRowid);
  },

  async getGiveaway(id: number): Promise<Giveaway | undefined> {
    const result = await client.execute({
      sql: "SELECT * FROM giveaways WHERE id = ?",
      args: [id],
    });
    return result.rows[0] as unknown as Giveaway | undefined;
  },

  async getGiveawayByMessage(messageId: string): Promise<Giveaway | undefined> {
    const result = await client.execute({
      sql: "SELECT * FROM giveaways WHERE message_id = ?",
      args: [messageId],
    });
    return result.rows[0] as unknown as Giveaway | undefined;
  },

  async getActiveGiveaways(): Promise<Giveaway[]> {
    const result = await client.execute("SELECT * FROM giveaways WHERE status = 'active'");
    return result.rows as unknown as Giveaway[];
  },

  async getGiveawaysByGuild(guildId: string): Promise<Giveaway[]> {
    const result = await client.execute({
      sql: "SELECT * FROM giveaways WHERE guild_id = ? ORDER BY created_at DESC LIMIT 50",
      args: [guildId],
    });
    return result.rows as unknown as Giveaway[];
  },

  async endGiveaway(id: number): Promise<void> {
    await client.execute({
      sql: "UPDATE giveaways SET status = 'ended' WHERE id = ?",
      args: [id],
    });
  },

  async setGiveawayMessage(id: number, messageId: string): Promise<void> {
    await client.execute({
      sql: "UPDATE giveaways SET message_id = ? WHERE id = ?",
      args: [messageId, id],
    });
  },

  async addGiveawayEntry(giveawayId: number, userId: string): Promise<void> {
    await client.execute({
      sql: "INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)",
      args: [giveawayId, userId],
    });
  },

  async getGiveawayEntries(giveawayId: number): Promise<string[]> {
    const result = await client.execute({
      sql: "SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?",
      args: [giveawayId],
    });
    return (result.rows as unknown as { user_id: string }[]).map((r) => r.user_id);
  },

  async getGiveawayEntryCount(giveawayId: number): Promise<number> {
    const result = await client.execute({
      sql: "SELECT COUNT(*) as count FROM giveaway_entries WHERE giveaway_id = ?",
      args: [giveawayId],
    });
    const row = result.rows[0] as unknown as { count: number } | undefined;
    return row?.count ?? 0;
  },

  async deleteGiveawayEntries(giveawayId: number): Promise<void> {
    await client.execute({
      sql: "DELETE FROM giveaway_entries WHERE giveaway_id = ?",
      args: [giveawayId],
    });
  },

  // ── Ticket Panel ──

  async getTicketPanel(guildId: string): Promise<TicketPanel | undefined> {
    const result = await client.execute({
      sql: "SELECT * FROM ticket_panels WHERE guild_id = ?",
      args: [guildId],
    });
    return result.rows[0] as unknown as TicketPanel | undefined;
  },

  async setTicketPanel(guildId: string, channelId: string, messageId: string | null): Promise<void> {
    await client.execute({
      sql: `INSERT INTO ticket_panels (guild_id, channel_id, message_id)
            VALUES (?, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET
              channel_id = excluded.channel_id,
              message_id = excluded.message_id`,
      args: [guildId, channelId, messageId],
    });
  },

  async getTicketPanelOptions(guildId: string): Promise<TicketPanelOption[]> {
    const result = await client.execute({
      sql: "SELECT * FROM ticket_panel_options WHERE guild_id = ? ORDER BY id ASC",
      args: [guildId],
    });
    return result.rows as unknown as TicketPanelOption[];
  },

  async setTicketPanelOptions(guildId: string, options: { label: string; emoji: string }[]): Promise<void> {
    await client.execute({ sql: "DELETE FROM ticket_panel_options WHERE guild_id = ?", args: [guildId] });
    for (const opt of options) {
      await client.execute({
        sql: "INSERT INTO ticket_panel_options (guild_id, label, emoji) VALUES (?, ?, ?)",
        args: [guildId, opt.label, opt.emoji],
      });
    }
  },

  async addTicketSupportRole(guildId: string, roleId: string): Promise<void> {
    await client.execute({
      sql: "INSERT OR IGNORE INTO ticket_support_roles (guild_id, role_id) VALUES (?, ?)",
      args: [guildId, roleId],
    });
  },

  async removeTicketSupportRole(guildId: string, roleId: string): Promise<void> {
    await client.execute({
      sql: "DELETE FROM ticket_support_roles WHERE guild_id = ? AND role_id = ?",
      args: [guildId, roleId],
    });
  },

  async getTicketSupportRoles(guildId: string): Promise<TicketSupportRole[]> {
    const result = await client.execute({
      sql: "SELECT * FROM ticket_support_roles WHERE guild_id = ?",
      args: [guildId],
    });
    return result.rows as unknown as TicketSupportRole[];
  },
};
