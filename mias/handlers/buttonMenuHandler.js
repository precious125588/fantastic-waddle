/**
 * MIAS — Button Menu Handler  v4 (FIXED)
 *
 * Complete navigable in-app menu for Button Mode:
 *   Home Screen (Owner vCard + 1 list button) → Category List (radio flow) → Command List (radio flow) → [Wizard] → Execute
 *
 * ALL selection screens use WhatsApp LIST messages (radio flow — tap to select).
 * Owner vCard (with name + profile picture) is sent at the top of every home screen.
 * A single "Open Menu" button on the home screen expands to show all categories.
 *
 * ONLY active when Button Mode is ON.
 * Text Mode and all existing command handlers are completely untouched.
 *
 * Architecture:  .menu → Owner vCard → Home → Categories (list) → Commands (list) → Wizard → Execute
 *
 * v4 FIXES:
 *  - _sendListMessage now uses the correct flat { text, sections, buttonText, ... } format
 *    that works with @itsliaaa/baileys (same format as the working [LIST_MENU] in index.js)
 *  - sendButtonCategorySelector now reads ALL real categories from globalThis.__MIAS_MENU_CATEGORIES__
 *    (the 34-category system from index.js) with per-category command counts
 *  - sendButtonCommandSelector reads real commands from globalThis.__MIAS_COMMANDS__ keyed by category
 *  - Robust multi-format fallback: tries flat list → old list → numbered text
 */

import { sendText }                              from "./messageHandler.js";
import { buildVCard, fetchProfilePic }           from "./contactHandler.js";
import { formatUptime }                          from "./utilityHandler.js";
import {
  startWizardSession,
  clearWizardSession,
  hasWizardSession,
  COMMAND_INPUTS,
}                                                from "./wizardHandler.js";
import {
  MENU_CATEGORIES as _STATIC_MENU_CATEGORIES,
  getCategoryById,
  getTotalCommandCount,
}                                                from "./menuConfig.js";

// ─── Visual constants ─────────────────────────────────────────────────────────

const LINE = "─".repeat(32);

// ─── Config helpers ───────────────────────────────────────────────────────────

function _prefix() {
  try {
    if (globalThis.__MIAS_CONFIG__?.PREFIX) return globalThis.__MIAS_CONFIG__.PREFIX;
    if (globalThis.__GET_SETTING__) return globalThis.__GET_SETTING__("prefix") || ".";
  } catch {}
  return ".";
}

function _botName() {
  try {
    if (globalThis.__MIAS_CONFIG__?.BOT_NAME) return globalThis.__MIAS_CONFIG__.BOT_NAME;
    const sock = globalThis.__MIAS_SOCK__;
    if (sock?.user?.name) return sock.user.name;
  } catch {}
  return "MIAS BOT";
}

function _cmdCount() {
  try {
    if (typeof globalThis.__MIAS_CMD_COUNT__ === "number") return globalThis.__MIAS_CMD_COUNT__;
    if (globalThis.__MIAS_COMMANDS__) return globalThis.__MIAS_COMMANDS__.size;
  } catch {}
  return getTotalCommandCount();
}

function _ownerNumber() {
  try {
    const n = (
      globalThis.__MIAS_CONFIG__?.OWNER_NUMBER ||
      globalThis.__MIAS_CONFIG__?.OWNER ||
      (globalThis.__GET_SETTING__ && globalThis.__GET_SETTING__("ownerNumber")) ||
      ""
    ).replace(/\D/g, "");
    return n;
  } catch {}
  return "";
}

function _ownerName() {
  try {
    return (
      globalThis.__MIAS_CONFIG__?.OWNER_NAME ||
      global?.OWNER_NAME ||
      (globalThis.__GET_SETTING__ && globalThis.__GET_SETTING__("ownerName")) ||
      "Owner"
    );
  } catch {}
  return "Owner";
}

// ─── Real category/command resolver ───────────────────────────────────────────

const _CAT_EMOJI = {
  ADULT: "🔞", AI: "🤖", ANIME: "🎌", AUDIO: "🎵", CONFIG: "⚙️",
  CONVERT: "🔄", CONVERTER: "🔄", CREATOR: "🎨", DEBUG: "🐛",
  DOWNLOAD: "⬇️", ECONOMY: "💰", FUN: "🎉", GAMES: "🎮",
  GROUP: "👥", HENTAI: "🔞", INFO: "ℹ️", LOGO: "🖼️",
  MEDIA: "🎬", MISC: "📦", NSFW: "🔞", OWNER: "👑",
  PANEL: "🗂️", RANDOM: "🎲", REACTIONS: "😄", RELIGION: "🕌",
  SEARCH: "🔍", SESSION: "🔐", SETTINGS: "⚙️", STALK: "🔍",
  SYSTEM: "⚙️", TEXT: "📝", TEXTMAKER: "✍️", TOOLS: "🛠️",
  TTS: "🔊", UTILITY: "🛠️", WHATSAPP: "💬", OTHER: "📁",
};

