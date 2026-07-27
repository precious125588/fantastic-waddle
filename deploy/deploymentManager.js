'use strict';
/**
 * MIAS Deployment Manager
 *
 * Scans bots/ folder for manifest.json files, builds the WhatsApp
 * bot-selection menu dynamically, handles user selection, shows
 * step-by-step deployment progress, and launches the chosen bot.
 *
 * Architecture:
 *   pair.js (connection open)
 *       │
 *       ▼
 *   deploymentManager.startDeploymentFlow(nexus, jid, tracker, launcher)
 *       │
 *       ├── scanBots()  ← reads bots/ manifests
 *       │
 *       ├── botSelector.sendMenu()  ← WhatsApp Native Flow / list
 *       │
 *       ├── waitForSelection()  ← messages.upsert listener
 *       │
 *       ├── progressReporter.deploy()  ← step-by-step WA messages
 *       │
 *       └── launcher.launch(jid, sessionDir, envOverrides)
 */

const fs      = require('fs');
const path    = require('path');
const chalk   = require('chalk');

const BOTS_DIR       = path.join(__dirname, '..', 'bots');
const SELECTIONS_FILE = path.join(__dirname, '..', 'nexstore', 'bot_selections.json');

// ── In-memory state for pending selections ────────────────────────────────────
// jid → { resolve, reject, timeout }
const _pendingSelections = new Map();

// ── Bot manifest cache ────────────────────────────────────────────────────────
let _botCache = null;

/**
 * Scan bots/ directory and return all valid manifests.
 * Results are cached in memory — call clearBotCache() to refresh.
 * @returns {Array<object>}
 */
