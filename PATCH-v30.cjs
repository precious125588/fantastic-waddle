/* ══════════════════════════════════════════════════════════════════════════
   PATCH-v30.cjs  ·  2026-09-18
   Wires precious-packs-preflight.cjs into server.js (idempotent) and runs the
   preflight immediately so the reason the pack-install lines are absent shows
   up in the very first lines of the deploy log.

   Background: "[packs] ...", "[precious-v28] ✅ installed" and
   "[v29] ✅ install pass complete" come from precious-all-packs-boot.cjs, which
   is required by mias/index.js — i.e. inside the bot child spawned per paired
   number. With 0 paired sessions on the volume that child never starts, so
   those lines can never be printed by the web container.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ok = (m) => console.log('[PATCH-v30] ✅ ' + m);
const skip = (m) => console.log('[PATCH-v30] ⏭  ' + m);
const bad = (m) => console.log('[PATCH-v30] ❌ ' + m);

const MARKER = 'precious-packs-preflight.cjs';
const BLOCK = `
// ── FIX PACK PREFLIGHT (v30) ────────────────────────────────────────
// Makes it visible why "[packs] / [precious-v28] / [v29] installed" lines are
// absent from the web-container logs: those come from the bot child process
// (mias/index.js), which only starts once a number is paired.
try { require('./precious-packs-preflight.cjs').run(); }
catch (_ePF) { console.log('[packs-preflight] skipped: ' + (_ePF && _ePF.message)); }
`;

function patchServer() {
  const f = path.join(ROOT, 'server.js');
  if (!fs.existsSync(f)) return bad('server.js not found — skip');
  let src = fs.readFileSync(f, 'utf8');
  if (src.includes(MARKER)) return skip('server.js already calls the preflight');

  const anchor = "} catch (_eP) { console.log('[server] patcher chain skipped: ";
  const i = src.indexOf(anchor);
  if (i === -1) {
    // Fallback: append right after the crash shield line.
    const shield = src.indexOf('\n', src.indexOf("crash-shield"));
    if (shield === -1) return bad('no anchor found in server.js');
    src = src.slice(0, shield + 1) + BLOCK + src.slice(shield + 1);
  } else {
    const end = src.indexOf('\n', i);
    src = src.slice(0, end + 1) + BLOCK + src.slice(end + 1);
  }
  try {
    fs.writeFileSync(f + '.v30bak', fs.readFileSync(f));
    fs.writeFileSync(f, src);
    ok('server.js patched (backup: server.js.v30bak)');
  } catch (e) { bad('server.js write failed: ' + e.message); }
}

function runPreflightNow() {
  try {
    require(path.join(ROOT, 'precious-packs-preflight.cjs')).run();
  } catch (e) {
    bad('preflight file missing or failed: ' + (e && e.message));
  }
}

patchServer();
runPreflightNow();
console.log('[PATCH-v30] done.');
