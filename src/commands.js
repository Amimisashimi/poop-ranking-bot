const { MessageEmbed } = require('discord.js');
const db = require('./database');
const unicornRace = require('./unicornRace');

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

// Slot machine symbols and their weights (lower = rarer)
const SLOT_SYMBOLS = [
  { emoji: '🍒', name: 'cherry', weight: 30 },
  { emoji: '🍋', name: 'lemon', weight: 25 },
  { emoji: '🍇', name: 'grape', weight: 20 },
  { emoji: '⭐', name: 'star', weight: 15 },
  { emoji: '💎', name: 'diamond', weight: 8 },
  { emoji: '💩', name: 'poop', weight: 2 },
];

// Build weighted pool for slot spins
const SLOT_POOL = [];
for (const sym of SLOT_SYMBOLS) {
  for (let i = 0; i < sym.weight; i++) SLOT_POOL.push(sym.emoji);
}

/**
 * Get a random poop confirmation message.
 */
function getRandomPoopMessage(username) {
  const msg = POOP_MESSAGES[Math.floor(Math.random() * POOP_MESSAGES.length)];
  return msg.replace('{user}', username);
}

/**
 * Format a poop leaderboard array into a string.
 */
function formatPoopLeaderboard(entries) {
  if (entries.length === 0) return '*No data yet! Start logging with `+poop`*';

  return entries.map((entry, index) => {
    const medal = MEDALS[index] || `**#${index + 1}**`;
    return `${medal} <@${entry.user_id}> — **${entry.count}** poop${entry.count !== 1 ? 's' : ''}`;
  }).join('\n');
}

/**
 * Format a time remaining as a human-readable string.
 */
function formatTimeRemaining(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && hours === 0) parts.push(`${seconds}s`);
  return parts.join(' ') || '0s';
}

// ============================================================
// Poop Commands
// ============================================================

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
 * Handle the !pooplb command (weekly poop leaderboard).
 */
