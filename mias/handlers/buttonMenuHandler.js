/**
 * MIAS — Button Menu Handler  v2
 *
 * Complete navigable in-app menu for Button Mode:
 *   Home Screen → Category → Command → [Wizard] → Execute
 *
 * Now reads ALL categories and commands from menuConfig.js (single source).
 * Adding a new category only requires editing menuConfig.js.
 *
 * ONLY active when Button Mode is ON.
 * Text Mode and all existing command handlers are completely untouched.
 *
 * Architecture:  .menu → Home → Categories → Commands → Wizard → Execute
 */

import { sendButtons, sendList, sendHeroCard } from "./interactiveHandler.js";
import { sendText }                            from "./messageHandler.js";
import { buildVCard, fetchProfilePic }         from "./contactHandler.js";
import { formatUptime }                        from "./utilityHandler.js";
import { getCapabilities }                     from "./capabilityHandler.js";
import {
  startWizardSession,
  clearWizardSession,
  hasWizardSession,
  COMMAND_INPUTS,
}                                              from "./wizardHandler.js";
import {
  MENU_CATEGORIES,
  getCategoryById,
  getTotalCommandCount,
}                                              from "./menuConfig.js";

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

// ─── Home screen ──────────────────────────────────────────────────────────────

/**
 * Send the Button Mode home screen.
 * Shows bot info + quick-action buttons + category list.
 */
export async function sendButtonHomeScreen(sock, jid, msg, opts = {}) {
  const prefix   = _prefix();
  const botName  = _botName();
  const cmdCount = _cmdCount();
  const uptime   = formatUptime(process.uptime?.() || 0);
  const caps     = await getCapabilities(sock);

  // Try to get bot profile pic for header
  let picBuffer = null;
  try {
    const sock_ = globalThis.__MIAS_SOCK__ || sock;
    const botJid = sock_?.user?.id;
    if (botJid) picBuffer = await fetchProfilePic(sock_, botJid);
  } catch {}

  const header = `${botName}`;
  const body   = [
    `Commands : ${cmdCount}`,
    `Uptime   : ${uptime}`,
    LINE,
    `What would you like to do?`,
  ].join("\n");

  // Hero card with image header (if capable)
  if (caps.heroCards && picBuffer) {
    try {
      return await sendHeroCard(sock, jid, {
        image:   picBuffer,
        title:   header,
        body,
        footer:  `${prefix}help <cmd> for details`,
        buttons: [
          { text: "Browse Commands", id: "btn_openmenu" },
          { text: "Close",           id: "btn_close"    },
        ],
        quoted:  msg,
      });
    } catch {}
  }

  // Buttons fallback
  if (caps.buttons) {
    try {
      return await sendButtons(sock, jid, `*${header}*\n\n${body}`, [
        { text: "Browse Commands", id: "btn_openmenu" },
        { text: "Close",           id: "btn_close"    },
      ], {
        footer: `${prefix}help <cmd> for details`,
        quoted: msg,
      });
    } catch {}
  }

  // Plain text fallback
  return sendText(sock, jid,
    `*${header}*\n${LINE}\n${body}\n\nType *${prefix}menu* to browse commands.`,
    { quoted: msg }
  );
}

// ─── Category selector ────────────────────────────────────────────────────────

/**
 * Send an interactive list of all categories.
 * Reads from menuConfig — no hardcoded category lists here.
 */
export async function sendButtonCategorySelector(sock, jid, msg, opts = {}) {
  const prefix = _prefix();
  const caps   = await getCapabilities(sock);

  const rows = MENU_CATEGORIES.map(cat => ({
    id:          cat.id,
    title:       cat.label,
    description: `${cat.cmds.length} command${cat.cmds.length !== 1 ? "s" : ""}`,
  }));

  const body = `*${_botName()} — Categories*\n${LINE}\nChoose a category:`;

  if (caps.lists) {
    try {
      return await sendList(sock, jid, body, [
        { title: "All Categories", rows },
      ], {
        buttonText: "Browse",
        title:      "Categories",
        footer:     `${prefix}menu to go home`,
        quoted:     msg,
      });
    } catch {}
  }

  if (caps.buttons) {
    // Split into chunks of 3 (WA button limit)
    try {
      await sendText(sock, jid, body, { quoted: msg });
      for (let i = 0; i < MENU_CATEGORIES.length; i += 3) {
        const chunk = MENU_CATEGORIES.slice(i, i + 3);
        await sendButtons(sock, jid, "Select a category:", chunk.map(c => ({
          text: c.label,
          id:   c.id,
        })), { quoted: msg });
      }
      return;
    } catch {}
  }

  // Plain text
  const list = MENU_CATEGORIES.map((c, i) => `[${i + 1}] ${c.label}`).join("\n");
  return sendText(sock, jid, `${body}\n\n${list}`, { quoted: msg });
}

