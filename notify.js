// notify.js
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const { BOT_TOKEN } = require('./nexstore/token');

const adminFilePath = './nexstore/admin.json';

async function sendNotification(message, parseMode = 'Markdown') {
    const envAdmins = (process.env.ADMIN_IDS || '')
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);
    let adminIDs = envAdmins.length ? envAdmins : [];

    try {
        if (!envAdmins.length && fs.existsSync(adminFilePath)) {
            const fileAdmins = JSON.parse(fs.readFileSync(adminFilePath, 'utf8'));
            if (Array.isArray(fileAdmins)) {
                adminIDs = fileAdmins.map(id => String(id).trim()).filter(Boolean);
            }
        }
    } catch (e) {
        console.error('Error loading admin IDs:', e);
    }

    if (adminIDs.length === 0) {
        console.warn('No Telegram admin IDs configured; skipping notification.');
        return;
    }

    try {
        const bot = new TelegramBot(BOT_TOKEN, { polling: false });
        for (const adminId of adminIDs) {
            try {
                await bot.sendMessage(adminId, message, { parse_mode: parseMode });
                console.log(`✓ Notification sent to admin: ${adminId}`);
            } catch (err) {
                console.error(`Failed to send to admin ${adminId}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Failed to send notification:', err.message);
    }
}

async function sendUserConnected(userNumber) {
    const BOT_NM = process.env.BOT_NAME || 'MAIS MDX';
    const date = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos' });

    const message =
`╔══════════════════════════════╗
║   ✅ *USER CONNECTED* ✅
╠══════════════════════════════╣
║ 📱 *Number:*  \`${userNumber}\`
║ 🕐 *Time:*    ${date}
║ 🟢 *Status:*  Online & Ready
║ 🤖 *Bot:*     ${BOT_NM}
╠══════════════════════════════╣
║   📌 *QUICK COMMANDS*
╠══════════════════════════════╣
║ 🎨 *AI / FUN*
║  .ai  .gpt  .roast  .poem
║  .storyai  .triviaai  .codeai
║  .txt2img  .compliment
╠══════════════════════════════╣
║ 📥 *DOWNLOADERS*
║  .tiktok  .ig  .yt  .twitter
║  .fb  .snap  .reddit  .spotify
║  .pin  .threads  .mediafire
╠══════════════════════════════╣
║ 🔍 *SEARCH & TOOLS*
║  .movies  .anime  .apk
║  .wiki  .weather  .tts
║  .translate  .adult
╠══════════════════════════════╣
║ 🛡️ *GROUP ADMIN*
║  .kick  .ban  .promote  .demote
║  .mute  .unmute  .tagall
║  .antilink  .antispam  .warn
║  .kickall  .close  .open
╠══════════════════════════════╣
║ ⚙️ *SETTINGS*
║  .autobio  .autoview  .autoreact
║  .autotyping  .setpp  .gst
╠══════════════════════════════╣
║ ℹ️  Send *.menu* in WhatsApp
║     for full command list
╠══════════════════════════════╣
║ ⚡ Powered by ${BOT_NM}
╚══════════════════════════════╝`;

    await sendNotification(message);
}

async function sendUserDisconnected(userNumber, reason = 'Unknown') {
    const BOT_NM = process.env.BOT_NAME || 'MAIS MDX';
    const date = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos' });

    const message =
`╔══════════════════════════════╗
║   ❌ *USER DISCONNECTED* ❌
╠══════════════════════════════╣
║ 📱 *Number:*  \`${userNumber}\`
║ 🕐 *Time:*    ${date}
║ 🔴 *Status:*  Offline
║ 📝 *Reason:*  ${reason}
║ 🤖 *Bot:*     ${BOT_NM}
╠══════════════════════════════╣
║ 🔄 Bot will attempt to reconnect
║ ⚡ Powered by ${BOT_NM}
╚══════════════════════════════╝`;

    await sendNotification(message);
}

async function sendBotStartMessage() {
    const BOT_NM = process.env.BOT_NAME || 'MAIS MDX';
    const date = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lagos' });
    const uptime = process.uptime();
    const days    = Math.floor(uptime / 86400);
    const hours   = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    const message =
`╔══════════════════════════════╗
║   🤖 *${BOT_NM} STARTED* 🤖
╠══════════════════════════════╣
║ 🕐 *Time:*    ${date}
║ ⏱️  *Uptime:*  ${days}d ${hours}h ${minutes}m
║ 🟢 *Status:*  Online & Ready
╠══════════════════════════════╣
║   📌 *SYSTEM INFO*
╠══════════════════════════════╣
║ 🔑 *Prefix:*  . (dot)
║ 📡 *Mode:*    Multi-User
║ 🔄 *Restart:* Auto (exit 75)
║ 🛡️ *Admin log:* ON for all GCs
╠══════════════════════════════╣
║   📌 *QUICK COMMANDS*
╠══════════════════════════════╣
║ .menu — Full command list
║ .pair — Pair WhatsApp
║ .ai   — AI chat
║ .tiktok .ig .yt — Download
║ .kick .ban .promote — GC admin
╠══════════════════════════════╣
║ ✨ *Ready to serve all users!*
║ ⚡ Powered by ${BOT_NM}
╚══════════════════════════════╝`;

    await sendNotification(message);
}

module.exports = {
    sendNotification,
    sendUserConnected,
    sendUserDisconnected,
    sendBotStartMessage
};
