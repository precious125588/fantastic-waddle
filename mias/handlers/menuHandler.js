/**
 * MIAS — Menu Handler  v2
 *
 * Main bot menu system — sends bot vCard (with profile picture) +
 * interactive category navigation buttons.
 *
 * No emojis anywhere. Clean, solid, professional.
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import { sendImage, sendDocument } from "./mediaHandler.js";
import { sendText } from "./messageHandler.js";
import { sendButtons, sendList } from "./interactiveHandler.js";
import { sendBotVCard } from "./contactHandler.js";
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
    date, time, mode, cmdCount, userName,
    baileysVer, gktwActive,
  } = opts;

  const bar = "─".repeat(32);

  return [
    `*${botName}*`,
    bar,
    `User     : ${userName || "Guest"}`,
    `Owner    : ${owner}`,
    `Prefix   : ${prefix}`,
    `Version  : ${version}`,
    `Mode     : ${mode}`,
    bar,
    `Commands : ${cmdCount}`,
    `Uptime   : ${uptime || "0s"}`,
    `Ping     : ${ping != null ? ping + "ms" : "—"}`,
    `Date     : ${date}`,
    `Time     : ${time}`,
    bar,
    `Baileys  : ${baileysVer || "unknown"}`,
    `GKTW     : ${gktwActive ? "Active" : "Inactive (Baileys fallback)"}`,
    bar,
    `Select a category below.`,
  ].join("\n");
}

// ─── Category list (no emojis) ────────────────────────────────────────────────

const MENU_CATEGORIES = [
  { text: "AI — Chat",           id: "menu_ai" },
  { text: "Media — Downloads",   id: "menu_media" },
  { text: "Groups",              id: "menu_groups" },
  { text: "WhatsApp Tools",      id: "menu_whatsapp" },
  { text: "Account",             id: "menu_account" },
  { text: "System — Info",       id: "menu_system" },
  { text: "Games — Fun",         id: "menu_games" },
  { text: "Owner Tools",         id: "menu_owner" },
];

// WhatsApp native-flow only allows max 3 quick-reply buttons per message.
// We split categories across multiple button messages.
function _chunkCategories(arr, size = 3) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send the main MIAS menu.
 *
 * Flow:
 *  1. Send bot vCard (with profile picture)
 *  2. Send menu image (if available) with menu text as caption
 *  3. Send interactive category buttons (in groups of 3)
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object}   msg            - Incoming WAMessage
 * @param {object}   [opts]
 * @param {string}   [opts.userName]
 * @param {boolean}  [opts.interactive]  - Force off interactive (default: on)
 * @param {object}   [opts.quoted]
 */
export async function sendMenu(sock, jid, msg, opts = {}) {
  const t0 = Date.now();

  const botName    = _getBotName();
  const owner      = _getOwner();
  const prefix     = _getPrefix();
  const version    = _getVersion();
  const mode       = _getMode();
  const cmdCount   = _getCmdCount();
  const uptime     = formatUptime(process.uptime ? process.uptime() : 0);
  const baileysVer = await getBaileysVersion();
  const gktwActive = await isGktwAvailable();

  const now  = new Date();
  const date = now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const userName = opts.userName || msg?.pushName || "Guest";
  const ping     = Date.now() - t0;

  const menuText = _buildMenuText({
    botName, owner, prefix, version, uptime, ping,
    date, time, mode, cmdCount, userName,
    baileysVer, gktwActive,
  });

  const quoted = opts.quoted || msg || null;

  // ── Step 1: Send bot vCard with profile picture ───────────────────────────
  try {
    await sendBotVCard(sock, jid, {
      displayName: botName,
      org: `MIAS BOT — v${version}`,
      note: `Prefix: ${prefix} | Commands: ${cmdCount}`,
      withPic: true,
      quoted,
    });
    // Brief pause so WhatsApp renders the card before buttons
    await new Promise(r => setTimeout(r, 400));
  } catch {
    // Non-fatal — continue to menu
  }

  // ── Step 2: Send menu image if available ──────────────────────────────────
  try {
    const { createRequire } = await import("module");
    const require = createRequire(import.meta.url);
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const __dirname = path.default.dirname(fileURLToPath(import.meta.url));
    const coverPath = path.default.join(__dirname, "..", "assets", "menu-cover.jpg");
    const { readFile } = await import("fs/promises");
    const coverBuf = await readFile(coverPath);

    await sendImage(sock, jid, coverBuf, {
      caption: menuText,
      quoted,
    });
  } catch {
    // No cover image — send text only
    await sendText(sock, jid, menuText, { quoted });
  }

  // ── Step 3: Interactive category buttons ──────────────────────────────────
  if (opts.interactive === false) return;

  const categoryChunks = _chunkCategories(MENU_CATEGORIES, 3);

  for (let i = 0; i < categoryChunks.length; i++) {
    const chunk = categoryChunks[i];
    const isFirst = i === 0;
    const isLast  = i === categoryChunks.length - 1;

    try {
      await sendButtons(sock, jid,
        isFirst ? "Select a category:" : "More categories:",
        chunk,
        {
          footer: isLast ? `${botName} — Powered by Baileys` : "",
        }
      );
      // Small delay between button groups
      if (!isLast) await new Promise(r => setTimeout(r, 300));
    } catch {
      // Fallback: list all categories as text
      if (isFirst) {
        const catText = MENU_CATEGORIES.map((c, i) => `[${i + 1}] ${c.text} — ${prefix}${c.id.replace("menu_", "")}`).join("\n");
        await sendText(sock, jid, `*Categories*\n${"─".repeat(20)}\n${catText}\n\nUse \`${prefix}help <command>\` for details.`);
      }
      break;
    }
  }
}

/**
 * Send a category sub-menu as a single-select list.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   categoryId   - e.g. "menu_ai"
 * @param {object[]} commands     - [{name, desc}]
 * @param {object}   [opts]
 * @param {object}   [opts.quoted]
 */
export async function sendCategoryMenu(sock, jid, categoryId, commands, opts = {}) {
  const cat    = MENU_CATEGORIES.find(c => c.id === categoryId);
  const title  = cat ? cat.text : categoryId;
  const prefix = _getPrefix();

  // Try as a list message first, fall back to plain text
  try {
    const rows = (commands || []).slice(0, 10).map(c => ({
      id: `cmd_${c.name}`,
      title: `${prefix}${c.name}`,
      description: c.desc || "",
    }));

    return await sendList(sock, jid, `Commands in ${title}:`, [
      { title, rows },
    ], {
      buttonText: "Browse",
      title: `${title}`,
      footer: `Use ${prefix}help <command> for details`,
      quoted: opts.quoted,
    });
  } catch {
    const list = (commands || []).map(c => `  ${prefix}${c.name}  —  ${c.desc || "No description"}`).join("\n");
    return sendText(sock, jid, `*${title}*\n${"─".repeat(24)}\n${list}\n\nUse \`${prefix}help <command>\` for details.`, { quoted: opts.quoted });
  }
}

/**
 * Send a quick command-count summary.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} [opts]
 * @param {object} [opts.quoted]
 */
export async function sendCommandCount(sock, jid, opts = {}) {
  const count  = _getCmdCount();
  const prefix = _getPrefix();
  const ver    = _getVersion();
  const text = [
    `*MIAS — Command Statistics*`,
    `${"─".repeat(28)}`,
    `Total commands : ${count}`,
    `Prefix         : ${prefix}`,
    `Version        : ${ver}`,
  ].join("\n");
  return sendText(sock, jid, text, { quoted: opts.quoted });
}