function handleWeeklyLeaderboard(message) {
  const guildId = message.guild.id;
  const entries = db.getWeeklyLeaderboard(guildId);

  const embed = new MessageEmbed()
    .setColor('#DAA520') // Gold
    .setTitle('📊 Weekly Poop Leaderboard 💩')
    .setDescription(formatPoopLeaderboard(entries))
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
    .setDescription(formatPoopLeaderboard(entries))
    .setFooter({ text: 'Monthly stats • Winner gets 10,000 Angel Coins!' })
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
    .setTitle(`💩 ${username}'s Stats`)
    .addField('📅 This Week', `**${stats.weeklyCount}** poops`, true)
    .addField('🗓️ This Month', `**${stats.monthlyCount}** poops`, true)
    .addField('🏆 All Time', `**${stats.allTimeCount}** poops`, true)
    .addField('📊 Weekly Rank', `#${stats.weeklyRank}`, true)
    .addField('👼 Angel Coins', `**${stats.coinBalance.toLocaleString()}**`, true)
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

// ============================================================
// Economy Commands
// ============================================================

/**
 * Handle the !daily command.
 */
function handleDaily(message) {
  const userId = message.author.id;
  const guildId = message.guild.id;

  const result = db.claimDaily(userId, guildId);

  if (result.success) {
    const embed = new MessageEmbed()
      .setColor('#2ECC71') // Green
      .setTitle('👼 Daily Angel Coins')
      .setDescription(`You claimed your daily **500** Angel Coins! 🪙\n\nNew balance: **${result.newBalance.toLocaleString()}** Angel Coins`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  } else {
    const remaining = result.nextClaim.getTime() - Date.now();
    const embed = new MessageEmbed()
      .setColor('#E74C3C') // Red
      .setTitle('👼 Daily Angel Coins')
      .setDescription(`⏰ You've already claimed your daily!\n\nCome back in **${formatTimeRemaining(remaining)}**`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
}

/**
 * Handle the !pray command.
 */
function handlePray(message) {
  const userId = message.author.id;
  const guildId = message.guild.id;

  const result = db.claimPray(userId, guildId);

  if (result.success) {
    const embed = new MessageEmbed()
      .setColor('#F1C40F') // Gold-yellow
      .setTitle('🙏 Prayer Answered!')
      .setDescription(`The angels blessed you with **50** Angel Coins! 🪙\n\nNew balance: **${result.newBalance.toLocaleString()}** Angel Coins`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  } else {
    const remaining = result.nextClaim.getTime() - Date.now();
    const embed = new MessageEmbed()
      .setColor('#E74C3C') // Red
      .setTitle('🙏 Prayer on Cooldown')
      .setDescription(`⏰ The angels need a break!\n\nYou can pray again in **${formatTimeRemaining(remaining)}**`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
}

/**
 * Handle the !bal / !balance command.
 */
function handleBalance(message) {
  const userId = message.author.id;
  const guildId = message.guild.id;

  const balance = db.getBalance(userId, guildId);

  const embed = new MessageEmbed()
    .setColor('#9B59B6') // Purple
    .setTitle('👼 Angel Coin Balance')
    .setDescription(`<@${userId}> has **${balance.toLocaleString()}** Angel Coins 🪙`)
    .setTimestamp();

  message.reply({ embeds: [embed] });
}

/**
 * Handle the !coinflip [amount] [heads/tails] command.
 */
function handleCoinflip(message) {
  const userId = message.author.id;
  const guildId = message.guild.id;
  const args = message.content.trim().split(/\s+/).slice(1);

  if (args.length < 2) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ Usage: `!coinflip [amount] [heads/tails]`\nExample: `!coinflip 200 heads`')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  const amount = parseInt(args[0]);
  const choice = args[1].toLowerCase();

  if (isNaN(amount) || amount <= 0) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ Please enter a valid amount greater than 0!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  if (choice !== 'heads' && choice !== 'tails') {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ Choose either `heads` or `tails`!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  const balance = db.getBalance(userId, guildId);
  if (balance < amount) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription(`❌ You only have **${balance.toLocaleString()}** Angel Coins!`)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Flip the coin
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const won = result === choice;
  const coinEmoji = result === 'heads' ? '🪙' : '💫';

  if (won) {
    const newBalance = db.addCoins(userId, guildId, amount);
    const embed = new MessageEmbed()
      .setColor('#2ECC71') // Green
      .setTitle(`${coinEmoji} Coin Flip — ${result.toUpperCase()}!`)
      .setDescription(`🎉 You won **${amount.toLocaleString()}** Angel Coins!\n\nBalance: **${newBalance.toLocaleString()}** Angel Coins`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  } else {
    const newBalance = db.addCoins(userId, guildId, -amount);
    const embed = new MessageEmbed()
      .setColor('#E74C3C') // Red
      .setTitle(`${coinEmoji} Coin Flip — ${result.toUpperCase()}!`)
      .setDescription(`😢 You lost **${amount.toLocaleString()}** Angel Coins!\n\nBalance: **${newBalance.toLocaleString()}** Angel Coins`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
}

/**
 * Handle the !transfer [amount] [@user] command.
 */
function handleTransfer(message) {
  const userId = message.author.id;
  const guildId = message.guild.id;
  const args = message.content.trim().split(/\s+/).slice(1);

  if (args.length < 2 || message.mentions.users.size === 0) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ Usage: `!transfer [amount] [@user]`\nExample: `!transfer 500 @angel`')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  const amount = parseInt(args[0]);
  const target = message.mentions.users.first();

  if (isNaN(amount) || amount <= 0) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ Please enter a valid amount greater than 0!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  if (target.bot) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ You can\'t transfer coins to a bot!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  const result = db.transferCoins(userId, target.id, guildId, amount);

  if (result.success) {
    const embed = new MessageEmbed()
      .setColor('#2ECC71')
      .setTitle('💸 Transfer Complete!')
      .setDescription(`<@${userId}> sent **${amount.toLocaleString()}** Angel Coins to <@${target.id}>!\n\nYour balance: **${result.senderBalance.toLocaleString()}** Angel Coins`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  } else {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription(`❌ ${result.error}`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
}

/**
 * Handle the !leaderboard / !lb command (Angel Coins leaderboard).
 */
function handleCoinLeaderboard(message) {
  const guildId = message.guild.id;
  const entries = db.getCoinLeaderboard(guildId);

  let description;
  if (entries.length === 0) {
    description = '*No data yet! Use `!daily` to get started.*';
  } else {
    description = entries.map((entry, index) => {
      const medal = MEDALS[index] || `**#${index + 1}**`;
      return `${medal} <@${entry.user_id}> — **${entry.balance.toLocaleString()}** Angel Coins`;
    }).join('\n');
  }

  const embed = new MessageEmbed()
    .setColor('#9B59B6') // Purple
    .setTitle('👼 Angel Coins Leaderboard 🪙')
    .setDescription(description)
    .setFooter({ text: 'Earn coins with !daily, !coinflip, !slots, and !rob' })
    .setTimestamp();

  message.reply({ embeds: [embed] });
}

/**
 * Handle the !slots [amount] command.
 */
function handleSlots(message) {
  const userId = message.author.id;
  const guildId = message.guild.id;
  const args = message.content.trim().split(/\s+/).slice(1);

  if (args.length < 1) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ Usage: `!slots [amount]`\nExample: `!slots 200`\nMin: 50 • Max: 5,000')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  const amount = parseInt(args[0]);

  if (isNaN(amount) || amount < 50) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ Minimum bet is **50** Angel Coins!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  if (amount > 5000) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ Maximum bet is **5,000** Angel Coins!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  const balance = db.getBalance(userId, guildId);
  if (balance < amount) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription(`❌ You only have **${balance.toLocaleString()}** Angel Coins!`)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Spin the reels
  const reel1 = SLOT_POOL[Math.floor(Math.random() * SLOT_POOL.length)];
  const reel2 = SLOT_POOL[Math.floor(Math.random() * SLOT_POOL.length)];
  const reel3 = SLOT_POOL[Math.floor(Math.random() * SLOT_POOL.length)];

  // Calculate payout
  let multiplier = 0;
  let resultText = '';

  if (reel1 === '💩' && reel2 === '💩' && reel3 === '💩') {
    multiplier = 10;
    resultText = '🚨💩 **POOP JACKPOT!!!** 💩🚨\nThe legendary triple poop!';
  } else if (reel1 === reel2 && reel2 === reel3) {
    multiplier = 5;
    resultText = '🎉 **TRIPLE MATCH!** 🎉\nIncredible luck!';
  } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
    multiplier = 2;
    resultText = '✨ **Double match!**\nNot bad!';
  } else {
    multiplier = 0;
    resultText = '💨 No match... better luck next time!';
  }

  const reelDisplay = `\`[ ${reel1} | ${reel2} | ${reel3} ]\``;
  let payout, newBalance, color;

  if (multiplier > 0) {
    payout = amount * multiplier;
    // Net gain is payout minus the original bet
    newBalance = db.addCoins(userId, guildId, payout - amount);
    color = '#2ECC71'; // Green
    resultText += `\n\n💰 Payout: **${payout.toLocaleString()}** Angel Coins (${multiplier}× bet!)`;
  } else {
    newBalance = db.addCoins(userId, guildId, -amount);
    color = '#E74C3C'; // Red
    resultText += `\n\n💸 Lost **${amount.toLocaleString()}** Angel Coins`;
  }

  const embed = new MessageEmbed()
    .setColor(color)
    .setTitle('🎰 Slot Machine')
    .setDescription(`${reelDisplay}\n\n${resultText}\n\nBalance: **${newBalance.toLocaleString()}** Angel Coins`)
    .setTimestamp();

  message.reply({ embeds: [embed] });
}

/**
 * Handle the !rob [@user] command.
 */
function handleRob(message) {
  const userId = message.author.id;
  const guildId = message.guild.id;

  if (message.mentions.users.size === 0) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ Usage: `!rob [@user]`\nExample: `!rob @angel`')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  const target = message.mentions.users.first();

  if (target.id === userId) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ You can\'t rob yourself!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  if (target.bot) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ You can\'t rob a bot!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Check cooldown
  const cooldown = db.checkRobCooldown(userId, guildId);
  if (!cooldown.canRob) {
    const remaining = cooldown.nextRob.getTime() - Date.now();
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription(`⏰ You're still laying low!\n\nYou can rob again in **${formatTimeRemaining(remaining)}**`)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Check balances
  const robberBalance = db.getBalance(userId, guildId);
  const targetBalance = db.getBalance(target.id, guildId);

  if (targetBalance < 100) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription(`❌ <@${target.id}> is too broke to rob! They need at least 100 Angel Coins.`)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Set cooldown regardless of outcome
  db.setRobTimestamp(userId, guildId);

  // 40% success rate
  const success = Math.random() < 0.4;

  if (success) {
    // Steal 10-30% of target's balance
    const stealPercent = 0.1 + Math.random() * 0.2;
    const stolenAmount = Math.floor(targetBalance * stealPercent);

    db.addCoins(userId, guildId, stolenAmount);
    db.addCoins(target.id, guildId, -stolenAmount);

    const embed = new MessageEmbed()
      .setColor('#2ECC71')
      .setTitle('🦹 Robbery Successful!')
      .setDescription(`You stole **${stolenAmount.toLocaleString()}** Angel Coins from <@${target.id}>! 💰\n\nYour balance: **${(robberBalance + stolenAmount).toLocaleString()}** Angel Coins`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  } else {
    // Fail: lose 10-20% of your own balance as a fine
    const finePercent = 0.1 + Math.random() * 0.1;
    const fineAmount = Math.max(50, Math.floor(robberBalance * finePercent));

    db.addCoins(userId, guildId, -fineAmount);

    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setTitle('🚔 Robbery Failed!')
      .setDescription(`You got caught trying to rob <@${target.id}>!\n\nYou paid a **${fineAmount.toLocaleString()}** Angel Coin fine! 💸\n\nYour balance: **${(robberBalance - fineAmount).toLocaleString()}** Angel Coins`)
      .setTimestamp();
    message.reply({ embeds: [embed] });
  }
}

// ============================================================
// Help Command
// ============================================================

/**
 * Handle the !poophelp command.
 */
function handleHelp(message) {
  const embed = new MessageEmbed()
    .setColor('#8B4513')
    .setTitle('👼 Angel Bot — Commands')
    .setDescription('Track your poops and manage your Angel Coins!')
    .addField('💩 Poop Commands', [
      '`+poop` — Log a poop',
      '`!pooplb` — Weekly poop leaderboard',
      '`!monthly` — Monthly poop leaderboard',
      '`!undo` — Remove your most recent poop',
      '`!reset` — 🔒 Reset poop data (admin)',
    ].join('\n'), false)
    .addField('👼 Angel Coins', [
      '`!daily` — Claim 500 coins (24hr cooldown)',
      '`!pray` — Claim 50 coins (1hr cooldown)',
      '`!bal` / `!balance` — Check your coin balance',
      '`!leaderboard` / `!lb` — Richest users',
      '`!transfer [amount] [@user]` — Send coins',
    ].join('\n'), false)
    .addField('🎮 Games', [
      '`!coinflip [amount] [heads/tails]` — Flip a coin (2× payout)',
      '`!slots [amount]` — Slot machine (50–5,000 bet)',
      '`!rob [@user]` — Attempt robbery (40% chance, 3hr cooldown)',
      '`!unicornbet` — Start a unicorn race!',
      '`!bet [amount] [color]` — Bet on a unicorn during a race',
    ].join('\n'), false)
    .addField('📊 Stats', [
      '`!mystats` — Your poop stats & coin balance',
    ].join('\n'), false)
    .setFooter({ text: 'Stay regular, stay rich! 🧻🪙' });

  message.reply({ embeds: [embed] });
}

// ============================================================
// Command Router
// ============================================================

/**
 * Main command router — called from the message event.
 */
function handleCommand(message) {
  const content = message.content.trim().toLowerCase();
  const command = content.split(/\s+/)[0]; // Get just the command word

  // Poop commands
  if (content === '+poop') {
    handlePoop(message);
  } else if (command === '!pooplb') {
    handleWeeklyLeaderboard(message);
  } else if (command === '!monthly') {
    handleMonthlyLeaderboard(message);
  } else if (command === '!mystats') {
    handleMyStats(message);
  } else if (command === '!undo') {
    handleUndo(message);
  } else if (command === '!reset') {
    handleReset(message);
  }
  // Economy commands
  else if (command === '!daily') {
    handleDaily(message);
  } else if (command === '!pray') {
    handlePray(message);
  } else if (command === '!bal' || command === '!balance') {
    handleBalance(message);
  } else if (command === '!coinflip' || command === '!cf') {
    handleCoinflip(message);
  } else if (command === '!transfer') {
    handleTransfer(message);
  } else if (command === '!leaderboard' || command === '!lb') {
    handleCoinLeaderboard(message);
  } else if (command === '!slots') {
    handleSlots(message);
  } else if (command === '!rob') {
    handleRob(message);
  } else if (command === '!unicornbet') {
    unicornRace.startRace(message);
  } else if (command === '!bet') {
    unicornRace.placeBet(message);
  }
  // Help
  else if (command === '!poophelp' || command === '!help') {
    handleHelp(message);
  }
}

module.exports = { handleCommand, formatPoopLeaderboard, MEDALS };
