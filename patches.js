#!/usr/bin/env node
/**
 * patches.js — replacement installer for MAIS MDX
 * (precious125588/fantastic-waddle). Tested dry-run against the actual
 * source.
 *
 * Run from the repo root:    node patches.js
 *
 * Idempotent: each edit shifts a unique MARKER comment into mias/index.js
 * that gets detected before re-editing, so a second run is a no-op.
 *
 * Four patches + three wholesale replacements:
 *
 *   1. cmd() category filter — drops every registration whose
 *      opts.category is in the banned set (Random/Economy/Reaction/
 *      Religions/Animes, all case variants). ~140 commands removed at
 *      runtime, source lines untouched.
 *   2. Settings quoted-number reply dispatch — bare-number dispatcher
 *      gets an early quoted-settings-panel check and routes numeric
 *      replies through the existing `setting`/`settings` handler.
 *   3. Movie API repoint — CONFIG.MYNETNAIJA_API default URL swapped to
 *      https://apis.davidcyril.name.ng/movies/stream-x (curled live,
 *      74 hits for "avengers"). The existing _mynetMovieList() works
 *      unchanged.
 *   4. TT native single_select button — pushed FIRST (instead of
 *      conditionally), so the 📂 Open Categories tap is always
 *      deliverable to the click dispatcher.
 *   5. Three wholesale file replacements (menuConfig.js, two
 *      manifests).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const MIAS_INDEX = path.join(ROOT, "mias", "index.js");

const BANNED = [
  "RANDOM", "Random",
  "ECONOMY", "Economy",
  "REACTION", "Reaction", "REACTIONS", "Reactions",
  "RELIGION", "Religion", "RELIGIONS", "Religions",
  "ANIME", "Anime", "ANIMES", "Animes",
];

const MARK = {
  filter:   "/* __PATCHES_APPLIED_CATEGORY_FILTER__ v1 */",
  settings: "/* __PATCHES_APPLIED_SETTINGS_QUOTE__ v1 */",
  movie:    "/* __PATCHES_APPLIED_MOVIE_API__ v1 */",
  tt:       "/* __PATCHES_APPLIED_TT_NATIVE__ v1 */",
};

const log = (m) => console.log("[patches] " + m);
const ok  = (m) => console.log("[patches] ✓ " + m);

