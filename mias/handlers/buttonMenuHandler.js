/**
 * MIAS — Button Menu Handler  v1
 *
 * Complete redesign of Button Mode's .menu experience.
 * Provides a fully navigable in-app menu:
 *   Home Screen → Category → Command → [Wizard] → Execute
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
import {
  startWizardSession,
  clearWizardSession,
  hasWizardSession,
  COMMAND_INPUTS,
}                                              from "./wizardHandler.js";

// ─── Visual constants ─────────────────────────────────────────────────────────

const LINE = "─".repeat(32);

// ─── Category registry ────────────────────────────────────────────────────────
// cat_*  → id used in list rows.  Row IDs travel back as the body.

const CATEGORIES = [
  {
    id: "cat_dl", label: "Downloads",
    cmds: [
      { name: "play",       desc: "Play / download a song" },
      { name: "song",       desc: "Download song as audio" },
      { name: "video",      desc: "Download a YouTube video" },
      { name: "ytmp3",      desc: "YouTube → MP3 audio" },
      { name: "ytmp4",      desc: "YouTube → MP4 video" },
      { name: "spotify",    desc: "Download Spotify track" },
      { name: "facebook",   desc: "Facebook video downloader" },
      { name: "instagram",  desc: "Instagram downloader" },
      { name: "tiktok",     desc: "TikTok video downloader" },
      { name: "pinterest",  desc: "Pinterest image search" },
      { name: "mediafire",  desc: "MediaFire downloader" },
      { name: "soundcloud", desc: "SoundCloud downloader" },
      { name: "twitter",    desc: "Twitter / X downloader" },
      { name: "apk",        desc: "Search and download APK" },
    ],
  },
  {
    id: "cat_ai", label: "AI",
    cmds: [
      { name: "ai",      desc: "AI assistant chat" },
      { name: "gpt",     desc: "ChatGPT conversation" },
      { name: "gemi",    desc: "Google Gemini AI" },
      { name: "claude",  desc: "Anthropic Claude AI" },
      { name: "bing",    desc: "Bing AI chat" },
      { name: "gpt4",    desc: "GPT-4 conversation" },
      { name: "imagine", desc: "AI image generation" },
      { name: "dalle",   desc: "DALL-E image creation" },
    ],
  },
  {
    id: "cat_search", label: "Search",
    cmds: [
      { name: "google",   desc: "Google web search" },
      { name: "youtube",  desc: "YouTube search" },
      { name: "wiki",     desc: "Wikipedia lookup" },
      { name: "weather",  desc: "Weather for a city" },
      { name: "news",     desc: "Latest news headlines" },
    ],
  },
  {
    id: "cat_media", label: "Media",
    cmds: [
      { name: "sticker",  desc: "Image / video → sticker" },
      { name: "toimg",    desc: "Sticker → image" },
      { name: "toanim",   desc: "Sticker → animated GIF" },
      { name: "togif",    desc: "Video → GIF" },
      { name: "ttp",      desc: "Text → sticker" },
      { name: "attp",     desc: "Text → animated sticker" },
      { name: "remini",   desc: "Enhance photo with Remini AI" },
      { name: "enhance",  desc: "AI image enhancer" },
      { name: "ocr",      desc: "Extract text from image" },
    ],
  },
  {
    id: "cat_tools", label: "Tools",
    cmds: [
      { name: "translate", desc: "Translate to any language" },
      { name: "shorten",   desc: "URL shortener" },
      { name: "qr",        desc: "Generate a QR code" },
      { name: "base64",    desc: "Encode text to Base64" },
      { name: "decode",    desc: "Decode Base64 text" },
      { name: "carbon",    desc: "Code image generator" },
    ],
  },
  {
    id: "cat_group", label: "Group",
    cmds: [
      { name: "kick",    desc: "Remove a member" },
      { name: "promote", desc: "Promote to admin" },
      { name: "demote",  desc: "Remove admin role" },
      { name: "mute",    desc: "Mute a member" },
      { name: "unmute",  desc: "Unmute a member" },
      { name: "open",    desc: "Open group for all" },
      { name: "close",   desc: "Restrict to admins" },
      { name: "link",    desc: "Get invite link" },
      { name: "revoke",  desc: "Revoke invite link" },
      { name: "tagall",  desc: "Tag all members" },
      { name: "warn",    desc: "Warn a member" },
    ],
  },
  {
    id: "cat_owner", label: "Owner",
    cmds: [
      { name: "ban",       desc: "Ban a user" },
      { name: "unban",     desc: "Unban a user" },
      { name: "broadcast", desc: "Broadcast to all chats" },
      { name: "setprefix", desc: "Change command prefix" },
      { name: "restart",   desc: "Restart the bot" },
      { name: "shutdown",  desc: "Shutdown the bot" },
    ],
  },
  {
    id: "cat_fun", label: "Fun",
    cmds: [
      { name: "joke",   desc: "Random joke" },
      { name: "fact",   desc: "Random fact" },
      { name: "quote",  desc: "Inspirational quote" },
      { name: "riddle", desc: "A riddle to solve" },
      { name: "dare",   desc: "Dare challenge" },
      { name: "truth",  desc: "Truth question" },
      { name: "8ball",  desc: "Magic 8-ball" },
      { name: "roast",  desc: "Generate a roast" },
      { name: "ship",   desc: "Ship two names" },
      { name: "meme",   desc: "Random meme" },
    ],
  },
  {
    id: "cat_games", label: "Games",
    cmds: [
      { name: "tictactoe", desc: "Play Tic-Tac-Toe" },
      { name: "wordle",    desc: "Play Wordle" },
      { name: "quiz",      desc: "Knowledge quiz" },
      { name: "trivia",    desc: "Trivia question" },
    ],
  },
  {
    id: "cat_utility", label: "Utility",
    cmds: [
      { name: "ping",    desc: "Bot response speed" },
      { name: "alive",   desc: "Check if bot is alive" },
      { name: "runtime", desc: "Bot runtime info" },
      { name: "uptime",  desc: "Bot uptime" },
      { name: "botinfo", desc: "Full bot information" },
      { name: "owner",   desc: "Contact the bot owner" },
    ],
  },
  {
    id: "cat_settings", label: "Settings",
    cmds: [
      { name: "setting",     desc: "Open settings menu" },
      { name: "buttonsmode", desc: "Toggle Button Mode" },
      { name: "richmode",    desc: "Toggle Rich Mode" },
      { name: "autochat",    desc: "Toggle AI auto-chatbot" },
      { name: "autoview",    desc: "Toggle auto-view statuses" },
      { name: "autolike",    desc: "Toggle auto-like statuses" },
    ],
  },
  {
    id: "cat_convert", label: "Converter",
    cmds: [
      { name: "convert",  desc: "Unit conversion" },
      { name: "currency", desc: "Currency conversion" },
    ],
  },
  {
    id: "cat_anime", label: "Anime",
    cmds: [
      { name: "anime",   desc: "Anime search" },
      { name: "manga",   desc: "Manga search" },
      { name: "waifu",   desc: "Random waifu image" },
      { name: "neko",    desc: "Random neko image" },
      { name: "husbando",desc: "Random husbando image" },
    ],
  },
];

// ─── Config helpers ───────────────────────────────────────────────────────────

function _cfg()     { return globalThis.__MIAS_CONFIG__ || {}; }
function _prefix()  { try { return _cfg().PREFIX  || "."; }  catch { return ".";   } }
function _version() { try { return _cfg().VERSION || "1.0"; } catch { return "1.0"; } }
function _owner()   {
  try {
    return _cfg().OWNER_NAME || _cfg().OWNER ||
           (globalThis.__GET_SETTING__ ? globalThis.__GET_SETTING__("owner") : null) ||
           "Owner";
  } catch { return "Owner"; }
}

function _botName() {
  try {
    const sock = globalThis.__MIAS_SOCK__;
    return _cfg().BOT_NAME || sock?.user?.name || "MIAS";
  } catch { return "MIAS"; }
}

function _cmdCount() {
  try {
    const map = globalThis.__MIAS_COMMANDS__;
    if (map) return map.size;
    return typeof globalThis.__MIAS_CMD_COUNT__ === "number"
      ? globalThis.__MIAS_CMD_COUNT__ : "—";
  } catch { return "—"; }
}

function _senderNum(msg) {
  try {
    const jid = msg.key.remoteJid;
    const raw  = jid.endsWith("@g.us")
      ? (msg.key.participant || msg.participant || "")
      : jid;
    return raw.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
  } catch { return ""; }
}

function _isPremium(num) {
  try {
    const list = globalThis.__MIAS_PREMIUM_LIST__;
    if (Array.isArray(list)) return list.includes(num);
    if (list instanceof Set) return list.has(num);
  } catch {}
  return false;
}

// ─── Home screen ──────────────────────────────────────────────────────────────

/**
 * Send the Button Mode home screen.
 * Called when the user types .menu while Button Mode is ON.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msg
 * @param {object} [opts]
 */
