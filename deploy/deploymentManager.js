'use strict';
/**
 * MIAS Deployment Manager
 *
 * Scans bots/ for manifest.json files, sends the WhatsApp selection menu,
 * waits for the user's choice, reports progress, and launches the chosen bot.
 *
 * FIXED (was broken):
 *   1. JID MISMATCH — pending selections were keyed by bare phone number
 *      (from pair.js) but looked up by full JID (from Baileys). No selection
 *      ever matched, so every deploy hit the timeout branch.
 *   2. TIMEOUT AUTO-PICKED bots[0] (= MIAS MDX). Deployment is now never
 *      chosen for the user: the menu is re-sent on a reminder interval and
 *      the flow gives up without launching anything if the user never answers.
 *   3. EMPTY-TEXT MATCHED EVERYTHING — `b.id.includes('')` is always true, so
 *      any non-text event (sticker, reaction, protocol message) resolved to
 *      the first bot. Matching is now strict.
 *   4. Wrapped messages (ephemeral / viewOnce) were never unwrapped, so real
 *      button replies were missed.
 */

const fs    = require('fs');
const path  = require('path');
const chalk = require('chalk');

const { jidKey, toJid } = require('./jid');

const BOTS_DIR        = path.join(__dirname, '..', 'bots');
const SELECTIONS_FILE = path.join(__dirname, '..', 'nexstore', 'bot_selections.json');

// How often to re-send the menu while waiting, and when to give up entirely.
const REMINDER_MS = 3 * 60 * 1000;   // re-prompt every 3 minutes
const GIVE_UP_MS  = 30 * 60 * 1000;  // stop waiting after 30 minutes

// digitsOnlyKey -> { resolve, timer, reminder }
const _pendingSelections = new Map();

let _botCache = null;

