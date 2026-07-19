// Bot token and startup config — loaded from .env
require('dotenv').config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
const startupPassword = process.env.STARTUP_PASSWORD || 'mais';

// Don't crash — WhatsApp bot works without Telegram token
// Telegram pair-bot will simply stay offline if not configured

module.exports = { BOT_TOKEN, startupPassword };
