/* ══════════════════════════════════════════════════════════════════════════
   precious-all-packs-boot.cjs  ·  v3 (2026-09-18)
   ONE entry point that loads + installs EVERY fix pack in this repo, in the
   correct order. Each pack is isolated so a single broken pack can never take
   the bot down, and every pack prints a [packs] line so you can SEE it load.

   WHAT CHANGED IN v3 (THE REAL FIX FOR "v28/v29 never show in logs")
   -----------------------------------------------------------------
   * v28 + v29 were placed AFTER `installAll()`'s closing brace and AFTER
     `module.exports`. Because `installAll()` ends with `return result`, every
     statement below it was DEAD CODE — it parsed fine but NEVER ran. That is
     why you saw PATCH-v29 (the file patcher) but never:
        [v29] ✅ install pass complete
        [precious-v28] ✅ installed
   * v28 + v29 are now installed INSIDE installAll(), dead-last, so they
     actually execute and can never be overwritten by an older pack.
   * The v27 entry block was also dead code (same reason) — it is now a live
     step inside installAll() too.

   Order matters (later installs win because `commands` is keyed by name):
     session-boot → v20 → v21 → gst-picker → v23-rc → playv2 shims →
     watermark → v24 → v27 → v28 → v29 (dead last)
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const path = require('path');
const fs   = require('fs');
const Module = require('module');

const ROOT = __dirname;
const MIAS = path.join(ROOT, 'mias');

const log  = (m) => { try { console.log('[packs] ' + m); } catch (_) {} };
const warn = (m) => { try { console.log('[packs] ⚠️ ' + m); } catch (_) {} };
const ok   = (m) => { try { console.log('[packs] ✅ ' + m); } catch (_) {} };
const bad  = (m) => { try { console.log('[packs] ❌ ' + m); } catch (_) {} };
const skip = (m) => { try { console.log('[packs] ⏭  ' + m); } catch (_) {} };

/* Shared per-process marker so nothing double-installs even if mias/index.js
   already called some packs directly earlier in this same process. */
function marker() {
  if (!globalThis.__PRECIOUS_INSTALLED__) globalThis.__PRECIOUS_INSTALLED__ = Object.create(null);
  return globalThis.__PRECIOUS_INSTALLED__;
}
function isInstalled(key) { return !!marker()[key]; }
function markInstalled(key, value) { marker()[key] = value || true; }

/* Try to require a module from several folders (so packs living under mias/
   can resolve axios / node-fetch etc. from mias/node_modules even when this
   file is loaded from repo root). Returns { mod, from, err }. */
function multiRequire(rel) {
  const abs = path.resolve(ROOT, rel);
  const attempts = [];

  // 1. createRequire scoped to the target file's own folder.
  try {
    if (fs.existsSync(abs)) {
      const scoped = Module.createRequire(abs);
      attempts.push({ from: 'self:' + path.relative(ROOT, path.dirname(abs)), fn: () => scoped(abs) });
    }
  } catch (_) {}

  // 2. createRequire scoped to mias/ (many packs share axios/node-fetch there).
  try {
    const miasReq = Module.createRequire(path.join(MIAS, 'noop.js'));
    attempts.push({ from: 'mias', fn: () => miasReq(abs) });
  } catch (_) {}

  // 3. Plain require from this file (root).
  attempts.push({ from: 'root', fn: () => require(rel) });

  let lastErr = null;
  for (const a of attempts) {
    try { return { mod: a.fn(), from: a.from, err: null }; }
    catch (e) { lastErr = e; }
  }

  // LAST RESORT: add every workspace node_modules to NODE_PATH and retry once.
  try {
    const extra = [path.join(ROOT, 'node_modules'), path.join(MIAS, 'node_modules')]
      .filter((d) => { try { return fs.existsSync(d); } catch (_) { return false; } });
    if (extra.length) {
      const sep = process.platform === 'win32' ? ';' : ':';
      const cur = process.env.NODE_PATH ? process.env.NODE_PATH.split(sep) : [];
      process.env.NODE_PATH = Array.from(new Set(extra.concat(cur))).join(sep);
      Module._initPaths();
      try {
        if (fs.existsSync(abs)) {
          const scoped = Module.createRequire(abs);
          return { mod: scoped(abs), from: 'self+NODE_PATH', err: null };
        }
      } catch (e) { lastErr = e; }
    }
  } catch (_) {}

  return { mod: null, from: null, err: lastErr };
}

