#!/usr/bin/env node
/**
 * MAIS MDX — auto-patcher (runs before server start via package.json "start" script)
 * Safe to run on every deploy — all fixes are idempotent (skip if already applied).
 */
'use strict';
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1 — SyntaxError: Invalid regular expression in mias/index.js
// A regex literal was split across two lines which crashes Node on ESM load.
// ─────────────────────────────────────────────────────────────────────────────
(function fixMiasIndex() {
  const target = path.join(__dirname, 'mias', 'index.js');
  if (!fs.existsSync(target)) return;

  let src = fs.readFileSync(target, 'utf8');

  // Already patched?
  if (src.includes('[\\x00-\\x1f\\x7f]') || src.includes('[\\u0000-\\u001f\\u007f]')) {
    console.log('[fix_all] mias/index.js — already patched, skip.');
    return;
  }

  const lines = src.split('\n');
  let fixed = false;

  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    // Detect open regex: line ends with /[ -   (no closing slash on same line)
    if (/\/\[ -\s*$/.test(a)) {
      const bTrim = b.trimStart();
      // Next line closes it: -]/  or  -]./  etc.
      if (bTrim.startsWith('-]/') || bTrim.startsWith('-]\\') || bTrim.startsWith('-] ')) {
        const openIdx = a.lastIndexOf('/[ -');
        const closeEnd = b.indexOf(']/') + 2;   // include the closing /
        const restOfB  = b.slice(closeEnd);
        lines[i]   = a.slice(0, openIdx) + '/[\\x00-\\x1f\\x7f]/' + restOfB;
        lines[i + 1] = '';
        fixed = true;
        console.log('[fix_all] mias/index.js — fixed multi-line regex at line ' + (i + 1) + '.');
        break;
      }
    }
  }

  if (!fixed) {
    // Fallback: raw two-line string search
    const broken = '/[ -\n-]/';
    const idx = src.indexOf(broken);
    if (idx !== -1) {
      src = src.slice(0, idx) + '/[\\x00-\\x1f\\x7f]/' + src.slice(idx + broken.length);
      fs.writeFileSync(target, src, 'utf8');
      console.log('[fix_all] mias/index.js — fixed multi-line regex (raw match).');
      return;
    }
    console.log('[fix_all] mias/index.js — broken regex not found (may already be fixed).');
    return;
  }

  fs.writeFileSync(target, lines.join('\n'), 'utf8');
})();


// ─────────────────────────────────────────────────────────────────────────────
// FIX 2 — Telegram 409 Conflict in bot.js
// Bot used autoStart:true causing 409 on Railway redeploys.
// Replaced with: deleteWebHook → 5s delay → startPolling, with 409 retry logic.
// ─────────────────────────────────────────────────────────────────────────────
(function fixBotJs() {
  const target = path.join(__dirname, 'bot.js');
  if (!fs.existsSync(target)) return;

  let src = fs.readFileSync(target, 'utf8');

  // Already patched?
  if (src.includes('_restartPollingAfterConflict') || src.includes('autoStart: false')) {
    console.log('[fix_all] bot.js — already patched, skip.');
    return;
  }

  let changed = 0;

  // Fix 2a: disable autoStart
  src = src.replace(
    /new TelegramBot\(BOT_TOKEN,\s*\{\s*polling:\s*\{[^}]*autoStart:\s*true[^}]*\}\s*\}\)/,
    `new TelegramBot(BOT_TOKEN, { polling: { interval: 1500, autoStart: false, params: { timeout: 10 } } })`
  );
  changed++;

  // Fix 2b: replace the polling_error handler block
  // Find start marker
  const startMarker = '// Suppress poll errors';
  const startIdx = src.indexOf(startMarker);
  if (startIdx !== -1) {
    // Find the closing }); of the bot.on('polling_error'...) block
    const after = src.slice(startIdx);
    const closeIdx = after.indexOf('\n});');
    if (closeIdx !== -1) {
      const oldBlock = after.slice(0, closeIdx + '\n});'.length);
      const newBlock = `// ── Telegram polling — 409-safe startup ─────────────────────────────────────
let _tgPollWarnedOnce = false;
let _tgRestarting     = false;

async function _restartPollingAfterConflict(delayMs) {
  delayMs = delayMs || 14000;
  if (_tgRestarting) return;
  _tgRestarting = true;
  console.warn(chalk.yellow('[Telegram] 409 conflict — waiting ' + Math.round(delayMs / 1000) + 's for old instance to stop...'));
  try { await bot.stopPolling(); } catch (_e) {}
  await new Promise(function (r) { setTimeout(r, delayMs); });
  try {
    await bot.startPolling({ restart: false });
    console.log(chalk.green('[Telegram] Polling restarted successfully after 409.'));
  } catch (e2) {
    console.error(chalk.red('[Telegram] Failed to restart after 409:'), e2.message);
  }
  _tgRestarting = false;
}

bot.on('polling_error', function (err) {
  if (err.code === 'EFATAL' || (err.message && err.message.includes('EFATAL'))) return;

  var code = (err.response && err.response.statusCode) ||
             (err.response && err.response.body && err.response.body.error_code);
  var msg  = String(err.message || err.code || '');

  var is409 = code === 409 || msg.indexOf('409') !== -1 || msg.toLowerCase().indexOf('conflict') !== -1;
  if (is409) { _restartPollingAfterConflict(14000).catch(function () {}); return; }

  var is401 = code === 401 || msg.indexOf('401') !== -1;
  if (is401) {
    if (!_tgPollWarnedOnce) {
      _tgPollWarnedOnce = true;
      console.warn(chalk.yellow('[Telegram] Token invalid (401) — bot OFFLINE. Fix: update TELEGRAM_BOT_TOKEN in Railway Variables.'));
      try { bot.stopPolling(); } catch (_e) {}
    }
    return;
  }

  if (!_tgPollWarnedOnce) { console.error(chalk.red('[Telegram] polling error:'), msg || err); }
});

// Delete any stale webhook, wait 5 s, then start polling safely
(async function _safePollStart() {
  try { await bot.deleteWebHook(); } catch (_e) {}
  await new Promise(function (r) { setTimeout(r, 5000); });
  try {
    await bot.startPolling({ restart: false });
    console.log(chalk.green('[Telegram] Polling started.'));
  } catch (e) {
    var m = String(e.message || '');
    if (m.indexOf('409') !== -1 || m.toLowerCase().indexOf('conflict') !== -1) {
      await _restartPollingAfterConflict(16000);
    } else {
      console.error(chalk.red('[Telegram] startPolling failed:'), m);
    }
  }
})();`;

      src = src.slice(0, startIdx) + newBlock + src.slice(startIdx + oldBlock.length);
      changed++;
      console.log('[fix_all] bot.js — replaced polling handler with 409-safe version.');
    }
  }

  if (changed > 0) {
    fs.writeFileSync(target, src, 'utf8');
    console.log('[fix_all] bot.js — patched (' + changed + ' change(s)).');
  }
})();

console.log('[fix_all] Done.\n');
