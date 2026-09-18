/* ══════════════════════════════════════════════════════════════════════════
   precious-packs-verify.cjs  ·  v31 (2026-09-18)

   Runs INSIDE the WhatsApp bot child (mias/index.js), after every fix pack has
   had a chance to install (including the 15s/45s/90s deferred v29 retries).

   It answers, in the deploy log, the exact question "is v29 actually applied
   to my WhatsApp?" — instead of leaving you to guess from install lines that
   may have been printed before the commands map even existed.

   Output looks like:
     [packs-verify] session: 2348xxxxxxx · AUTH_DIR=/app/nexstore/pairing/234...
     [packs-verify] mias/index.js file patch: __V29_PATCHED__ ✅
     [packs-verify] commands map: 412 commands
     [packs-verify] movie   → wrapped by v28 ✅
     [packs-verify] nkiri   → registered ✅
     [packs-verify] savetube→ quote wrapper ✅
     [packs-verify] globals: picker ✅ nativeSender ✅ chatbot ✅
     [packs-verify] RESULT: v29 fully applied ✅   (or a list of what is missing)
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const TAG = '[packs-verify]';
const log = (m) => { try { console.log(TAG + ' ' + m); } catch (_) {} };

function findCommands() {
  const cands = [
    globalThis.__PRECIOUS__ && globalThis.__PRECIOUS__.commands,
    globalThis.__MIAS_COMMANDS,
    globalThis.__commands,
  ];
  for (const c of cands) if (c && typeof c.get === 'function') return c;
  return null;
}

function run() {
  try {
    const authDir = process.env.AUTH_DIR || '(unset)';
    const num = String(authDir).split(path.sep).pop().split('@')[0];
    log('════════ FIX PACK VERIFY (bot child) ════════');
    log('session: ' + num + ' · AUTH_DIR=' + authDir);

    /* 1. did the FILE patcher (PATCH-v29.cjs) actually touch mias/index.js? */
    const missing = [];
    try {
      const target = path.join(__dirname, 'mias', 'index.js');
      const head = fs.readFileSync(target, 'utf8').slice(0, 4000);
      const patched = head.includes('__V29_PATCHED__');
      log('mias/index.js file patch: __V29_PATCHED__ ' + (patched ? '✅' : '❌ NOT PATCHED'));
      if (!patched) missing.push('PATCH-v29.cjs never rewrote mias/index.js (patcher chain did not run before the bot child spawned)');
    } catch (e) { log('could not read mias/index.js: ' + (e && e.message)); }

    /* 2. is the live commands map reachable, and are the handlers wrapped? */
    const commands = findCommands();
    if (!commands) {
      log('commands map: ❌ NOT EXPOSED — no pack could wrap a single handler');
      missing.push('commands map not exposed on globalThis.__PRECIOUS__');
    } else {
      let size = 0; try { size = commands.size || 0; } catch (_) {}
      log('commands map: ' + size + ' commands');
      const checks = [
        ['movie', '__v28Quote'],
        ['nkiri', null],
        ['savetube', '__v29Quote'],
        ['ytmp4', '__v29Quote'],
        ['play', null],
      ];
      for (const [name, flag] of checks) {
        const e = commands.get(name);
        if (!e) { log(name + ' → ❌ not registered'); missing.push('command .' + name + ' missing'); continue; }
        if (!flag) { log(name + ' → registered ✅'); continue; }
        if (e[flag]) log(name + ' → wrapped ✅ (' + flag + ')');
        else { log(name + ' → ⚠️ registered but NOT wrapped (' + flag + ' absent)'); missing.push('.' + name + ' not wrapped by the quote fix'); }
      }
    }

    /* 3. the process-level globals each pack installs */
    const g = [
      ['picker', '__v29PickerWidened'],
      ['nativeSender', '__miasSendNativeSmart'],
      ['chatbot', '__v29ApplyChatbot'],
    ];
    log('globals: ' + g.map(([k, v]) => k + ' ' + (globalThis[v] ? '✅' : '❌')).join(' '));
    for (const [k, v] of g) if (!globalThis[v]) missing.push('global ' + k + ' (' + v + ') not installed');

    /* 4. which packs the all-packs boot marked installed */
    try {
      const marks = globalThis.__PRECIOUS_INSTALLED__ || {};
      log('installed packs: ' + (Object.keys(marks).join(', ') || '(none)'));
    } catch (_) {}

    if (!missing.length) log('RESULT: v29 fully applied ✅');
    else {
      log('RESULT: ❌ v29 NOT fully applied — ' + missing.length + ' problem(s):');
      for (const m of missing) log('  • ' + m);
    }
    log('════════ VERIFY DONE ════════');
    return { ok: !missing.length, missing };
  } catch (e) {
    log('verify error: ' + (e && e.message));
    return null;
  }
}

/* Run twice: once after the first install pass, once after the 90s deferred
   v29 retry, so a late install is reported as fixed instead of broken. */
function schedule() {
  for (const ms of [20000, 120000]) {
    try { const t = setTimeout(run, ms); if (t && t.unref) t.unref(); } catch (_) {}
  }
}

module.exports = { run, schedule };

if (require.main === module) run();
