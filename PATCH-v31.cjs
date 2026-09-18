/* ══════════════════════════════════════════════════════════════════════════
   PATCH-v31.cjs  ·  2026-09-18
   THE FIX FOR "fix pack 30 isn't applied" and "v29 isn't applied to WhatsApp".

   ROOT CAUSES FOUND
   -----------------
   1. PATCH-v30.cjs was only ever executed by the npm "start" script. Railway
      boots this service with  startCommand = "node server.js"  (railway.toml)
      and the Procfile says  web: node server.js  — neither runs npm start, and
      server.js' own patcher chain listed
        fix_all, fix_session_401, PATCH-v25, PATCH-v27, precious-fix-pack, PATCH-v29
      with NO PATCH-v30. So v30 never ran on the deployed container: no
      [PATCH-v30] lines, no [packs-preflight] lines. It was never "not working",
      it was never started.
   2. start.sh' patcher list was also missing PATCH-v27 and PATCH-v30.
   3. Nothing ever verified, inside the bot child, that the packs really took
      effect — so "[v29] ✅ install pass complete" printing (or not printing)
      was the only signal, and it is printed before the wrappers are proven.

   WHAT THIS PATCHER DOES (all idempotent, marker-guarded)
   -------------------------------------------------------
   A) server.js  — adds PATCH-v30.cjs + PATCH-v31.cjs to the boot patcher chain.
   B) index.js   — same, for the legacy CLI entry.
   C) start.sh   — same, for the shell entry.
   D) mias/index.js — appends a hook that runs precious-packs-verify.cjs inside
      the bot child, so the log states plainly whether v29 is applied.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ok   = (m) => console.log('[PATCH-v31] ✅ ' + m);
const skip = (m) => console.log('[PATCH-v31] ⏭  ' + m);
const bad  = (m) => console.log('[PATCH-v31] ❌ ' + m);

function read(f) { try { return fs.readFileSync(f, 'utf8'); } catch (_) { return null; } }
function write(f, s, tag) {
  try {
    const bak = f + '.v31bak';
    if (!fs.existsSync(bak)) fs.writeFileSync(bak, fs.readFileSync(f));
    fs.writeFileSync(f, s);
    ok(tag + ' (backup: ' + path.basename(bak) + ')');
    return true;
  } catch (e) { bad(tag + ' write failed: ' + e.message); return false; }
}

/* ── A + B) JS patcher arrays in server.js and index.js ───────────────────── */
const OLD_LIST = "'fix_all.cjs', 'fix_session_401.cjs', 'PATCH-v25.cjs', 'PATCH-v27.cjs', 'precious-fix-pack.cjs', 'PATCH-v29.cjs'";
const NEW_LIST = "'fix_all.cjs', 'fix_session_401.cjs', 'PATCH-v25.cjs', 'PATCH-v27.cjs', 'precious-fix-pack.cjs', 'PATCH-v29.cjs', 'PATCH-v30.cjs', 'PATCH-v31.cjs'";

function patchJsEntry(rel) {
  const f = path.join(ROOT, rel);
  let src = read(f);
  if (src == null) return skip(rel + ' not present');
  if (src.includes("'PATCH-v30.cjs'") && src.includes("'PATCH-v31.cjs'")) return skip(rel + ' already runs v30 + v31');
  if (!src.includes(OLD_LIST)) return bad(rel + ' — patcher list not found (run it manually: node PATCH-v30.cjs)');
  src = src.split(OLD_LIST).join(NEW_LIST);
  write(f, src, rel + ' patcher chain now includes PATCH-v30 + PATCH-v31');
}

/* ── C) start.sh ─────────────────────────────────────────────────────────── */
function patchStartSh() {
  const f = path.join(ROOT, 'start.sh');
  let src = read(f);
  if (src == null) return skip('start.sh not present');
  const oldLine = 'for p in fix_all.cjs fix_session_401.cjs PATCH-v25.cjs precious-fix-pack.cjs PATCH-v29.cjs; do';
  const newLine = 'for p in fix_all.cjs fix_session_401.cjs PATCH-v25.cjs PATCH-v27.cjs precious-fix-pack.cjs PATCH-v29.cjs PATCH-v30.cjs PATCH-v31.cjs; do';
  if (src.includes('PATCH-v31.cjs')) return skip('start.sh already runs v30 + v31');
  if (!src.includes(oldLine)) return bad('start.sh — patcher loop not found');
  write(f, src.replace(oldLine, newLine), 'start.sh patcher loop now includes v27 + v30 + v31');
}

/* ── D) verify hook inside the bot child ─────────────────────────────────── */
function patchMiasVerify() {
  const f = path.join(ROOT, 'mias', 'index.js');
  let src = read(f);
  if (src == null) return bad('mias/index.js not found');
  if (src.includes('__V31_VERIFY_HOOK__')) return skip('mias/index.js already has the verify hook');
  const hook = [
    '',
    '/* __V31_VERIFY_HOOK__ — prove in the log whether the fix packs really took',
    '   effect in THIS bot child (runs 20s and 120s after boot, after the',
    '   deferred v29 retries). Never throws, never blocks the bot. */',
    'try { require("../precious-packs-verify.cjs").schedule(); }',
    'catch (_e31v) { console.log("[packs-verify] hook skipped: " + (_e31v && _e31v.message)); }',
    '',
  ].join('\n');
  write(f, src.replace(/\s*$/, '\n') + hook, 'mias/index.js verify hook appended');
}

patchJsEntry('server.js');
patchJsEntry('index.js');
patchStartSh();
patchMiasVerify();

/* Run the v30 preflight right now so this boot already shows pack health. */
try { require(path.join(ROOT, 'precious-packs-preflight.cjs')).run(); }
catch (e) { bad('preflight not run: ' + (e && e.message)); }

console.log('[PATCH-v31] done.');
