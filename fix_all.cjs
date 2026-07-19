#!/usr/bin/env node
/**
 * MAIS MDX — auto-patcher (runs before server start via package.json "start" script)
 * Saved as .cjs so Node always treats it as CommonJS — works even if the project
 * has "type":"module" in package.json.
 * All fixes are idempotent — safe to run multiple times.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTIC HELPER — logs surrounding lines so Railway logs always show context
// ─────────────────────────────────────────────────────────────────────────────
function showContext(lines, lineIdx, label) {
  const start = Math.max(0, lineIdx - 3);
  const end   = Math.min(lines.length - 1, lineIdx + 3);
  console.log('[fix_all] ' + label + ':');
  for (let i = start; i <= end; i++) {
    console.log('  L' + (i + 1) + ': ' + JSON.stringify(lines[i]));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1 — SyntaxError: Invalid regular expression in mias/index.js
//
// The error is always at line ~1273:
//   if (_senderJid && /[ -       ← line 1273 (opens a regex but never closes it)
//   -]/)                          ← line 1274
//
// JavaScript forbids multi-line regex literals. We patch the file on disk
// before the server imports it. Four escalating strategies + a diagnostic dump.
// ─────────────────────────────────────────────────────────────────────────────
(function fixMiasRegex() {
  const target = path.join(__dirname, 'mias', 'index.js');
  if (!fs.existsSync(target)) {
    console.log('[fix_all] mias/index.js not found — skip.');
    return;
  }

  const raw = fs.readFileSync(target, 'utf8');

  // Guard: skip if we already patched it (look for our replacement, any spacing)
  if (/\/\[\\x00-\\x1f\\x7f\]/.test(raw) || /\/\[\\u0000-\\u001f\\u007f\]/.test(raw)) {
    console.log('[fix_all] mias/index.js — already patched, skip.');
    return;
  }

  // Normalise to LF so every strategy works uniformly
  const hasCRLF = raw.indexOf('\r\n') !== -1;
  let src = hasCRLF ? raw.replace(/\r\n/g, '\n') : raw;

  // ── DIAGNOSTIC: show what's actually around line 1273 ─────────────────────
  const diag = src.split('\n');
  const diagStart = Math.max(0, 1270);  // lines are 0-indexed, so 1273 → index 1272
  const diagEnd   = Math.min(diag.length - 1, 1277);
  console.log('[fix_all] mias/index.js context around line 1273:');
  for (let i = diagStart; i <= diagEnd; i++) {
    console.log('  L' + (i + 1) + ': ' + JSON.stringify(diag[i]));
  }

  let patched = false;

  // ── Strategy A: cross-line regex anchored to _senderJid (broad) ────────────
  // Matches: _senderJid [whitespace] && [whitespace] /[ <anything except />  up
  // to 200 chars including newlines >  ]/ 
  // Uses [\s\S] to cross line boundaries.
  if (!patched) {
    const before = src;
    src = src.replace(
      /(_senderJid[\s]*&&[\s]*)\/\[[\s\S]{0,200}?\]\//,
      (m, prefix) => {
        console.log('[fix_all] Strategy A matched: ' + JSON.stringify(m.slice(0, 120)));
        return prefix + '/[\\x00-\\x1f\\x7f]/';
      }
    );
    if (src !== before) patched = true;
  }

  // ── Strategy B: line-by-line, broad senderJid window (±30 lines) ──────────
  if (!patched) {
    const lines = src.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const a = lines[i];
      const b = lines[i + 1];

      // Find an unclosed /[ on this line
      const slashBracket = a.indexOf('/[');
      if (slashBracket === -1) continue;
      const afterOpen = a.slice(slashBracket + 2);
      // The regex must NOT be closed on the same line
      if (afterOpen.indexOf('/') !== -1) continue;

      // Check if _senderJid appears anywhere within ±30 lines
      const lo = Math.max(0, i - 30);
      const hi = Math.min(lines.length - 1, i + 30);
      let nearJid = false;
      for (let j = lo; j <= hi; j++) {
        if (lines[j].indexOf('senderJid') !== -1) { nearJid = true; break; }
      }
      if (!nearJid) continue;

      // Confirm next line closes with ]/
      if (!/\]\s*\//.test(b)) continue;

      showContext(lines, i, 'Strategy B found unclosed regex');

      const beforeRegex = a.slice(0, slashBracket);
      // Find where ]/  ends on line b
      const closeMatch = b.match(/^([\s\S]*?)\]\s*\//);
      const restOfB    = closeMatch ? b.slice(closeMatch[0].length) : '';

      lines[i]     = beforeRegex + '/[\\x00-\\x1f\\x7f]/' + restOfB;
      lines[i + 1] = '';
      console.log('[fix_all] Strategy B fixed line ' + (i + 1) + '.');
      patched = true;
      src = lines.join('\n');
      break;
    }
  }

  // ── Strategy C: raw string search — exhaustive variant list ──────────────
  if (!patched) {
    // Every plausible encoding of the broken two-line regex
    const candidates = [
      '/[ -\n-]/',
      '/[ -\r\n-]/',
      '/[ -\n -]/',
      '/[ -\r\n -]/',
      '/[\x20-\n-]/',
      '/[\x20-\r\n-]/',
      '/[\\x20-\n-]/',
    ];
    for (const cand of candidates) {
      const idx = src.indexOf(cand);
      if (idx !== -1) {
        src = src.slice(0, idx) + '/[\\x00-\\x1f\\x7f]/' + src.slice(idx + cand.length);
        console.log('[fix_all] Strategy C matched: ' + JSON.stringify(cand));
        patched = true;
        break;
      }
    }
  }

  // ── Strategy D: line-number attack (scan lines 1255–1300) ─────────────────
  if (!patched) {
    const lines = src.split('\n');
    for (let li = 1254; li <= 1299 && li < lines.length - 1; li++) {
      const lineText = lines[li];
      const openPos  = lineText.indexOf('/[');
      if (openPos === -1) continue;
      const afterOpen = lineText.slice(openPos + 2);
      if (afterOpen.indexOf('/') !== -1) continue;  // already closed
      const nextLine  = lines[li + 1];
      if (!/\]\s*\//.test(nextLine)) continue;

      showContext(lines, li, 'Strategy D found unclosed regex');

      const beforeRegex = lineText.slice(0, openPos);
      const closeMatch  = nextLine.match(/^([\s\S]*?)\]\s*\//);
      const restOfNext  = closeMatch ? nextLine.slice(closeMatch[0].length) : '';
      lines[li]     = beforeRegex + '/[\\x00-\\x1f\\x7f]/' + restOfNext;
      lines[li + 1] = '';
      console.log('[fix_all] Strategy D fixed line ' + (li + 1) + '.');
      patched = true;
      src = lines.join('\n');
      break;
    }
  }

  // ── Strategy E: global unclosed-regex scan (last resort) ──────────────────
  // Finds ANY /[...newline...]/  in the whole file.
  // This is broad but the replacement is surgical: we only replace one match.
  if (!patched) {
    const before = src;
    // Match a /[ that is NOT immediately followed by a closing ] on the same
    // logical line — i.e. there is a newline inside the character class.
    src = src.replace(
      /\/\[[^\]\/\n]*\n[^\]\/\n]*\]\//,
      (m) => {
        console.log('[fix_all] Strategy E (global scan) matched: ' + JSON.stringify(m));
        return '/[\\x00-\\x1f\\x7f]/';
      }
    );
    if (src !== before) patched = true;
  }

  if (!patched) {
    console.log('[fix_all] mias/index.js — broken regex NOT found. Check the diagnostic output above to identify the exact pattern and update fix_all.cjs.');
    return;
  }

  // Restore original line endings
  const out = hasCRLF ? src.replace(/\n/g, '\r\n') : src;
  fs.writeFileSync(target, out, 'utf8');
  console.log('[fix_all] mias/index.js — patched and saved successfully.\n');
})();


// ─────────────────────────────────────────────────────────────────────────────
// FIX 2 — Telegram 409 Conflict in bot.js
// Replace autoStart:true with safe startup that clears any stale webhook first.
// ─────────────────────────────────────────────────────────────────────────────
(function fixBotJs() {
  const target = path.join(__dirname, 'bot.js');
  if (!fs.existsSync(target)) {
    console.log('[fix_all] bot.js not found — skip.');
    return;
  }

  let src = fs.readFileSync(target, 'utf8');

  // Already patched?
  if (src.indexOf('_restartPollingAfterConflict') !== -1 ||
      src.indexOf('autoStart: false') !== -1) {
    console.log('[fix_all] bot.js — already patched, skip.');
    return;
  }

  let changed = 0;

  // Fix 2a: disable autoStart — broad pattern handles varied spacing/structure
  const before2a = src;
  src = src.replace(
    /new TelegramBot\s*\(\s*BOT_TOKEN\s*,\s*\{[^}]*polling\s*:\s*\{[^}]*autoStart\s*:\s*true[^}]*\}[^}]*\}\s*\)/s,
    `new TelegramBot(BOT_TOKEN, { polling: { interval: 1500, autoStart: false, params: { timeout: 10 } } })`
  );
  if (src !== before2a) { changed++; console.log('[fix_all] bot.js — disabled autoStart.'); }

  // Fix 2b: replace the polling_error handler block
  // Look for the comment marker; fall back to searching for 'polling_error'
  let startIdx = src.indexOf('// Suppress poll errors');
  if (startIdx === -1) startIdx = src.indexOf("bot.on('polling_error'");
  if (startIdx === -1) startIdx = src.indexOf('bot.on("polling_error"');

  if (startIdx !== -1) {
    const after    = src.slice(startIdx);
    const closeIdx = after.indexOf('\n});');
    if (closeIdx !== -1) {
      const oldBlock = after.slice(0, closeIdx + '\n});'.length);
      const newBlock = `// ── Telegram polling — 409-safe startup ──────────────────────────────────
var _tgPollWarnedOnce = false;
var _tgRestarting     = false;

async function _restartPollingAfterConflict(delayMs) {
  delayMs = delayMs || 14000;
  if (_tgRestarting) return;
  _tgRestarting = true;
  console.warn('[Telegram] 409 conflict — waiting ' + Math.round(delayMs / 1000) + 's for old instance to stop...');
  try { await bot.stopPolling(); } catch (_e) {}
  await new Promise(function (r) { setTimeout(r, delayMs); });
  try {
    await bot.startPolling({ restart: false });
    console.log('[Telegram] Polling restarted successfully after 409.');
  } catch (e2) {
    console.error('[Telegram] Failed to restart after 409:', e2.message);
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
      console.warn('[Telegram] Token invalid (401) — bot OFFLINE. Fix BOT_TOKEN in Railway Variables.');
      try { bot.stopPolling(); } catch (_e) {}
    }
    return;
  }
  if (!_tgPollWarnedOnce) { console.error('[Telegram] polling error:', msg || err); }
});

// Delete stale webhook, wait 5 s, then start polling safely
(async function _safePollStart() {
  try { await bot.deleteWebHook(); } catch (_e) {}
  await new Promise(function (r) { setTimeout(r, 5000); });
  try {
    await bot.startPolling({ restart: false });
    console.log('[Telegram] Polling started.');
  } catch (e) {
    var m = String(e.message || '');
    if (m.indexOf('409') !== -1 || m.toLowerCase().indexOf('conflict') !== -1) {
      await _restartPollingAfterConflict(16000);
    } else {
      console.error('[Telegram] startPolling failed:', m);
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
    console.log('[fix_all] bot.js — patched (' + changed + ' change(s)).\n');
  } else {
    console.log('[fix_all] bot.js — no changes made (pattern not matched).\n');
  }
})();



// ─────────────────────────────────────────────────────────────────────────────
// FIX 3 — SyntaxError: missing ) after argument list in mias/index.js
//
// A corrupted gst-IIFE (v17) was accidentally merged into the replace() string
// literal of the addcmd command handler, making the entire file un-parseable.
// Pattern:
//   const _prefix = (CONFIG.PREFIX || ".").replace(/.../, "\\    for (const name of ["gst"...
// Correct:
//   const _prefix = (CONFIG.PREFIX || ".").replace(/.../, "\\$&");
//
// The v18 gst IIFE registered earlier in the file is already correct and stays.
// ─────────────────────────────────────────────────────────────────────────────
(function fixMiasPrefixSyntax() {
  const target = path.join(__dirname, 'mias', 'index.js');
  if (!fs.existsSync(target)) { console.log('[fix_all] FIX-3: mias/index.js not found — skip.'); return; }

  const raw = fs.readFileSync(target, 'utf8');

  // Guard — only present when the file is still broken.
  // The broken string has: replace(/.../g, "\\    for (const name of ...
  // The healthy v18 has the same loop as a *statement*, not inside a string.
  const BROKEN_MARKER = 'const _prefix = (CONFIG.PREFIX || ".").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\';
  if (!raw.includes(BROKEN_MARKER)) {
    console.log('[fix_all] FIX-3: already clean — skip.');
    return;
  }

  // The broken block starts with the malformed _prefix line and ends with })();");
  // We replace the entire corrupted stretch with just the correct one-liner.
  const BAD_START = 'const _prefix = (CONFIG.PREFIX || ".").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\';
  const BAD_END   = '})();");';

  const si = raw.indexOf(BAD_START);
  if (si === -1) { console.log('[fix_all] FIX-3: bad-start marker not found — skip.'); return; }

  const ei = raw.indexOf(BAD_END, si);
  if (ei === -1) { console.log('[fix_all] FIX-3: bad-end marker not found — skip.'); return; }

  const fixed = raw.slice(0, si) +
    'const _prefix = (CONFIG.PREFIX || ".").replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");' +
    raw.slice(ei + BAD_END.length);

  fs.writeFileSync(target, fixed, 'utf8');
  console.log('[fix_all] FIX-3: mias/index.js — corrupted gst-v17 IIFE removed, _prefix line restored. ✓');
})();

console.log('[fix_all] All done.\n');