/**
 * Build categories from the REAL index.js MENU_CATEGORIES (globalThis.__MIAS_MENU_CATEGORIES__)
 * Falls back to static menuConfig.js categories.
 * Returns: [{ id, label, emoji, cmdNames: string[], totalCount }]
 */
function _getRealCategories() {
  try {
    // Prefer the full index.js MENU_CATEGORIES exposed via globalThis
    const real = globalThis.__MIAS_MENU_CATEGORIES__;
    if (Array.isArray(real) && real.length > 0) {
      return real
        .filter(cat => cat && (cat.name || cat.id) && Array.isArray(cat.cmds) && cat.cmds.length > 0)
        .map(cat => {
          const name  = (cat.name || cat.id || "OTHER").toUpperCase();
          const emoji = cat.emoji || _CAT_EMOJI[name] || "📁";
          const cmds  = [...new Set(cat.cmds)]; // deduplicate
          return {
            id:         `cat_${name.toLowerCase()}`,
            label:      `${emoji} ${name}`,
            emoji,
            name,
            cmdNames:   cmds,
            totalCount: cmds.length,
          };
        })
        .filter(c => c.totalCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch {}

  // Fallback: build categories from globalThis.__MIAS_COMMANDS__ dynamically
  try {
    const cmds = globalThis.__MIAS_COMMANDS__;
    if (cmds && typeof cmds.entries === "function") {
      const catMap = new Map();
      for (const [name, entry] of cmds.entries()) {
        if (!entry?.handler) continue;
        const cat = (entry.category || "OTHER").toUpperCase();
        if (!catMap.has(cat)) catMap.set(cat, []);
        catMap.get(cat).push(name);
      }
      if (catMap.size > 0) {
        return Array.from(catMap.entries())
          .map(([cat, cmdNames]) => {
            const emoji = _CAT_EMOJI[cat] || "📁";
            return { id: `cat_${cat.toLowerCase()}`, label: `${emoji} ${cat}`, emoji, name: cat, cmdNames, totalCount: cmdNames.length };
          })
          .filter(c => c.totalCount > 0)
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  } catch {}

  // Last resort: static menuConfig.js
  return _STATIC_MENU_CATEGORIES.map(cat => {
    const name  = (cat.id || cat.label || "OTHER").toUpperCase().replace(/^CAT_/, "");
    const emoji = _CAT_EMOJI[name] || "📁";
    const cmds  = (cat.cmds || []).map(c => (typeof c === "string" ? c : c.name));
    return { id: cat.id, label: cat.label || `${emoji} ${name}`, emoji, name, cmdNames: cmds, totalCount: cmds.length };
  });
}

/**
 * Get commands for a given category id (e.g. "cat_ai").
 * Returns { name, desc }[] from __MIAS_COMMANDS__ or static menuConfig.
 */
function _getCategoryCommands(catId) {
  // Look up from real categories first
  const cats = _getRealCategories();
  const cat  = cats.find(c => c.id === catId);
  if (!cat) return [];

  // Try to get desc for each cmd from __MIAS_COMMANDS__
  const cmdsMap = globalThis.__MIAS_COMMANDS__;
  return cat.cmdNames.map(n => {
    const entry = cmdsMap?.get(n);
    return { name: n, desc: entry?.desc || "" };
  });
}

// ─── Owner vCard sender ───────────────────────────────────────────────────────

/**
 * Send the owner's vCard (with name + profile picture) as a contact card.
 * This appears at the top of every home screen in Button Mode.
 */
async function _sendOwnerVCard(sock, jid, msg) {
  try {
    const ownerNum  = _ownerNumber();
    const ownerName = _ownerName();
    if (!ownerNum) return; // skip if owner not configured

    const ownerJid = `${ownerNum}@s.whatsapp.net`;

    // Fetch owner's WhatsApp profile picture
    let picBuffer = null;
    try {
      picBuffer = await fetchProfilePic(sock, ownerJid);
    } catch {}

    const vcard = buildVCard({
      displayName: ownerName,
      phone:       ownerNum,
      org:         _botName(),
      note:        "Bot Owner",
      picBuffer,
    });

    const sendOpts = {};
    if (msg) sendOpts.quoted = msg;

    await sock.sendMessage(jid, {
      contacts: {
        displayName: ownerName,
        contacts: [{ vcard }],
      },
    }, sendOpts);

    // Small delay so the vCard renders before the menu message
    await new Promise(r => setTimeout(r, 450));
  } catch (err) {
    console.error("[buttonMenu] _sendOwnerVCard error:", err?.message);
  }
}

// ─── Direct WhatsApp list message builder ─────────────────────────────────────

/**
 * Send a WhatsApp list message (radio flow).
 *
 * FIXED v4: Uses the flat { text, sections, buttonText, title, footer } format
 * that works with @itsliaaa/baileys — matches the [LIST_MENU] format in index.js.
 *
 * Falls back to old { list: {...} } format, then numbered plain text.
 *
 * @returns {Promise<object|null>} Sent message or null on ALL failures
 */
async function _sendListMessage(sock, jid, { title, body, buttonText, footer, sections, quoted }) {
  const sendOpts = {};
  if (quoted) sendOpts.quoted = quoted;

  // ── Format 1: flat { text, sections, buttonText, title, footer } ─────────
  // This is the format that works in @itsliaaa/baileys (see [LIST_MENU] in index.js)
  try {
    const payload = {
      text:       body       || "",
      title:      title      || "",
      buttonText: buttonText || "Select",
      footer:     footer     || "",
      sections:   (sections  || []).map(s => ({
        title: s.title || "",
        rows:  (s.rows || []).slice(0, 10).map(r => ({
          rowId:       String(r.id),
          title:       String(r.title).slice(0, 24),
          description: String(r.description || "").slice(0, 72),
        })),
      })).filter(s => s.rows.length > 0),
    };
    const result = await sock.sendMessage(jid, payload, sendOpts);
    if (result) return result;
  } catch {}

  // ── Format 2: { list: { description, ... } } (older Baileys format) ───────
  try {
    const payload2 = {
      list: {
        title:       title      || "",
        description: body       || "",
        buttonText:  buttonText || "Select",
        listType:    1,
        footer:      footer     || "",
        sections:    (sections  || []).map(s => ({
          title: s.title || "",
          rows:  (s.rows || []).slice(0, 10).map(r => ({
            rowId:       String(r.id),
            title:       String(r.title).slice(0, 24),
            description: String(r.description || "").slice(0, 72),
          })),
        })).filter(s => s.rows.length > 0),
      },
    };
    const result2 = await sock.sendMessage(jid, payload2, sendOpts);
    if (result2) return result2;
  } catch {}

  // ── Format 3: numbered text fallback ─────────────────────────────────────
  try {
    const allRows = (sections || []).flatMap(s => s.rows || []);
    const numbered = allRows.map((r, i) =>
      `[${i + 1}] *${r.title}*${r.description ? `  —  _${r.description}_` : ""}`
    ).join("\n");
    const text = [
      title  ? `*${title}*`  : null,
      body   ? body          : null,
      numbered || null,
      footer ? `_${footer}_` : null,
    ].filter(Boolean).join("\n\n");
    return await sock.sendMessage(jid, { text }, sendOpts);
  } catch (err) {
    console.error("[buttonMenu] _sendListMessage all formats failed:", err?.message);
    return null;
  }
}

// ─── Home screen ──────────────────────────────────────────────────────────────

/**
 * Send the Button Mode home screen.
 *
 * Steps:
 *  1. Owner vCard (name + profile picture)  ← shown at TOP as the header
 *  2. ONE list message with a single "Open Menu" button
 *     → tapping it returns "btn_openmenu" and shows the category list
 */
export async function sendButtonHomeScreen(sock, jid, msg, opts = {}) {
  const prefix   = _prefix();
  const botName  = _botName();
  const cmdCount = _cmdCount();
  const uptime   = formatUptime(process.uptime?.() || 0);

  // Step 1 — owner vCard with profile pic (appears at the TOP of the menu)
  await _sendOwnerVCard(sock, jid, msg);

  // Step 2 — home menu as a list (radio flow) with Browse + Close actions
  const body = [
    `*${botName}*`,
    LINE,
    `Commands : ${cmdCount}`,
    `Uptime   : ${uptime}`,
    LINE,
    `Tap *Open Menu* below to browse all categories and commands.`,
  ].join("\n");

  const sections = [
    {
      title: "Main Menu",
      rows: [
        {
          id:          "btn_openmenu",
          title:       "📋 Open Menu",
          description: `Browse all ${cmdCount} commands`,
        },
        {
          id:          "btn_close",
          title:       "❌ Close",
          description: "Dismiss the menu",
        },
      ],
    },
  ];

  const result = await _sendListMessage(sock, jid, {
    title:      botName,
    body,
    buttonText: "Open Menu",
    footer:     `${prefix}menu to return here`,
    sections,
    quoted:     msg,
  });

  if (result) return result;

  // Plain-text fallback (should not reach here — _sendListMessage has its own fallback)
  return sendText(sock, jid,
    `*${botName}*\n${LINE}\nCommands: ${cmdCount}  |  Uptime: ${uptime}\n\n` +
    `Type *${prefix}menu* to browse commands.\n_Button mode active — try ${prefix}menu_`,
    { quoted: msg }
  );
}

// ─── Category selector (radio flow) ──────────────────────────────────────────

/**
 * Send ALL menu categories as a WhatsApp list (radio flow).
 * Reads from globalThis.__MIAS_MENU_CATEGORIES__ (the real 34-category system).
 * Falls back to globalThis.__MIAS_COMMANDS__ grouped by category.
 * Last resort: static menuConfig.js categories.
 */
export async function sendButtonCategorySelector(sock, jid, msg, opts = {}) {
  const prefix  = _prefix();
  const botName = _botName();

  const cats = _getRealCategories();

  const body = [
    `*${botName} — Categories*`,
    LINE,
    `${cats.length} categories  •  ${_cmdCount()} total commands`,
    LINE,
    `Select a category to browse its commands:`,
  ].join("\n");

  // Build rows for all categories (WhatsApp allows max 10 rows per section)
  const allRows = cats.map(cat => ({
    id:          cat.id,
    title:       cat.label.slice(0, 24),
    description: `${cat.totalCount} command${cat.totalCount !== 1 ? "s" : ""}`,
  }));

  // Split into sections of 10 (WhatsApp limit per section)
  const sections = [];
  const CHUNK = 10;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    sections.push({
      title: i === 0 ? "📂 Categories" : `📂 More Categories (${Math.floor(i / CHUNK) + 1})`,
      rows:  allRows.slice(i, i + CHUNK),
    });
  }

  // Add navigation row
  const lastSec = sections[sections.length - 1];
  if (lastSec && lastSec.rows.length < 10) {
    lastSec.rows.push({ id: "btn_close", title: "❌ Close", description: "Dismiss the menu" });
  } else {
    sections.push({ title: "Navigation", rows: [
      { id: "btn_close", title: "❌ Close", description: "Dismiss the menu" },
    ]});
  }

  const result = await _sendListMessage(sock, jid, {
    title:      "📋 Menu Categories",
    body,
    buttonText: "Select Category",
    footer:     `${prefix}menu to go home  •  ${cats.length} categories`,
    sections,
    quoted:     msg,
  });

  if (result) return result;

  // Fallback text already sent by _sendListMessage
}

// ─── Command selector (radio flow) ───────────────────────────────────────────

/**
 * Send all commands in a category as a WhatsApp list (radio flow).
 * Shows ALL commands — uses multiple sections (max 10 rows each).
 * Reads real commands from __MIAS_COMMANDS__ / __MIAS_MENU_CATEGORIES__.
 *
 * @param {string} catId - e.g. "cat_ai"
 */
export async function sendButtonCommandSelector(sock, jid, msg, catId, opts = {}) {
  const prefix = _prefix();
  const cats   = _getRealCategories();
  const cat    = cats.find(c => c.id === catId);

  if (!cat) {
    // Unknown category — go back to category selector
    return sendButtonCategorySelector(sock, jid, msg, opts);
  }

  const cmds = _getCategoryCommands(catId);

  if (!cmds.length) {
    return sendText(sock, jid,
      `*${cat.label}*\n${LINE}\nNo commands found in this category.\n\nType *${prefix}menu* to start over.`,
      { quoted: msg }
    );
  }

  const body = [
    `*${cat.label}*`,
    LINE,
    `${cmds.length} command${cmds.length !== 1 ? "s" : ""} available.`,
    `Select a command — tap to use it:`,
  ].join("\n");

  // Build rows for ALL commands — use multiple sections (10 per section)
  const allRows = cmds.map(c => ({
    id:          `cmd_${c.name}`,
    title:       `${prefix}${c.name}`.slice(0, 24),
    description: (c.desc || "No description").slice(0, 72),
  }));

  const sections = [];
  const CHUNK = 10;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const sectionNum = Math.floor(i / CHUNK);
    sections.push({
      title: sectionNum === 0 ? cat.label : `${cat.label} (${sectionNum + 1})`,
      rows:  allRows.slice(i, i + CHUNK),
    });
  }

  // Navigation section (Back + Close)
  sections.push({
    title: "Navigation",
    rows: [
      { id: "btn_back",  title: "⬅️ Back to Categories", description: "Browse other categories" },
      { id: "btn_close", title: "❌ Close",               description: "Dismiss the menu" },
    ],
  });

  const result = await _sendListMessage(sock, jid, {
    title:      cat.label,
    body,
    buttonText: "Select Command",
    footer:     `${prefix}help <command> for details  •  ${prefix}menu to go home`,
    sections,
    quoted:     msg,
  });

  if (result) return result;
  // Fallback text already sent by _sendListMessage
}

// ─── Command selection handler ────────────────────────────────────────────────

/**
 * Called when a user picks a command from the list menu.
 * Either starts a wizard session (if input required) or dispatches immediately.
 */
export async function handleCommandSelection(sock, jid, msg, cmdName, opts = {}) {
  const prefix       = _prefix();
  const spec         = COMMAND_INPUTS[cmdName];
  const isGrp        = (jid || "").endsWith("@g.us");
  const effectiveJid = isGrp
    ? (msg?.key?.participant || msg?.participant || jid)
    : jid;

  if (spec) {
    // Wizard required — prompt for input
    startWizardSession(effectiveJid, cmdName, { timeoutMs: 90_000 });
    if (effectiveJid !== jid) startWizardSession(jid, cmdName, { timeoutMs: 90_000 });

    const promptText = [
      `*${_botName()} — ${cmdName.toUpperCase()}*`,
      LINE,
      spec.prompt,
      "",
      `_Reply with your input. Type *cancel* to exit._`,
      `_Session expires in 90 seconds._`,
    ].join("\n");

    return sendText(sock, jid, promptText, { quoted: msg });
  }

  // No input needed — dispatch immediately via command registry
  try {
    if (typeof globalThis.__MIAS_DISPATCH_CMD__ === "function") {
      return await globalThis.__MIAS_DISPATCH_CMD__(sock, msg, cmdName, []);
    }
    const cmds = globalThis.__MIAS_COMMANDS__;
    if (cmds) {
      const entry = cmds.get(cmdName);
      if (entry?.handler) return await entry.handler(sock, msg, []);
    }
    // If no registry entry, just send a notice
    await sendText(sock, jid,
      `▶️ Running *${prefix}${cmdName}*...`,
      { quoted: msg }
    );
  } catch (e) {
    try {
      await sendText(sock, jid,
        `❌ Error running *${prefix}${cmdName}*: ${e?.message || e}`,
        { quoted: msg }
      );
    } catch {}
  }
}

// ─── Button / list response router ───────────────────────────────────────────

/**
 * Route an incoming button ID or list selectedRowId to the correct handler.
 * Called from mias/index.js when isButtonMode() is true and a button/list ID arrives.
 *
 * @param {object} sock
 * @param {object} msg
 * @param {string} body  - Extracted button/list ID or response text
 */
export async function handleButtonResponse(sock, msg, body) {
  const jid = msg?.key?.remoteJid;
  if (!jid) return;

  const prefix  = _prefix();
  const trimmed = (body || "").trim();

  // ── Navigation ──────────────────────────────────────────────────────────────
  if (trimmed === "btn_home" || trimmed === "btn_menu") {
    return sendButtonHomeScreen(sock, jid, msg, {});
  }
  if (trimmed === "btn_openmenu" || trimmed === "btn_back") {
    return sendButtonCategorySelector(sock, jid, msg, {});
  }
  if (trimmed === "btn_close" || trimmed === "btn_cancel") {
    const sJid = jid.endsWith("@g.us")
      ? (msg?.key?.participant || msg?.participant || jid)
      : jid;
    clearWizardSession(jid);
    clearWizardSession(sJid);
    return sendText(sock, jid,
      `✅ Menu closed. Type *${prefix}menu* to open it again.`
    ).catch(() => {});
  }

  // ── Category selected ────────────────────────────────────────────────────────
  if (trimmed.startsWith("cat_")) {
    return sendButtonCommandSelector(sock, jid, msg, trimmed, {});
  }

  // ── Command selected ─────────────────────────────────────────────────────────
  if (trimmed.startsWith("cmd_")) {
    const cmdName = trimmed.slice(4);
    return handleCommandSelection(sock, jid, msg, cmdName, {});
  }

  // ── Unknown payload — show home screen ───────────────────────────────────────
  return sendButtonHomeScreen(sock, jid, msg, {});
}