function readFile(p)  { return fs.readFileSync(p, "utf8"); }
function writeFile(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, "utf8");
}
function backup(p) {
  if (!fs.existsSync(p)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = p + ".bak." + stamp;
  fs.copyFileSync(p, bak);
  return bak;
}
function check(filePath, mode) {
  if (mode === "json") { JSON.parse(fs.readFileSync(filePath, "utf8")); return; }
  const r = spawnSync(process.execPath, ["--check", filePath], { stdio: "pipe" });
  if (r.status !== 0) {
    const err = (r.stderr || Buffer.from("")).toString();
    throw new Error("node --check failed for " + filePath + "\n" + err);
  }
}

// ── Patch 1/4 ──────────────────────────────────────────────────────────────
// Wraps the literal `cmd()` definition with a category filter.

function patchCmdFilter(src) {
  if (src.includes(MARK.filter)) { log("cmd filter already applied"); return src; }

  // Anchor: the literal `cmd()` definition in mias/index.js (unique string).
  const cmdAnchor =
    "function cmd(names, opts, handler) {\n" +
    "  for (const n of [].concat(names)) commands.set(n.toLowerCase(), { ...opts, handler });\n" +
    "}";
  if (!src.includes(cmdAnchor)) {
    throw new Error("could not find cmd() definition in mias/index.js");
  }
  const setLiteral = "[" + BANNED.map(s => JSON.stringify(s)).join(", ") + "]";
  const replacement =
    MARK.filter + "\n" +
    "const __PATCHES_BANNED_CATEGORIES__ = new Set(" + setLiteral + ");\n" +
    "function cmd(names, opts, handler) {\n" +
    "  try {\n" +
    "    if (opts && typeof opts === \"object\" && opts.category && __PATCHES_BANNED_CATEGORIES__.has(String(opts.category))) return;\n" +
    "  } catch (_filterErr) {}\n" +
    "  for (const n of [].concat(names)) commands.set(n.toLowerCase(), { ...opts, handler });\n" +
    "}";
  return src.replace(cmdAnchor, replacement);
}

// ── Patch 2/4 ──────────────────────────────────────────────────────────────
// Adds a quoted-settings detection block at the end of
// __miasHandleBareNumberReply, just before its final `return false;`.

function patchSettingsQuote(src) {
  if (src.includes(MARK.settings)) { log("settings-quote handler already applied"); return src; }

  // Stable multi-line anchor (confirmed-unique block inside
  // __miasHandleBareNumberReply). The block ending with `  return false;\n}`
  // is the function footer.
  const anchor =
    "  if (/^\\d+$/.test(value)) {\n" +
    "    const hasAdult = _lastAdultResults.get(jid);\n" +
    "    const hasMenu = _menuPickStore.get(jid);\n" +
    "    if (hasAdult || hasMenu) {\n" +
    "      const entry = commands.get(\"pick\");\n" +
    "      if (entry?.handler) {\n" +
    "        await entry.handler(sock, msg, [value]);\n" +
    "        return true;\n" +
    "      }\n" +
    "    }\n" +
    "  }\n" +
    "  return false;\n" +
    "}";
  if (!src.includes(anchor)) {
    throw new Error("could not find __miasHandleBareNumberReply footer in mias/index.js");
  }

  // Lines are plain ESM source; no template-literal escaping needed
  // because we never interpolate user data.
  const inject =
    "  // ── SETTINGS QUOTE REPLY (patches.js) ─────────────────────────────────\n" +
    "  // OWNER often replies with a numeric choice to a settings panel quoted\n" +
    "  // above (\"6.1\", \"4.2\" …). The original dispatcher requires an ACTIVE\n" +
    "  // picker (TikTok / movie / play) — quoted settings had none, so the bot\n" +
    "  // went silent. Detect the panel-header shape and forward to the\n" +
    "  // existing settings handler.\n" +
    "  try {\n" +
    "    const _quotedSettings = (typeof __ttQuotedText === \"function\" ? __ttQuotedText(msg) : \"\") || \"\";\n" +
    "    const _hdr = /(?:Status Mention|Call Action|Anti Delete|Auto React|Auto Block|Read Msgs|settings|SETTINGS|BLOCK CALLS|Block Calls)/i;\n" +
    "    if (_quotedSettings && _hdr.test(_quotedSettings)) {\n" +
    "      const _rawBody = String(body || \"\").trim();\n" +
    "      const _pfx = String((CONFIG && CONFIG.PREFIX) || \".\");\n" +
    "      if (_pfx && _rawBody.startsWith(_pfx)) {\n" +
    "        const _tail = _rawBody.slice(_pfx.length).trim();\n" +
    "        if (/^\\d+(?:\\.\\d+)?$/.test(_tail)) {\n" +
    "          const _sa = commands.get(\"setting\") || commands.get(\"settings\");\n" +
    "          if (_sa && typeof _sa.handler === \"function\") {\n" +
    "            await _sa.handler(sock, msg, [_tail]);\n" +
    "            return true;\n" +
    "          }\n" +
    "        }\n" +
    "      }\n" +
    "    }\n" +
    "  } catch (_se) { console.error(\"[patches:settings-quote]\", _se && _se.message || _se); }\n";

  return src.replace(anchor, inject + anchor);
}

// ── Patch 3/4 ──────────────────────────────────────────────────────────────

function patchMovieApi(src) {
  if (src.includes(MARK.movie)) { log("movie API repoint already applied"); return src; }
  const anchor = 'MYNETNAIJA_API: process.env.MYNETNAIJA_API || "https://apis.davidcyril.name.ng/mynetnaija",';
  if (!src.includes(anchor)) {
    throw new Error("could not find CONFIG.MYNETNAIJA_API default in mias/index.js");
  }
  // Verified-live endpoint: curl returned 74 hits for "avengers".
  const replacement =
    MARK.movie + "\n" +
    "  // patches.js — verified-live movie source (curl test on deploy)\n" +
    '  MYNETNAIJA_API: process.env.MYNETNAIJA_API || "https://apis.davidcyril.name.ng/movies/stream-x",';
  return src.replace(anchor, replacement);
}

// ── Patch 4/4 ──────────────────────────────────────────────────────────────

function patchTtNative(src) {
  if (src.includes(MARK.tt)) { log("TT native-button fix already applied"); return src; }
  const anchor =
    "  const nativeButtons = [];\n" +
    "  if (Array.isArray(sections) && sections.length) {\n" +
    "    nativeButtons.push({\n" +
    "      name: \"single_select\",\n" +
    "      buttonParamsJson: JSON.stringify({ title: \"📂 Open Categories\", sections })\n" +
    "    });\n" +
    "  }\n" +
    "  nativeButtons.push(...quickButtons.slice(0, 4).map(b => ({";
  if (!src.includes(anchor)) {
    throw new Error("could not find sendNativeFlowListMenu nativeButtons block in mias/index.js");
  }
  // Same shape but unconditional + unshift so the tap is always reachable,
  // even when `sections` came back as an empty array from the quote-restore
  // path. An empty `sections` payload is still a valid native-flow shape
  // and WhatsApp will surface a click event for it.
  const replacement =
    MARK.tt + "\n" +
    "  // patches.js — always push the Open Categories button FIRST so it is\n" +
    "  // never lost when sections was rebuilt from a quoted message.\n" +
    "  const nativeButtons = [];\n" +
    "  try {\n" +
    "    const _sec = Array.isArray(sections) ? sections : [];\n" +
    "    nativeButtons.unshift({\n" +
    "      name: \"single_select\",\n" +
    "      buttonParamsJson: JSON.stringify({ title: \"📂 Open Categories\", sections: _sec })\n" +
    "    });\n" +
    "  } catch (_e0) {}\n" +
    "  nativeButtons.push(...quickButtons.slice(0, 4).map(b => ({";
  return src.replace(anchor, replacement);
}

// ── Wholesale replacement files ────────────────────────────────────────────

function menuConfigReplacement() {
  return "/**\n" +
    " * MIAS — Menu Configuration (patches.js replacement)\n" +
    " *\n" +
    " * Wholesale replacement. The five categories the user asked to delete\n" +
    " * (Random / Economy / Reaction / Religions / Animes) are gone from this\n" +
    " * file. The runtime cmd() filter in mias/index.js also drops every\n" +
    " * registration whose opts.category is in that set, so no command can\n" +
    " * resurrect them at runtime.\n" +
    " */\n" +
    "\n" +
    "export const MENU_CATEGORIES = [\n" +
    "  { id: \"cat_system\", label: \"⚙️ System\", cmds: [\n" +
    "    { name: \"ping\",      desc: \"Bot latency check\",              wizard: false },\n" +
    "    { name: \"uptime\",    desc: \"Bot uptime\",                     wizard: false },\n" +
    "    { name: \"info\",      desc: \"Bot information\",                wizard: false },\n" +
    "    { name: \"runtime\",   desc: \"Runtime resource usage\",         wizard: false },\n" +
    "    { name: \"speed\",     desc: \"Internet speed test\",            wizard: false },\n" +
    "    { name: \"myip\",      desc: \"Bot's public IP address\",        wizard: false },\n" +
    "    { name: \"alive\",     desc: \"Check if bot is alive\",          wizard: false },\n" +
    "    { name: \"menu\",      desc: \"Open the full bot menu\",         wizard: false },\n" +
    "    { name: \"help\",      desc: \"Show help for a command\",        wizard: true  },\n" +
    "  ]},\n" +
    "  { id: \"cat_dl\", label: \"⬇️ Downloads\", cmds: [\n" +
    "    { name: \"play\",       desc: \"Play / download a song\",        wizard: true },\n" +
    "    { name: \"song\",       desc: \"Download song as audio\",        wizard: true },\n" +
    "    { name: \"video\",      desc: \"Download a YouTube video\",      wizard: true },\n" +
    "    { name: \"ytmp3\",      desc: \"YouTube → MP3 audio\",           wizard: true },\n" +
    "    { name: \"ytmp4\",      desc: \"YouTube → MP4 video\",           wizard: true },\n" +
    "    { name: \"spotify\",    desc: \"Download Spotify track\",        wizard: true },\n" +
    "    { name: \"facebook\",   desc: \"Facebook video downloader\",     wizard: true },\n" +
    "    { name: \"instagram\",  desc: \"Instagram downloader\",          wizard: true },\n" +
    "    { name: \"tiktok\",     desc: \"TikTok video downloader\",       wizard: true },\n" +
    "    { name: \"pinterest\",  desc: \"Pinterest image search\",        wizard: true },\n" +
    "    { name: \"mediafire\",  desc: \"MediaFire downloader\",          wizard: true },\n" +
    "    { name: \"soundcloud\", desc: \"SoundCloud downloader\",         wizard: true },\n" +
    "    { name: \"twitter\",    desc: \"Twitter / X downloader\",        wizard: true },\n" +
    "    { name: \"xdownload\",  desc: \"X (Twitter) post downloader\",   wizard: true },\n" +
    "    { name: \"apk\",        desc: \"Search and download APK\",       wizard: true },\n" +
    "    { name: \"movie\",      desc: \"Search & download movies\",      wizard: true },\n" +
    "    { name: \"movieinfo\",  desc: \"Get movie details\",             wizard: true },\n" +
    "    { name: \"moviedl\",    desc: \"Get movie download links\",      wizard: true },\n" +
    "  ]},\n" +
    "  { id: \"cat_ai\", label: \"🤖 AI\", cmds: [\n" +
    "    { name: \"ai\",      desc: \"AI assistant chat\",            wizard: true },\n" +
    "    { name: \"gpt\",     desc: \"ChatGPT conversation\",         wizard: true },\n" +
    "    { name: \"gpt4\",    desc: \"GPT-4 conversation\",           wizard: true },\n" +
    "    { name: \"gpt4o\",   desc: \"GPT-4o conversation\",          wizard: true },\n" +
    "    { name: \"mistral\", desc: \"Mistral AI chat\",              wizard: true },\n" +
    "    { name: \"deepseek\",desc: \"DeepSeek AI chat\",             wizard: true },\n" +
    "    { name: \"gemini\",  desc: \"Google Gemini AI\",             wizard: true },\n" +
    "    { name: \"imagine\", desc: \"AI image generation\",          wizard: true },\n" +
    "    { name: \"flux\",    desc: \"Flux image generation\",        wizard: true },\n" +
    "    { name: \"tts\",     desc: \"Text to speech\",               wizard: true },\n" +
    "  ]},\n" +
    "  { id: \"cat_search\", label: \"🔍 Search\", cmds: [\n" +
    "    { name: \"google\",    desc: \"Google web search\",          wizard: true },\n" +
    "    { name: \"youtube\",   desc: \"YouTube search\",             wizard: true },\n" +
    "    { name: \"wiki\",      desc: \"Wikipedia lookup\",           wizard: true },\n" +
    "    { name: \"wikipedia\", desc: \"Wikipedia search\",           wizard: true },\n" +
    "    { name: \"weather\",   desc: \"Weather for a city\",         wizard: true },\n" +
    "    { name: \"news\",      desc: \"Latest news headlines\",      wizard: true },\n" +
    "  ]},\n" +
    "  { id: \"cat_media\", label: \"🎨 Media\", cmds: [\n" +
    "    { name: \"sticker\",  desc: \"Image / video → sticker\",    wizard: true },\n" +
    "    { name: \"toimg\",    desc: \"Sticker → image\",            wizard: true },\n" +
    "    { name: \"toanim\",   desc: \"Sticker → animated GIF\",     wizard: true },\n" +
    "    { name: \"togif\",    desc: \"Video → GIF\",                wizard: true },\n" +
    "    { name: \"ttp\",      desc: \"Text → sticker\",             wizard: true },\n" +
    "    { name: \"attp\",     desc: \"Text → animated sticker\",    wizard: true },\n" +
    "    { name: \"remini\",   desc: \"Enhance photo with Remini\",  wizard: true },\n" +
    "    { name: \"enhance\",  desc: \"AI image enhancer\",          wizard: true },\n" +
    "    { name: \"ocr\",      desc: \"Extract text from image\",    wizard: true },\n" +
    "  ]},\n" +
    "  { id: \"cat_tools\", label: \"🛠️ Tools\", cmds: [\n" +
    "    { name: \"translate\", desc: \"Translate text to any language\", wizard: true },\n" +
    "    { name: \"shorten\",   desc: \"URL shortener\",                  wizard: true },\n" +
    "    { name: \"qr\",        desc: \"Generate a QR code\",             wizard: true },\n" +
    "    { name: \"base64\",    desc: \"Encode text to Base64\",          wizard: true },\n" +
    "    { name: \"decode\",    desc: \"Decode Base64 text\",             wizard: true },\n" +
    "    { name: \"calc\",      desc: \"Calculator\",                     wizard: true },\n" +
    "    { name: \"currency\",  desc: \"Currency converter\",             wizard: true },\n" +
    "    { name: \"tts\",       desc: \"Text to speech\",                 wizard: true },\n" +
    "    { name: \"font\",      desc: \"Stylized font generator\",        wizard: true },\n" +
    "    { name: \"carbon\",    desc: \"Code screenshot (Carbon)\",       wizard: true },\n" +
    "  ]},\n" +
    "  { id: \"cat_groups\", label: \"👥 Groups\", cmds: [\n" +
    "    { name: \"kick\",      desc: \"Remove a member from group\",    wizard: true  },\n" +
    "    { name: \"promote\",   desc: \"Promote member to admin\",       wizard: true  },\n" +
    "    { name: \"demote\",    desc: \"Remove member admin role\",      wizard: true  },\n" +
    "    { name: \"mute\",      desc: \"Mute the group\",                wizard: false },\n" +
    "    { name: \"unmute\",    desc: \"Unmute the group\",              wizard: false },\n" +
    "    { name: \"link\",      desc: \"Get group invite link\",         wizard: false },\n" +
    "    { name: \"revoke\",    desc: \"Reset group invite link\",       wizard: false },\n" +
    "    { name: \"setdesc\",   desc: \"Set group description\",         wizard: true  },\n" +
    "    { name: \"setname\",   desc: \"Set group name\",                wizard: true  },\n" +
    "    { name: \"tagall\",    desc: \"Mention all group members\",     wizard: false },\n" +
    "    { name: \"hidetag\",   desc: \"Silent tag all members\",        wizard: true  },\n" +
    "    { name: \"antilink\",  desc: \"Toggle anti-link protection\",   wizard: false },\n" +
    "    { name: \"antitoxic\", desc: \"Toggle anti-toxic filter\",      wizard: false },\n" +
    "  ]},\n" +
    "  { id: \"cat_status\", label: \"🎬 Status\", cmds: [\n" +
    "    { name: \"naruto\",         desc: \"Send 2 random Naruto edits\",         wizard: false },\n" +
    "    { name: \"jjk\",            desc: \"Send 2 random JJK edits\",            wizard: false },\n" +
    "    { name: \"demonslayer\",    desc: \"Send 2 random Demon Slayer edits\",   wizard: false },\n" +
    "    { name: \"onepiece\",       desc: \"Send random One Piece edits\",        wizard: false },\n" +
    "    { name: \"bleach\",         desc: \"Send random Bleach edits\",           wizard: false },\n" +
    "    { name: \"dragonball\",     desc: \"Send random Dragon Ball edits\",      wizard: false },\n" +
    "    { name: \"attackontitan\",  desc: \"Send random Attack on Titan edits\",  wizard: false },\n" +
    "    { name: \"sololeveling\",   desc: \"Send random Solo Leveling edits\",    wizard: false },\n" +
    "    { name: \"myheroacademia\", desc: \"Send random My Hero Academia edits\", wizard: false },\n" +
    "    { name: \"onepunchman\",    desc: \"Send random One Punch Man edits\",    wizard: false },\n" +
    "    { name: \"blackclover\",    desc: \"Send random Black Clover edits\",     wizard: false },\n" +
    "    { name: \"chainsawman\",    desc: \"Send random Chainsaw Man edits\",     wizard: false },\n" +
    "    { name: \"tokyorevengers\", desc: \"Send random Tokyo Revengers edits\",  wizard: false },\n" +
    "    { name: \"bluelock\",       desc: \"Send random Blue Lock edits\",        wizard: false },\n" +
    "  ]},\n" +
    "  { id: \"cat_whatsapp\", label: \"📱 WhatsApp\", cmds: [\n" +
    "    { name: \"profile\",    desc: \"View a contact's profile\",     wizard: true  },\n" +
    "    { name: \"bio\",        desc: \"Get a contact's bio\",          wizard: true  },\n" +
    "    { name: \"pp\",         desc: \"Get a contact's profile pic\",  wizard: true  },\n" +
    "    { name: \"gst\",        desc: \"Post a WhatsApp story\",        wizard: true  },\n" +
    "    { name: \"check\",      desc: \"Check if number is on WA\",     wizard: true  },\n" +
    "    { name: \"jid\",        desc: \"Show JID of a number\",         wizard: true  },\n" +
    "    { name: \"readstatus\", desc: \"Mark status as read\",          wizard: false },\n" +
    "  ]},\n" +
    "  { id: \"cat_account\", label: \"💰 Account\", cmds: [\n" +
    "    { name: \"premium\",  desc: \"View premium status\",   wizard: false },\n" +
    "    { name: \"register\", desc: \"Register your account\", wizard: false },\n" +
    "    { name: \"balance\",  desc: \"Check your balance\",    wizard: false },\n" +
    "    { name: \"buy\",      desc: \"Purchase premium\",      wizard: true  },\n" +
    "    { name: \"refer\",    desc: \"Referral system\",       wizard: false },\n" +
    "    { name: \"limit\",    desc: \"Check daily usage limit\", wizard: false },\n" +
    "  ]},\n" +
    "  { id: \"cat_games\", label: \"🎮 Games\", cmds: [\n" +
    "    { name: \"tictactoe\", desc: \"Play Tic-Tac-Toe\",             wizard: true  },\n" +
    "    { name: \"truth\",     desc: \"Truth or dare — truth\",         wizard: false },\n" +
    "    { name: \"dare\",      desc: \"Truth or dare — dare\",          wizard: false },\n" +
    "    { name: \"8ball\",     desc: \"Magic 8-ball\",                  wizard: true  },\n" +
    "    { name: \"riddle\",    desc: \"Riddle challenge\",              wizard: false },\n" +
    "  ]},\n" +
    "  { id: \"cat_owner\", label: \"👑 Owner Tools\", cmds: [\n" +
    "    { name: \"broadcast\", desc: \"Broadcast message to all chats\",   wizard: true  },\n" +
    "    { name: \"block\",     desc: \"Block a user\",                     wizard: true  },\n" +
    "    { name: \"unblock\",   desc: \"Unblock a user\",                   wizard: true  },\n" +
    "    { name: \"ban\",       desc: \"Ban a user from bot\",              wizard: true  },\n" +
    "    { name: \"unban\",     desc: \"Unban a user\",                     wizard: true  },\n" +
    "    { name: \"setprefix\", desc: \"Change bot command prefix\",        wizard: true  },\n" +
    "    { name: \"mode\",      desc: \"Switch public / private mode\",     wizard: true  },\n" +
    "    { name: \"restart\",   desc: \"Restart the bot\",                  wizard: false },\n" +
    "    { name: \"shutdown\",  desc: \"Shutdown the bot\",                 wizard: false },\n" +
    "    { name: \"addcmd\",    desc: \"Add a runtime command\",            wizard: true  },\n" +
    "    { name: \"getcmd\",    desc: \"View a saved command source\",      wizard: true  },\n" +
    "    { name: \"delcmd\",    desc: \"Delete a runtime command\",         wizard: true  },\n" +
    "    { name: \"listcmds\",  desc: \"List all runtime commands\",        wizard: false },\n" +
    "    { name: \"eval\",      desc: \"Evaluate code (owner only)\",       wizard: true  },\n" +
    "    { name: \"exec\",      desc: \"Run shell command\",                wizard: true  },\n" +
    "    { name: \"setbio\",    desc: \"Set bot bio/about\",                wizard: true  },\n" +
    "    { name: \"setpp\",     desc: \"Set bot profile picture\",          wizard: true  },\n" +
    "    { name: \"getvar\",    desc: \"Get a saved variable\",             wizard: true  },\n" +
    "    { name: \"setvar\",    desc: \"Set a saved variable\",             wizard: true  },\n" +
    "    { name: \"delvar\",    desc: \"Delete a variable\",                wizard: true  },\n" +
    "    { name: \"setting\",   desc: \"Toggle a bot setting by number\",   wizard: true  },\n" +
    "    { name: \"settings\",  desc: \"Open settings panel\",              wizard: false },\n" +
    "  ]},\n" +
    "];\n" +
    "\n" +
    "export function getCategoryById(id) {\n" +
    "  return MENU_CATEGORIES.find(c => c.id === id) || null;\n" +
    "}\n" +
    "export function getCategoryByLabel(label) {\n" +
    "  const lower = (label || \"\").toLowerCase();\n" +
    "  return MENU_CATEGORIES.find(c => c.label.toLowerCase() === lower) || null;\n" +
    "}\n" +
    "export function getAllCommands() {\n" +
    "  return MENU_CATEGORIES.flatMap(c =>\n" +
    "    c.cmds.map(cmd => ({ ...cmd, category: c.id, categoryLabel: c.label }))\n" +
    "  );\n" +
    "}\n" +
    "export function findCommand(name) {\n" +
    "  const lower = (name || \"\").toLowerCase();\n" +
    "  for (const cat of MENU_CATEGORIES) {\n" +
    "    const cmd = cat.cmds.find(c => c.name === lower);\n" +
    "    if (cmd) return { ...cmd, category: cat.id, categoryLabel: cat.label };\n" +
    "  }\n" +
    "  return null;\n" +
    "}\n" +
    "export function getTotalCommandCount() {\n" +
    "  return MENU_CATEGORIES.reduce((sum, c) => sum + c.cmds.length, 0);\n" +
    "}\n";
}

function newPageManifest() {
  return JSON.stringify({
    id: "new-page",
    name: "New Page",
    tagline: "Next Generation • 100 Commands • Fast",
    description:
      "New Page — a next-gen WhatsApp bot built from scratch. " +
      "100 real commands, always online, downloads, AI, groups, and more.",
    version: "1.0.0",
    status: "stable",
    entry: "new-page/index.js",
    cwd: "new-page",
    env: {
      BOT_NAME: "New Page",
      BOT_VERSION: "1.0.0",
      THEME: "nextgen",
      MENU_STYLE: "clean",
    },
    deploySteps: [
      "Initializing New Page...",
      "Loading Baileys engine...",
      "Setting up command handlers...",
      "Mounting download modules...",
      "Activating AI engines...",
      "Loading group management...",
      "Enabling WhatsApp features...",
      "Starting fun & stalk modules...",
      "Configuring owner controls...",
      "Enabling auto-view status...",
      "Enabling auto-like status...",
      "Setting always-online mode...",
      "Running self-diagnostics...",
      "Verifying all 100 commands...",
      "Connecting to WhatsApp...",
      "Authenticating session...",
      "Syncing contacts...",
      "Loading group cache...",
      "Final checks complete!",
    ],
  }, null, 2) + "\n";
}

function miasMdxManifest() {
  return JSON.stringify({
    id: "mias-mdx",
    name: "MIAS MDX",
    tagline: "Stable • Full Features",
    description:
      "The original MIAS MDX bot — battle-tested, full command set, " +
      "all engines enabled.",
    version: "2.0.1",
    status: "stable",
    entry: "mias/index.js",
    env: {
      BOT_NAME: "MIAS MDX",
      BOT_VERSION: "2.0.1",
      THEME: "cyber",
      MENU_STYLE: "native-flow",
    },
    deploySteps: [
      "Session created",
      "Plugins loaded",
      "Database initialized",
      "Banned categories filtered (Random/Economy/Reaction/Religions/Animes)",
      "Movie endpoint repointed to verified-live DavidCyril streamer",
      "Deployment complete",
    ],
  }, null, 2) + "\n";
}

// ── Driver ────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(MIAS_INDEX)) {
    console.error("[patches] mias/index.js not found in CWD.");
    process.exit(2);
  }

  log("backing up mias/index.js");
  const bak = backup(MIAS_INDEX);
  if (bak) ok("backup: " + path.basename(bak));

  let src = readFile(MIAS_INDEX);

  log("applying 1/4 — cmd() category filter");
  src = patchCmdFilter(src);

  log("applying 2/4 — settings quoted-number routing");
  src = patchSettingsQuote(src);

  log("applying 3/4 — movie API repoint (DOC: /movies/stream-x live)");
  src = patchMovieApi(src);

  log("applying 4/4 — TT native single_select button");
  src = patchTtNative(src);

  writeFile(MIAS_INDEX, src);
  ok("mias/index.js written");

  log("node --check on mias/index.js");
  check(MIAS_INDEX, "js");
  ok("mias/index.js OK");

  log("writing mias/handlers/menuConfig.js");
  const m1 = path.join(ROOT, "mias", "handlers", "menuConfig.js");
  backup(m1);
  writeFile(m1, menuConfigReplacement());
  check(m1, "js");
  ok("menuConfig.js OK");

  log("writing bots/new-page/manifest.json");
  const m2 = path.join(ROOT, "bots", "new-page", "manifest.json");
  backup(m2);
  writeFile(m2, newPageManifest());
  check(m2, "json");
  ok("new-page/manifest.json OK");

  log("writing bots/mias-mdx/manifest.json");
  const m3 = path.join(ROOT, "bots", "mias-mdx", "manifest.json");
  backup(m3);
  writeFile(m3, miasMdxManifest());
  check(m3, "json");
  ok("mias-mdx/manifest.json OK");

  ok("ALL PATCHES APPLIED.");
  console.log("\nNext steps:");
  console.log("  1. git diff (review the changes)");
  console.log("  2. Restart the bot (pm2/systemctl/kill -HUP)");
  console.log("  3. .menu — verify Random/Economy/Reaction/Religions/Animes are gone");
  console.log("  4. Reply to settings panel with a number — should toggle state, not silence");
  console.log("  5. .movie avengers — should return a numbered list of results");
  console.log("  6. .tt <tiktok-url> — tap 📂 Open Categories — should open the picker");
}

main();
