/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║               NIX ASSISTANT SYSTEM v2.1.0                      ║
 * ║     Ultra Human Reactive Engine — Private + Group Support       ║
 * ║     DOES NOT modify or interfere with main bot                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * INTEGRATION — add these 2 lines to your main index.js:
 *
 *   import { nixHandler } from './nix/index.js';
 *
 *   // Inside messages.upsert handler, BEFORE your main cmd() call:
 *   if (await nixHandler(sock, msg)) return;
 *
 * Works in: private chats, group chats, self-chat (owner texting bot directly).
 * Owner detection: set NIX_OWNER_JID env var for best results.
 *   e.g.  NIX_OWNER_JID=2349012345678
 */

// ── Imports (all at top — ES module requirement) ─────────────────────────────
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseNixMessage } from './intent.js';
import { getOwnerName, setOwnerName } from './owner.js';
import { buildMainMenu, buildCategoryHelp } from './menu.js';
import { sendNix, reactNix, stagedSend, nixFooter, nixPreReact, nixAfterComment } from './ui.js';
import { incrementStat } from './modules/system.js';
import {
  trackUsage,
  preReactionText,
  afterCommentText,
  denialText,
  errorText,
} from './personality.js';

// ── Resolve bot pic path ─────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolves to: mias/assets/botpic1.jpg
const BOT_PIC_PATH = path.resolve(__dirname, '..', 'assets', 'botpic1.jpg');

// ── Lazy-load modules (keeps startup fast) ───────────────────────────────────
let _account, _groups, _whatsapp, _ai, _media, _system, _info, _productivity, _contact, _autoFeat;

async function getAccount()      { return _account      ??= await import('./modules/account.js'); }
async function getGroups()       { return _groups       ??= await import('./modules/groups.js'); }
async function getWhatsapp()     { return _whatsapp     ??= await import('./modules/whatsapp.js'); }
async function getAi()           { return _ai           ??= await import('./modules/ai.js'); }
async function getMedia()        { return _media        ??= await import('./modules/media.js'); }
async function getSystem()       { return _system       ??= await import('./modules/system.js'); }
async function getInfo()         { return _info         ??= await import('./modules/info.js'); }
async function getProductivity() { return _productivity ??= await import('./modules/productivity.js'); }
async function getContact()      { return _contact      ??= await import('./modules/contact.js'); }
async function getAutoFeat()     { return _autoFeat     ??= await import('./modules/autofeatures.js'); }

// ── Menu with bot pic + buttons ────────────────────────────────────────────────
/**
 * Sends the menu as ONE rich interactive message: image header + caption + buttons.
 * All three (image, body text, buttons) go in a single sendMessage() call via
 * sendRichInteractive() → Baileys proto InteractiveMessage with image header.
 *
 * Fallback chain:
 *   1. Rich interactive (image + buttons combined)   ← main fix
 *   2. Image + caption only (if buttons fail)
 *   3. Plain text (if image also fails)
 */
async function sendMenuWithPic(sock, msg, menuText, menuButtons) {
  const jid = msg.key.remoteJid;
  const buttons = Array.isArray(menuButtons) ? menuButtons : [];

  try {
    if (fs.existsSync(BOT_PIC_PATH)) {
      const imageBuffer = fs.readFileSync(BOT_PIC_PATH);

      // ── Try ONE rich message: image + buttons + adReply ──────────────────
      if (buttons.length) {
        try {
          const { sendRichInteractive } = await import('../handlers/gktwAdapter.js');
          return await sendRichInteractive(sock, jid, {
            header:  sock.user?.name || 'NIX',
            body:    menuText,
            footer:  'NIX Assistant',
            buttons,
            image:   imageBuffer,
            quoted:  msg,
          });
        } catch {}
      }

      // ── Fallback: image + caption only (no buttons) ───────────────────────
      await sock.sendMessage(jid, {
        image:   imageBuffer,
        caption: menuText,
        mimetype: 'image/jpeg',
      }, { quoted: msg });

      // Send buttons as separate text if rich path failed
      if (buttons.length) {
        const btnLines = buttons.map((b, i) => `[${i + 1}] ${b.text}`).join('\n');
        await sock.sendMessage(jid, { text: btnLines }, {});
      }
    } else {
      // No pic file — plain text menu
      const extra = buttons.length
        ? '\n\n' + buttons.map((b, i) => `[${i + 1}] ${b.text}`).join('\n')
        : '';
      await sock.sendMessage(jid, { text: menuText + extra }, { quoted: msg });
    }
  } catch {
    // Last-resort: plain text
    try { await sock.sendMessage(jid, { text: menuText }, { quoted: msg }); } catch {}
  }
}

