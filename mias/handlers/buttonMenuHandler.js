/**
 * MIAS — Button Menu Handler  v3
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
  MENU_CATEGORIES,
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
 * Send a WhatsApp list message (radio flow — shows a selectable list when tapped).
 * Uses sock.sendMessage directly with `list` content type — most reliable method.
 *
 * WhatsApp limitations:
 *   - Max 10 rows per section
 *   - Max ~5 sections per list
 *   - buttonText = label on the "Select" tap target
 *
 * @returns {Promise<object|null>} Sent message or null on failure
 */
async function _sendListMessage(sock, jid, { title, body, buttonText, footer, sections, quoted }) {
  try {
    const content = {
      list: {
        title:       title       || "",
        description: body        || "",
        buttonText:  buttonText  || "Select",
        listType:    1,            // SINGLE_SELECT
        sections:    (sections || []).map(s => ({
          title: s.title || "",
          rows:  (s.rows || []).slice(0, 10).map(r => ({
            rowId:       String(r.id),
            title:       String(r.title).slice(0, 24),      // WA title limit
            description: String(r.description || "").slice(0, 72), // WA desc limit
          })),
        })).filter(s => s.rows.length > 0),
        footer: footer || "",
      },
    };
    const sendOpts = {};
    if (quoted) sendOpts.quoted = quoted;
    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[buttonMenu] _sendListMessage error:", err?.message);
    return null;
  }
}

// ─── Home screen ──────────────────────────────────────────────────────────────

/**
 * Send the Button Mode home screen.
 *
 * Steps:
 *  1. Owner vCard (name + profile picture)
 *  2. ONE list message with a single "Open Menu" button
 *     → tapping it returns "btn_openmenu" and shows the category list
 */
export async function sendButtonHomeScreen(sock, jid, msg, opts = {}) {
  const prefix   = _prefix();
  const botName  = _botName();
  const cmdCount = _cmdCount();
  const uptime   = formatUptime(process.uptime?.() || 0);

  // Step 1 — owner vCard with profile pic
  await _sendOwnerVCard(sock, jid, msg);

  // Step 2 — home menu as a list (radio flow) with one Browse action
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

  // Plain-text fallback
  return sendText(sock, jid,
    `*${botName}*\n${LINE}\nCommands: ${cmdCount}  |  Uptime: ${uptime}\n\nType *${prefix}menu* to browse commands.`,
    { quoted: msg }
  );
}

// ─── Category selector (radio flow) ──────────────────────────────────────────

/**
 * Send all menu categories as a WhatsApp list (radio flow).
 * The user taps "Select Category" → sees all categories → taps one.
 *
 * Uses up to 2 sections if there are more than 10 categories.
 */
export async function sendButtonCategorySelector(sock, jid, msg, opts = {}) {
  const prefix  = _prefix();
  const botName = _botName();

  const body = [
    `*${botName} — Categories*`,
    LINE,
    `Select a category to browse its commands:`,
  ].join("\n");

  // Build rows for all categories
  const allRows = MENU_CATEGORIES.map(cat => ({
    id:          cat.id,
    title:       cat.label,
    description: `${cat.cmds.length} command${cat.cmds.length !== 1 ? "s" : ""}`,
  }));

  // WhatsApp allows max 10 rows per section; split into sections of 10
  const sections = [];
  const CHUNK = 10;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    sections.push({
      title: i === 0 ? "Categories" : "More Categories",
      rows:  allRows.slice(i, i + CHUNK),
    });
  }

  const result = await _sendListMessage(sock, jid, {
    title:      "Menu Categories",
    body,
    buttonText: "Select Category",
    footer:     `${prefix}menu to go home`,
    sections,
    quoted:     msg,
  });

  if (result) return result;

  // Plain-text fallback
  const catList = MENU_CATEGORIES.map((c, i) =>
    `[${i + 1}] *${c.label}* — ${c.cmds.length} cmds`
  ).join("\n");
  return sendText(sock, jid, `${body}\n\n${catList}\n\n_Type the category name or number._`, { quoted: msg });
}