/* Call whatever install shape a pack exposes (fn / .install / .apply). */
function run(loaded, ctx, label, key, opts) {
  opts = opts || {};
  const requireFn = !!opts.requireFn;
  if (isInstalled(key)) { skip(label + ' — already installed earlier this process (skipped)'); return true; }
  if (!loaded || !loaded.mod) {
    const why = loaded && loaded.err ? loaded.err.message : 'module missing';
    bad(label + ' — ' + why);
    return false;
  }
  const mod = loaded.mod;
  try {
    if (typeof mod === 'function')          { mod(ctx);                     markInstalled(key); ok(label + ' — installed (function) [' + loaded.from + ']'); return true; }
    if (typeof mod.install === 'function')  { const r = mod.install(ctx);   markInstalled(key, r || true); ok(label + ' — installed (.install) [' + loaded.from + ']' + (r ? ' → ' + safeJson(r) : '')); return true; }
    if (typeof mod.apply === 'function')    { const r = mod.apply(ctx);     markInstalled(key, r || true); ok(label + ' — applied (.apply) [' + loaded.from + ']' + (r ? ' → ' + safeJson(r) : '')); return true; }
    if (requireFn)                          { markInstalled(key);           ok(label + ' — loaded (side-effect) [' + loaded.from + ']'); return true; }
    warn(label + ' — loaded but exposes no install()/apply(); nothing to call');
    return false;
  } catch (e) { bad(label + ' — install error: ' + (e && e.message)); return false; }
}

function safeJson(x) { try { return JSON.stringify(x); } catch (_) { return String(x); } }

/* Side-effect module: just requiring it does the job. */
function sideEffect(rel, label, key) {
  if (isInstalled(key)) { skip(label + ' — already loaded earlier this process (skipped)'); return true; }
  const loaded = multiRequire(rel);
  if (!loaded.mod) { bad(label + ' — ' + (loaded.err ? loaded.err.message : 'failed')); return false; }
  markInstalled(key);
  ok(label + ' — loaded (side-effect) [' + loaded.from + ']');
  return true;
}

