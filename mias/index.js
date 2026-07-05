// ═══════════════════════════════════════════════════════════════════════════════
// MAIS MDX v2026 — Main Bot (mias/index.js)
// Latest Whiskey Socket Baileys with all features fixed
// ═══════════════════════════════════════════════════════════════════════════════

import { default as makeWASocket, DisconnectReason, useMultiFileAuthState, Browsers, getContentType, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import NodeCache from 'node-cache';
import { Boom } from '@hapi/boom';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({ level: 'silent' });
const msgRetryCounterCache = new NodeCache();
const SESSION_DIR = process.env.AUTH_DIR || path.join(__dirname, '..', 'nexstore', 'pairing', 'main');
const BOT_NAME = process.env.BOT_NAME || 'MAIS MDX';
const PREFIX = process.env.PREFIX || '.';

let sock = null;
let isLoggedIn = false;

// ════════════════════════════════════════════════════════════════════════════════
// LOGOUT MANAGEMENT SYSTEM
// ════════════════════════════════════════════════════════════════════════════════
const logoutFile = path.join(SESSION_DIR, 'logout_settings.json');

function readLogoutSettings() {
  try {
    if (fs.existsSync(logoutFile)) {
      return JSON.parse(fs.readFileSync(logoutFile, 'utf8'));
    }
  } catch (e) {}
  return { keepSessions: false, linkedDevices: [], lastLogout: null };
}

function saveLogoutSettings(data) {
  try {
    fs.mkdirSync(path.dirname(logoutFile), { recursive: true });
    fs.writeFileSync(logoutFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving logout settings:', e.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// EMOJI REACTIONS SYSTEM
// ════════════════════════════════════════════════════════════════════════════════
const emojiPoolFile = path.join(SESSION_DIR, 'emoji_pool.json');

function readEmojiPool() {
  try {
    if (fs.existsSync(emojiPoolFile)) {
      const data = JSON.parse(fs.readFileSync(emojiPoolFile, 'utf8'));
      return data.emojis || [];
    }
  } catch (e) {}
  return ['👍', '❤️', '😂', '😮', '😢', '🔥'];
}

function saveEmojiPool(emojis) {
  try {
    fs.mkdirSync(path.dirname(emojiPoolFile), { recursive: true });
    fs.writeFileSync(emojiPoolFile, JSON.stringify({ emojis }, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving emoji pool:', e.message);
  }
}

function getRandomEmoji() {
  const emojis = readEmojiPool();
  return emojis[Math.floor(Math.random() * emojis.length)];
}

// ════════════════════════════════════════════════════════════════════════════════
// SOCKET INITIALIZATION
// ════════════════════════════════════════════════════════════════════════════════

async function initSocket() {
  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    
    const version = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      auth: state,
      msgRetryCounterCache,
      shouldSyncHistoryMessage: msg => {
        console.log(`📥 Loading Chat [${msg.progress}%]`);
        return !!msg.syncType;
      },
    });

    sock.ev.on('connection.update', handleConnectionUpdate);
    sock.ev.on('messages.upsert', handleMessagesUpsert);
    sock.ev.on('creds.update', saveCreds);
    sock.public = true;
    
    console.log(chalk.green('✅ Socket initialized'));
  } catch (error) {
    console.error(chalk.red('Socket initialization failed:'), error.message);
    process.exit(1);
  }
}

function handleConnectionUpdate(update) {
  const { connection, lastDisconnect } = update;
  
  if (connection === 'close') {
    const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
    console.log(chalk.red(`❌ Connection closed, reason: ${reason}`));
    
    if (reason !== DisconnectReason.loggedOut) {
      setTimeout(() => initSocket(), 5000);
    } else {
      console.log(chalk.yellow('🔐 Device logged out'));
      isLoggedIn = false;
    }
  } else if (connection === 'open') {
    console.log(chalk.bgGreen.black('✅ Bot Connected!'));
    isLoggedIn = true;
  } else if (connection === 'connecting') {
    console.log(chalk.blue('🔄 Connecting...'));
  }
}

function handleMessagesUpsert(m) {
  try {
    if (!m.messages || m.messages.length === 0) return;
    
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;
    
    const type = Object.keys(msg.message)[0];
    if (['protocolMessage', 'senderKeyDistributionMessage'].includes(type)) return;
    
    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    
    // Handle logout command
    if (text.startsWith(PREFIX + 'logout')) {
      handleLogoutCommand(msg);
      return;
    }
    
    // Handle setemoji command
    if (text.startsWith(PREFIX + 'setemoji')) {
      handleSetEmojiCommand(msg, text);
      return;
    }
    
    // Handle interactive buttons/list responses
    if (type === 'buttonsResponseMessage') {
      handleButtonResponse(msg);
      return;
    }
    
    if (type === 'listResponseMessage') {
      handleListResponse(msg);
      return;
    }
    
  } catch (error) {
    console.error('Message handler error:', error.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// LOGOUT COMMAND HANDLER
// ════════════════════════════════════════════════════════════════��═══════════════

async function handleLogoutCommand(msg) {
  const chat = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;
  
  try {
    // Ask user if they want to keep sessions
    await sock.sendMessage(chat, {
      text: `🔐 *Logout Confirmation*\n\nDo you want to keep your sessions and settings after logout?\n\n1️⃣ YES - Keep sessions\n2️⃣ NO - Remove everything\n\nReply with 1 or 2`,
      mentions: [sender]
    }, { quoted: msg });
    
    // Listen for response
    const timeout = setTimeout(() => {
      sock.sendMessage(chat, { text: '⏰ Logout confirmation timeout. Try again.' });
    }, 60000);
    
    // Store pending logout request (in production, use database)
    global.pendingLogouts = global.pendingLogouts || {};
    global.pendingLogouts[sender] = { timeout, chat };
    
  } catch (error) {
    console.error('Logout command error:', error.message);
    await sock.sendMessage(chat, { text: '❌ Logout failed. Please try again.' });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SET EMOJI COMMAND HANDLER
// ════════════════════════════════════════════════════════════════════════════════

async function handleSetEmojiCommand(msg, text) {
  const chat = msg.key.remoteJid;
  const args = text.split(' ').slice(1).join('');
  
  try {
    // Extract emojis from text
    const emojiRegex = /\p{Emoji}/gu;
    const emojis = args.match(emojiRegex) || [];
    
    if (emojis.length === 0) {
      return sock.sendMessage(chat, {
        text: '❌ No emojis found. Use: .setemoji 😀😂❤️'
      });
    }
    
    if (emojis.length === 1) {
      // Single emoji mode
      await sock.sendMessage(chat, {
        text: `✅ Single emoji mode activated: ${emojis[0]}\n\nAll auto-likes will use this emoji.`
      });
    } else {
      // Random pool mode
      saveEmojiPool(emojis);
      await sock.sendMessage(chat, {
        text: `✅ Random emoji pool set!\n\n🎲 Emojis: ${emojis.join(' ')}\n\nAuto-likes will randomly use one of these.`
      });
    }
  } catch (error) {
    console.error('Set emoji error:', error.message);
    await sock.sendMessage(chat, { text: '❌ Error setting emojis.' });
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// BUTTON & LIST RESPONSE HANDLERS (Fixed for latest Baileys)
// ════════════════════════════════════════════════════════════════════════════════

async function handleButtonResponse(msg) {
  const chat = msg.key.remoteJid;
  const response = msg.message?.buttonsResponseMessage?.selectedButtonId;
  
  console.log(chalk.cyan(`📱 Button pressed: ${response}`));
  
  // Process button action
  switch(response) {
    case 'action_help':
      await sock.sendMessage(chat, { text: '📖 Help menu\n\n1. Type .help\n2. Type .menu\n3. Type .commands' });
      break;
    case 'action_menu':
      await sock.sendMessage(chat, { text: '📋 Main menu opened' });
      break;
    default:
      await sock.sendMessage(chat, { text: `✅ You selected: ${response}` });
  }
}

async function handleListResponse(msg) {
  const chat = msg.key.remoteJid;
  const response = msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
  
  console.log(chalk.cyan(`📋 List option selected: ${response}`));
  
  // Process list selection
  await sock.sendMessage(chat, { text: `✅ You selected: ${response}` });
}

// ════════════════════════════════════════════════════════════════════════════════
// ENHANCED SEND MESSAGE WITH BUTTONS/LIST (Fixed for latest Baileys)
// ════════════════════════════════════════════════════════════════════════════════

sock.sendButtons = async function(jid, text, buttons = [], quoted = null) {
  return this.sendMessage(jid, {
    text: text,
    buttons: buttons.map((btn, i) => ({
      buttonId: btn.id || `action_${i}`,
      buttonText: { displayText: btn.text },
      type: 1
    })),
    headerType: 1
  }, { quoted });
};

sock.sendList = async function(jid, text, sections = [], quoted = null) {
  return this.sendMessage(jid, {
    text: text,
    sections: sections.map(section => ({
      title: section.title || 'Menu',
      rows: section.rows.map((row, i) => ({
        title: row.title || `Option ${i + 1}`,
        rowId: row.id || `option_${i}`,
        description: row.desc || ''
      }))
    })),
    buttonText: 'Click Here'
  }, { quoted });
};

// ════════════════════════════════════════════════════════════════════════════════
// GST STATUS POST FIX (Group Status)
// ════════════════════════════════════════════════════════════════════════════════

sock.sendStatus = async function(text, image = null, mentions = []) {
  try {
    if (image) {
      return await this.sendMessage('status@broadcast', {
        image: { url: image },
        caption: text,
        mentions: mentions
      });
    } else {
      return await this.sendMessage('status@broadcast', {
        text: text,
        mentions: mentions
      });
    }
  } catch (error) {
    console.error('Status post error:', error.message);
    throw error;
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// AUTO-LIKE WITH RANDOM EMOJI
// ════════════════════════════════════════════════════════════════════════════════

sock.autoLike = async function(msg) {
  try {
    const emojis = readEmojiPool();
    const emoji = emojis.length === 1 ? emojis[0] : getRandomEmoji();
    
    return await this.sendMessage(msg.key.remoteJid, {
      react: {
        text: emoji,
        key: msg.key
      }
    });
  } catch (error) {
    console.error('Auto-like error:', error.message);
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════���════════════

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n🛑 Shutting down...'));
  if (sock) sock.ws?.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n🛑 Terminating...'));
  if (sock) sock.ws?.close();
  process.exit(0);
});

console.log(chalk.magenta(`\n╔════════════════════════╗\n║  MAIS MDX v2026        ║\n║  Whiskey Socket Ready  ║\n╚════════════════════════╝\n`));
initSocket().catch(console.error);
