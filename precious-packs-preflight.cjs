/* ══════════════════════════════════════════════════════════════════════════
   precious-packs-preflight.cjs  ·  v30 (2026-09-18)

   WHY THIS FILE EXISTS
   --------------------
   The lines

       [v29] ✅ install pass complete
       [precious-v28] ✅ installed — {...}
       [packs] ✅ precious-fixes-v29 installed

   are printed by precious-all-packs-boot.cjs, which is required at the bottom
   of mias/index.js — i.e. INSIDE the WhatsApp bot child process that
   mais_launcher.js spawns for each paired number.

   The web container boot (node server.js) only runs the FILE PATCHERS
   (fix_all / PATCH-v25 / PATCH-v27 / precious-fix-pack / PATCH-v29). When
   `[precious-session-boot] usable paired sessions on the volume: 0`, no bot
   child is ever spawned, so the pack-install lines can never appear. That is
   the whole reason they are "missing" from the deploy logs.

   This preflight makes that visible instead of silent:
     * static-checks every pack file (node --check, zero side effects),
     * prints one [packs-preflight] line per pack: OK / SYNTAX ERROR / MISSING,
     * prints exactly WHY the pack-install lines are not in the log yet
       (0 paired sessions → bot child not started).

   It never installs anything and can never crash the web server.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = __dirname;
const TAG = '[packs-preflight]';

const PACKS = [
  'precious-all-packs-boot.cjs',
  'precious-session-boot.cjs',
  'precious-fixes-v21.cjs',
  'precious-fixes-v27.cjs',
  'precious-fixes-v28.cjs',
  'precious-fixes-v29.cjs',
  'precious-play-v2.js',
  'playv2-deliver.cjs',
  'download-worker.cjs',
  '_addVideoWatermark.cjs',
  'mias/precious-fixes-v20.cjs',
  'mias/precious-fixes-v21.cjs',
  'mias/precious-fixes-v24.cjs',
  'mias/precious-gst-picker.cjs',
  'patches/precious-fixes-v23-rc.cjs',
];

function log(m) { try { console.log(TAG + ' ' + m); } catch (_) {} }

function checkSyntax(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return { rel, state: 'MISSING' };
  try {
    const r = cp.spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8' });
    if (r.status === 0) return { rel, state: 'OK' };
    return { rel, state: 'SYNTAX ERROR', detail: String(r.stderr || '').split('\n')[0] };
  } catch (e) {
    return { rel, state: 'CHECK FAILED', detail: e && e.message };
  }
}

/* Count usable paired sessions the same way precious-session-boot does. */
function pairedSessionCount() {
  try {
    const sessionPaths = require('./sessionPaths');
    const root = sessionPaths.nexstoreRoot();
    const pairing = path.join(root, 'pairing');
    if (!fs.existsSync(pairing)) return 0;
    return fs.readdirSync(pairing).filter((d) => {
      try { return fs.existsSync(path.join(pairing, d, 'creds.json')); } catch (_) { return false; }
    }).length;
  } catch (_) { return -1; }
}

function run() {
  try {
    log('════════ FIX PACK PREFLIGHT (web process) ════════');
    let ok = 0;
    const problems = [];
    for (const rel of PACKS) {
      const r = checkSyntax(rel);
      if (r.state === 'OK') { ok++; log('✅ ' + rel); }
      else {
        problems.push(r);
        log('❌ ' + rel + ' — ' + r.state + (r.detail ? ' — ' + r.detail : ''));
      }
    }
    log(ok + '/' + PACKS.length + ' pack files healthy' + (problems.length ? ', ' + problems.length + ' problem(s)' : ''));

    const sessions = pairedSessionCount();
    if (sessions === 0) {
      log('⚠️ 0 paired sessions on the volume → NO bot child is running.');
      log('⚠️ THIS is why you do not see: "[packs] ... installed", "[precious-v28] ✅ installed", "[v29] ✅ install pass complete".');
      log('→ Those lines are printed by mias/index.js inside the bot child (prefixed "[MAIS:<number>]"). Pair a number, then re-read the logs.');
    } else if (sessions > 0) {
      log(sessions + ' paired session(s) found → bot child(ren) should boot; look for "[MAIS:<number>] [packs] ..." lines below.');
    } else {
      log('could not count paired sessions (sessionPaths unavailable) — skipping that check.');
    }
    log('════════ PREFLIGHT DONE ════════');
    return { ok, total: PACKS.length, problems, sessions };
  } catch (e) {
    log('preflight error: ' + (e && e.message));
    return null;
  }
}

module.exports = { run, PACKS };

/* Allow `node precious-packs-preflight.cjs` for a manual check. */
if (require.main === module) run();
