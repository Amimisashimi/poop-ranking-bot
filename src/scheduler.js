const cron = require('node-cron');
const { MessageEmbed } = require('discord.js');
const db = require('./database');

/**
 * Get the month name from a 0-indexed month number.
 */
function getMonthName(month) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month];
}

/**
 * Post the monthly leaderboard to #general in all guilds.
 */
async function postMonthlyAnnouncement(client) {
  const now = new Date();
  // Use the current month (the cron runs on the last day of the month)
  const ukStr = now.toLocaleString('en-GB', { timeZone: 'Europe/London' });
  const ukNow = new Date(ukStr);
  const year = ukNow.getFullYear();
  const month = ukNow.getMonth();
  const monthName = getMonthName(month);

  console.log(`[Scheduler] Posting monthly announcement for ${monthName} ${year}`);

  // Post to every guild the bot is in
  for (const guild of client.guilds.cache.values()) {
    try {
      // Find the #general channel
      let channel = guild.channels.cache.find(
        ch => ch.name === 'general' && ch.isText()
      );

      if (!channel) {
        console.log(`[Scheduler] No #general channel found in guild "${guild.name}" (${guild.id}), skipping.`);
        continue;
      }

      // Get the leaderboard for this month
      const entries = db.getLeaderboardForMonth(guild.id, year, month, 10);

      if (entries.length === 0) {
        console.log(`[Scheduler] No poop data for guild "${guild.name}" this month, skipping.`);
        continue;
      }

      // Build the leaderboard text
      const medals = ['👑', '🥈', '🥉'];
      const leaderboardText = entries.map((entry, index) => {
        const medal = medals[index] || `**#${index + 1}**`;
        return `${medal} <@${entry.user_id}> — **${entry.count}** poop${entry.count !== 1 ? 's' : ''}`;
      }).join('\n');

      const winner = entries[0];
      const totalPoops = entries.reduce((sum, e) => sum + e.count, 0);

      const embed = new MessageEmbed()
        .setColor('#FFD700')
        .setTitle(`🏆💩 MONTHLY POOP CHAMPIONSHIP — ${monthName} ${year} 💩🏆`)
        .setDescription(leaderboardText)
        .addField('🎉 Champion', `Congratulations to <@${winner.user_id}> for the healthiest gut this month!`, false)
        .addField('📊 Server Total', `**${totalPoops}** poops logged this month by **${entries.length}** members`, false)
        .setFooter({ text: 'New month, new competition! Keep logging with +poop' })
        .setTimestamp();

      await channel.send({ content: '@everyone', embeds: [embed] });
      console.log(`[Scheduler] Monthly announcement posted in guild "${guild.name}"`);

    } catch (err) {
      console.error(`[Scheduler] Error posting to guild "${guild.name}":`, err);
    }
  }
}

/**
 * Schedule the monthly announcement cron job.
 * Runs at 23:59 UK time on the last day of every month.
 *
 * Since cron doesn't have a "last day of month" expression,
 * we run at 23:59 every day and check if tomorrow is the 1st.
 */
function scheduleMonthlyAnnouncement(client) {
  // Run every day at 23:59 UK time, check if it's the last day of the month
  cron.schedule('59 23 * * *', () => {
    const now = new Date();
    const ukStr = now.toLocaleString('en-GB', { timeZone: 'Europe/London' });
    const ukNow = new Date(ukStr);
    const tomorrow = new Date(ukNow);
    tomorrow.setDate(ukNow.getDate() + 1);

    // If tomorrow is the 1st, today is the last day of the month
    if (tomorrow.getDate() === 1) {
      console.log('[Scheduler] Last day of the month detected — posting monthly announcement!');
      postMonthlyAnnouncement(client);
    }
  }, {
    timezone: 'Europe/London'
  });

  console.log('[Scheduler] Monthly announcement cron job scheduled (23:59 UK time, last day of month)');
}

module.exports = { scheduleMonthlyAnnouncement, postMonthlyAnnouncement };
