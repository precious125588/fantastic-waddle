'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   precious-master-fix-boot.cjs  ·  v33 — THE MERGED MASTER FIX BOOT
   ──────────────────────────────────────────────────────────────────────────
   ⚠️  MUST READ — THIS IS NOW THE ONLY FIX-PACK ENTRY POINT.

   Every fix pack in this repo is loaded from THIS ONE FILE, in ONE
   deterministic order, from BOTH entry points:

     • PARENT (index.js / server.js — the web + pairing process):
         bootParent()  → on-disk patch chain + session boot + session fix
                         + preflight health report
     • CHILD  (mias/index.js — the actual WhatsApp bot process):
         bootChild()   → crash shield + EVERY runtime command-fix pack in
                         order (v20 → v21 → gst → v23 → playv2 → watermark →
                         v24 → v27 → v28 → v29) + post-boot verify hook

   WHY THIS FILE EXISTS
   --------------------
   Before v33 the fixes were scattered: index.js had its own inline patch
   chain, server.js had another, start.sh / Procfile / railway.toml each ran
   a DIFFERENT subset, and some packs (v28/v29, verify hook) were only
   injected at runtime by PATCH-v31 — which a fresh git clone wiped out.
   Result: "some fix packs aren't loading" and commands you fixed before
   silently came back broken. Now there is exactly ONE list (PATCH_CHAIN
   below + installAll() in precious-all-packs-boot.cjs) and ONE caller per
   process. If a fix isn't in this file, it does not run — so future fixes
   MUST be added HERE (see MUST-READ-NO-NEW-FIX-PACKS.md), never as a new
   standalone pack.

   Everything here is idempotent and marker-guarded: safe on every boot,
   safe if both index.js and server.js somehow load in one process, and a
   single failing pack can NEVER take the bot down.
   ══════════════════════════════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const log  = (m) => { try { console.log('[MASTER-FIX] ' + m); } catch (_) {} };
const bad  = (m) => { try { console.log('[MASTER-FIX] ❌ ' + m); } catch (_) {} };

/* ── THE canonical on-disk patch order (was PATCH_CHAIN in fix_pack_runtime) ─
   fix_all first (repairs mias/index.js syntax so string patchers can parse
   it), then targeted content patchers. Each script is marker-guarded. */
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

/* ════════════════════════════════ PARENT ════════════════════════════════
   Call this at the VERY TOP of index.js and server.js (before anything
   heavy). Runs every on-disk patcher, the session-persistence repairs and
   the preflight report — once per process, no matter which entry booted. */
function bootParent() {
  if (globalThis.__PRECIOUS_MASTER_PARENT__) {
    log('parent boot already done — skipping (dedup guard)');
    return globalThis.__PRECIOUS_MASTER_PARENT__;
  }
  const t0 = Date.now();
  log('════════ PARENT BOOT — merging ALL fix packs into main entry ════════');

  const result = { patches: null, sessionBoot: false, sessionFix: false, preflight: false };

  /* 1. Deterministic on-disk patch chain (idempotent, absolute-pathed). */
  try {
    result.patches = require('./fix_pack_runtime.cjs').installParent();
  } catch (e) {
    bad('fix_pack_runtime.installParent failed: ' + (e && e.message));
    /* Fallback: run the chain ourselves so a broken runtime module can
       never mean "no patches ran at all". */
    const cp = require('child_process');
    let applied = 0, failed = 0;
    for (const name of PATCH_CHAIN) {
      const abs = path.join(ROOT, name);
      if (!fs.existsSync(abs)) continue;
      try {
        const r = cp.spawnSync(process.execPath, [abs], { cwd: ROOT, stdio: 'inherit' });
        if (r.status === 0) applied++; else failed++;
      } catch (_) { failed++; }
    }
    result.patches = { applied, failed, fallback: true };
  }

  /* 2. Session boot: volume detection + legacy session migration. */
  try { require('./precious-session-boot.cjs'); result.sessionBoot = true; }
  catch (e) { bad('precious-session-boot skipped: ' + (e && e.message)); }

  /* 3. Session fix: rewrites any hard session delete → quarantine. */
  try { require('./precious-session-fix.cjs'); result.sessionFix = true; }
  catch (e) { bad('precious-session-fix skipped: ' + (e && e.message)); }

  /* 4. Preflight: prints pack health in the boot log (never throws). */
  try { require('./precious-packs-preflight.cjs').run(); result.preflight = true; }
  catch (e) { bad('precious-packs-preflight skipped: ' + (e && e.message)); }

  log('════════ PARENT BOOT DONE in ' + (Date.now() - t0) + 'ms — ' +
      'patches=' + JSON.stringify(result.patches) +
      ' sessionBoot=' + result.sessionBoot +
      ' sessionFix=' + result.sessionFix +
      ' preflight=' + result.preflight + ' ════════');
  globalThis.__PRECIOUS_MASTER_PARENT__ = result;
  return result;
}