// ── Owner JID detection ──────────────────────────────────────────────────────
/**
 * Returns true if the message sender is the bot owner.
 *
 * Detection priority:
 *   1. NIX_OWNER_JID env var   — explicit number match (most reliable)
 *   2. msg.key.fromMe === true — bot's own account (Baileys multi-device)
 *   3. Self-chat: remoteJid matches sock.user.id number
 *   4. Safe default: true      — Nix is owner-only by design
 *
 * To enable non-owner denial in groups: set NIX_OWNER_JID=<your_number>
 */
function isSenderOwner(msg, sock) {
  try {
    const ownerJid = (process.env.NIX_OWNER_JID || '').trim();
    if (ownerJid) {
      const norm = (j) => String(j || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
      // In groups, participant is the real sender; in DMs it's remoteJid
      const sender = msg.key.participant || msg.key.remoteJid || '';
      if (norm(sender) === norm(ownerJid)) return true;
      // If set but doesn't match → non-owner
      return false;
    }
    // fromMe = true means the bot's account sent it (self-message or own device)
    if (msg.key.fromMe === true) return true;
    // Self-chat: DM to own number
    const selfNum = sock?.user?.id
      ? String(sock.user.id).split(':')[0].split('@')[0]
      : null;
    const remoteNum = String(msg.key.remoteJid || '').split('@')[0];
    if (selfNum && selfNum === remoteNum) return true;
  } catch {}
  // Safe default: assume owner (backward-compatible — Nix was always owner-only)
  return true;
}

/**
 * Returns true if this is a private/DM chat (not a group)
 */
function isPrivateChat(msg) {
  return !String(msg?.key?.remoteJid || '').endsWith('@g.us');
}

// ── Owner-restricted intents ─────────────────────────────────────────────────
// Non-owners get a personality-driven denial for these instead of robotic block
const OWNER_ONLY = new Set([
  'kick','closegroup','opengroup','promote','demote','block','unblock',
  'mutechat','unmutechat','textcontact','forward','deletemsg','addcontact',
  'setstatus','clearstatus','leavegroup','revokelink','tagall','groupinvite',
  'autoview','autolike','autotyping','autorecording','autoread','autobio','autoreact',
  'repair','cleanup','nixreset','sessions','diagnose','setnixowner',
]);

// Intents that skip pre-reaction (formatting-heavy responses, pre-react adds noise)
const SKIP_PRE_REACT = new Set(['menu','help','setnixowner','unknown']);

// Intents that skip after-comment (quick utility, no need for follow-up)
const SKIP_AFTER_COMMENT = new Set(['menu','help','setnixowner','ping','unknown']);

// ── Main Nix handler ─────────────────────────────────────────────────────────
/**
 * Call this from your messages.upsert handler BEFORE your main cmd() processing.
 * Works for both private chats and group messages.
 *
 * @param {object} sock - Baileys socket
 * @param {object} msg  - Message object
 * @returns {boolean}   - true if Nix handled the message, false to pass on
 */
export async function nixHandler(sock, msg) {
  try {
    const body = extractBody(msg);
    if (!body) return false;

    const parsed = parseNixMessage(body);
    if (!parsed) return false;

    incrementStat('commands');

    const isOwner   = isSenderOwner(msg, sock);
    const isPrivate = isPrivateChat(msg);
    const usage     = trackUsage(parsed.intent);

    // ── PRIORITY SYSTEM ──────────────────────────────────────────────────────
    // 1. Safety / system-critical → always pass through
    // 2. Owner commands           → personality + execute
    // 3. Core commands            → personality + execute
    // 4. Natural language inputs  → personality + execute
    // 5. Spam / repeated inputs   → spam phrase inside preReactionText

    // ── LAYER 1: Emotional Reaction ──────────────────────────────────────────
    // 70% of responses get a pre-reaction; skipped for menu/help/etc.
    const shouldPreReact = !SKIP_PRE_REACT.has(parsed.intent) && Math.random() < 0.7;

    if (shouldPreReact) {
      const preText = preReactionText(parsed.intent, usage, isOwner, isPrivate);
      await nixPreReact(sock, msg, preText);
    }

    // ── LAYER 2: Execution ───────────────────────────────────────────────────
    let success = true;
    try {
      await route(sock, msg, parsed, isOwner);
    } catch {
      success = false;
      incrementStat('errors');
      try {
        await sendNix(sock, msg, `${errorText()}${nixFooter()}`);
      } catch {}
    }

    // ── LAYER 3: After-Comment ───────────────────────────────────────────────
    // 60% chance; skipped for menu/ping/etc.
    if (!SKIP_AFTER_COMMENT.has(parsed.intent)) {
      const comment = afterCommentText(success);
      if (comment) await nixAfterComment(sock, msg, comment);
    }

    return true;

  } catch {
    incrementStat('errors');
    try { await sendNix(sock, msg, `${errorText()}${nixFooter()}`); } catch {}
    return true; // consumed — don't fall through to main bot
  }
}

// ── Message body extractor ───────────────────────────────────────────────────
function extractBody(msg) {
  const m = msg?.message;
  if (!m) return null;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.templateButtonReplyMessage?.selectedId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    null
  );
}

