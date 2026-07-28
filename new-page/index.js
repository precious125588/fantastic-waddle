/**
 * NEW PAGE BOT — Next-gen WhatsApp bot
 * 100 commands · Fast · Clean · ESM
 */
import 'dotenv/config';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import chalk from 'chalk';

import { handleUtility }  from './commands/utility.js';
import { handleDownload } from './commands/download.js';
import { handleSticker }  from './commands/sticker.js';
import { handleImage }    from './commands/image.js';
import { handleAI }       from './commands/ai.js';
import { handleGroup }    from './commands/group.js';
import { handleWhatsApp } from './commands/whatsapp.js';
import { handleFun }      from './commands/fun.js';
import { handleStalk }    from './commands/stalk.js';
import { handleEconomy }  from './commands/economy.js';
import { handleOwner }    from './commands/owner.js';
import { buildMenu }      from './menu.js';
import { getAutoFeat, getSetting, setSetting } from './lib/db.js';
import { sleep, senderNum, isOwnerOrSudo, isBotOwner, isGroup, msgText, mentionedJids as getMentioned, quoted as getQuoted, quotedSender as getQuotedSender } from './lib/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Ensure data dir ──────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Auth dir from env ────────────────────────────────────────────────────────
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, '..', 'nexstore', 'pairing', 'new-page-session');
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const PREFIX = getSetting('prefix', null) || process.env.PREFIX || '.';
const BOT_NAME = process.env.BOT_NAME || 'NEW PAGE';
const OWNER_NUMBER = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

const logger = pino({ level: 'silent' });

// ── Load Baileys ─────────────────────────────────────────────────────────────
let Baileys;
for (const pkg of ['@whiskeysockets/baileys']) {
  try {
    const mod = await import(pkg);
    Baileys = mod.default ? mod : mod;
    break;
  } catch {}
}
if (!Baileys) throw new Error('Failed to load Baileys');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  isJidGroup,
  proto,
} = Baileys;

// ── Suppress unhandled rejection noise ───────────────────────────────────────
process.on('unhandledRejection', (r) => {
  const m = String(r?.message || r || '');
  if (/bad mac|bad_mac|BadMAC|Connection Closed|408|429/i.test(m)) return;
  console.error(chalk.red('[NP] UnhandledRejection:'), m.slice(0, 200));
});
process.on('uncaughtException', (e) => {
  const m = String(e?.message || e || '');
  if (/bad mac|bad_mac|BadMAC/i.test(m)) return;
  console.error(chalk.red('[NP] UncaughtException:'), m.slice(0, 200));
});

// ── Always-online heartbeat ───────────────────────────────────────────────────
let _sock = null;
const ONLINE_INTERVAL = 30000;
let _onlineTimer = null;

function startOnlineHeartbeat() {
  if (_onlineTimer) clearInterval(_onlineTimer);
  _onlineTimer = setInterval(async () => {
    if (!_sock) return;
    if (getSetting('alwaysOnline', true) === false) return;
    try { await _sock.sendPresenceUpdate('available'); } catch {}
  }, ONLINE_INTERVAL);
}

// ── Auto-view + auto-like status ─────────────────────────────────────────────
async function handleStatusUpdate(sock, statusMsg) {
  try {
    const sender = statusMsg.key?.participant || statusMsg.key?.remoteJid;
    if (!sender) return;
    const num = senderNum(sender);

    // Auto-view
    if (getSetting('globalAutoStatus', true) !== false || getAutoFeat(num, 'autostatus') || getAutoFeat(OWNER_NUMBER, 'autostatus')) {
      try {
        await sock.readMessages([statusMsg.key]);
      } catch {}
    }

    // Auto-like
    if (getSetting('globalAutoLike', true) !== false || getAutoFeat(OWNER_NUMBER, 'autolikestatus')) {
      try {
        const reactions = ['❤️', '🔥', '👍', '😍', '🎉'];
        const emoji = reactions[Math.floor(Math.random() * reactions.length)];
        await sock.sendMessage(statusMsg.key.remoteJid, {
          react: { text: emoji, key: statusMsg.key },
        });
      } catch {}
    }
  } catch {}
}

// ── Antilink check ────────────────────────────────────────────────────────────
const LINK_REGEX = /https?:\/\/|wa\.me\/|chat\.whatsapp\.com\//i;
async function checkAntilink(sock, msg, jid) {
  if (!isGroup(jid)) return;
  const { getGroupSetting } = await import('./lib/db.js');
  if (!getGroupSetting(jid, 'antilink')) return;
  const text = msgText(msg);
  if (!LINK_REGEX.test(text)) return;
  try {
    await sock.sendMessage(jid, { delete: msg.key });
    await sock.groupParticipantsUpdate(jid, [msg.key.participant], 'remove');
  } catch {}
}

