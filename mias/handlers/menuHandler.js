/**
 * MIAS — Menu Handler
 *
 * Redesigned menu system using the new handler architecture.
 * Displays bot info + interactive category navigation.
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import { sendImage, sendDocument } from "./mediaHandler.js";
import { sendText } from "./messageHandler.js";
import { sendButtons } from "./buttonHandler.js";
import { getBaileysVersion, isGktwAvailable } from "./baileysHandler.js";
import { formatUptime } from "./utilityHandler.js";

// ─── Dynamic resolver (set by index.js via globalThis) ───────────────────────

function _getSock() {
  return globalThis.__MIAS_SOCK__ || null;
}

// ─── Bot info resolvers ────────────────────────────────────────────────────────

function _getOwner() {
  try {
    if (globalThis.__MIAS_CONFIG__?.OWNER) return globalThis.__MIAS_CONFIG__.OWNER;
    if (globalThis.__GET_SETTING__) {
      const s = globalThis.__GET_SETTING__("owner");
      if (s) return s;
    }
  } catch {}
  return "MIAS Owner";
}

function _getPrefix() {
  try {
    if (globalThis.__MIAS_CONFIG__?.PREFIX) return globalThis.__MIAS_CONFIG__.PREFIX;
    if (globalThis.__GET_SETTING__) return globalThis.__GET_SETTING__("prefix") || ".";
  } catch {}
  return ".";
}

function _getVersion() {
  try {
    if (globalThis.__MIAS_CONFIG__?.VERSION) return globalThis.__MIAS_CONFIG__.VERSION;
  } catch {}
  return "5.3.1";
}

function _getBotName() {
  try {
    if (globalThis.__MIAS_CONFIG__?.BOT_NAME) return globalThis.__MIAS_CONFIG__.BOT_NAME;
    const sock = _getSock();
    if (sock?.user?.name) return sock.user.name;
  } catch {}
  return "MIAS BOT";
}

function _getMode() {
  try {
    if (globalThis.__GET_SETTING__) return globalThis.__GET_SETTING__("publicMode") ? "Public" : "Private";
  } catch {}
  return "Unknown";
}

function _getCmdCount() {
  try {
    if (typeof globalThis.__MIAS_CMD_COUNT__ === "number") return globalThis.__MIAS_CMD_COUNT__;
    if (typeof globalThis.__MIAS_CMDS__ === "object") return Object.keys(globalThis.__MIAS_CMDS__).length;
  } catch {}
  return "2000+";
}

// ─── Menu text builder ────────────────────────────────────────────────────────

function _buildMenuText(opts = {}) {
  const {
    botName, owner, prefix, version, uptime, ping,
    date, time, mode, cmdCount, userName, userJid,
    baileysVer, gktwActive,
  } = opts;

  const border = "━".repeat(30);
  const dot = "◈";

  return `
╔${border}╗
║        🤖 *${botName}* — MIAS BOT        ║
╚${border}╝

${dot} *User:* ${userName || "Guest"}
${dot} *Owner:* ${owner}
${dot} *Prefix:* \`${prefix}\`
${dot} *Version:* ${version}
${dot} *Mode:* ${mode}

${border}

${dot} *Commands:* ${cmdCount}
${dot} *Uptime:* ${uptime || "0s"}
${dot} *Ping:* ${ping != null ? ping + "ms" : "~"}
${dot} *Date:* ${date}
${dot} *Time:* ${time}

${border}

${dot} *Baileys:* ${baileysVer || "unknown"}
${dot} *GKTW:* ${gktwActive ? "✅ Active" : "⬜ Inactive (Baileys fallback)"}

${border}

_Select a category below to explore commands._
`.trim();
}

// ─── Category buttons ─────────────────────────────────────────────────────────

const MENU_CATEGORIES = [
  { text: "🤖 AI & Chat", id: "menu_ai" },
  { text: "🎬 Media & Downloads", id: "menu_media" },
  { text: "👥 Groups", id: "menu_groups" },
  { text: "📱 WhatsApp", id: "menu_whatsapp" },
  { text: "👤 Account", id: "menu_account" },
  { text: "🛠 System & Info", id: "menu_system" },
  { text: "🎮 Games & Fun", id: "menu_games" },
  { text: "⚙️ Owner Tools", id: "menu_owner" },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send the main MIAS menu.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object}   msg          - Incoming WAMessage (for user info + quoted)
 * @param {object}   [opts]
 * @param {Buffer}   [opts.botPic]     - Bot profile picture buffer
 * @param {string}   [opts.userName]   - Sender display name
 * @param {number}   [opts.ping]       - Current ping in ms
 * @param {boolean}  [opts.interactive] - Show category buttons
 * @returns {Promise<void>}
 */