function _onOff(args) {
  const v = (args?.[0] || '').toLowerCase();
  if (['on','1','enable','true','start','activate','yes','y'].includes(v)) return true;
  if (['off','0','disable','false','stop','deactivate','no','n'].includes(v)) return false;
  return undefined; // toggle
}

// ── Command router ───────────────────────────────────────────────────────────
async function route(sock, msg, { intent, args, raw }, isOwner) {
  const owner = getOwnerName();

  // Non-owner trying owner-only commands → personality denial (never robotic)
  if (!isOwner && OWNER_ONLY.has(intent)) {
    await reactNix(sock, msg, '😭');
    await sendNix(sock, msg, `${denialText()}${nixFooter()}`);
    return;
  }

  switch (intent) {

    // ── META ─────────────────────────────────────────────────────────────────
    case 'menu':
      await reactNix(sock, msg, '🧠');
      await sendMenuWithPic(sock, msg, buildMainMenu(), [
        { text: '👤 Account',     id: 'nix_account'      },
        { text: '💬 Messaging',   id: 'nix_messaging'    },
        { text: '🤖 AI',          id: 'nix_ai'           },
        { text: '🎵 Media',       id: 'nix_media'        },
        { text: '📊 System',      id: 'nix_system'       },
        { text: 'ℹ️ Info',         id: 'nix_info'         },
      ]);
      break;

    case 'help': {
      const cat = args[0]?.toLowerCase();
      const catHelp = buildCategoryHelp(cat);
      if (catHelp) {
        await sendNix(sock, msg, catHelp + nixFooter());
      } else {
        await sendMenuWithPic(sock, msg, buildMainMenu(), [
          { text: '👤 Account',   id: 'nix_account'      },
          { text: '💬 Messaging', id: 'nix_messaging'    },
          { text: '🤖 AI',        id: 'nix_ai'           },
          { text: '🎵 Media',     id: 'nix_media'        },
          { text: '📊 System',    id: 'nix_system'       },
          { text: 'ℹ️ Info',       id: 'nix_info'         },
        ]);
      }
      break;
    }

    case 'setnixowner': {
      const name = args.join(' ') || raw;
      if (!name) {
        await sendNix(sock, msg, `⚠️ Usage: \`.setnixowner <name>\`\nExample: \`.setnixowner Precious\`${nixFooter()}`);
        break;
      }
      const saved = setOwnerName(name);
      await reactNix(sock, msg, '✅');
      await sendNix(sock, msg, saved
        ? `✅ *Owner name set!*\n\nNix will now call you *${name}*.\nTest: \`.nix contacts\`${nixFooter()}`
        : `⚠️ Name saved in memory but file write failed.\n_Check write permissions for owner.json_${nixFooter()}`
      );
      break;
    }

    // ── ACCOUNT ──────────────────────────────────────────────────────────────
    case 'contacts':      { const m = await getAccount(); await m.contacts(sock, msg); break; }
    case 'groups':        { const m = await getAccount(); await m.groups(sock, msg); break; }
    case 'unread':        { const m = await getAccount(); await m.unread(sock, msg); break; }
    case 'accountreport': { const m = await getAccount(); await m.accountReport(sock, msg); break; }
    case 'blocked':       { const m = await getAccount(); await m.blocked(sock, msg); break; }
    case 'archived':      { const m = await getAccount(); await m.archived(sock, msg); break; }
    case 'setstatus':     { const m = await getAccount(); await m.setStatus(sock, msg, args); break; }

    // ── GROUP INTELLIGENCE ───────────────────────────────────────────────────
    case 'listgroups':     { const m = await getGroups(); await m.listGroups(sock, msg); break; }
    case 'groupstats':     { const m = await getGroups(); await m.groupStats(sock, msg); break; }
    case 'activegroups':   { const m = await getGroups(); await m.activeGroups(sock, msg); break; }
    case 'inactivegroups': { const m = await getGroups(); await m.inactiveGroups(sock, msg); break; }
    case 'members':        { const m = await getGroups(); await m.members(sock, msg); break; }
    case 'groupsummary':   { const m = await getGroups(); await m.groupSummary(sock, msg); break; }
    case 'tagall':         { const m = await getGroups(); await m.tagAll(sock, msg, args); break; }
    case 'groupinvite':    { const m = await getGroups(); await m.groupInvite(sock, msg); break; }
    case 'revokelink':     { const m = await getGroups(); await m.revokeInvite(sock, msg); break; }
    case 'leavegroup':     { const m = await getGroups(); await m.leaveGroup(sock, msg); break; }

    // ── WHATSAPP MANAGEMENT ──────────────────────────────────────────────────
    case 'kick':        { const m = await getWhatsapp(); await m.kick(sock, msg, args); break; }
    case 'closegroup':  { const m = await getWhatsapp(); await m.closeGroup(sock, msg); break; }
    case 'opengroup':   { const m = await getWhatsapp(); await m.openGroup(sock, msg); break; }
    case 'mutechat':    { const m = await getWhatsapp(); await m.muteChat(sock, msg, args); break; }
    case 'unmutechat':  { const m = await getWhatsapp(); await m.unmuteChat(sock, msg); break; }
    case 'promote':     { const m = await getWhatsapp(); await m.promote(sock, msg, args); break; }
    case 'demote':      { const m = await getWhatsapp(); await m.demote(sock, msg, args); break; }
    case 'textcontact': { const m = await getWhatsapp(); await m.textContact(sock, msg, args); break; }
    case 'block':       { const m = await getWhatsapp(); await m.blockContact(sock, msg, args); break; }
    case 'unblock':     { const m = await getWhatsapp(); await m.unblockContact(sock, msg, args); break; }
    case 'addcontact':  { const m = await getWhatsapp(); await m.addContact(sock, msg, args); break; }
    case 'forward':     { const m = await getWhatsapp(); await m.forwardMsg(sock, msg, args); break; }
    case 'deletemsg':   { const m = await getWhatsapp(); await m.deleteMsg(sock, msg, args); break; }
    case 'clearstatus': { const m = await getWhatsapp(); await m.clearStatus(sock, msg); break; }

    // ── AUTO-FEATURE TOGGLES ─────────────────────────────────────────────────
    case 'autoview':      { const m = await getAutoFeat(); await m.setAuto(sock, msg, 'viewStatus',  _onOff(args)); break; }
    case 'autolike':      { const m = await getAutoFeat(); await m.setAuto(sock, msg, 'reactStatus', _onOff(args)); break; }
    case 'autotyping':    { const m = await getAutoFeat(); await m.setAuto(sock, msg, 'typing',      _onOff(args)); break; }
    case 'autorecording': { const m = await getAutoFeat(); await m.setAuto(sock, msg, 'recording',   _onOff(args)); break; }
    case 'autoread':      { const m = await getAutoFeat(); await m.setAuto(sock, msg, 'autoread',    _onOff(args)); break; }
    case 'autobio':       { const m = await getAutoFeat(); await m.setAuto(sock, msg, 'autobio',     _onOff(args)); break; }
    case 'autoreact':     { const m = await getAutoFeat(); await m.setAuto(sock, msg, 'autoreact',   _onOff(args)); break; }

    // ── AI ASSISTANT ─────────────────────────────────────────────────────────
    case 'aichat':    { incrementStat('aiRequests'); const m = await getAi(); await m.aiChat(sock, msg, args); break; }
    case 'summarize': { incrementStat('aiRequests'); const m = await getAi(); await m.summarize(sock, msg, args); break; }
    case 'rewrite':   { incrementStat('aiRequests'); const m = await getAi(); await m.rewrite(sock, msg, args); break; }
    case 'translate': { incrementStat('aiRequests'); const m = await getAi(); await m.translate(sock, msg, args); break; }
    case 'explain':   { incrementStat('aiRequests'); const m = await getAi(); await m.explain(sock, msg, args); break; }
    case 'poem':      { incrementStat('aiRequests'); const m = await getAi(); await m.poem(sock, msg, args); break; }
    case 'story':     { incrementStat('aiRequests'); const m = await getAi(); await m.story(sock, msg, args); break; }
    case 'code':      { incrementStat('aiRequests'); const m = await getAi(); await m.code(sock, msg, args); break; }
    case 'fixcode':   { incrementStat('aiRequests'); const m = await getAi(); await m.fixCode(sock, msg, args); break; }
    case 'roast':     { incrementStat('aiRequests'); const m = await getAi(); await m.roast(sock, msg, args); break; }
    case 'define':    { incrementStat('aiRequests'); const m = await getAi(); await m.define(sock, msg, args); break; }
    case 'synonym':   { incrementStat('aiRequests'); const m = await getAi(); await m.synonym(sock, msg, args); break; }

    // ── MEDIA ────────────────────────────────────────────────────────────────
    case 'download':     { incrementStat('downloads'); const m = await getMedia(); await m.download(sock, msg, args); break; }
    case 'viewonce':     { const m = await getMedia(); await m.viewOnce(sock, msg); break; }
    case 'saveviewonce': { const m = await getMedia(); await m.viewOnce(sock, msg); break; }
    case 'gif':          { const m = await getMedia(); await m.gif(sock, msg, args); break; }
    case 'meme':         { const m = await getMedia(); await m.meme(sock, msg); break; }
    case 'lastmedia':    { const m = await getMedia(); await m.lastMedia(sock, msg, args); break; }
    case 'mediafrom':    { const m = await getMedia(); await m.mediaFrom(sock, msg, args); break; }
    case 'mediasent':    { const m = await getMedia(); await m.mediaSent(sock, msg, args); break; }

    // ── SYSTEM ───────────────────────────────────────────────────────────────
    case 'uptime':    { const m = await getSystem(); await m.uptime(sock, msg); break; }
    case 'ping':      { const m = await getSystem(); await m.ping(sock, msg); break; }
    case 'health':    { const m = await getSystem(); await m.health(sock, msg); break; }
    case 'logs':      { const m = await getSystem(); await m.logs(sock, msg); break; }
    case 'version':   { const m = await getSystem(); await m.version(sock, msg); break; }
    case 'nixstats':  { const m = await getSystem(); await m.nixStats(sock, msg); break; }
    case 'nixreset':  { const m = await getSystem(); await m.nixReset(sock, msg); break; }
    case 'sessions':  { const m = await getSystem(); await m.sessions(sock, msg); break; }
    case 'diagnose':  { const m = await getSystem(); await m.diagnose(sock, msg); break; }
    case 'repair':    { const m = await getSystem(); await m.repair(sock, msg); break; }
    case 'cleanup':   { const m = await getSystem(); await m.cleanup(sock, msg); break; }

    // ── INFO & WEB ───────────────────────────────────────────────────────────
    case 'weather':   { const m = await getInfo(); await m.weather(sock, msg, args); break; }
    case 'news':      { const m = await getInfo(); await m.news(sock, msg); break; }
    case 'wiki':      { const m = await getInfo(); await m.wiki(sock, msg, args); break; }
    case 'search':    { const m = await getInfo(); await m.search(sock, msg, args); break; }
    case 'fact':      { const m = await getInfo(); await m.fact(sock, msg); break; }
    case 'joke':      { const m = await getInfo(); await m.joke(sock, msg); break; }
    case 'quote':     { const m = await getInfo(); await m.quote(sock, msg); break; }
    case 'calculate': { const m = await getInfo(); await m.calculate(sock, msg, args); break; }
    case 'myip':      { const m = await getInfo(); await m.myIp(sock, msg); break; }

    // ── PRODUCTIVITY ─────────────────────────────────────────────────────────
    case 'note':      { const m = await getProductivity(); await m.addNote(sock, msg, args); break; }
    case 'viewnotes': { const m = await getProductivity(); await m.viewNotes(sock, msg); break; }
    case 'todo':      { const m = await getProductivity(); await m.addTodo(sock, msg, args); break; }
    case 'viewtodos': { const m = await getProductivity(); await m.viewTodos(sock, msg); break; }
    case 'remind':    { const m = await getProductivity(); await m.setReminder(sock, msg, args); break; }

    // ── CONTACT INTELLIGENCE ─────────────────────────────────────────────────
    case 'profile':      { const m = await getContact(); await m.profile(sock, msg, args); break; }
    case 'contactabout': { const m = await getContact(); await m.contactAbout(sock, msg, args); break; }
    case 'lastseen':     { const m = await getContact(); await m.lastSeen(sock, msg, args); break; }
    case 'isonline':     { const m = await getContact(); await m.isOnline(sock, msg, args); break; }
    case 'contactinfo':  { const m = await getContact(); await m.contactInfo(sock, msg, args); break; }
    case 'lastmsg':      { const m = await getContact(); await m.lastMsg(sock, msg, args); break; }
    case 'firstmsg':     { const m = await getContact(); await m.firstMsg(sock, msg, args); break; }
    case 'msgcount':     { const m = await getContact(); await m.msgCount(sock, msg, args); break; }
    case 'searchmsg':    { const m = await getContact(); await m.searchMsg(sock, msg, args); break; }
    case 'deletedmsg':   { const m = await getContact(); await m.deletedMsg(sock, msg); break; }
    case 'editedmsg':    { const m = await getContact(); await m.editedMsg(sock, msg); break; }
    case 'mostactive':   { const m = await getContact(); await m.mostActive(sock, msg); break; }
    case 'leastactive':  { const m = await getContact(); await m.leastActive(sock, msg); break; }
    case 'chatreport':   { const m = await getContact(); await m.chatReport(sock, msg, args); break; }
    case 'streak':       { const m = await getContact(); await m.streak(sock, msg, args); break; }
    case 'lastcall':     { const m = await getContact(); await m.lastCall(sock, msg); break; }
    case 'missedcalls':  { const m = await getContact(); await m.missedCalls(sock, msg); break; }
    case 'callhistory':  { const m = await getContact(); await m.lastCall(sock, msg); break; }
    case 'lastdoc':      { const m = await getContact(); await m.lastDoc(sock, msg, args); break; }
    case 'finddoc':      { const m = await getContact(); await m.findDoc(sock, msg, args); break; }
    case 'responsetime': { const m = await getContact(); await m.responseTime(sock, msg, args); break; }

    // ── UNKNOWN ──────────────────────────────────────────────────────────────
    default:
    case 'unknown':
      await reactNix(sock, msg, '❓');
      await sendNix(sock, msg,
        `❓ *Nix — hm?*\n\n${owner}, I didn't catch that one.\n\n• \`.nix menu\` — see everything I can do\n• \`.nix ai <question>\` — ask me anything\n• _"Nix count my contacts"_\n• _"Nix close this group"_${nixFooter()}`
      );
      break;
  }
}