// ── Bot discovery ────────────────────────────────────────────────────────────
function scanBots() {
  if (_botCache) return _botCache;
  const result = [];
  try {
    if (!fs.existsSync(BOTS_DIR)) {
      console.warn(chalk.yellow('[DeployMgr] bots/ not found — using defaults'));
      _botCache = _getDefaultBots();
      return _botCache;
    }
    for (const entry of fs.readdirSync(BOTS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const mf = path.join(BOTS_DIR, entry.name, 'manifest.json');
      if (!fs.existsSync(mf)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
        if (manifest.id && manifest.name) result.push(manifest);
      } catch (e) {
        console.warn(chalk.yellow(`[DeployMgr] Skipping ${entry.name}: ${e.message}`));
      }
    }
    result.sort((a, b) => {
      const order = { stable: 0, beta: 1, experimental: 2 };
      const ao = order[a.status] ?? 9;
      const bo = order[b.status] ?? 9;
      return ao !== bo ? ao - bo : a.name.localeCompare(b.name);
    });
  } catch (e) {
    console.error(chalk.red(`[DeployMgr] scanBots error: ${e.message}`));
    _botCache = _getDefaultBots();
    return _botCache;
  }
  _botCache = result.length ? result : _getDefaultBots();
  return _botCache;
}

function clearBotCache() { _botCache = null; }

function _getDefaultBots() {
  return [
    {
      id: 'mias-mdx', name: 'MIAS MDX', tagline: 'Stable • Full Features',
      version: '2.0.1', status: 'stable', entry: 'mias/index.js',
      env: { BOT_NAME: 'MIAS MDX' },
      deploySteps: ['Session created', 'Plugins loaded', 'Database initialized', 'Deployment complete'],
    },
    {
      id: 'new-page', name: 'New Page', tagline: 'Next Generation • Fast',
      version: '1.0.0', status: 'stable', entry: 'new-page/index.js', cwd: 'new-page',
      env: { BOT_NAME: 'New Page' },
      deploySteps: ['Framework initialized', 'Services loaded', 'Session created', 'Deployment complete'],
    },
  ];
}

function getBotById(id) {
  if (!id) return null;
  const wanted = String(id).replace(/^deploy:/, '').trim().toLowerCase();
  return scanBots().find(b => b.id.toLowerCase() === wanted) || null;
}

// ── Persisted selections ─────────────────────────────────────────────────────
function _readSelections() {
  try {
    if (fs.existsSync(SELECTIONS_FILE)) return JSON.parse(fs.readFileSync(SELECTIONS_FILE, 'utf8'));
  } catch {}
  return {};
}

function _writeSelection(userKey, botId) {
  try {
    const data = _readSelections();
    data[userKey] = { botId, chosenAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(SELECTIONS_FILE), { recursive: true });
    fs.writeFileSync(SELECTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(chalk.yellow(`[DeployMgr] Could not persist selection: ${e.message}`));
  }
}

function getStoredSelection(numberOrJid) {
  return _readSelections()[jidKey(numberOrJid)]?.botId || null;
}

// ── Message unwrapping ───────────────────────────────────────────────────────
function _unwrap(message, depth = 0) {
  if (!message || depth > 4) return message;
  if (message.ephemeralMessage)     return _unwrap(message.ephemeralMessage.message, depth + 1);
  if (message.viewOnceMessage)      return _unwrap(message.viewOnceMessage.message, depth + 1);
  if (message.viewOnceMessageV2)    return _unwrap(message.viewOnceMessageV2.message, depth + 1);
  if (message.viewOnceMessageV2Extension)
    return _unwrap(message.viewOnceMessageV2Extension.message, depth + 1);
  if (message.documentWithCaptionMessage)
    return _unwrap(message.documentWithCaptionMessage.message, depth + 1);
  return message;
}

/**
 * Pull a bot id out of any WhatsApp reply shape.
 * Returns a canonical bot id, or null when the message is not a valid choice.
 */
function _extractSelection(rawMessage) {
  const message = _unwrap(rawMessage);
  if (!message) return null;

  const bots = scanBots();
  const candidates = [];

  // 1. List reply
  const listReply = message.listResponseMessage?.singleSelectReply?.selectedRowId;
  if (listReply) candidates.push(listReply);

  // 2. Interactive / native flow reply
  const nf = message.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (nf?.paramsJson) {
    try {
      const parsed = JSON.parse(nf.paramsJson);
      for (const k of ['id', 'rowId', 'selected_id', 'selectedId']) {
        if (parsed?.[k]) candidates.push(parsed[k]);
      }
      // single_select nests the choice one level deeper on some clients
      const nested = parsed?.selectedRowId || parsed?.selected_row_id;
      if (nested) candidates.push(nested);
    } catch {}
  }

  // 3. Buttons / template replies
  if (message.buttonsResponseMessage?.selectedButtonId) {
    candidates.push(message.buttonsResponseMessage.selectedButtonId);
  }
  if (message.templateButtonReplyMessage?.selectedId) {
    candidates.push(message.templateButtonReplyMessage.selectedId);
  }

  // Any structured candidate must resolve to a real bot.
  for (const c of candidates) {
    const bot = getBotById(c);
    if (bot) return bot.id;
  }

  // 4. Typed reply — strict, and never matches empty/blank input.
  const text = (
    message.conversation ||
    message.extendedTextMessage?.text ||
    ''
  ).trim();

  if (!text) return null;

  // "1" / "2"
  if (/^\d{1,2}$/.test(text)) {
    const idx = parseInt(text, 10) - 1;
    if (idx >= 0 && idx < bots.length) return bots[idx].id;
    return null;
  }

  const lc = text.toLowerCase();
  // Exact id or exact name
  const exact = bots.find(b => b.id.toLowerCase() === lc || b.name.toLowerCase() === lc);
  if (exact) return exact.id;

  // Whole-word-ish partial: require at least 3 characters so stray chatter
  // cannot silently pick a bot.
  if (lc.length >= 3) {
    const partial = bots.filter(
      b => b.name.toLowerCase().includes(lc) || b.id.toLowerCase().includes(lc)
    );
    if (partial.length === 1) return partial[0].id;
  }

  return null;
}

/**
 * Called from pair.js `messages.upsert`.
 * @returns {boolean} true when the message was consumed by the deploy flow.
 */
function handleIncomingMessage(numberOrJid, rawMessage) {
  const key = jidKey(numberOrJid);
  if (!key) return false;

  const entry = _pendingSelections.get(key);
  if (!entry) return false;

  const selectedId = _extractSelection(rawMessage);
  if (!selectedId) return false; // let the normal command pipeline handle it

  clearTimeout(entry.timer);
  clearInterval(entry.reminder);
  _pendingSelections.delete(key);
  entry.resolve(selectedId);
  return true;
}

/** True while we are waiting on this user to pick a bot. */
function isAwaitingSelection(numberOrJid) {
  return _pendingSelections.has(jidKey(numberOrJid));
}

/** Cancel a pending wait (e.g. the socket dropped). */
function cancelSelection(numberOrJid) {
  const key = jidKey(numberOrJid);
  const entry = _pendingSelections.get(key);
  if (!entry) return false;
  clearTimeout(entry.timer);
  clearInterval(entry.reminder);
  _pendingSelections.delete(key);
  entry.resolve(null);
  return true;
}

// ── Wait for the user's choice — never guesses on their behalf ───────────────
function _waitForSelection(userKey, onRemind) {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      const e = _pendingSelections.get(userKey);
      if (e) clearInterval(e.reminder);
      _pendingSelections.delete(userKey);
      resolve(null); // null == no choice made; caller must NOT pick for them
    }, GIVE_UP_MS);

    const reminder = setInterval(() => {
      Promise.resolve()
        .then(onRemind)
        .catch(e => console.warn(chalk.yellow(`[DeployMgr] Reminder failed: ${e.message}`)));
    }, REMINDER_MS);

    if (typeof timer.unref === 'function') timer.unref();
    if (typeof reminder.unref === 'function') reminder.unref();

    _pendingSelections.set(userKey, { resolve, timer, reminder });
  });
}

