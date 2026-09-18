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
  'precious-packs-verify.cjs',
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

/* Count usable paired sessions the SAME WAY the rest of the app resolves them.
   v31 FIX: this used to hardcode nexstoreRoot()+'/pairing', which ignores the
   SESSION_DIR / SESSION_ROOT / SESSIONS_DIR overrides that sessionPaths honours
   — on a deployment that sets SESSION_DIR it always reported "0 paired
   sessions" even with a live, paired number. */
function sessionRoot() {
  try { return require('./sessionPaths').resolveSessionRoot(); }
  catch (_) { return null; }
}

function pairedSessions() {
  const root = sessionRoot();
  if (!root) return { root: null, list: null };
  try {
    if (!fs.existsSync(root)) return { root, list: [] };
    const list = fs.readdirSync(root).filter((d) => {
      try { return fs.existsSync(path.join(root, d, 'creds.json')); } catch (_) { return false; }
    });
    return { root, list };
  } catch (e) { return { root, list: null, err: e && e.message }; }
}

/* Did PATCH-v29.cjs actually rewrite mias/index.js on this container? */
function v29FilePatched() {
  try {
    const head = fs.readFileSync(path.join(ROOT, 'mias', 'index.js'), 'utf8').slice(0, 4000);
    return head.includes('__V29_PATCHED__');
  } catch (_) { return null; }
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

    const patched = v29FilePatched();
    log('mias/index.js file patch (__V29_PATCHED__): ' +
      (patched === true ? '✅ applied' : patched === false ? '❌ NOT applied — PATCH-v29.cjs did not run before this point' : '? unreadable'));

    const { root, list } = pairedSessions();
    log('session root in use: ' + (root || 'unknown') +
      (process.env.SESSION_DIR ? ' (SESSION_DIR override)' : ''));
    if (list === null) {
      log('could not read the session root — skipping the paired-session check.');
    } else if (list.length === 0) {
      log('⚠️ 0 paired sessions on the volume → NO bot child is running.');
      log('⚠️ THIS is why you do not see: "[packs] ... installed", "[precious-v28] ✅ installed", "[v29] ✅ install pass complete".');
      log('→ Those lines are printed by mias/index.js inside the bot child (prefixed "[MAIS:<number>]"). Pair a number, then re-read the logs.');
    } else {
      log(list.length + ' paired session(s): ' + list.map((d) => d.split('@')[0]).join(', '));
      log('→ each one spawns a bot child; look for "[MAIS:<number>] [packs] ..." and the "[packs-verify] RESULT:" line below.');
    }

    log('════════ PREFLIGHT DONE ════════');
    return { ok, total: PACKS.length, problems, sessions: (list ? list.length : -1), sessionRoot: root, v29FilePatched: patched };
  } catch (e) {
    log('preflight error: ' + (e && e.message));
    return null;
  }
}

module.exports = { run, PACKS };

/* Allow `node precious-packs-preflight.cjs` for a manual check. */
if (require.main === module) run();
