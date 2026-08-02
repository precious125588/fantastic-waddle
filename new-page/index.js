/**
 * NEW PAGE BOT — Next-gen WhatsApp bot
 * 120+ commands · Baileys + GKTW Helper · All Engines · ESM
 * v2.0
 */
// ══ CRASH SHIELD — must be first so a bad handler can't kill the bot ════════
import { install as installCrashShield } from '../lib/crash-shield.mjs';
installCrashShield({ name: process.env.SHIELD_NAME || 'new-page' });
// ════════════════════════════════════════════════════════════════════════════
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
import { handleExtra }    from './commands/extra.js';
import { buildMenu }      from './menu.js';
import { getAutoFeat, getSetting, setSetting } from './lib/db.js';
import {
  sleep, senderNum, isOwnerOrSudo, isBotOwner, isGroup,
  msgText, mentionedJids as getMentioned,
  quoted as getQuoted, quotedSender as getQuotedSender,
} from './lib/utils.js';

// ── GKTW helper — loaded once ─────────────────────────────────────────────────
import { isGktwAvailable, gktwDiagnostics } from './lib/gktw.js';

// ── Engines — loaded once ─────────────────────────────────────────────────────
import { getAllEngines } from './lib/engines.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Ensure data dir ──────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Auth dir from env ────────────────────────────────────────────────────────
const AUTH_DIR = process.env.AUTH_DIR
  || path.join(__dirname, '..', 'nexstore', 'pairing', 'new-page-session');
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const PREFIX       = getSetting('prefix', null) || process.env.PREFIX || '.';
const BOT_NAME     = process.env.BOT_NAME || 'NEW PAGE';
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

// Reconnect / liveness state. Kept at module scope so repeated `close` events
// can never start more than one socket at a time.
let _connecting        = false;
let _reconnectTimer    = null;
let _reconnectAttempts = 0;
let _watchdogTimer     = null;
let _lastEventAt       = Date.now();
let _announcedOnline   = false;
const WATCHDOG_INTERVAL = 60000;   // check every minute
const SILENCE_LIMIT     = 300000;  // 5 min with no traffic AND no live socket

function startOnlineHeartbeat() {
  if (_onlineTimer) clearInterval(_onlineTimer);
  _onlineTimer = setInterval(async () => {
    if (!_sock) return;
    if (getSetting('alwaysOnline', true) === false) return;
    try {
      await _sock.sendPresenceUpdate('available');
      _lastEventAt = Date.now();
    } catch {}
  }, ONLINE_INTERVAL);
}

/** Single-flight reconnect with capped exponential backoff. */
function scheduleReconnect() {
  if (_reconnectTimer || _connecting) return;
  _reconnectAttempts += 1;
  const delay = Math.min(30000, 2000 * _reconnectAttempts);
  console.log(chalk.yellow(`[NP] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${_reconnectAttempts})`));
  _reconnectTimer = setTimeout(async () => {
    _reconnectTimer = null;
    _connecting = true;
    try {
      await connectToWhatsApp();
    } catch (e) {
      console.error(chalk.red(`[NP] Reconnect failed: ${e.message}`));
      _connecting = false;
      scheduleReconnect();
    }
  }, delay);
}

function stopConnectionWatchdog() {
  if (_watchdogTimer) clearInterval(_watchdogTimer);
  _watchdogTimer = null;
}

/**
 * Watchdog: the bot used to sit "online" for hours while its websocket was
 * actually dead, so nothing ever replied. If the socket is gone and we have
 * seen no traffic for SILENCE_LIMIT, force a fresh connection.
 */
function startConnectionWatchdog() {
  stopConnectionWatchdog();
  _lastEventAt = Date.now();
  _watchdogTimer = setInterval(() => {
    const silentFor = Date.now() - _lastEventAt;
    const socketDead = !_sock || _sock.ws?.readyState === 3 || _sock.ws?.readyState === 2;
    if (socketDead || silentFor > SILENCE_LIMIT) {
      console.log(chalk.yellow(`[NP] Watchdog: socket ${socketDead ? 'dead' : 'silent'} (${Math.round(silentFor / 1000)}s) — reconnecting`));
      try { _sock?.end?.(new Error('watchdog restart')); } catch {}
      _sock = null;
      stopConnectionWatchdog();
      scheduleReconnect();
    }
  }, WATCHDOG_INTERVAL);
}