function installAll(ctx) {
  ctx = ctx || globalThis.__PRECIOUS__ || {};
  /* v31 FIX: this file auto-runs at require-time when globalThis.__PRECIOUS__
     already exists AND mias/index.js also calls installAll() explicitly, so the
     whole chain used to run twice per boot — doubling the log noise and every
     "already installed (skipped)" line. One pass per process is enough. */
  if (globalThis.__ALL_PACKS_BOOTED__) {
    log('already booted this process — skipping the second pass');
    return globalThis.__ALL_PACKS_RESULT__ || {};
  }
  globalThis.__ALL_PACKS_BOOTED__ = true;
  const result = {};
  const t0 = Date.now();
  log('════════ ALL FIX PACKS BOOT ════════');

  /* 1. session persistence must exist before anything reads AUTH_DIR */
  result.sessionBoot = sideEffect('./precious-session-boot.cjs',
    'session-boot (volume-aware AUTH_DIR + migration)', 'sessionBoot');

  /* 2. v20 */
  result.v20 = run(multiRequire('./mias/precious-fixes-v20.cjs'), ctx, 'precious-fixes-v20', 'v20');

  /* 3. v21 (mias copy) */
  result.v21 = run(multiRequire('./mias/precious-fixes-v21.cjs'), ctx, 'precious-fixes-v21 (mias)', 'v21');
  if (!result.v21) {
    result.v21root = run(multiRequire('./precious-fixes-v21.cjs'), ctx, 'precious-fixes-v21 (root fallback)', 'v21');
  } else {
    log('precious-fixes-v21 (root) — skipped (mias copy already installed)');
  }

  /* 4. gst picker */
  result.gstPicker = run(multiRequire('./mias/precious-gst-picker.cjs'), ctx, 'precious-gst-picker', 'gstPicker');

  /* 5. v23-rc */
  result.v23rc = run(multiRequire('./patches/precious-fixes-v23-rc.cjs'), ctx, 'precious-fixes-v23-rc', 'v23rc');

  /* 6. play-v2 shims */
  result.playV2         = run(multiRequire('./precious-play-v2.js'),  ctx, 'precious-play-v2', 'playV2', { requireFn: true });
  result.playv2Deliver  = run(multiRequire('./playv2-deliver.cjs'),   ctx, 'playv2-deliver',   'playv2Deliver', { requireFn: true });
  result.downloadWorker = run(multiRequire('./download-worker.cjs'),  ctx, 'download-worker',  'downloadWorker', { requireFn: true });

  /* 7. video watermark helper */
  result.watermark = run(multiRequire('./_addVideoWatermark.cjs'), ctx, '_addVideoWatermark', 'watermark', { requireFn: true });

  /* 8. v24 — final override for the older handlers */
  result.v24 = run(multiRequire('./mias/precious-fixes-v24.cjs'), ctx, 'precious-fixes-v24 (final override)', 'v24');

  /* 9. v27 master fix pack (now a LIVE step — was dead code before) */
  result.v27 = run(multiRequire('./precious-fixes-v27.cjs'), ctx, 'precious-fixes-v27', 'v27');

  /* 10. v28 — movie/nkiri reply-quote logic (now LIVE, dead-last-ish) */
  result.v28 = run(multiRequire('./precious-fixes-v28.cjs'), ctx, 'precious-fixes-v28', 'v28');

  /* 11. v29 — master fix pack, DEAD LAST, with deferred retry so it survives
         the commands map not being exposed yet at require-time. */
  result.v29 = (function installV29() {
    const key = 'v29';
    if (isInstalled(key)) { skip('precious-fixes-v29 already installed'); return true; }
    const loaded = multiRequire('./precious-fixes-v29.cjs');
    if (!loaded.mod) { bad('precious-fixes-v29 failed to load: ' + (loaded.err && loaded.err.message)); return false; }
    const runOnce = () => {
      try {
        const rep = (typeof loaded.mod.install === 'function') ? loaded.mod.install(globalThis.__PRECIOUS__ || ctx) : null;
        markInstalled(key, true);
        ok('precious-fixes-v29 installed (from ' + loaded.from + ') ' + safeJson(rep));
        return true;
      } catch (e) { bad('precious-fixes-v29 install error: ' + (e && e.message)); return false; }
    };
    const first = runOnce();
    /* v31 FIX: the retries used to test isInstalled('v29-final'), a key nothing
       ever sets, so v29 re-installed 3 extra times on every boot and re-wrapped
       handlers that were already wrapped. Retry ONLY while the commands map is
       still not reachable, and stop for good once it is. */
    const commandsVisible = () => {
      try {
        const c = (globalThis.__PRECIOUS__ && globalThis.__PRECIOUS__.commands) || globalThis.__MIAS_COMMANDS;
        return !!(c && typeof c.get === 'function' && c.size);
      } catch (_) { return false; }
    };
    for (const ms of [15000, 45000, 90000]) {
      try {
        const t = setTimeout(() => {
          if (globalThis.__V29_FINAL__) return;
          if (commandsVisible()) { globalThis.__V29_FINAL__ = true; }
          runOnce();
        }, ms);
        if (t && t.unref) t.unref();
      } catch (_) {}
    }
    return first;
  })();

  const slots = Object.keys(result).length;
  const good  = Object.values(result).filter(Boolean).length;
  const dt    = Date.now() - t0;
  log('════════ DONE — loaded ' + good + '/' + slots + ' pack slots in ' + dt + 'ms ════════');
  globalThis.__ALL_PACKS_RESULT__ = result;
  return result;
}

module.exports = { installAll };

/* Auto-run when required with a live context already on the global. */
if (globalThis.__PRECIOUS__) {
  try { installAll(globalThis.__PRECIOUS__); }
  catch (e) { bad('auto-run: ' + (e && e.message)); }
}
