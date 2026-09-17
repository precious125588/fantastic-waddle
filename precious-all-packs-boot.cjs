/* ══════════════════════════════════════════════════════════════════════════
   precious-all-packs-boot.cjs
   ONE entry point that loads + installs EVERY fix pack in this repo, in the
   correct order, each one isolated so a single broken pack can never take the
   bot down. Every pack prints a [packs] line so you can SEE it load in the log.

   Order matters (later installs win because `commands` is keyed by name):
     session-boot → v20 → v21 → gst-picker → v23-rc → playv2 shims → v24 (last)
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const ROOT = __dirname;
const MIAS = path.join(ROOT, 'mias');

const log  = (m) => { try { console.log('[packs] ' + m); } catch (_) {} };
const warn = (m) => { try { console.log('[packs] ⚠️ ' + m); } catch (_) {} };
const ok   = (m) => { try { console.log('[packs] ✅ ' + m); } catch (_) {} };
const bad  = (m) => { try { console.log('[packs] ❌ ' + m); } catch (_) {} };

/* Resolve a module defensively: returns null instead of throwing. */
function tryRequire(rel) {
  try { return require(rel); }
  catch (e) { warn('could not require ' + rel + ' → ' + (e && e.message)); return null; }
}

/* Call whatever install shape a pack exposes (fn / .install / .apply). */
function run(mod, ctx, label, { requireFn = false } = {}) {
  if (!mod) { bad(label + ' — module missing'); return false; }
  try {
    if (typeof mod === 'function')        { mod(ctx);                     ok(label + ' — installed (function)'); return true; }
    if (typeof mod.install === 'function'){ mod.install(ctx);             ok(label + ' — installed (.install)'); return true; }
    if (typeof mod.apply === 'function')  { const r = mod.apply(ctx);     ok(label + ' — applied ' + JSON.stringify(r)); return true; }
    if (requireFn)                        { ok(label + ' — loaded (side-effect)'); return true; }
    warn(label + ' — loaded but exposes no install()/apply(); nothing to call');
    return false;
  } catch (e) { bad(label + ' — install error: ' + (e && e.message)); return false; }
}

/* Side-effect module: just requiring it does the job. */
function sideEffect(rel, label) {
  const m = tryRequire(rel);
  if (m === null) { bad(label + ' — failed'); return false; }
  ok(label + ' — loaded (side-effect)');
  return true;
}

function installAll(ctx) {
  ctx = ctx || globalThis.__PRECIOUS__ || {};
  const result = {};
  log('════════ ALL FIX PACKS BOOT ════════');

  /* 1. session persistence must exist before anything reads AUTH_DIR */
  result.sessionBoot = sideEffect('./precious-session-boot.cjs', 'session-boot (volume-aware AUTH_DIR + migration)');

  /* 2. v20 — exposes real handlers, gst/play/settings/rows/categories */
  result.v20 = run(tryRequire('./mias/precious-fixes-v20.cjs'), ctx, 'precious-fixes-v20');

  /* 3. v21 — nkiri, tgsticker, shazam, gst re-pin (mias copy) */
  result.v21 = run(tryRequire('./mias/precious-fixes-v21.cjs'), ctx, 'precious-fixes-v21 (mias)');

  /* 3b. root v21 is a byte-identical duplicate of the mias copy. Installing it
         twice would double-register the same commands, so it is loaded only as
         a fallback if the mias copy is missing. */
  if (!result.v21) result.v21root = run(tryRequire('./precious-fixes-v21.cjs'), ctx, 'precious-fixes-v21 (root fallback)');
  else log('precious-fixes-v21 (root) — skipped (mias copy already installed; duplicate would double-register)');

  /* 4. gst picker */
  result.gstPicker = run(tryRequire('./mias/precious-gst-picker.cjs'), ctx, 'precious-gst-picker');

  /* 5. v23-rc — picker registry / universal buttons / videoFix / shazamFix */
  result.v23rc = run(tryRequire('./patches/precious-fixes-v23-rc.cjs'), ctx, 'precious-fixes-v23-rc');

  /* 6. play-v2 delivery shims (only if they expose something callable) */
  result.playV2 = run(tryRequire('./precious-play-v2.js'), ctx, 'precious-play-v2', { requireFn: true });
  result.playv2Deliver = run(tryRequire('./playv2-deliver.cjs'), ctx, 'playv2-deliver', { requireFn: true });
  result.downloadWorker = run(tryRequire('./download-worker.cjs'), ctx, 'download-worker', { requireFn: true });

  /* 7. video watermark helper */
  result.watermark = run(tryRequire('./_addVideoWatermark.cjs'), ctx, '_addVideoWatermark', { requireFn: true });

  /* 8. v24 LAST — overrides every older handler (includes anime-edits) */
  result.v24 = run(tryRequire('./mias/precious-fixes-v24.cjs'), ctx, 'precious-fixes-v24 (final override)');

  const good = Object.values(result).filter(Boolean).length;
  log('════════ DONE — loaded ' + good + '/' + Object.keys(result).length + ' pack slots ════════');
  return result;
}

module.exports = { installAll };

/* Auto-run when required with a live context already on the global. */
if (globalThis.__PRECIOUS__) { try { installAll(globalThis.__PRECIOUS__); } catch (e) { bad('auto-run: ' + (e && e.message)); } }