// ─── Command selector (for a given category) ─────────────────────────────────

/**
 * Send the command list for the selected category.
 * @param {string} catId - e.g. "cat_ai"
 */
export async function sendButtonCommandSelector(sock, jid, msg, catId, opts = {}) {
  const cat    = getCategoryById(catId);
  if (!cat) {
    return sendText(sock, jid, `Category not found. Type *${_prefix()}menu* to start over.`, { quoted: msg });
  }

  const prefix = _prefix();
  const cmds   = (cat.cmds || []).slice(0, 10);
  const caps   = await getCapabilities(sock);

  const body  = `*${cat.label}*\n${LINE}\nSelect a command:`;

  if (caps.lists) {
    try {
      const rows = cmds.map(c => ({
        id:          `cmd_${c.name}`,
        title:       `${prefix}${c.name}`,
        description: c.desc || "",
      }));
      return await sendList(sock, jid, body, [
        { title: cat.label, rows },
      ], {
        buttonText: "Choose",
        title:      cat.label,
        footer:     `${prefix}menu to go home`,
        quoted:     msg,
      });
    } catch {}
  }

  if (caps.buttons) {
    try {
      await sendText(sock, jid, body, { quoted: msg });
      for (let i = 0; i < cmds.length; i += 3) {
        const chunk = cmds.slice(i, i + 3);
        await sendButtons(sock, jid, "Pick a command:", chunk.map(c => ({
          text: `${prefix}${c.name}`,
          id:   `cmd_${c.name}`,
        })), {
          footer: `${prefix}menu to go home`,
          quoted: msg,
        });
      }
      return;
    } catch {}
  }

  const list = cmds.map(c => `  ${prefix}${c.name}  —  ${c.desc || ""}`).join("\n");
  return sendText(sock, jid, `${body}\n\n${list}`, { quoted: msg });
}

// ─── Command selection handler ────────────────────────────────────────────────

/**
 * Called when a user picks a command from the button menu.
 * Either starts a wizard session (if input required) or runs immediately.
 */
export async function handleCommandSelection(sock, jid, msg, cmdName, opts = {}) {
  const prefix     = _prefix();
  const spec       = COMMAND_INPUTS[cmdName];
  const isGrp      = (jid || "").endsWith("@g.us");
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

// ─── Button response router ───────────────────────────────────────────────────

/**
 * Route an incoming button / list response to the correct handler.
 * Called from mias/index.js when isButtonMode() is true and a button ID arrives.
 *
 * @param {object} sock
 * @param {object} msg
 * @param {string} body  - Extracted button/list ID or response text
 */
export async function handleButtonResponse(sock, msg, body) {
  const jid = msg?.key?.remoteJid;
  if (!jid) return;

  const prefix = _prefix();

  // ── Navigation ──────────────────────────────────────────────────────────────
  if (body === "btn_home" || body === "btn_menu") {
    return sendButtonHomeScreen(sock, jid, msg, {});
  }
  if (body === "btn_openmenu" || body === "btn_back") {
    return sendButtonCategorySelector(sock, jid, msg, {});
  }
  if (body === "btn_close" || body === "btn_cancel") {
    const isGrp   = (jid || "").endsWith("@g.us");
    const sJid    = isGrp ? (msg?.key?.participant || msg?.participant || jid) : jid;
    clearWizardSession(jid);
    clearWizardSession(sJid);
    return sendText(sock, jid,
      `Closed. Type *${prefix}menu* to return to the menu.`
    ).catch(() => {});
  }

  // ── Category selected ────────────────────────────────────────────────────────
  if (body.startsWith("cat_")) {
    return sendButtonCommandSelector(sock, jid, msg, body, {});
  }

  // ── Command selected ─────────────────────────────────────────────────────────
  if (body.startsWith("cmd_")) {
    const cmdName = body.slice(4);
    return handleCommandSelection(sock, jid, msg, cmdName, {});
  }
}
