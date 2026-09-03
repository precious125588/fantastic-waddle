#!/usr/bin/env node
/**
 * MAIS MDX — auto-patcher (runs before server start via package.json "start" script)
 * Saved as .cjs so Node always treats it as CommonJS — works even if the project
 * has "type":"module" in package.json.
 * All fixes are idempotent — safe to run multiple times.
 */
'use strict';

try {
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

  // ── Guard: skip if file has NO unclosed multi-line /[ regex at all ─────────
  // An unclosed regex looks like /[ followed by a newline before the closing ]/
  // If that pattern is absent the file is already clean — nothing to patch.
  if (!/\/\[[^\]\n]*\n/.test(src)) {
    console.log('[fix_all] mias/index.js — file is clean, no broken regex present. ✓');
    return;
  }

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

// ─────────────────────────────────────────────────────────────────────────────
// FIX 4 — Railway volume overlays nexstore/ and hides module files
//
// When a Railway volume is mounted at /app/nexstore, the entire directory is
// replaced by the (initially empty) volume. This makes logger.js,
// sessionRegistry.js, token.js, and myfunc.js disappear, causing server.js
// to crash before it can even bind the HTTP port ("service unavailable").
//
// Fix: copies the module files from nexstore_modules/ (outside the volume)
// into nexstore/ at every startup, so they are always present.
// ─────────────────────────────────────────────────────────────────────────────
(function restoreNexstoreModules() {
  const SRC  = path.join(__dirname, 'nexstore_modules');
  const DEST = path.join(__dirname, 'nexstore');
  const FILES = ['logger.js', 'sessionRegistry.js', 'token.js', 'myfunc.js'];

  if (!fs.existsSync(SRC)) {
    console.log('[fix_all] FIX-4: nexstore_modules/ not found — skip.');
    return;
  }

  if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });

  let restored = 0;
  for (const f of FILES) {
    const src  = path.join(SRC, f);
    const dest = path.join(DEST, f);
    if (!fs.existsSync(src)) { console.log('[fix_all] FIX-4: backup missing: ' + f); continue; }
    try {
      fs.copyFileSync(src, dest);
      restored++;
    } catch(e) {
      console.log('[fix_all] FIX-4: could not copy ' + f + ': ' + e.message);
    }
  }
  console.log('[fix_all] FIX-4: restored ' + restored + '/' + FILES.length + ' nexstore module files. ✓');
})();

