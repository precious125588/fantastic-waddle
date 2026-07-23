/**
 * MIAS — Menu Handler  v3
 *
 * Main bot menu system — sends bot vCard (with profile picture) +
 * interactive category navigation. Now reads all categories from
 * menuConfig.js (single source of truth — no hardcoded lists here).
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import { sendImage, sendDocument }    from "./mediaHandler.js";
import { sendText }                   from "./messageHandler.js";
import { sendButtons, sendList }      from "./interactiveHandler.js";
import { sendBotVCard }               from "./contactHandler.js";
import { getBaileysVersion }          from "./baileysHandler.js";
import { isGktwAvailable }            from "./gktwAdapter.js";
import { formatUptime }               from "./utilityHandler.js";
import {
  MENU_CATEGORIES,
  getCategoryById,
  getTotalCommandCount,
}                                     from "./menuConfig.js";
import { getCapabilities }            from "./capabilityHandler.js";

// ─── Dynamic resolver (set by index.js via globalThis) ───────────────────────

function _getSock()   { return globalThis.__MIAS_SOCK__ || null; }

// ─── Bot info resolvers ────────────────────────────────────────────────────────

function _getOwner() {
  try {
    if (globalThis.__MIAS_CONFIG__?.OWNER) return globalThis.__MIAS_CONFIG__.OWNER;
    if (globalThis.__GET_SETTING__) { const s = globalThis.__GET_SETTING__("owner"); if (s) return s; }
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
  try { if (globalThis.__MIAS_CONFIG__?.VERSION) return globalThis.__MIAS_CONFIG__.VERSION; } catch {}
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
  try { if (globalThis.__GET_SETTING__) return globalThis.__GET_SETTING__("publicMode") ? "Public" : "Private"; } catch {}
  return "Unknown";
}
function _getCmdCount() {
  try {
    if (typeof globalThis.__MIAS_CMD_COUNT__ === "number") return globalThis.__MIAS_CMD_COUNT__;
    if (typeof globalThis.__MIAS_COMMANDS__ === "object") return globalThis.__MIAS_COMMANDS__.size;
  } catch {}
  return getTotalCommandCount();
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

// ─── WhatsApp native buttons limit = 3 per message ───────────────────────────

function _chunk(arr, size = 3) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send the full bot menu (info card + interactive category navigation).
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} [msg]            - WAMessage for quoted reply
 * @param {object} [opts]
 * @param {string} [opts.userName]  - Display name shown in the menu header
 * @param {number} [opts.ping]      - Latency in ms
 * @returns {Promise<void>}
 */
export async function sendMenu(sock, jid, msg, opts = {}) {
  const prefix     = _getPrefix();
  const botName    = _getBotName();
  const owner      = _getOwner();
  const version    = _getVersion();
  const mode       = _getMode();
  const cmdCount   = _getCmdCount();
  const uptime     = formatUptime(process.uptime?.() || 0);
  const gktwActive = await isGktwAvailable().catch(() => false);

  let baileysVer = "unknown";
  try { const bv = await getBaileysVersion(); baileysVer = bv?.version?.join(".") || "unknown"; } catch {}

  const now  = new Date();
  const date = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const menuText = _buildMenuText({
    botName, owner, prefix, version, uptime, ping: opts.ping ?? null,
    date, time, mode, cmdCount, userName: opts.userName,
    baileysVer, gktwActive,
  });

  // ── Send bot vCard with profile pic ─────────────────────────────────────────
  try { await sendBotVCard(sock, jid, { quoted: msg, withPic: true }); } catch {}

  // ── Try interactive list (all categories from menuConfig) ────────────────────
  const caps = await getCapabilities(sock);
  if (caps.lists) {
    try {
      const rows = MENU_CATEGORIES.map(cat => ({
        id:          cat.id,
        title:       cat.label,
        description: `${cat.cmds.length} command${cat.cmds.length !== 1 ? "s" : ""}`,
      }));

      return await sendList(sock, jid, menuText, [
        { title: "Categories", rows },
      ], {
        buttonText: "Open Categories",
        title:      botName,
        footer:     `${prefix}help <command> for details`,
        quoted:     msg,
      });
    } catch {}
  }

  // ── Try quick-reply buttons (max 3 per message, split into pages) ────────────
  if (caps.buttons) {
    try {
      await sendText(sock, jid, menuText, { quoted: msg });
      const chunks = _chunk(MENU_CATEGORIES, 3);
      for (const chunk of chunks) {
        await sendButtons(sock, jid, "Choose a category:", chunk.map(c => ({
          text: c.label,
          id:   c.id,
        })), { quoted: msg });
      }
      return;
    } catch {}
  }

  // ── Fallback: plain-text category list ─────────────────────────────────────
  const catList = MENU_CATEGORIES.map((c, i) =>
    `[${i + 1}] ${c.label} (${c.cmds.length} cmds)`
  ).join("\n");
  return sendText(sock, jid, `${menuText}\n\n${catList}`, { quoted: msg });
}

/**
 * Send the command list for a specific category.
 * Reads category from menuConfig — no hardcoded lists here.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   categoryId   - e.g. "cat_ai"
 * @param {object[]} [commands]   - Override list (optional, falls back to menuConfig)
 * @param {object}   [opts]
 * @param {object}   [opts.quoted]
 */
export async function sendCategoryMenu(sock, jid, categoryId, commands, opts = {}) {
  const cat    = getCategoryById(categoryId);
  const title  = cat ? cat.label : categoryId;
  const prefix = _getPrefix();

  // Use provided commands OR fall back to menuConfig
  const cmds = (commands?.length ? commands : (cat?.cmds || [])).slice(0, 10);

  const caps = await getCapabilities(sock);

  if (caps.lists) {
    try {
      const rows = cmds.map(c => ({
        id:          `cmd_${c.name}`,
        title:       `${prefix}${c.name}`,
        description: c.desc || "",
      }));
      return await sendList(sock, jid, `Commands in *${title}*:`, [
        { title, rows },
      ], {
        buttonText: "Browse",
        title,
        footer:     `${prefix}help <command> for details`,
        quoted:     opts.quoted,
      });
    } catch {}
  }

  const list = cmds.map(c => `  ${prefix}${c.name}  —  ${c.desc || "No description"}`).join("\n");
  return sendText(sock, jid,
    `*${title}*\n${"─".repeat(24)}\n${list}\n\nUse \`${prefix}help <command>\` for details.`,
    { quoted: opts.quoted }
  );
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
