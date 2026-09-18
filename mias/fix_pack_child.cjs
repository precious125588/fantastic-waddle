'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   mias/fix_pack_child.cjs — runs INSIDE the WhatsApp child process.

   mais_launcher spawns mias/index.js as a separate process. Any fix that only
   runs in the parent (server.js / index.js) NEVER reaches the live socket.
   This module is required dead-last from mias/index.js (after every command
   is registered and globalThis.__PRECIOUS__ exists) and installs every runtime
   fix pack into THIS process's own commands map / event emitter.

   Idempotent: a per-process registry guarantees each pack installs ONCE even
   if the deferred re-try timers also fire.
   ══════════════════════════════════════════════════════════════════════════ */

const log = (m) => { try { console.log(m); } catch (_) {} };

function registry() {
  if (!globalThis.__FIX_PACK_CHILD_INSTALLED__) globalThis.__FIX_PACK_CHILD_INSTALLED__ = Object.create(null);
  return globalThis.__FIX_PACK_CHILD_INSTALLED__;
}

function installAll() {
  const P = globalThis.__PRECIOUS__ || {};
  const commandCount = P.commands && typeof P.commands.size === 'number' ? P.commands.size : '?';
  log('[RUNTIME-FIX] child verification starting (pid=' + process.pid + ', commands=' + commandCount + ')');

  /* The actual installation is owned by the FINAL all-packs boot in
     mias/index.js. Never call it from the top of mias/index.js, because at
     that point __PRECIOUS__ does not exist yet. Also never re-run it after
     __ALL_PACKS_BOOTED__ has been set: the old implementation permanently
     locked the loader with an empty context and made every later install a
     no-op. */
  try {
    if (!globalThis.__ALL_PACKS_BOOTED__) {
      const allPacks = require('../precious-all-packs-boot.cjs');
      const result = allPacks.installAll(P);
      globalThis.__ALL_PACKS_FINAL_RESULT__ = result;
      log('[RUNTIME-FIX] all-packs fallback install: REGISTERED');
    } else {
      log('[RUNTIME-FIX] all-packs already booted by final mias/index.js — no duplicate install');
    }
  } catch (e) {
    log('[FIX] all-packs fallback: FAILED (' + (e && e.message) + ')');
  }

  try {
    require('../precious-packs-verify.cjs').schedule();
    log('[RUNTIME-FIX] packs-verify: REGISTERED');
  } catch (e) {
    log('[FIX] packs-verify: FAILED (' + (e && e.message) + ')');
  }

  /* Keep a short verification retry. This is verification only; it does not
     mutate handlers or re-run the pack loader. */
  for (const ms of [15000, 45000, 90000]) {
    try {
      const t = setTimeout(() => {
        try { require('../precious-packs-verify.cjs').run(); }
        catch (e) { log('[FIX] delayed packs-verify: FAILED (' + (e && e.message) + ')'); }
      }, ms);
      if (t && t.unref) t.unref();
    } catch (_) {}
  }

  log('[RUNTIME-FIX] child verification complete');
}

module.exports = { installAll };
