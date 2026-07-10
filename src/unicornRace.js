const { MessageEmbed } = require('discord.js');
const db = require('./database');

// ============================================================
// Unicorn Definitions
// ============================================================

const UNICORNS = [
  {
    name: 'Pink',
    emoji: '🩷',
    color: 'pink',
    winWeight: 30,
    multiplier: 2,
    funFact: 'Once ate an entire cotton candy cloud and burped glitter for 3 days.',
  },
  {
    name: 'White',
    emoji: '🤍',
    color: 'white',
    winWeight: 25,
    multiplier: 3,
    funFact: 'Claims to be a regular horse with a party hat, but nobody believes them.',
  },
  {
    name: 'Blue',
    emoji: '💙',
    color: 'blue',
    winWeight: 20,
    multiplier: 4,
    funFact: 'Got disqualified last season for using roller skates. Denies everything.',
  },
  {
    name: 'Yellow',
    emoji: '💛',
    color: 'yellow',
    winWeight: 15,
    multiplier: 5,
    funFact: 'Runs faster when you play the Benny Hill theme. Scientists are baffled.',
  },
  {
    name: 'Purple',
    emoji: '💜',
    color: 'purple',
    winWeight: 10,
    multiplier: 7,
    funFact: 'Has never finished a race sober. Somehow still the fan favourite.',
  },
];

// Build weighted pool for picking the winner
const WIN_POOL = [];
for (const u of UNICORNS) {
  for (let i = 0; i < u.winWeight; i++) WIN_POOL.push(u.color);
}

// Number emojis for the countdown
const NUMBER_EMOJIS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

// Minimum bet
const MIN_BET = 50;

// ============================================================
// Active Races (per guild)
// ============================================================

// Map<guildId, { phase, bets, countdownMsg, channel, timer }>
const activeRaces = new Map();

/**
 * Format a unicorn's display line for the race embed.
 */
function formatUnicornLine(u) {
  return `${u.emoji} **${u.name} Unicorn** — ${u.multiplier}× payout (${u.winWeight}% chance)\n> _"${u.funFact}"_`;
}

/**
 * Build the initial race embed (shown during betting).
 */
function buildRaceEmbed(secondsLeft) {
  const unicornLines = UNICORNS.map(formatUnicornLine).join('\n\n');

  const countdownDisplay = secondsLeft > 10
    ? `**${secondsLeft}**`
    : NUMBER_EMOJIS[secondsLeft];

  const embed = new MessageEmbed()
    .setColor('#9B59B6')
    .setTitle('🦄 Unicorn Race — Place Your Bets!')
    .setDescription(
      `${unicornLines}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `⏳ Race starts in: ${countdownDisplay}\n\n` +
      `Use \`!bet [amount] [color]\` to bet!\n` +
      `Example: \`!bet 200 blue\`\n` +
      `Minimum bet: **${MIN_BET}** Angel Coins`
    )
    .setFooter({ text: 'May the best unicorn win! 🏁' })
    .setTimestamp();

  return embed;
}

/**
 * Start a unicorn race in the given guild.
 */
async function startRace(message) {
  const guildId = message.guild.id;
  const channel = message.channel;

  // Check if a race is already active
  if (activeRaces.has(guildId)) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ A unicorn race is already in progress! Wait for it to finish.')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Create race state
  const race = {
    phase: 'betting',  // 'betting' | 'racing' | 'finished'
    bets: new Map(),    // Map<userId, { amount, unicornColor, username }>
    countdownMsg: null,
    channel: channel,
    secondsLeft: 15,
    timer: null,
  };

  activeRaces.set(guildId, race);

  // Send initial embed
  const embed = buildRaceEmbed(15);
  const sentMsg = await channel.send({ embeds: [embed] });
  race.countdownMsg = sentMsg;

  // Start countdown
  race.timer = setInterval(async () => {
    race.secondsLeft -= 1;

    if (race.secondsLeft <= 0) {
      clearInterval(race.timer);
      race.phase = 'racing';

      // Update embed to show betting closed
      try {
        const closedEmbed = new MessageEmbed()
          .setColor('#E67E22')
          .setTitle('🦄 Unicorn Race — Bets Closed!')
          .setDescription('🏁 The race is about to begin...')
          .setTimestamp();
        await race.countdownMsg.edit({ embeds: [closedEmbed] });
      } catch (e) { /* message may have been deleted */ }

      // Run the race
      await runRace(channel, guildId);
      return;
    }

    // Update countdown in embed
    try {
      const updatedEmbed = buildRaceEmbed(race.secondsLeft);

      // Show current bets if any
      if (race.bets.size > 0) {
        const betLines = [];
        for (const [userId, bet] of race.bets) {
          const unicorn = UNICORNS.find(u => u.color === bet.unicornColor);
          betLines.push(`${unicorn.emoji} <@${userId}> — **${bet.amount.toLocaleString()}** on ${unicorn.name}`);
        }
        updatedEmbed.addField('💰 Current Bets', betLines.join('\n'));
      }

      await race.countdownMsg.edit({ embeds: [updatedEmbed] });
    } catch (e) { /* message may have been deleted */ }
  }, 1000);
}