export async function sendButtonHomeScreen(sock, jid, msg, opts = {}) {
  const t0       = Date.now();
  const botName  = _botName();
  const prefix   = _prefix();
  const version  = _version();
  const ownerStr = _owner();
  const cmdCount = _cmdCount();

  // Collect sender info
  const senderNum  = _senderNum(msg);
  const userName   = opts.userName || msg?.pushName || "User";
  const isPremium  = _isPremium(senderNum);
  const rank       = isPremium ? "Premium" : "Free";
  const platform   = process.platform || "linux";
  const memMB      = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const uptime     = formatUptime(process.uptime ? process.uptime() * 1000 : 0);
  const ping       = Date.now() - t0;
  const now        = new Date();
  const date       = now.toLocaleDateString("en-GB",
    { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  const time       = now.toLocaleTimeString("en-GB",
    { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // ── 1. User profile card ──────────────────────────────────────────────────
  try {
    let picBuffer = null;
    if (senderNum) {
      const uJid = `${senderNum}@s.whatsapp.net`;
      try { picBuffer = await fetchProfilePic(sock, uJid); } catch {}
    }

    const userVcard = buildVCard({
      displayName: userName,
      phone: senderNum || "0",
      org: `MIAS User — ${rank}`,
      note: `Button Mode ON`,
      picBuffer,
    });

    await sock.sendMessage(jid, {
      contacts: {
        displayName: userName,
        contacts: [{ vcard: userVcard }],
      },
    }, opts.quoted ? { quoted: opts.quoted } : {});
    await new Promise(r => setTimeout(r, 350));
  } catch { /* non-fatal */ }

  // ── 2. Hero card — bot info + "Open Menu" button ─────────────────────────
  const heroBody = [
    `Welcome back, *${userName}*`,
    LINE,
    `Bot      : ${botName}`,
    `Version  : v${version}`,
    `Owner    : ${ownerStr}`,
    `Prefix   : ${prefix}`,
    `Commands : ${cmdCount}+`,
    LINE,
    `Ping     : ${ping} ms`,
    `Uptime   : ${uptime}`,
    `Memory   : ${memMB} MB`,
    `Platform : ${platform}`,
    LINE,
    `${date}  |  ${time}`,
  ].join("\n");

  // Attempt to fetch the bot's own picture for the hero image
  let botPicBuf = null;
  try {
    const botJid = sock.user?.id;
    if (botJid) botPicBuf = await fetchProfilePic(sock, botJid);
  } catch {}

  try {
    if (botPicBuf) {
      // sendHeroCard with image header + button
      await sendHeroCard(sock, jid, {
        image: botPicBuf,
        body: heroBody,
        footer: `${botName} v${version}`,
        buttons: [
          { text: "Open Menu",  id: "btn_openmenu" },
          { text: "Close",      id: "btn_close" },
        ],
        quoted: opts.quoted || msg || null,
      });
    } else {
      // No image — plain interactive card
      await sendButtons(sock, jid, heroBody,
        [
          { text: "Open Menu",  id: "btn_openmenu" },
          { text: "Close",      id: "btn_close" },
        ],
        {
          header: botName,
          footer: `${botName} v${version}`,
          quoted: opts.quoted || msg || null,
        }
      );
    }
  } catch {
    // Final fallback: plain text with inline instruction
    await sendText(sock, jid,
      heroBody + `\n\nReply with *${prefix}menu cat* to browse categories.`,
      { quoted: opts.quoted || msg || null }
    ).catch(() => {});
  }
}

// ─── Category selector ────────────────────────────────────────────────────────

/**
 * Send the interactive category list.
 */
export async function sendButtonCategorySelector(sock, jid, msg, opts = {}) {
  const botName = _botName();
  const version = _version();
  const prefix  = _prefix();
  const quoted  = opts.quoted || msg || null;

  const rows = CATEGORIES.map(cat => ({
    id:          cat.id,
    title:       cat.label,
    description: `${cat.cmds.length} commands`,
  }));

  try {
    await sendList(sock, jid,
      "Select a category to browse its commands.",
      [{ title: "Categories", rows }],
      {
        title:      `${botName} — Menu`,
        buttonText: "Browse Categories",
        footer:     `${botName} v${version} — ${prefix}menu for home`,
        quoted,
      }
    );
  } catch {
    // Fallback: chunked quick-reply buttons (max 3 per message)
    const chunks = [];
    for (let i = 0; i < CATEGORIES.length; i += 3) chunks.push(CATEGORIES.slice(i, i + 3));
    for (let i = 0; i < chunks.length; i++) {
      const btns = chunks[i].map(c => ({ text: c.label, id: c.id }));
      await sendButtons(sock, jid,
        i === 0 ? "Choose a category:" : "More categories:",
        btns,
        {
          header: i === 0 ? `${botName} Menu` : "",
          footer: i === chunks.length - 1 ? `${prefix}menu → home` : "",
          quoted: i === 0 ? quoted : null,
        }
      ).catch(() => {});
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 300));
    }
  }
}

// ─── Command selector ─────────────────────────────────────────────────────────

/**
 * Send the command list for a given category ID (cat_*).
 */
export async function sendButtonCommandSelector(sock, jid, msg, catId, opts = {}) {
  const botName = _botName();
  const version = _version();
  const prefix  = _prefix();
  const quoted  = opts.quoted || msg || null;

  const cat = CATEGORIES.find(c => c.id === catId);
  if (!cat) {
    await sendButtonCategorySelector(sock, jid, msg, opts);
    return;
  }

  // Build rows — prefix command names for clarity
  const rows = cat.cmds.map(cmd => ({
    id:          `cmd_${cmd.name}`,
    title:       `${prefix}${cmd.name}`,
    description: cmd.desc || "",
  }));
  // Navigation row
  rows.push({ id: "btn_back", title: "Back to Categories", description: "" });

  try {
    await sendList(sock, jid,
      `Commands in *${cat.label}*. Tap any command to run it.`,
      [{ title: cat.label, rows }],
      {
        title:      cat.label,
        buttonText: `Browse ${cat.label}`,
        footer:     `${botName} v${version} — Tap a command to select`,
        quoted,
      }
    );
  } catch {
    // Fallback: up to 9 commands as chunked buttons
    const limited = cat.cmds.slice(0, 9);
    const chunks  = [];
    for (let i = 0; i < limited.length; i += 3) chunks.push(limited.slice(i, i + 3));
    for (let i = 0; i < chunks.length; i++) {
      const btns = chunks[i].map(c => ({ text: prefix + c.name, id: `cmd_${c.name}` }));
      if (i === chunks.length - 1) btns.push({ text: "Back", id: "btn_back" });
      await sendButtons(sock, jid,
        i === 0 ? `${cat.label} commands:` : "More:",
        btns.slice(0, 3),
        {
          header: i === 0 ? cat.label : "",
          footer: i === chunks.length - 1 ? `${prefix}menu → home` : "",
          quoted: i === 0 ? quoted : null,
        }
      ).catch(() => {});
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 300));
    }
  }
}

