require('dotenv').config();

const { Client, Intents } = require('discord.js');
const { initDatabase } = require('./database');
const { handleCommand } = require('./commands');
const { scheduleMonthlyAnnouncement } = require('./scheduler');

// Validate token
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is not set! Create a .env file with your bot token.');
  console.error('   See .env.example for the format.');
  process.exit(1);
}

async function main() {
  // Initialize database (sql.js is async due to WASM loading)
  console.log('📦 Initializing database...');
  await initDatabase();
  console.log('✅ Database ready!');

  // Create Discord client with required intents
  const client = new Client({
    intents: [
      Intents.FLAGS.GUILDS,
      Intents.FLAGS.GUILD_MESSAGES,
    ],
  });

  // Bot ready event
  client.once('ready', () => {
    console.log(`\n🚀 Poop Ranking Bot is online!`);
    console.log(`   Logged in as: ${client.user.tag}`);
    console.log(`   Serving ${client.guilds.cache.size} server(s)`);
    console.log(`   Commands: +poop, !leaderboard, !monthly, !mystats, !undo, !reset, !poophelp\n`);

    // Set bot status
    client.user.setActivity('💩 +poop to log', { type: 'WATCHING' });

    // Schedule monthly announcements
    scheduleMonthlyAnnouncement(client);
  });

  // Message event — route to command handler
  client.on('messageCreate', (message) => {
    // Ignore bot messages and DMs
    if (message.author.bot) return;
    if (!message.guild) return;

    // Only process messages that look like commands
    const content = message.content.trim().toLowerCase();
    if (content.startsWith('+') || content.startsWith('!')) {
      handleCommand(message);
    }
  });

  // Error handling
  client.on('error', (error) => {
    console.error('[Discord] Client error:', error);
  });

  process.on('unhandledRejection', (error) => {
    console.error('[Process] Unhandled rejection:', error);
  });

  // Login
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
