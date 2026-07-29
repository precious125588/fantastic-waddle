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


// ── Bot selection required (new pairing, no bot chosen yet) ──────────────────
// Sent to the Telegram user who paired the number (when known) and to admins.
// The inline keyboard is answered by the polling bot in bot.js.
async function sendSelectionRequired(userNumber, bots = []) {
    const number = String(userNumber).replace(/\D/g, '');
    if (!number) return;

    let store = null;
    try { store = require('./deploy/botSelectionStore'); } catch {}

    const keyboard = {
        inline_keyboard: (bots.length ? bots : [{ id: 'mias-mdx', name: 'MIAS MDX' }]).map(b => ([{
            text: `${b.name}${b.tagline ? ' — ' + b.tagline : ''}`,
            callback_data: `bsel|${number}|${b.id}`,
        }])),
    };

    const text =
`🤖 *CHOOSE YOUR BOT*

📱 Number: \`${number}\`
✅ WhatsApp linked successfully.

Nothing is deployed until you pick a bot below.
You can also send /number any time.

🔒 *Your choice is final* — to change bots you must unpair this number and pair it again.`;

    const targets = new Set();

    const owner = store?.getOwner?.(number);
    if (owner?.id) targets.add(String(owner.id));

    const envAdmins = (process.env.ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
    if (envAdmins.length) {
        envAdmins.forEach(a => targets.add(a));
    } else {
        try {
            if (fs.existsSync(adminFilePath)) {
                const fileAdmins = JSON.parse(fs.readFileSync(adminFilePath, 'utf8'));
                if (Array.isArray(fileAdmins)) fileAdmins.forEach(a => targets.add(String(a).trim()));
            }
        } catch {}
    }

    if (!targets.size) {
        console.warn('[notify] No Telegram target for bot selection of ' + number);
        return;
    }

    // Reuse the already-polling bot when it exists so we do not open a second
    // Telegram client for a single send.
    const client = global._miasTelegramBot || new TelegramBot(BOT_TOKEN, { polling: false });

    for (const chatId of targets) {
        try {
            await client.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
        } catch (err) {
            console.error(`[notify] Selection prompt failed for ${chatId}:`, err.message);
        }
    }
}

module.exports = {
    sendNotification,
    sendSelectionRequired,
    sendUserConnected,
    sendUserDisconnected,
    sendBotStartMessage
};