// ─── Command execution / wizard ───────────────────────────────────────────────

/**
 * Handle a selected command (cmd_*).
 * No input needed → execute immediately.
 * Input needed    → start wizard session and prompt.
 */
export async function handleCommandSelection(sock, jid, msg, cmdName, opts = {}) {
  const prefix  = _prefix();
  const botName = _botName();
  const version = _version();
  const quoted  = opts.quoted || msg || null;

  // Resolve input spec
  const inputSpec = cmdName in COMMAND_INPUTS ? COMMAND_INPUTS[cmdName] : undefined;

  // ── No input → execute immediately ────────────────────────────────────────
  if (inputSpec === null || inputSpec === undefined) {
    try {
      if (typeof globalThis.__MIAS_DISPATCH_CMD__ === "function") {
        await globalThis.__MIAS_DISPATCH_CMD__(sock, msg, cmdName, []);
      } else {
        const entry = globalThis.__MIAS_COMMANDS__?.get?.(cmdName);
        if (entry?.handler) await entry.handler(sock, msg, []);
        else {
          await sendText(sock, jid,
            `Unknown command: *${cmdName}*\nType *${prefix}${cmdName}* manually.`,
            { quoted }
          ).catch(() => {});
        }
      }
    } catch (e) {
      await sendText(sock, jid,
        `Error running *${cmdName}*: ${e?.message || e}`,
        { quoted }
      ).catch(() => {});
    }

    // After execution — offer navigation
    await new Promise(r => setTimeout(r, 500));
    try {
      await sendButtons(sock, jid,
        "Done. What would you like to do next?",
        [
          { text: "Home",             id: "btn_home" },
          { text: "Browse More",      id: "btn_back" },
        ],
        {
          footer: `${botName} v${version}`,
        }
      );
    } catch {}
    return;
  }

  // ── Needs input → start wizard ────────────────────────────────────────────
  const isGrp      = jid.endsWith("@g.us");
  const senderJid  = isGrp
    ? (msg.key?.participant || msg.participant || jid)
    : jid;

  // Store on both senderJid (for group DM resolution) and jid
  startWizardSession(senderJid, cmdName, inputSpec.prompt, 90_000);
  if (senderJid !== jid) startWizardSession(jid, cmdName, inputSpec.prompt, 90_000);

  const promptBody = [
    `*${cmdName.toUpperCase()}*`,
    LINE,
    inputSpec.prompt,
    LINE,
    `Reply with your input to continue.`,
    `Type *cancel* to abort.`,
    `Session expires in 90 seconds.`,
  ].join("\n");

  try {
    await sendButtons(sock, jid, promptBody,
      [{ text: "Cancel", id: "btn_cancel" }],
      {
        header: `${prefix}${cmdName}`,
        footer: `${botName} — waiting for input`,
      }
    );
  } catch {
    await sendText(sock, jid, promptBody, { quoted }).catch(() => {});
  }
}

