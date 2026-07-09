const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Use Railway volume mount if available, otherwise store locally
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..');
const DB_PATH = path.join(DB_DIR, 'poop_ranking.db');

let db;

/**
 * Initialize the database and create tables if they don't exist.
 * sql.js is async on init (WASM loading), so this returns a promise.
 */
async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database file if it exists, otherwise create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS poop_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_poop_logs_guild_user
      ON poop_logs (guild_id, user_id);
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_poop_logs_timestamp
      ON poop_logs (timestamp);
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      announcement_channel_id TEXT
    );
  `);

  // Save to persist the schema
  saveDatabase();

  return db;
}

/**
 * Persist the in-memory database to disk.
 */
function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Log a poop for a user.
 * @returns {number} The user's total poop count in this guild (1-indexed)
 */
function addPoop(userId, username, guildId) {
  db.run(
    `INSERT INTO poop_logs (user_id, username, guild_id) VALUES (?, ?, ?)`,
    [userId, username, guildId]
  );
  saveDatabase();

  // Return the user's total count in this guild (always >= 1 after insert)
  const result = db.exec(
    `SELECT COUNT(*) as count FROM poop_logs WHERE user_id = '${userId}' AND guild_id = '${guildId}'`
  );
  return result[0].values[0][0];
}

/**
 * Undo the most recent poop for a user (deletes their latest entry).
 * @returns {boolean} Whether a record was deleted
 */
function undoPoop(userId, guildId) {
  db.run(
    `DELETE FROM poop_logs
     WHERE id = (
       SELECT id FROM poop_logs
       WHERE user_id = ? AND guild_id = ?
       ORDER BY timestamp DESC
       LIMIT 1
     )`,
    [userId, guildId]
  );
  const changes = db.getRowsModified();
  if (changes > 0) saveDatabase();
  return changes > 0;
}

/**
 * Parse UK date components reliably using Intl (avoids DD/MM vs MM/DD ambiguity).
 */
function getUKDateParts() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
    hour12: false,
  });
  const parts = {};
  for (const { type, value } of fmt.formatToParts(now)) {
    if (type !== 'literal') parts[type] = parseInt(value, 10);
  }
  return parts; // { year, month, day, hour, minute, second }
}

/**
 * Helper: get UK time "now" and compute the start of the current ISO week (Monday).
 */
function getWeekStartUK() {
  const uk = getUKDateParts();
  const d = new Date(Date.UTC(uk.year, uk.month - 1, uk.day));
  const dow = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Helper: get UK time "now" and compute the start of the current month.
 */
function getMonthStartUK() {
  const uk = getUKDateParts();
  const monthStart = new Date(Date.UTC(uk.year, uk.month - 1, 1));
  return monthStart.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Run a query and return all rows as objects.
 */
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * Run a query and return the first row as an object.
 */
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Get the weekly leaderboard (current ISO week, Monday–Sunday).
 */
function getWeeklyLeaderboard(guildId, limit = 10) {
  const weekStart = getWeekStartUK();
  return queryAll(
    `SELECT user_id, username, COUNT(*) as count
     FROM poop_logs
     WHERE guild_id = ? AND timestamp >= ?
     GROUP BY user_id
     ORDER BY count DESC
     LIMIT ?`,
    [guildId, weekStart, limit]
  );
}

/**
 * Get the monthly leaderboard (current calendar month).
 */
function getMonthlyLeaderboard(guildId, limit = 10) {
  const monthStart = getMonthStartUK();
  return queryAll(
    `SELECT user_id, username, COUNT(*) as count
     FROM poop_logs
     WHERE guild_id = ? AND timestamp >= ?
     GROUP BY user_id
     ORDER BY count DESC
     LIMIT ?`,
    [guildId, monthStart, limit]
  );
}

/**
 * Get a specific month's leaderboard (for end-of-month announcements).
 * @param {number} year
 * @param {number} month - 0-indexed (0=Jan, 11=Dec)
 */
function getLeaderboardForMonth(guildId, year, month, limit = 10) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  const startStr = start.toISOString().slice(0, 19).replace('T', ' ');
  const endStr = end.toISOString().slice(0, 19).replace('T', ' ');

  return queryAll(
    `SELECT user_id, username, COUNT(*) as count
     FROM poop_logs
     WHERE guild_id = ? AND timestamp >= ? AND timestamp < ?
     GROUP BY user_id
     ORDER BY count DESC
     LIMIT ?`,
    [guildId, startStr, endStr, limit]
  );
}

/**
 * Get a user's personal stats.
 */
function getUserStats(userId, guildId) {
  const weekStart = getWeekStartUK();
  const monthStart = getMonthStartUK();

  const weeklyCount = queryOne(
    `SELECT COUNT(*) as count FROM poop_logs WHERE user_id = ? AND guild_id = ? AND timestamp >= ?`,
    [userId, guildId, weekStart]
  ).count;

  const monthlyCount = queryOne(
    `SELECT COUNT(*) as count FROM poop_logs WHERE user_id = ? AND guild_id = ? AND timestamp >= ?`,
    [userId, guildId, monthStart]
  ).count;

  const allTimeCount = queryOne(
    `SELECT COUNT(*) as count FROM poop_logs WHERE user_id = ? AND guild_id = ?`,
    [userId, guildId]
  ).count;

  // Weekly rank: count how many users have more poops this week
  const rankRows = queryAll(
    `SELECT COUNT(*) as count FROM poop_logs
     WHERE guild_id = ? AND timestamp >= ?
     GROUP BY user_id
     HAVING COUNT(*) > ?`,
    [guildId, weekStart, weeklyCount]
  );
  const weeklyRank = rankRows.length + 1;

  return { weeklyCount, monthlyCount, allTimeCount, weeklyRank };
}

/**
 * Get the user's current weekly count (for the +poop response).
 */
function getUserWeeklyCount(userId, guildId) {
  const weekStart = getWeekStartUK();
  return queryOne(
    `SELECT COUNT(*) as count FROM poop_logs WHERE user_id = ? AND guild_id = ? AND timestamp >= ?`,
    [userId, guildId, weekStart]
  ).count;
}

/**
 * Get all guild IDs that have poop logs.
 */
function getAllGuildIds() {
  return queryAll(`SELECT DISTINCT guild_id FROM poop_logs`).map(r => r.guild_id);
}

/**
 * Reset (delete) all poop logs for a specific guild.
 * @returns {number} Number of records deleted
 */
function resetAllPoops(guildId) {
  db.run(`DELETE FROM poop_logs WHERE guild_id = ?`, [guildId]);
  const changes = db.getRowsModified();
  if (changes > 0) saveDatabase();
  return changes;
}

module.exports = {
  initDatabase,
  addPoop,
  undoPoop,
  getWeeklyLeaderboard,
  getMonthlyLeaderboard,
  getLeaderboardForMonth,
  getUserStats,
  getUserWeeklyCount,
  getAllGuildIds,
  resetAllPoops,
};
