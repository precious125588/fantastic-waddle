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
  log('[RUNTIME-FIX] child install starting (pid=' + process.pid + ', commands=' + (P.commands && typeof P.commands.size === 'number' ? P.commands.size : '?') + ')');

  try {
    const allPacks = require('../precious-all-packs-boot.cjs');
    allPacks.installAll(P);
    log('[RUNTIME-FIX] precious-all-packs-boot: REGISTERED');
  } catch (e) {
    log('[FIX] precious-all-packs-boot: FAILED (' + (e && e.message) + ')');
  }

  try { require('../precious-packs-verify.cjs').schedule(); log('[RUNTIME-FIX] packs-verify: REGISTERED'); }
  catch (e) { log('[FIX] packs-verify: FAILED (' + (e && e.message) + ')'); }

  /* Deferred re-install: some packs probe the commands map at require-time and
     silently no-op if it is not populated yet. Re-assert after the socket is
     up so "movie/nkiri/savetube not applied" cannot recur. */
  const again = () => {
    try {
      const reg = registry();
      if (reg.__deferred) return; reg.__deferred = true;
      require('../precious-all-packs-boot.cjs').installAll(globalThis.__PRECIOUS__ || {});
      log('[RUNTIME-FIX] deferred pack re-assert: REGISTERED');
    } catch (e) { log('[FIX] deferred re-assert: FAILED (' + (e && e.message) + ')'); }
  };
  for (const ms of [15000, 45000, 90000]) {
    try { const t = setTimeout(again, ms); if (t && t.unref) t.unref(); } catch (_) {}
  }

  log('[RUNTIME-FIX] child install complete');
}

module.exports = { installAll };
