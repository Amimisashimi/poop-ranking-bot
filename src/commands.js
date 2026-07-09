const { MessageEmbed } = require('discord.js');
const db = require('./database');

// Fun confirmation messages for when someone logs a poop
const POOP_MESSAGES = [
  "Nice one, {user}! 💩",
  "Another one bites the dust! 💩",
  "That's the spirit, {user}! 💩",
  "{user} has been blessed by the poop gods! 💩",
  "Boom! {user} drops a log! 💩",
  "Keep 'em coming, {user}! 💩",
  "Healthy gut alert! 🚨💩",
  "{user} is on a roll! 🧻💩",
  "Splashdown confirmed! 🌊💩",
  "Mission accomplished, {user}! 🎯💩",
  "One small poop for {user}, one giant leap for gut health! 🚀💩",
  "{user} just leveled up! 📈💩",
];

// Medal emojis for leaderboard positions
const MEDALS = ['👑', '🥈', '🥉'];

/**
 * Get a random poop confirmation message.
 */
function getRandomPoopMessage(username) {
  const msg = POOP_MESSAGES[Math.floor(Math.random() * POOP_MESSAGES.length)];
  return msg.replace('{user}', username);
}

/**
 * Format a leaderboard array into a string.
 */
function formatLeaderboard(entries) {
  if (entries.length === 0) return '*No data yet! Start logging with `+poop`*';

  return entries.map((entry, index) => {
    const medal = MEDALS[index] || `**#${index + 1}**`;
    return `${medal} <@${entry.user_id}> — **${entry.count}** poop${entry.count !== 1 ? 's' : ''}`;
  }).join('\n');
}

/**
 * Handle the +poop command.
 */
function handlePoop(message) {
  const userId = message.author.id;
  const username = message.member?.nickname || message.author.username;
  const guildId = message.guild.id;

  // Log the poop
  db.addPoop(userId, username, guildId);

  // Get the user's weekly count (not all-time)
  const weeklyCount = db.getUserWeeklyCount(userId, guildId);

  // Build response
  const funMessage = getRandomPoopMessage(username);

  const embed = new MessageEmbed()
    .setColor('#8B4513') // Brown
    .setDescription(`${funMessage}\n\nThat's poop **#${weeklyCount}** this week!`)
    .setTimestamp();

  message.reply({ embeds: [embed] });
}

/**
 * Handle the !leaderboard / !lb command (weekly).
 */
function handleWeeklyLeaderboard(message) {
  const guildId = message.guild.id;
  const entries = db.getWeeklyLeaderboard(guildId);

  const embed = new MessageEmbed()
    .setColor('#DAA520') // Gold
    .setTitle('📊 Weekly Poop Leaderboard 💩')
    .setDescription(formatLeaderboard(entries))
    .setFooter({ text: 'Week resets every Monday • Keep pooping!' })
    .setTimestamp();

  message.reply({ embeds: [embed] });
}

/**
 * Handle the !monthly command.
 */
function handleMonthlyLeaderboard(message) {
  const guildId = message.guild.id;
  const entries = db.getMonthlyLeaderboard(guildId);

  const now = new Date();
  const monthName = now.toLocaleString('en-GB', { month: 'long', timeZone: 'Europe/London' });

  const embed = new MessageEmbed()
    .setColor('#FFD700') // Bright Gold
    .setTitle(`📊 ${monthName} Poop Leaderboard 💩`)
    .setDescription(formatLeaderboard(entries))
    .setFooter({ text: 'Monthly stats • Keep it regular!' })
    .setTimestamp();

  message.reply({ embeds: [embed] });
}

/**
 * Handle the !mystats command.
 */
function handleMyStats(message) {
  const userId = message.author.id;
  const username = message.member?.nickname || message.author.username;
  const guildId = message.guild.id;

  const stats = db.getUserStats(userId, guildId);

  const embed = new MessageEmbed()
    .setColor('#8B4513')
    .setTitle(`💩 ${username}'s Poop Stats`)
    .addField('📅 This Week', `**${stats.weeklyCount}** poops`, true)
    .addField('🗓️ This Month', `**${stats.monthlyCount}** poops`, true)
    .addField('🏆 All Time', `**${stats.allTimeCount}** poops`, true)
    .addField('📊 Weekly Rank', `#${stats.weeklyRank}`, true)
    .setTimestamp();

  message.reply({ embeds: [embed] });
}

/**
 * Handle the !undo command (remove most recent poop).
 */
function handleUndo(message) {
  const userId = message.author.id;
  const guildId = message.guild.id;

  const removed = db.undoPoop(userId, guildId);

  if (removed) {
    const embed = new MessageEmbed()
      .setColor('#FF6347') // Tomato red
      .setDescription(`🔄 Oops! Last poop entry removed for <@${userId}>.`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  } else {
    const embed = new MessageEmbed()
      .setColor('#FF6347')
      .setDescription(`❌ No poop entries to undo!`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
}

/**
 * Handle the !reset command (admin-only — wipes ALL poop logs for this server).
 */
function handleReset(message) {
  // Only allow server admins to reset
  if (!message.member.permissions.has('ADMINISTRATOR')) {
    const embed = new MessageEmbed()
      .setColor('#FF6347')
      .setDescription('❌ Only server administrators can use `!reset`.')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  const guildId = message.guild.id;
  const deletedCount = db.resetAllPoops(guildId);

  const embed = new MessageEmbed()
    .setColor('#FF6347') // Tomato red
    .setTitle('🔄 Server Poop Reset')
    .setDescription(
      deletedCount > 0
        ? `💥 All poop data has been wiped! **${deletedCount}** log${deletedCount !== 1 ? 's' : ''} deleted.\n\nEveryone starts fresh — get logging with \`+poop\`!`
        : `There was nothing to reset — no poop logs found!`
    )
    .setTimestamp();

  message.reply({ embeds: [embed] });
}

/**
 * Handle the !poophelp command.
 */
function handleHelp(message) {
  const embed = new MessageEmbed()
    .setColor('#8B4513')
    .setTitle('💩 Poop Ranking Bot — Commands')
    .setDescription('Track your poops and compete with your friends!')
    .addField('`+poop`', 'Log a poop 💩', false)
    .addField('`!leaderboard` / `!lb`', 'View the weekly leaderboard', false)
    .addField('`!monthly`', 'View the monthly leaderboard', false)
    .addField('`!mystats`', 'View your personal poop stats', false)
    .addField('`!undo`', 'Remove your most recent poop entry', false)
    .addField('`!reset`', '🔒 Reset all poop data (admin only)', false)
    .addField('`!poophelp`', 'Show this help message', false)
    .setFooter({ text: 'Stay regular, stay healthy! 🧻' });

  message.reply({ embeds: [embed] });
}

/**
 * Main command router — called from the message event.
 */
function handleCommand(message) {
  const content = message.content.trim().toLowerCase();

  if (content === '+poop') {
    handlePoop(message);
  } else if (content === '!leaderboard' || content === '!lb') {
    handleWeeklyLeaderboard(message);
  } else if (content === '!monthly') {
    handleMonthlyLeaderboard(message);
  } else if (content === '!mystats') {
    handleMyStats(message);
  } else if (content === '!undo') {
    handleUndo(message);
  } else if (content === '!reset') {
    handleReset(message);
  } else if (content === '!poophelp') {
    handleHelp(message);
  }
}

module.exports = { handleCommand, formatLeaderboard, MEDALS };