/* ════════════════════════════════ CHILD ═════════════════════════════════
   Call this at the VERY END of mias/index.js (after __PRECIOUS__ and the
   full commands map exist). Installs the crash shield, then EVERY runtime
   command-fix pack in winning order via precious-all-packs-boot, then arms
   the v31 verify hook so the logs PROVE the fixes took effect. */
function bootChild(ctx) {
  if (globalThis.__PRECIOUS_MASTER_CHILD__) {
    log('child boot already done — skipping (dedup guard)');
    return globalThis.__PRECIOUS_MASTER_CHILD__;
  }
  const t0 = Date.now();
  log('════════ CHILD BOOT — installing ALL runtime fix packs ════════');

  const result = { shield: false, packs: null, verify: false };

  /* 1. Child crash shield — a bad pack can never kill the socket. */
  try { require('./fix_pack_runtime.cjs').installChild(); result.shield = true; }
  catch (e) { bad('fix_pack_runtime.installChild failed: ' + (e && e.message)); }

  /* 2. EVERY runtime pack, correct order (later installs win). installAll
        is marker-guarded per pack, so if mias/index.js already loaded some
        packs directly they are NOT double-installed. */
  try {
    const boot = require('./precious-all-packs-boot.cjs');
    const context = ctx || globalThis.__PRECIOUS__ || {};
    result.packs = (typeof boot.installAll === 'function') ? boot.installAll(context) : null;
  } catch (e) { bad('precious-all-packs-boot failed: ' + (e && e.message)); }

  /* 2b. Final TT quote-reply routing fix — this used to be installed
         separately by mias/fix_pack_child.cjs (now superseded by this file).
         It MUST run after every pack so it wraps the final bare-number
         consumer instead of being overwritten by one. */
  try {
    const ttQuote = require('./mias/precious-tt-quote-fix.cjs');
    if (ttQuote && typeof ttQuote.install === 'function') {
      result.ttQuote = !!ttQuote.install();
      log('TT quote-reply fix: ' + (result.ttQuote ? 'INSTALLED' : 'WAITING'));
    }
  } catch (e) { bad('precious-tt-quote-fix failed: ' + (e && e.message)); }

  /* 3. Verify hook (was injected at runtime by PATCH-v31 — a fresh clone
        wiped it; now it is version-controlled HERE and runs every boot). */
  try { require('./precious-packs-verify.cjs').schedule(); result.verify = true; }
  catch (e) { bad('precious-packs-verify skipped: ' + (e && e.message)); }

  const good = result.packs ? Object.values(result.packs).filter(Boolean).length : 0;
  const slots = result.packs ? Object.keys(result.packs).length : 0;
  log('════════ CHILD BOOT DONE in ' + (Date.now() - t0) + 'ms — ' +
      'shield=' + result.shield + ' packs=' + good + '/' + slots +
      ' verify=' + result.verify + ' ════════');
  globalThis.__PRECIOUS_MASTER_CHILD__ = result;
  return result;
}

module.exports = { bootParent, bootChild, PATCH_CHAIN };