// ─── Button response router ───────────────────────────────────────────────────

/**
 * Route a button/list response payload.
 * Called by index.js when the extracted body matches btn_*, cat_*, or cmd_*.
 *
 * @param {object} sock
 * @param {object} msg
 * @param {string} body  - Extracted button/list ID
 */
export async function handleButtonResponse(sock, msg, body) {
  const jid  = msg.key.remoteJid;
  const opts = {};

  // ── Navigation ──────────────────────────────────────────────────────────
  if (body === "btn_home" || body === "btn_menu") {
    await sendButtonHomeScreen(sock, jid, msg, opts);
    return;
  }

  if (body === "btn_openmenu") {
    await sendButtonCategorySelector(sock, jid, msg, opts);
    return;
  }

  if (body === "btn_back") {
    await sendButtonCategorySelector(sock, jid, msg, opts);
    return;
  }

  if (body === "btn_close" || body === "btn_cancel") {
    clearWizardSession(jid);
    const isGrp = jid.endsWith("@g.us");
    const sJid  = isGrp ? (msg.key.participant || msg.participant || jid) : jid;
    clearWizardSession(sJid);
    const prefix = _prefix();
    await sendText(sock, jid,
      `Closed. Type *${prefix}menu* to return to the menu.`
    ).catch(() => {});
    return;
  }

  // ── Category selected ───────────────────────────────────────────────────
  if (body.startsWith("cat_")) {
    await sendButtonCommandSelector(sock, jid, msg, body, opts);
    return;
  }

  // ── Command selected ────────────────────────────────────────────────────
  if (body.startsWith("cmd_")) {
    const cmdName = body.slice(4); // strip "cmd_"
    await handleCommandSelection(sock, jid, msg, cmdName, opts);
    return;
  }
}
