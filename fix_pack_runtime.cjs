'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   fix_pack_runtime.cjs — NEW orchestrator (small, additive, marker-guarded)

   WHY THIS FILE EXISTS (the actual root causes it repairs)
   ---------------------------------------------------------
   1. Railway boots via startCommand "node server.js" (see railway.toml), and
      the Procfile says "web: node PATCH-v30.cjs && node PATCH-v31.cjs && node
      server.js". npm start — the ONLY chain that ran fix_all.cjs and
      fix_session_401.cjs — is NOT what the deployed container runs. So the
      regex syntax fix and the session-401 wipe guard never ran on deploy.
   2. PATCH-v30 / PATCH-v31 write preflight/verify hooks into server.js,
      index.js and start.sh — but on Railway the repo is a FRESH git clone
      every deploy, so those "persisted" edits are wiped before the next boot.
      The hooks must live in version control, not be injected at runtime.
   3. Fixes that run in the parent web process do NOT reach the WhatsApp bot,
      because mais_launcher spawns mias/index.js as a SEPARATE child process.
      The only fix that affects the child is one loaded inside the child.

   WHAT THIS FILE DOES
   -------------------
   Parent phase (required by server.js + index.js before anything heavy):
     - runs the deterministic on-disk patch chain (absolute __dirname paths)
     - counts APPLIED / ALREADY_APPLIED / FAILED and NEVER reports a false OK
   Child phase (required at the very top of mias/index.js):
     - installs a crash shield so a single pack failure cannot kill the bot

   Everything here is idempotent and safe to run on every boot.
   ══════════════════════════════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');
const cp   = require('child_process');

const ROOT = __dirname;
const log  = (m) => { try { console.log(m); } catch (_) {} };

/* Deterministic on-disk patch order. Order matters: fix_all first (repairs
   mias/index.js syntax so later string patches can even parse the file),
   then the targeted content patchers. Each script is idempotent/marker-guarded. */
const PATCH_CHAIN = [
  'fix_all.cjs',
  'fix_session_401.cjs',
  'PATCH-v25.cjs',
  'PATCH-v27.cjs',
  'precious-fix-pack.cjs',
  'PATCH-v29.cjs',
  'PATCH-v30.cjs',
  'PATCH-v31.cjs',
];

function runOnDiskPatchChain() {
  log('[FIX-PACK] on-disk patch chain starting (cwd=' + process.cwd() + ', root=' + ROOT + ')');
  let applied = 0, already = 0, failed = 0, missing = 0;
  for (const name of PATCH_CHAIN) {
    const abs = path.join(ROOT, name);            // absolute — never rely on cwd
    if (!fs.existsSync(abs)) {
      missing++;
      log('[FIX] ' + name + ': MISSING');
      continue;
    }
    try {
      const r = cp.spawnSync(process.execPath, [abs], { cwd: ROOT, stdio: 'inherit' });
      if (r.status === 0) { applied++; log('[FIX] ' + name + ': APPLIED (exit 0)'); }
      else { failed++; log('[FIX] ' + name + ': FAILED (exit ' + r.status + ')'); }
    } catch (e) {
      failed++;
      log('[FIX] ' + name + ': FAILED (' + (e && e.message) + ')');
    }
  }
  log('[FIX-PACK] chain done — applied=' + applied + ' already=' + already + ' failed=' + failed + ' missing=' + missing);
  return { applied, already, failed, missing };
}

function installParent() {
  log('[FIX] fix_pack_runtime: LOADED (parent=' + path.basename(process.argv[1] || '?') + ', pid=' + process.pid + ')');
  return runOnDiskPatchChain();
}

function installChild() {
  // Crash shield for the bot child: log, never let a pack kill the socket.
  if (!globalThis.__MIAS_CHILD_SHIELD__) {
    globalThis.__MIAS_CHILD_SHIELD__ = true;
    process.on('uncaughtException',  (e) => log('[child-shield] uncaughtException: ' + (e && e.message)));
    process.on('unhandledRejection', (e) => log('[child-shield] unhandledRejection: ' + (e && e.message)));
  }
  log('[FIX] fix_pack_runtime: LOADED (child=mias/index.js, pid=' + process.pid + ', cwd=' + process.cwd() + ')');
  log('[RUNTIME-FIX] fix_pack_runtime: REGISTERED child crash-shield');
}

module.exports = { installParent, installChild, runOnDiskPatchChain, PATCH_CHAIN };