export async function sendMenu(sock, jid, msg, opts = {}) {
  const startTime = Date.now();
  const now = new Date();

  const baileysVer = await getBaileysVersion();
  const gktwActive = await isGktwAvailable();

  const menuText = _buildMenuText({
    botName: _getBotName(),
    owner: _getOwner(),
    prefix: _getPrefix(),
    version: _getVersion(),
    uptime: formatUptime(process.uptime() * 1000),
    ping: Date.now() - startTime,
    date: now.toLocaleDateString("en-NG", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    time: now.toLocaleTimeString("en-NG", { hour12: true }),
    mode: _getMode(),
    cmdCount: _getCmdCount(),
    userName: opts.userName || msg?.pushName || "Guest",
    userJid: msg?.key?.remoteJid,
    baileysVer,
    gktwActive,
  });

  const sendOpts = {};
  if (msg) sendOpts.quoted = msg;

  // Send with bot pic if available
  if (opts.botPic) {
    try {
      if (opts.interactive !== false && MENU_CATEGORIES.length) {
        // Send pic + text first, then buttons
        await sendImage(sock, jid, opts.botPic, {
          caption: menuText,
          quoted: msg,
        });
        // Send category buttons
        await sendButtons(sock, jid, "📋 *Choose a category:*", MENU_CATEGORIES.slice(0, 3), {
          footer: "MIAS — Powered by Baileys",
        });
        return;
      }

      return await sendImage(sock, jid, opts.botPic, { caption: menuText, quoted: msg });
    } catch {
      // Fall through to text
    }
  }

  // Text-only menu
  if (opts.interactive !== false && MENU_CATEGORIES.length) {
    await sendText(sock, jid, menuText, sendOpts);
    await sendButtons(sock, jid, "📋 *Choose a category:*", MENU_CATEGORIES.slice(0, 3), {
      footer: "MIAS — Powered by Baileys",
    });
    return;
  }

  return sendText(sock, jid, menuText, sendOpts);
}

/**
 * Send a category sub-menu listing commands.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   categoryId   - e.g. "menu_ai"
 * @param {object[]} commands     - [{name, desc}]
 * @param {object}   [opts]
 * @param {object}   [opts.quoted]
 */
export async function sendCategoryMenu(sock, jid, categoryId, commands, opts = {}) {
  const cat = MENU_CATEGORIES.find(c => c.id === categoryId);
  const title = cat ? cat.text : categoryId;
  const prefix = _getPrefix();

  const list = commands.map(c => `• \`${prefix}${c.name}\` — ${c.desc || "No description"}`).join("\n");
  const text = `*${title}*\n${"─".repeat(25)}\n${list}\n\n_Use \`${prefix}help <command>\` for details._`;

  return sendText(sock, jid, text, { quoted: opts.quoted });
}

/**
 * Send a quick command-count summary.
 * @param {object} sock
 * @param {string} jid
 * @param {object} [opts]
 * @param {object} [opts.quoted]
 */
export async function sendCommandCount(sock, jid, opts = {}) {
  const count = _getCmdCount();
  const text = `📊 *MIAS Command Statistics*\n\n• Total commands: *${count}*\n• Prefix: \`${_getPrefix()}\`\n• Version: ${_getVersion()}`;
  return sendText(sock, jid, text, { quoted: opts.quoted });
}