// ── Core deployment flow ─────────────────────────────────────────────────────
/**
 * @param {object} nexus        Baileys pairing socket
 * @param {string} numberOrJid  Bare number (pair.js) or full JID
 * @param {object} tracker      rentbotTracker entry
 * @param {string} sessionDir   Absolute session path
 * @param {object} launcher     mais_launcher module
 */
async function startDeploymentFlow(nexus, numberOrJid, tracker, sessionDir, launcher) {
  const bots    = scanBots();
  const userKey = jidKey(numberOrJid);
  const jid     = toJid(numberOrJid);

  const { sendBotSelectionMenu } = require('./botSelector');
  const { reportDeployProgress } = require('./progressReporter');

  if (!userKey || !jid) {
    console.error(chalk.red(`[DeployMgr] Bad recipient "${numberOrJid}" — aborting`));
    return null;
  }

  console.log(chalk.cyan(`[DeployMgr] Bot selection started for ${jid}`));

  // Register the waiter BEFORE sending the menu, otherwise a very fast tap
  // arrives while no listener exists and the reply is dropped.
  const selectionPromise = _waitForSelection(userKey, async () => {
    console.log(chalk.gray(`[DeployMgr] Re-sending menu to ${jid}`));
    await sendBotSelectionMenu(nexus, jid, bots);
  });

  const delivered = await sendBotSelectionMenu(nexus, jid, bots).catch(e => {
    console.error(chalk.red(`[DeployMgr] Menu send failed: ${e.message}`));
    return false;
  });

  if (!delivered) {
    // Could not show any menu at all — do not silently deploy something.
    console.error(chalk.red(`[DeployMgr] No menu delivered to ${jid}; not deploying`));
    cancelSelection(userKey);
    return null;
  }

  const selectedId = await selectionPromise;

  // ── No choice made: stop here. Never auto-pick. ────────────────────────────
  if (!selectedId) {
    console.log(chalk.yellow(`[DeployMgr] ${jid} never chose a bot — nothing deployed`));
    try {
      await nexus.sendMessage(jid, {
        text:
          `⌛ *Deployment cancelled*\n\n` +
          `You didn't choose a bot, so nothing was deployed.\n\n` +
          `Send *deploy* whenever you're ready and I'll show the menu again.`,
      });
    } catch {}
    return null;
  }

  const chosen = getBotById(selectedId);
  if (!chosen) {
    console.error(chalk.red(`[DeployMgr] Unknown bot id "${selectedId}" — not deploying`));
    return null;
  }

  console.log(chalk.green(`[DeployMgr] ${jid} chose: ${chosen.name} (${chosen.id})`));
  _writeSelection(userKey, chosen.id);

  try {
    await nexus.sendMessage(jid, { text: `✅ You chose *${chosen.name}*. Deploying now…` });
  } catch {}

  try {
    await reportDeployProgress(nexus, jid, chosen);
  } catch (e) {
    console.warn(chalk.yellow(`[DeployMgr] Progress report failed: ${e.message}`));
  }

  // ── Hand off: close the pairing socket, launch the chosen bot ─────────────
  try {
    console.log(chalk.cyan(`[DeployMgr] Handing ${jid} over to ${chosen.name}…`));
    if (tracker) tracker.handoffToMais = true;
    try { nexus.end(); } catch {}
    try { nexus.ws?.close(); } catch {}

    const envOverrides = {
      ...(chosen.env || {}),
      BOT_ENTRY: chosen.entry || 'mias/index.js',
      BOT_ID: chosen.id,
    };
    if (chosen.cwd) envOverrides.BOT_CWD = chosen.cwd;

    await launcher.launch(numberOrJid, sessionDir, envOverrides);
    console.log(chalk.green.bold(`🎉 ${chosen.name} active for ${jid}`));
    return chosen;
  } catch (e) {
    console.error(chalk.red(`[DeployMgr] Launch failed for ${jid}: ${e.message}`));
    return null;
  }
}

module.exports = {
  scanBots,
  clearBotCache,
  getBotById,
  getStoredSelection,
  handleIncomingMessage,
  isAwaitingSelection,
  cancelSelection,
  startDeploymentFlow,
};