// ── Main connect function ────────────────────────────────────────────────────
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    browser: ['NEW PAGE', 'Chrome', '124.0'],
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 3000,
    defaultQueryTimeoutMs: 60000,
    patchMessageBeforeSending: (msg) => {
      const interactiveMsg = msg?.message?.interactiveMessage;
      if (interactiveMsg) {
        msg.message = proto?.Message?.fromObject({
          ...msg.message,
          viewOnceMessage: {
            message: {
              messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
              interactiveMessage,
            },
          },
        });
      }
      return msg;
    },
  });

  _sock = sock;

  // ── Connection events ────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(chalk.yellow('[NP] QR code received — scan with WhatsApp'));
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(chalk.yellow(`[NP] Disconnected (code=${code}). Reconnect: ${shouldReconnect}`));
      if (shouldReconnect) {
        await sleep(3000);
        connectToWhatsApp();
      } else {
        console.log(chalk.red('[NP] Logged out — clearing session'));
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
        process.exit(1);
      }
    }

    if (connection === 'open') {
      console.log(chalk.green(`[NP] ✅ ${BOT_NAME} connected as ${sock.user?.name}`));
      startOnlineHeartbeat();
      // Set always online immediately
      try { await sock.sendPresenceUpdate('available'); } catch {}
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ── Status updates ────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        // Handle status/broadcast
        if (msg.key?.remoteJid === 'status@broadcast') {
          await handleStatusUpdate(sock, msg);
          continue;
        }

        if (!msg.message || msg.key?.fromMe) continue;

        const jid    = msg.key.remoteJid;
        const sender = isGroup(jid) ? (msg.key.participant || msg.pushName) : jid;
        const body   = msgText(msg);
        const quotedMsg    = getQuoted(msg);
        const quotedSender = getQuotedSender(msg);
        const mentionedJids = getMentioned(msg);

        // Antilink
        await checkAntilink(sock, msg, jid);

        if (!body.startsWith(PREFIX)) continue;

        const args    = body.slice(PREFIX.length).trim().split(/\s+/);
        const command = args.shift().toLowerCase();
        const text    = args.join(' ');

        // Convenience reply helper
        const reply = async (content) => {
          if (typeof content === 'string') {
            return sock.sendMessage(jid, { text: content }, { quoted: msg });
          }
          return sock.sendMessage(jid, content, { quoted: msg });
        };

        const ctx = { command, args, jid, sender, text, reply, quotedMsg, quotedSender, mentionedJids, quotedType: null };

        // Owner check for owner commands
        const OWNER_CMDS = ['broadcast', 'setsudo', 'addsudo', 'delsudo', 'removesudo', 'listsudo', 'getsudo', 'restart', 'eval', 'exec', 'setprefix', 'cleartmp', 'botstat', 'stats', 'setname', 'botname'];
        if (OWNER_CMDS.includes(command) && !isOwnerOrSudo(sender)) {
          await reply(`⛔ *${BOT_NAME}*\nThis command requires owner/sudo access.`);
          continue;
        }

        // Route to handlers in priority order
        let handled = false;
        for (const handler of [
          handleOwner,
          handleGroup,
          handleWhatsApp,
          handleDownload,
          handleSticker,
          handleImage,
          handleAI,
          handleFun,
          handleStalk,
          handleEconomy,
          handleUtility,
        ]) {
          try {
            const result = await handler(sock, msg, ctx);
            if (result !== false) { handled = true; break; }
          } catch (e) {
            console.error(chalk.red(`[NP] Handler error (${command}): ${e.message}`));
            await reply(`❌ Error: ${e.message.slice(0, 200)}`).catch(() => {});
            handled = true;
            break;
          }
        }

        if (!handled) {
          await reply(`❓ Unknown command: *${command}*\nType *${PREFIX}menu* for all commands.`);
        }

      } catch (e) {
        console.error(chalk.red('[NP] Message processing error:'), e.message?.slice(0, 200));
      }
    }
  });

  // ── Group participants update ─────────────────────────────────────────────
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      const { getGroupSetting } = await import('./lib/db.js');
      if (action === 'add') {
        const welcome = getGroupSetting(id, 'welcome');
        if (welcome) {
          const meta = await sock.groupMetadata(id).catch(() => null);
          for (const p of participants) {
            await sock.sendMessage(id, {
              text: `👋 Welcome @${p.split('@')[0]} to *${meta?.subject || 'the group'}*! 🎉`,
              mentions: [p],
            });
          }
        }
      } else if (action === 'remove') {
        const goodbye = getGroupSetting(id, 'goodbye');
        if (goodbye) {
          for (const p of participants) {
            await sock.sendMessage(id, {
              text: `😢 @${p.split('@')[0]} has left the group. Goodbye!`,
              mentions: [p],
            });
          }
        }
      }
    } catch {}
  });

  return sock;
}

// ── Start ─────────────────────────────────────────────────────────────────────
console.log(chalk.cyan(`\n⚡ Starting ${BOT_NAME}...\n`));

// Set global auto-status defaults on first start
if (getSetting('globalAutoStatus', null) === null) setSetting('globalAutoStatus', true);
if (getSetting('globalAutoLike', null) === null) setSetting('globalAutoLike', true);
if (getSetting('alwaysOnline', null) === null) setSetting('alwaysOnline', true);

connectToWhatsApp().catch((e) => {
  console.error(chalk.red('[NP] Fatal:'), e.message);
  process.exit(1);
});