// ─── Command selector (radio flow) ───────────────────────────────────────────

/**
 * Send all commands in a category as a WhatsApp list (radio flow).
 * Shows ALL commands — no artificial limit.
 * Uses multiple sections (max 10 rows each) when a category has >10 commands.
 *
 * @param {string} catId - e.g. "cat_ai"
 */
export async function sendButtonCommandSelector(sock, jid, msg, catId, opts = {}) {
  const cat = getCategoryById(catId);
  if (!cat) {
    return sendText(sock, jid,
      `Category not found. Type *${_prefix()}menu* to start over.`,
      { quoted: msg }
    );
  }

  const prefix = _prefix();
  const cmds   = cat.cmds || [];

  const body = [
    `*${cat.label}*`,
    LINE,
    `${cmds.length} command${cmds.length !== 1 ? "s" : ""} available.`,
    `Select a command to use it:`,
  ].join("\n");

  // Build rows for ALL commands — no slice limit
  const allRows = cmds.map(c => ({
    id:          `cmd_${c.name}`,
    title:       `${prefix}${c.name}`,
    description: c.desc || "",
  }));

  // Split into sections of max 10 rows each (WhatsApp limit per section)
  const sections = [];
  const CHUNK = 10;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    sections.push({
      title: i === 0 ? cat.label : `${cat.label} (more)`,
      rows:  allRows.slice(i, i + CHUNK),
    });
  }

  // Append "Back" row to the last section
  if (sections.length > 0) {
    const last = sections[sections.length - 1];
    if (last.rows.length < 10) {
      last.rows.push({ id: "btn_back", title: "⬅ Back to Categories", description: "" });
    } else {
      sections.push({
        title: "Navigation",
        rows:  [{ id: "btn_back", title: "⬅ Back to Categories", description: "" }],
      });
    }
  }

  const result = await _sendListMessage(sock, jid, {
    title:      cat.label,
    body,
    buttonText: "Select Command",
    footer:     `${prefix}menu to go home`,
    sections,
    quoted:     msg,
  });

  if (result) return result;

  // Plain-text fallback
  const list = cmds.map((c, i) =>
    `[${i + 1}] *${prefix}${c.name}* — ${c.desc || ""}`
  ).join("\n");
  return sendText(sock, jid, `${body}\n\n${list}`, { quoted: msg });
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

  // No input needed — dispatch immediately
  try {
    if (typeof globalThis.__MIAS_DISPATCH_CMD__ === "function") {
      return await globalThis.__MIAS_DISPATCH_CMD__(sock, msg, cmdName, []);
    }
    const cmds = globalThis.__MIAS_COMMANDS__;
    if (cmds) {
      const entry = cmds.get(cmdName);
      if (entry?.handler) return await entry.handler(sock, msg, []);
    }
    await sendText(sock, jid,
      `Running *${prefix}${cmdName}*...`,
      { quoted: msg }
    );
  } catch (e) {
    try {
      await sendText(sock, jid,
        `Error running *${cmdName}*: ${e?.message || e}`,
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

  const prefix = _prefix();
  const trimmed = (body || "").trim();

  // ── Navigation ──────────────────────────────────────────────────────────────
  if (trimmed === "btn_home" || trimmed === "btn_menu") {
    return sendButtonHomeScreen(sock, jid, msg, {});
  }
  if (trimmed === "btn_openmenu" || trimmed === "btn_back") {
    return sendButtonCategorySelector(sock, jid, msg, {});
  }
  if (trimmed === "btn_close" || trimmed === "btn_cancel") {
    const isGrp = (jid || "").endsWith("@g.us");
    const sJid  = isGrp ? (msg?.key?.participant || msg?.participant || jid) : jid;
    clearWizardSession(jid);
    clearWizardSession(sJid);
    return sendText(sock, jid,
      `Menu closed. Type *${prefix}menu* to open the menu again.`
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

  // ── Unknown — show home screen ───────────────────────────────────────────────
  // (could be a stale button ID or unsupported payload)
}
