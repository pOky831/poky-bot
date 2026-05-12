import { Message, TextChannel } from "discord.js";
import { stmts } from "../database/db.js";

// Spam tracking: Map<guildId, Map<userId, timestamp[]>>
const messageCache = new Map<string, Map<string, number[]>>();
// XP cooldown: Map<guildId_userId, timestamp>
const xpCooldowns = new Map<string, number>();

const SPAM_WINDOW_MS = 5000; // 5 seconds
const XP_COOLDOWN_MS = 60_000; // 60 seconds
const XP_MIN = 15;
const XP_MAX = 25;

// Periodic cleanup of stale entries (every 60 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [, guildMap] of messageCache) {
    for (const [userId, timestamps] of guildMap) {
      const recent = timestamps.filter((ts) => now - ts < SPAM_WINDOW_MS);
      if (recent.length === 0) {
        guildMap.delete(userId);
      } else {
        guildMap.set(userId, recent);
      }
    }
  }
  // Clean XP cooldowns
  for (const [key, ts] of xpCooldowns) {
    if (now - ts > XP_COOLDOWN_MS) xpCooldowns.delete(key);
  }
}, 60_000);

function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5));
}

export async function handleMessageCreate(message: Message): Promise<void> {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;

  // Fetch automod config
  const configRow = stmts.getAutomodConfig(guildId) as {
    automod_enabled: number;
    automod_spam_threshold: number;
    automod_link_filter: number;
    automod_mention_cap: number;
  } | undefined;

  if (!configRow || !configRow.automod_enabled) return;

  const { automod_spam_threshold, automod_link_filter, automod_mention_cap } = configRow;
  const channel = message.channel as TextChannel;

  // ── Bad Word Filter ──
  const badWords = stmts.getAutomodWords(guildId) as string[];
  if (badWords.length > 0) {
    const content = message.content.toLowerCase();
    const foundWord = badWords.find((word) => content.includes(word.toLowerCase()));
    if (foundWord) {
      try {
        await message.delete();
        const reply = await channel.send(
          `⚠️ ${message.author}, unangemessene Wörter sind nicht erlaubt.`
        );
        setTimeout(() => reply.delete().catch(() => {}), 5000);
      } catch {
        // Missing permissions, silently ignore
      }
      return; // Don't check other filters if message was deleted
    }
  }

  // ── Link Filter ──
  if (automod_link_filter) {
    const linkRegex = /https?:\/\/[^\s]+|discord\.gg\/[^\s]+/i;
    if (linkRegex.test(message.content)) {
      try {
        await message.delete();
        const reply = await channel.send(
          `🔗 ${message.author}, Links sind auf diesem Server nicht erlaubt.`
        );
        setTimeout(() => reply.delete().catch(() => {}), 5000);
      } catch {
        // Missing permissions
      }
      return;
    }
  }

  // ── Mention Cap ──
  if (automod_mention_cap > 0) {
    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    if (mentionCount > automod_mention_cap) {
      try {
        await message.delete();
        const reply = await channel.send(
          `📢 ${message.author}, zu viele Mentions! Maximal ${automod_mention_cap} erlaubt.`
        );
        setTimeout(() => reply.delete().catch(() => {}), 5000);
      } catch {
        // Missing permissions
      }
      return;
    }
  }

  // ── Anti-Spam ──
  if (automod_spam_threshold > 0) {
    if (!messageCache.has(guildId)) {
      messageCache.set(guildId, new Map());
    }
    const guildCache = messageCache.get(guildId)!;
    if (!guildCache.has(message.author.id)) {
      guildCache.set(message.author.id, []);
    }

    const now = Date.now();
    const timestamps = guildCache.get(message.author.id)!;
    // Remove old timestamps outside the window
    const recent = timestamps.filter((ts) => now - ts < SPAM_WINDOW_MS);
    recent.push(now);
    guildCache.set(message.author.id, recent);

    if (recent.length >= automod_spam_threshold) {
      // Spam detected
      try {
        // Delete the spam messages (last few messages from this user)
        const messages = await channel.messages.fetch({ limit: 20 });
        const userMessages = messages.filter(
          (m) => m.author.id === message.author.id && Date.now() - m.createdTimestamp < SPAM_WINDOW_MS + 2000
        );
        for (const [, msg] of userMessages) {
          await msg.delete().catch(() => {});
        }

        // Try to timeout the user
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member?.moderatable) {
          await member.timeout(60_000, "Auto-Mod: Spam").catch(() => {});
          const reply = await channel.send(
            `🔇 ${message.author} wurde für 1 Minute stummgeschaltet (Spam).`
          );
          setTimeout(() => reply.delete().catch(() => {}), 5000);
        } else {
          const reply = await channel.send(
            `⚠️ ${message.author}, bitte höre auf zu spammen!`
          );
          setTimeout(() => reply.delete().catch(() => {}), 5000);
        }
      } catch {
        // Missing permissions
      }
    }
  }

  // ── XP / Leveling System ──
  const xpKey = `${guildId}_${message.author.id}`;
  const now = Date.now();
  const lastXp = xpCooldowns.get(xpKey);

  if (!lastXp || now - lastXp > XP_COOLDOWN_MS) {
    xpCooldowns.set(xpKey, now);

    const xpGain = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
    const current = stmts.getUserXp(guildId, message.author.id);
    const newXp = (current?.xp ?? 0) + xpGain;
    const newLevel = (() => {
      let lvl = current?.level ?? 1;
      while (newXp >= xpForLevel(lvl + 1)) lvl++;
      return lvl;
    })();

    stmts.addUserXp(guildId, message.author.id, xpGain, newLevel);

    // Check if user leveled up and assign role rewards
    if (newLevel > (current?.level ?? 1)) {
      const levelRoles = stmts.getLevelRoles(guildId);
      for (const lr of levelRoles) {
        if (lr.level <= newLevel && lr.level > (current?.level ?? 0)) {
          const member = await message.guild!.members.fetch(message.author.id).catch(() => null);
          if (member) {
            await member.roles.add(lr.role_id).catch(() => {});
          }
        }
      }
    }
  }
}