// ─────────────────────────────────────────────────────────────────────────────
// FIX 5 — ESM/CJS Interop: ensure mias/handlers/bridge.cjs is executable
//
// The bridge file is what lets case.js and nexray_bot.cjs (CommonJS) access
// the ESM handler system via globalThis.__MIAS__.
// This fix verifies it exists and is not corrupted.
// ─────────────────────────────────────────────────────────────────────────────
(function ensureHandlerBridge() {
  const bridgePath = path.join(__dirname, 'mias', 'handlers', 'bridge.cjs');
  if (!fs.existsSync(bridgePath)) {
    console.warn('[fix_all] FIX-5: mias/handlers/bridge.cjs not found — skipping bridge check.');
    return;
  }
  try {
    const content = fs.readFileSync(bridgePath, 'utf8');
    if (!content.includes('__MIAS__') || !content.includes('module.exports')) {
      console.warn('[fix_all] FIX-5: bridge.cjs appears corrupted or missing key exports.');
    } else {
      console.log('[fix_all] FIX-5: handler bridge.cjs OK ✓');
    }
  } catch (e) {
    console.warn('[fix_all] FIX-5: could not read bridge.cjs:', e.message);
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// FIX 6 — ESM/CJS: ensure mias/package.json has "type":"module"
//
// If the mias sub-package's package.json is missing or has the wrong type,
// Node will try to execute ESM files as CommonJS and crash.
// ─────────────────────────────────────────────────────────────────────────────
(function ensureMiasPackageType() {
  const pkgPath = path.join(__dirname, 'mias', 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.warn('[fix_all] FIX-6: mias/package.json not found — skip.');
    return;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.type !== 'module') {
      pkg.type = 'module';
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
      console.log('[fix_all] FIX-6: mias/package.json — added "type":"module" ✓');
    } else {
      console.log('[fix_all] FIX-6: mias/package.json type=module already set ✓');
    }
  } catch (e) {
    console.warn('[fix_all] FIX-6:', e.message);
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// FIX 7 — GKTW helper status (no install attempts)
//
// @itsreimau/gktw is not published on npm (404) and github.com/itsreimau/gktw
// does not exist, so the old "try npm, then GitHub" install loop could only
// ever fail — it just burned ~60s of boot time per deploy and spammed errors.
// Both bots run every feature through a raw Baileys fallback, so this is now a
// pure status report. To plug in a real helper package later:
//     GKTW_PACKAGE=<package-name>   (and npm install it inside mias/ new-page/)
// ─────────────────────────────────────────────────────────────────────────────
(function logGktwStatus() {
  const candidates = [process.env.GKTW_PACKAGE, '@itsreimau/gktw', '@mengkodingan/ckptw'].filter(Boolean);
  const roots = [path.join(__dirname, 'mias', 'node_modules'),
                 path.join(__dirname, 'new-page', 'node_modules'),
                 path.join(__dirname, 'node_modules')];
  for (const name of candidates) {
    for (const root of roots) {
      if (fs.existsSync(path.join(root, ...name.split('/')))) {
        console.log(`[fix_all] FIX-7: helper "${name}" detected in ${path.basename(path.dirname(root))} — helper layer ACTIVE ✓`);
        return;
      }
    }
  }
  console.log('[fix_all] FIX-7: no GKTW helper installed — Baileys native fallback ACTIVE ✓ (this is normal)');
})();

console.log('[fix_all] All done.\n');

} catch (_outerErr) {
  console.error('[fix_all] Outer guard caught:', _outerErr && _outerErr.message || _outerErr);
  process.exit(0); // always exit 0 so server.js still runs
}


// ─────────────────────────────────────────────────────────────────────────────
// FIX 8 — Portable video pipeline and resilient NSFW binary/API handling
// Providers can return WebM, GIF, HTML errors, or JSON containing a media URL.
// WhatsApp playback is most reliable with H.264/AAC MP4 (yuv420p).
// ─────────────────────────────────────────────────────────────────────────────
(function ensurePortableVideoPipeline() {
  const fs = require('fs');
  const path = require('path');
  const target = path.join(__dirname, 'mias', 'index.js');
  const helperPath = path.join(__dirname, 'mias', 'lib', 'portableVideo.cjs');
  const helperB64 = 'J3VzZSBzdHJpY3QnOwpjb25zdCBmc3AgPSByZXF1aXJlKCdmcy9wcm9taXNlcycpOwpjb25zdCBvcyA9IHJlcXVpcmUoJ29zJyk7CmNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7CmNvbnN0IHsgZXhlY0ZpbGUgfSA9IHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKTsKY29uc3QgeyBwcm9taXNpZnkgfSA9IHJlcXVpcmUoJ3V0aWwnKTsKY29uc3QgZXhlY0ZpbGVBc3luYyA9IHByb21pc2lmeShleGVjRmlsZSk7CmxldCBmZm1wZWdQYXRoOwpmdW5jdGlvbiByZXNvbHZlRmZtcGVnKCkgewogIGlmIChmZm1wZWdQYXRoKSByZXR1cm4gZmZtcGVnUGF0aDsKICB0cnkgeyBmZm1wZWdQYXRoID0gcmVxdWlyZSgnZmZtcGVnLXN0YXRpYycpOyB9CiAgY2F0Y2ggKF8pIHsgZmZtcGVnUGF0aCA9IHByb2Nlc3MuZW52LkZGTVBFR19QQVRIIHx8ICdmZm1wZWcnOyB9CiAgcmV0dXJuIGZmbXBlZ1BhdGg7Cn0KZnVuY3Rpb24gaXNNcDQoYnVmKSB7CiAgcmV0dXJuIEJ1ZmZlci5pc0J1ZmZlcihidWYpICYmIGJ1Zi5sZW5ndGggPj0gMTIgJiYgYnVmLnNsaWNlKDQsIDgpLnRvU3RyaW5nKCdhc2NpaScpID09PSAnZnR5cCc7Cn0KYXN5bmMgZnVuY3Rpb24gbm9ybWFsaXplVmlkZW9CdWZmZXIoaW5wdXQsIG9wdHMgPSB7fSkgewogIGlmICghQnVmZmVyLmlzQnVmZmVyKGlucHV0KSB8fCBpbnB1dC5sZW5ndGggPCAxMDI0KSByZXR1cm4gaW5wdXQ7CiAgaWYgKGlucHV0Lmxlbmd0aCA+IChvcHRzLm1heElucHV0Qnl0ZXMgfHwgOTAgKiAxMDI0ICogMTAyNCkpIHJldHVybiBpbnB1dDsKICBjb25zdCBkaXIgPSBhd2FpdCBmc3AubWtkdGVtcChwYXRoLmpvaW4ob3MudG1wZGlyKCksICdtaWFzLXZpZGVvLScpKTsKICBjb25zdCBpblBhdGggPSBwYXRoLmpvaW4oZGlyLCAnaW5wdXQuYmluJyk7CiAgY29uc3Qgb3V0UGF0aCA9IHBhdGguam9pbihkaXIsICdvdXRwdXQubXA0Jyk7CiAgdHJ5IHsKICAgIGF3YWl0IGZzcC53cml0ZUZpbGUoaW5QYXRoLCBpbnB1dCk7CiAgICBhd2FpdCBleGVjRmlsZUFzeW5jKHJlc29sdmVGZm1wZWcoKSwgWwogICAgICAnLWhpZGVfYmFubmVyJywgJy1sb2dsZXZlbCcsICdlcnJvcicsICcteScsICctaScsIGluUGF0aCwKICAgICAgJy1tYXAnLCAnMDp2OjAnLCAnLW1hcCcsICcwOmE6MD8nLAogICAgICAnLWM6dicsICdsaWJ4MjY0JywgJy1wcmVzZXQnLCBvcHRzLnByZXNldCB8fCAndmVyeWZhc3QnLAogICAgICAnLWNyZicsIFN0cmluZyhvcHRzLmNyZiB8fCAyMyksICctcGl4X2ZtdCcsICd5dXY0MjBwJywKICAgICAgJy1jOmEnLCAnYWFjJywgJy1iOmEnLCAnMTI4aycsICctbW92ZmxhZ3MnLCAnK2Zhc3RzdGFydCcsCiAgICAgICctZicsICdtcDQnLCBvdXRQYXRoLAogICAgXSwgeyB0aW1lb3V0OiBvcHRzLnRpbWVvdXRNcyB8fCAxMjAwMDAsIG1heEJ1ZmZlcjogMTAyNCAqIDEwMjQgfSk7CiAgICBjb25zdCBvdXRwdXQgPSBhd2FpdCBmc3AucmVhZEZpbGUob3V0UGF0aCk7CiAgICBpZiAoaXNNcDQob3V0cHV0KSAmJiBvdXRwdXQubGVuZ3RoID4gMTAwMDApIHJldHVybiBvdXRwdXQ7CiAgfSBjYXRjaCAoZXJyKSB7CiAgICB0cnkgeyBjb25zb2xlLndhcm4oJ1t2aWRlb10gbm9ybWFsaXphdGlvbiBza2lwcGVkOicsIGVyciAmJiBlcnIubWVzc2FnZSB8fCBlcnIpOyB9IGNhdGNoIChfKSB7fQogIH0gZmluYWxseSB7CiAgICB0cnkgeyBhd2FpdCBmc3Aucm0oZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7IH0gY2F0Y2ggKF8pIHt9CiAgfQogIHJldHVybiBpbnB1dDsKfQptb2R1bGUuZXhwb3J0cyA9IHsgbm9ybWFsaXplVmlkZW9CdWZmZXIsIGlzTXA0LCByZXNvbHZlRmZtcGVnIH07Cg==';
  try {
    if (!fs.existsSync(path.dirname(helperPath))) fs.mkdirSync(path.dirname(helperPath), { recursive: true });
    if (!fs.existsSync(helperPath) || !fs.readFileSync(helperPath, 'utf8').includes('normalizeVideoBuffer')) {
      fs.writeFileSync(helperPath, Buffer.from(helperB64, 'base64').toString('utf8'), 'utf8');
      console.log('[fix_all] FIX-8: installed portableVideo helper.');
    }
  } catch (e) { console.warn('[fix_all] FIX-8: helper install failed:', e.message); }
  if (!fs.existsSync(target)) return;
  let src = fs.readFileSync(target, 'utf8');
  const marker = '__MIAS_PORTABLE_VIDEO_PATCH_V1__';
  if (src.includes(marker)) { console.log('[fix_all] FIX-8: video pipeline already patched.'); return; }
  let changed = 0;
  const videoBufNeedle = 'const vidBuf = Buffer.from(vidRes.data || []);';
  if (src.includes(videoBufNeedle)) {
    src = src.replace(videoBufNeedle,
      'let vidBuf = Buffer.from(vidRes.data || []);\n' +
      '     try {\n' +
      '       const _vn = require("./lib/portableVideo.cjs");\n' +
      '       const _nv = await _vn.normalizeVideoBuffer(vidBuf, { timeoutMs: 120000 });\n' +
      '       if (Buffer.isBuffer(_nv) && _nv.length > 10000) vidBuf = _nv;\n' +
      '     } catch (_videoNormalizeErr) { console.warn("[video] normalization unavailable:", _videoNormalizeErr?.message || _videoNormalizeErr); }');
    changed++;
  }
  const mimeNeedle = '    const _vMime = _hasWebm ? "video/webm" : "video/mp4";\n    const _vExt  = _hasWebm ? ".webm"      : ".mp4";';
  const mimeReplacement =
    '    const _finalHasFtyp = vidBuf.length >= 12 && vidBuf.slice(4, 8).toString("ascii") === "ftyp";\n' +
    '    const _finalHasWebm = vidBuf.length >= 4 && vidBuf[0] === 0x1A && vidBuf[1] === 0x45 && vidBuf[2] === 0xDF && vidBuf[3] === 0xA3;\n' +
    '    const _vMime = _finalHasWebm && !_finalHasFtyp ? "video/webm" : "video/mp4";\n' +
    '    const _vExt  = _finalHasWebm && !_finalHasFtyp ? ".webm" : ".mp4";';
  if (src.includes(mimeNeedle)) { src = src.replace(mimeNeedle, mimeReplacement); changed++; }
  const adultNeedle = 'const buf = await _downloadVideoBuf(mp4, pageUrl);';
  if (src.includes(adultNeedle)) {
    src = src.replace(adultNeedle,
      'let buf = await _downloadVideoBuf(mp4, pageUrl);\n' +
      '        if (buf) { try { const _vn = require("./lib/portableVideo.cjs"); buf = await _vn.normalizeVideoBuffer(buf, { timeoutMs: 120000 }); } catch (_e) {} }');
    changed++;
  }
  const nsfwNeedle = 'if (isVid) await sock.sendMessage(msg.key.remoteJid, { video: buf, caption: _pCaption }, { quoted: msg });';
  if (src.includes(nsfwNeedle)) {
    src = src.replace(nsfwNeedle,
      'if (isVid) {\n' +
      '         let _sendBuf = buf;\n' +
      '         try { const _vn = require("./lib/portableVideo.cjs"); _sendBuf = await _vn.normalizeVideoBuffer(buf, { timeoutMs: 90000 }); } catch (_e) {}\n' +
      '         const _sendMp4 = Buffer.isBuffer(_sendBuf) && _sendBuf.length >= 12 && _sendBuf.slice(4, 8).toString("ascii") === "ftyp";\n' +
      '         await sock.sendMessage(msg.key.remoteJid, { video: _sendBuf, mimetype: _sendMp4 ? "video/mp4" : "video/webm", caption: _pCaption }, { quoted: msg });\n' +
      '       }');
    changed++;
  }
  const fnStart = src.indexOf('async function _prexzyNsfwFetch');
  const fnEnd = src.indexOf('\n\nconst PREXZY_NSFW_MAP', fnStart);
  if (fnStart !== -1 && fnEnd > fnStart) {
    const robustFn = [
      'async function _prexzyNsfwFetch(endpoint, params = {}, timeoutMs = 35000) {',
      '  const qs = new URLSearchParams();',
      '  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) qs.set(k, v);',
      '  const base = String(CONFIG.PREXZY_API || "").replace(/\\/$/, "");',
      '  const url = base + "/" + endpoint + (qs.toString() ? "?" + qs.toString() : "");',
      '  const resp = await axios.get(url, { responseType: "arraybuffer", timeout: timeoutMs, maxRedirects: 5 });',
      '  let buf = Buffer.from(resp.data || []);',
      '  let ct = String(resp.headers?.["content-type"] || "").toLowerCase();',
      '  const looksJson = ct.includes("json") || /^[\\s]*[\\[{]/.test(buf.slice(0, 256).toString("utf8"));',
      '  if (looksJson) {',
      '    try {',
      '      const parsed = JSON.parse(buf.toString("utf8"));',
      '      const findUrl = (v, depth = 0) => {',
      '        if (depth > 4 || !v) return null;',
      '        if (typeof v === "string") return /^https?:\\/\\//i.test(v) ? v : null;',
      '        if (Array.isArray(v)) { for (const x of v) { const u = findUrl(x, depth + 1); if (u) return u; } return null; }',
      '        if (typeof v === "object") { for (const k of ["url", "download", "download_url", "media", "video", "image", "result", "data"]) { const u = findUrl(v[k], depth + 1); if (u) return u; } }',
      '        return null;',
      '      };',
      '      const mediaUrl = findUrl(parsed);',
      '      if (mediaUrl) { const media = await axios.get(mediaUrl, { responseType: "arraybuffer", timeout: timeoutMs, maxRedirects: 5 }); buf = Buffer.from(media.data || []); ct = String(media.headers?.["content-type"] || "").toLowerCase(); }',
      '    } catch {}',
      '  }',
      '  return { buf, ct, ok: buf.length > 500 };',
      '}',
    ].join('\n');
    src = src.slice(0, fnStart) + robustFn + src.slice(fnEnd);
    changed++;
  }
  if (changed) {
    src = '/* ' + marker + ' */\n' + src;
    fs.writeFileSync(target, src, 'utf8');
    console.log('[fix_all] FIX-8: patched mias video/adult media paths (' + changed + ' change(s)).');
  } else {
    console.warn('[fix_all] FIX-8: no known video/adult markers found; helper remains available.');
  }
})();