// ── Auto-view + auto-like status ─────────────────────────────────────────────
async function handleStatusUpdate(sock, statusMsg) {
  try {
    const sender = statusMsg.key?.participant || statusMsg.key?.remoteJid;
    if (!sender) return;
    const num = senderNum(sender);

    // Auto-view
    if (
      getSetting('globalAutoStatus', true) !== false ||
      getAutoFeat(num, 'autostatus') ||
      getAutoFeat(OWNER_NUMBER, 'autostatus')
    ) {
      try { await sock.readMessages([statusMsg.key]); } catch {}
    }

    // Auto-like
    if (
      getSetting('globalAutoLike', true) !== false ||
      getAutoFeat(OWNER_NUMBER, 'autolikestatus')
    ) {
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
  _connecting = true;
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const { version }          = await fetchLatestBaileysVersion();

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
    _lastEventAt = Date.now();


    if (qr) {
      console.log(chalk.yellow('[NP] QR code received — scan with WhatsApp'));
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(chalk.yellow(`[NP] Disconnected (code=${code}). Reconnect: ${shouldReconnect}`));
      stopConnectionWatchdog();
      if (shouldReconnect) {
        // Guarded reconnect: a stream error used to fire `close` several times
        // in a row, each one starting ANOTHER socket. The extra sockets kicked
        // each other off (conflict/440) and the bot looked "online but mute".
        scheduleReconnect();
      } else {
        // __MAIS_GUARDED_SESSION_WIPE__ — do not wipe a session the pairing handoff is still settling.
        let __MAIS_GUARDED_SESSION_WIPE___ok = true;
        try {
          const _ownerPath = path.join(AUTH_DIR, '.owner.json');
          if (fs.existsSync(_ownerPath)) {
            const _own = JSON.parse(fs.readFileSync(_ownerPath, 'utf8')) || {};
            const _handedOffAt = _own.handedOffAt || _own.at || 0;
            if (Date.now() - _handedOffAt < 90 * 1000) __MAIS_GUARDED_SESSION_WIPE___ok = false;
          }
        } catch {}
        if (__MAIS_GUARDED_SESSION_WIPE___ok) {
          console.log(chalk.red('[NP] Logged out — clearing session'));
          try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
          process.exit(1);
        } else {
          console.log(chalk.yellow('[NP] 🛡️ Ignoring logout kick: this session was just handed over to me. Reconnecting instead of wiping.'));
          scheduleReconnect();
          return;
        }
      }
    }

    if (connection === 'open') {
      _reconnectAttempts = 0;
      _connecting = false;
      console.log(chalk.green(`[NP] ✅ ${BOT_NAME} connected as ${sock.user?.name}`));
      startOnlineHeartbeat();
      startConnectionWatchdog();
      try { await sock.sendPresenceUpdate('available'); } catch {}

      // Log GKTW + engine status
      const gktwOk = await isGktwAvailable();
      const engines = getAllEngines();
      const enginesLoaded = Object.entries(engines).filter(([,v])=>v).map(([k])=>k).join(', ');
      console.log(chalk.cyan(`[NP] GKTW helper: ${gktwOk ? '✅ loaded' : '⚠️  fallback mode (Baileys only)'}`));
      console.log(chalk.cyan(`[NP] Engines: ${enginesLoaded || 'none (fallback mode)'}`));

      // Tell the owner the bot is alive — this is the "connection message"
      // that should land a few seconds after the bot is chosen.
      if (!_announcedOnline) {
        _announcedOnline = true;
        const selfJid = sock.user?.id?.split(':')[0];
        if (selfJid) {
          setTimeout(() => {
            sock.sendMessage(`${selfJid}@s.whatsapp.net`, {
              text:
                `✅ *${BOT_NAME} IS ONLINE*\n\n` +
                `🔑 Prefix: *${PREFIX}*\n` +
                `📖 Send *${PREFIX}menu* to see every command.\n\n` +
                `_This chat works too — commands you send to yourself are handled._`,
            }).catch(() => {});
          }, 1500);
        }
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // ── Message handler ───────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    _lastEventAt = Date.now();

    for (const msg of messages) {
      try {
        // Handle status/broadcast
        if (msg.key?.remoteJid === 'status@broadcast') {
          await handleStatusUpdate(sock, msg);
          continue;
        }

        if (!msg.message) continue;

        // IMPORTANT: do NOT drop `fromMe`. Most people test the bot by
        // messaging their own number, and the old `|| msg.key.fromMe` check
        // silently swallowed every one of those commands — the bot showed as
        // online and never answered. Self/owner messages are still filtered by
        // the prefix check below, so the bot never replies to its own output.
        if (msg.key?.fromMe && !msgText(msg).startsWith(PREFIX)) continue;


        const jid           = msg.key.remoteJid;
        const sender        = isGroup(jid) ? (msg.key.participant || msg.pushName) : jid;
        const body          = msgText(msg);
        const quotedMsg     = getQuoted(msg);
        const quotedSender  = getQuotedSender(msg);
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

        const ctx = {
          command, args, jid, sender, text, reply,
          quotedMsg, quotedSender, mentionedJids, quotedType: null,
        };

        // Owner-only guard
        const OWNER_CMDS = [
          'broadcast','setsudo','addsudo','delsudo','removesudo','listsudo','getsudo',
          'restart','eval','exec','setprefix','cleartmp','botstat','stats','setname','botname',
        ];
        if (OWNER_CMDS.includes(command) && !isOwnerOrSudo(sender)) {
          await reply(`⛔ *${BOT_NAME}*\nThis command requires owner/sudo access.`);
          continue;
        }

        // Route to handlers in priority order
        // handleExtra is last so existing handlers take precedence on any overlap
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
          handleExtra,
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
console.log(chalk.cyan(`\n⚡ Starting ${BOT_NAME} v2.0...\n`));

// Set global auto-status defaults on first start
if (getSetting('globalAutoStatus', null) === null) setSetting('globalAutoStatus', true);
if (getSetting('globalAutoLike',   null) === null) setSetting('globalAutoLike', true);
if (getSetting('alwaysOnline',     null) === null) setSetting('alwaysOnline', true);

connectToWhatsApp().catch((e) => {
  console.error(chalk.red('[NP] Fatal:'), e.message);
  process.exit(1);
});