function scanBots() {
  if (_botCache) return _botCache;
  const result = [];
  try {
    if (!fs.existsSync(BOTS_DIR)) {
      console.warn(chalk.yellow('[DeployMgr] bots/ directory not found — using defaults'));
      return _getDefaultBots();
    }
    const entries = fs.readdirSync(BOTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
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
    // Sort: stable before beta, then alphabetically
    result.sort((a, b) => {
      const statusOrder = { stable: 0, beta: 1, experimental: 2 };
      const ao = statusOrder[a.status] ?? 9;
      const bo = statusOrder[b.status] ?? 9;
      return ao !== bo ? ao - bo : a.name.localeCompare(b.name);
    });
  } catch (e) {
    console.error(chalk.red(`[DeployMgr] scanBots error: ${e.message}`));
    return _getDefaultBots();
  }
  _botCache = result.length ? result : _getDefaultBots();
  return _botCache;
}

function clearBotCache() { _botCache = null; }

function _getDefaultBots() {
  return [
    {
      id: 'mias-mdx',
      name: 'MIAS MDX',
      tagline: 'Stable • Full Features',
      version: '2.0.1',
      status: 'stable',
      entry: 'mias/index.js',
      env: { BOT_NAME: 'MIAS MDX' },
      deploySteps: ['Session created', 'Plugins loaded', 'Database initialized', 'Deployment complete']
    },
    {
      id: 'new-page',
      name: 'New Page',
      tagline: 'Next Generation • Beta',
      version: '2.0.0-beta',
      status: 'beta',
      entry: 'mias/index.js',
      env: { BOT_NAME: 'New Page' },
      deploySteps: ['Framework initialized', 'Services loaded', 'Session created', 'Deployment complete']
    }
  ];
}

// ── Persisted selections (which bot each JID chose) ───────────────────────────
function _readSelections() {
  try {
    if (fs.existsSync(SELECTIONS_FILE)) return JSON.parse(fs.readFileSync(SELECTIONS_FILE, 'utf8'));
  } catch {}
  return {};
}
function _writeSelection(jid, botId) {
  try {
    const data = _readSelections();
    data[jid] = { botId, chosenAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(SELECTIONS_FILE), { recursive: true });
    fs.writeFileSync(SELECTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn(chalk.yellow(`[DeployMgr] Could not write selection: ${e.message}`));
  }
}
function getStoredSelection(jid) {
  return _readSelections()[jid]?.botId || null;
}

// ── Resolve bot by id ─────────────────────────────────────────────────────────
function getBotById(id) {
  return scanBots().find(b => b.id === id) || null;
}

// ── Handle incoming WhatsApp selection response ───────────────────────────────
/**
 * Call this from pair.js messages.upsert handler.
 * Returns true if the message was consumed by the deployment flow.
 */
function handleIncomingMessage(jid, message) {
  if (!_pendingSelections.has(jid)) return false;

  let selectedId = null;

  // 1. List response (single-select list menu)
  const listResp = message?.listResponseMessage;
  if (listResp?.singleSelectReply?.selectedRowId) {
    selectedId = listResp.singleSelectReply.selectedRowId;
  }

  // 2. Interactive response (native flow / button)
  const interactiveResp = message?.interactiveResponseMessage;
  if (!selectedId && interactiveResp) {
    try {
      const body = JSON.parse(interactiveResp.nativeFlowResponseMessage?.paramsJson || '{}');
      selectedId = body.id || body.rowId || body.selected_id || null;
    } catch {}
    if (!selectedId) selectedId = interactiveResp.nativeFlowResponseMessage?.name || null;
  }

  // 3. Buttons response
  const btnResp = message?.buttonsResponseMessage;
  if (!selectedId && btnResp?.selectedButtonId) {
    selectedId = btnResp.selectedButtonId;
  }

  // 4. Template button response
  const templateResp = message?.templateButtonReplyMessage;
  if (!selectedId && templateResp?.selectedId) {
    selectedId = templateResp.selectedId;
  }

  // 5. Plain text fallback (user types "1" or "2")
  if (!selectedId) {
    const bots = scanBots();
    const text = (message?.conversation || message?.extendedTextMessage?.text || '').trim();
    const num = parseInt(text, 10);
    if (num >= 1 && num <= bots.length) {
      selectedId = bots[num - 1].id;
    } else {
      // Try name match
      const lc = text.toLowerCase();
      const match = bots.find(b => b.name.toLowerCase().includes(lc) || b.id.includes(lc));
      if (match) selectedId = match.id;
    }
  }

  if (!selectedId) return false;

  const entry = _pendingSelections.get(jid);
  if (!entry) return false;

  clearTimeout(entry.timeout);
  _pendingSelections.delete(jid);
  entry.resolve(selectedId);
  return true;
}

// ── Core deployment flow ──────────────────────────────────────────────────────
/**
 * Main entry point called from pair.js after WhatsApp connection opens.
 *
 * @param {object}   nexus       — Raw Baileys socket (pairing socket)
 * @param {string}   jid         — User's WhatsApp JID (e.g. "2349...@s.whatsapp.net")
 * @param {object}   tracker     — rentbotTracker entry for this JID
 * @param {string}   sessionDir  — Absolute path to session directory
 * @param {object}   launcher    — mais_launcher module
 */
async function startDeploymentFlow(nexus, jid, tracker, sessionDir, launcher) {
  const bots = scanBots();
  const { sendBotSelectionMenu } = require('./botSelector');
  const { reportDeployProgress }  = require('./progressReporter');

  console.log(chalk.cyan(`[DeployMgr] Starting bot selection flow for ${jid}`));

  // ── Send the bot selection menu ──────────────────────────────────────────
  try {
    await sendBotSelectionMenu(nexus, jid, bots);
  } catch (e) {
    console.error(chalk.red(`[DeployMgr] Failed to send selection menu: ${e.message}`));
    // Fall through — user may still respond to a prior menu or we timeout and use default
  }

  // ── Wait for user's selection (60-second timeout → default to first bot) ──
  let selectedId;
  try {
    selectedId = await _waitForSelection(jid, 60000);
    console.log(chalk.green(`[DeployMgr] ${jid} selected: ${selectedId}`));
  } catch {
    // Timeout — default to first (most stable) bot
    selectedId = bots[0].id;
    console.log(chalk.yellow(`[DeployMgr] Timeout — defaulting to ${selectedId} for ${jid}`));
  }

  const chosen = getBotById(selectedId) || bots[0];

  // Persist selection
  _writeSelection(jid, chosen.id);

  // ── Send deployment progress ─────────────────────────────────────────────
  try {
    await reportDeployProgress(nexus, jid, chosen);
  } catch (e) {
    console.warn(chalk.yellow(`[DeployMgr] Progress report failed: ${e.message}`));
  }

  // ── Close pairing socket and launch chosen bot ───────────────────────────
  try {
    console.log(chalk.cyan(`[DeployMgr] Handing off ${jid} to ${chosen.name}…`));
    tracker.handoffToMais = true;
    try { nexus.end(); } catch {}
    try { nexus.ws?.close(); } catch {}

    // Build env overrides from the manifest
    const envOverrides = { ...(chosen.env || {}), BOT_ENTRY: chosen.entry || 'mias/index.js' };
    await launcher.launch(jid, sessionDir, envOverrides);
    console.log(chalk.green.bold(`🎉 ${chosen.name} active for: ${jid}`));
  } catch (e) {
    console.error(chalk.red(`[DeployMgr] Launch failed for ${jid}: ${e.message}`));
  }
}

function _waitForSelection(jid, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      _pendingSelections.delete(jid);
      reject(new Error('Selection timeout'));
    }, timeoutMs);
    _pendingSelections.set(jid, { resolve, reject, timeout });
  });
}

module.exports = {
  scanBots,
  clearBotCache,
  getBotById,
  getStoredSelection,
  handleIncomingMessage,
  startDeploymentFlow,
};