/**
 * Place a bet on an active race.
 */
function placeBet(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;
  const username = message.member?.nickname || message.author.username;

  const race = activeRaces.get(guildId);

  // Check if there's an active race in betting phase
  if (!race || race.phase !== 'betting') {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ No unicorn race is accepting bets right now!\nStart one with `!unicornbet`')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Parse args: !bet [amount] [color]
  const args = message.content.trim().split(/\s+/).slice(1);

  if (args.length < 2) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ Usage: `!bet [amount] [color]`\nExample: `!bet 200 blue`\nColors: pink, white, blue, yellow, purple')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  const amount = parseInt(args[0]);
  const colorChoice = args[1].toLowerCase();

  // Validate amount
  if (isNaN(amount) || amount < MIN_BET) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription(`❌ Minimum bet is **${MIN_BET}** Angel Coins!`)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Validate unicorn color
  const unicorn = UNICORNS.find(u => u.color === colorChoice);
  if (!unicorn) {
    const validColors = UNICORNS.map(u => `\`${u.color}\``).join(', ');
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription(`❌ Unknown unicorn! Pick from: ${validColors}`)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Check if player already bet
  if (race.bets.has(userId)) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription('❌ You\'ve already placed a bet this race!')
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Check balance
  const balance = db.getBalance(userId, guildId);
  if (balance < amount) {
    const embed = new MessageEmbed()
      .setColor('#E74C3C')
      .setDescription(`❌ You only have **${balance.toLocaleString()}** Angel Coins!`)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Deduct coins immediately
  db.addCoins(userId, guildId, -amount);

  // Store the bet
  race.bets.set(userId, { amount, unicornColor: colorChoice, username });

  // Confirm
  const embed = new MessageEmbed()
    .setColor('#2ECC71')
    .setDescription(`${unicorn.emoji} **${username}** bet **${amount.toLocaleString()}** Angel Coins on **${unicorn.name} Unicorn**!\n\nPotential payout: **${(amount * unicorn.multiplier).toLocaleString()}** (${unicorn.multiplier}×)`)
    .setTimestamp();
  message.reply({ embeds: [embed] });
}

// ============================================================
// Race Narration
// ============================================================

// Race commentary templates — {winner} and {loser} get replaced
const RACE_NARRATION = [
  [
    '🏁 The unicorns line up at the starting gate... the crowd goes wild!',
    '💨 They\'re off! {pink} takes an early lead with {blue} close behind!',
    '⚡ {yellow} makes a sudden burst of speed from the back!',
    '🌀 {purple} trips over their own hooves but somehow keeps running!',
    '🔥 It\'s neck and neck! {white} and {winner} are fighting for the lead!',
    '😱 DRAMATIC TURN! {winner} pulls ahead with an incredible sprint!',
    '🏆 **{winner} CROSSES THE FINISH LINE!**',
  ],
  [
    '🏁 The gates open and the unicorns charge forward!',
    '🌈 {white} leaves a rainbow trail as they gallop ahead!',
    '💥 {blue} bumps into {yellow} — the crowd gasps!',
    '🚀 {winner} activates their secret turbo mode!',
    '😤 {pink} is giving it everything but starts falling behind!',
    '🎭 {purple} stops to pose for the cameras, then panics and sprints!',
    '🏆 **{winner} WINS THE RACE!**',
  ],
  [
    '🏁 AND THEY\'RE OFF! Five unicorns blast out of the gate!',
    '🍌 {yellow} slips on a banana peel but recovers beautifully!',
    '👀 {pink} and {white} are trading places in a fierce battle!',
    '💨 {blue} uses the slipstream behind {purple} to gain speed!',
    '🎪 The crowd is on their feet! This is anyone\'s race!',
    '⚡ {winner} makes their move — charging through the pack!',
    '🏆 **{winner} TAKES THE VICTORY!**',
  ],
];

/**
 * Pick a random narration template and fill in unicorn names.
 */
function buildNarration(winnerUnicorn) {
  const template = RACE_NARRATION[Math.floor(Math.random() * RACE_NARRATION.length)];

  return template.map(line => {
    let result = line;
    // Replace {winner} with the winning unicorn
    result = result.replace(/\{winner\}/g, `${winnerUnicorn.emoji} ${winnerUnicorn.name}`);
    // Replace other unicorn placeholders
    for (const u of UNICORNS) {
      result = result.replace(new RegExp(`\\{${u.color}\\}`, 'g'), `${u.emoji} ${u.name}`);
    }
    return result;
  });
}

/**
 * Sleep helper.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run the race narration and settle bets.
 */
async function runRace(channel, guildId) {
  const race = activeRaces.get(guildId);
  if (!race) return;

  // If nobody bet, cancel the race
  if (race.bets.size === 0) {
    const embed = new MessageEmbed()
      .setColor('#95A5A6')
      .setTitle('🦄 Unicorn Race — Cancelled')
      .setDescription('Nobody placed a bet! The unicorns went home. 😴')
      .setTimestamp();
    await channel.send({ embeds: [embed] });
    activeRaces.delete(guildId);
    return;
  }

  // Pick the winner (weighted random)
  const winnerColor = WIN_POOL[Math.floor(Math.random() * WIN_POOL.length)];
  const winnerUnicorn = UNICORNS.find(u => u.color === winnerColor);

  // Build narration
  const narration = buildNarration(winnerUnicorn);

  // Send narration line by line
  for (const line of narration) {
    await channel.send(line);
    await sleep(2000);
  }

  // Settle bets
  await settleRace(channel, guildId, winnerUnicorn);
}

/**
 * Settle all bets after the race ends.
 */
async function settleRace(channel, guildId, winnerUnicorn) {
  const race = activeRaces.get(guildId);
  if (!race) return;

  const winners = [];
  const losers = [];

  for (const [userId, bet] of race.bets) {
    if (bet.unicornColor === winnerUnicorn.color) {
      // Winner! Pay out bet × multiplier
      const payout = bet.amount * winnerUnicorn.multiplier;
      const newBalance = db.addCoins(userId, guildId, payout);
      winners.push({
        userId,
        username: bet.username,
        betAmount: bet.amount,
        payout,
        newBalance,
      });
    } else {
      // Loser — coins were already deducted when they bet
      const currentBalance = db.getBalance(userId, guildId);
      losers.push({
        userId,
        username: bet.username,
        betAmount: bet.amount,
        unicorn: UNICORNS.find(u => u.color === bet.unicornColor),
        newBalance: currentBalance,
      });
    }
  }

  // Build results embed
  const embed = new MessageEmbed()
    .setColor('#FFD700')
    .setTitle(`🏆 ${winnerUnicorn.emoji} ${winnerUnicorn.name} Unicorn Wins!`)
    .setTimestamp();

  // Winners section
  if (winners.length > 0) {
    const winnerLines = winners.map(w =>
      `🎉 <@${w.userId}> — bet **${w.betAmount.toLocaleString()}** → won **${w.payout.toLocaleString()}** (${winnerUnicorn.multiplier}×)`
    ).join('\n');
    embed.addField('💰 Winners', winnerLines);
  } else {
    embed.addField('💰 Winners', '_Nobody bet on the winner!_');
  }

  // Losers section
  if (losers.length > 0) {
    const loserLines = losers.map(l =>
      `💸 <@${l.userId}> — lost **${l.betAmount.toLocaleString()}** on ${l.unicorn.emoji} ${l.unicorn.name}`
    ).join('\n');
    embed.addField('😢 Better Luck Next Time', loserLines);
  }

  await channel.send({ embeds: [embed] });

  // Clean up
  activeRaces.delete(guildId);
}

module.exports = { startRace, placeBet };
