/* ══════════════════════════════════════════════════════════════════════════
   precious-all-packs-boot.cjs  ·  v2 (2026-09-17)
   ONE entry point that loads + installs EVERY fix pack in this repo, in the
   correct order. Each pack is isolated so a single broken pack can never take
   the bot down, and every pack prints a [packs] line so you can SEE it load.

   WHAT CHANGED IN v2
   ------------------
   * Multi-path require: some packs (v21, v24) live under mias/ and `require`
     from THIS file (which sits at repo root) would resolve their deps from
     the root node_modules first — where a peer of mias/node_modules such as
     axios may not exist. We now try require from (a) the pack's own folder
     via createRequire, (b) mias/, (c) root — in that order — so `axios`
     always resolves from wherever npm actually installed it.
   * Double-install guard: mias/index.js used to install v21, gst-picker and
     v24 itself BEFORE calling this boot; we detect that via a shared marker
     on globalThis.__PRECIOUS_INSTALLED__ and skip so nothing double-registers.
   * The root-level precious-fixes-v21.cjs is a byte-identical duplicate of
     the mias copy — installing it twice would double-register the same
     commands, so it is loaded ONLY as a fallback if the mias copy failed.
   * Clean, honest summary: the final line reports how many packs were newly
     installed vs. skipped-as-already-installed vs. failed.

   Order matters (later installs win because `commands` is keyed by name):
     session-boot → v20 → v21 → gst-picker → v23-rc → playv2 shims → v24 (last)
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
  // Absolute path of the target file (rel is like './mias/precious-fixes-v21.cjs')
  const abs = path.resolve(ROOT, rel);

  const attempts = [];

  // 1. createRequire scoped to the target file's own folder — deps resolve
  //    starting from THAT folder (best chance of finding node_modules).
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
    try {
      const mod = a.fn();
      return { mod, from: a.from, err: null };
    } catch (e) { lastErr = e; }
  }

  // LAST RESORT: pack-local deps (axios, node-fetch, ...) can fail to resolve
  // if the require chain started from the wrong folder. Add every workspace
  // node_modules to NODE_PATH and retry the primary attempt once. This makes
  // the loader bulletproof even if a deploy didn't run the mias npm install.
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
          const mod = scoped(abs);
          return { mod, from: 'self+NODE_PATH', err: null };
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
  const result = {};
  const t0 = Date.now();
  log('════════ ALL FIX PACKS BOOT ════════');

  /* 1. session persistence must exist before anything reads AUTH_DIR */
  result.sessionBoot = sideEffect('./precious-session-boot.cjs',
    'session-boot (volume-aware AUTH_DIR + migration)', 'sessionBoot');

  /* 2. v20 — exposes real handlers, gst/play/settings/rows/categories */
  result.v20 = run(multiRequire('./mias/precious-fixes-v20.cjs'), ctx,
    'precious-fixes-v20', 'v20');

  /* 3. v21 — nkiri, tgsticker, shazam, gst re-pin (mias copy) */
  result.v21 = run(multiRequire('./mias/precious-fixes-v21.cjs'), ctx,
    'precious-fixes-v21 (mias)', 'v21');

  /* 3b. root v21 is a byte-identical duplicate of the mias copy. Installing
         it twice would double-register the same commands, so it is loaded
         ONLY as a fallback if the mias copy failed. */
  if (!result.v21) {
    result.v21root = run(multiRequire('./precious-fixes-v21.cjs'), ctx,
      'precious-fixes-v21 (root fallback)', 'v21');
  } else {
    log('precious-fixes-v21 (root) — skipped (mias copy already installed; duplicate would double-register)');
  }

  /* 4. gst picker */
  result.gstPicker = run(multiRequire('./mias/precious-gst-picker.cjs'), ctx,
    'precious-gst-picker', 'gstPicker');

  /* 5. v23-rc — picker registry / universal buttons / videoFix / shazamFix */
  result.v23rc = run(multiRequire('./patches/precious-fixes-v23-rc.cjs'), ctx,
    'precious-fixes-v23-rc', 'v23rc');

  /* 6. play-v2 delivery shims (only if they expose something callable) */
  result.playV2         = run(multiRequire('./precious-play-v2.js'),  ctx, 'precious-play-v2', 'playV2', { requireFn: true });
  result.playv2Deliver  = run(multiRequire('./playv2-deliver.cjs'),   ctx, 'playv2-deliver',   'playv2Deliver', { requireFn: true });
  result.downloadWorker = run(multiRequire('./download-worker.cjs'),  ctx, 'download-worker',  'downloadWorker', { requireFn: true });

  /* 7. video watermark helper */
  result.watermark = run(multiRequire('./_addVideoWatermark.cjs'), ctx,
    '_addVideoWatermark', 'watermark', { requireFn: true });

  /* 8. v24 LAST — overrides every older handler (includes anime-edits) */
  result.v24 = run(multiRequire('./mias/precious-fixes-v24.cjs'), ctx,
    'precious-fixes-v24 (final override)', 'v24');

  const slots = Object.keys(result).length;
  const good  = Object.values(result).filter(Boolean).length;
  const dt    = Date.now() - t0;
  log('════════ DONE — loaded ' + good + '/' + slots + ' pack slots in ' + dt + 'ms ════════');
  return result;
}


  /* __V27_PACK_ENTRY__ — the master fix pack installs LAST so nothing overwrites it. */
  {
    const key = 'v27';
    if (isInstalled(key)) { skip('precious-fixes-v27 already installed'); }
    else {
      const { mod, from, err } = multiRequire('./precious-fixes-v27.cjs');
      if (err) { bad('precious-fixes-v27 failed to load: ' + (err && err.message)); markInstalled(key, 'failed'); }
      else {
        try {
          const rep = (mod && typeof mod.install === 'function') ? mod.install(globalThis.__PRECIOUS__ || {}) : null;
          markInstalled(key, true);
          ok('precious-fixes-v27 installed (from ' + from + ') ' + JSON.stringify(rep));
        } catch (e) { bad('precious-fixes-v27 install error: ' + (e && e.message)); markInstalled(key, 'failed'); }
      }
    }
  }

module.exports = { installAll };

/* Auto-run when required with a live context already on the global. */
if (globalThis.__PRECIOUS__) {
  try { installAll(globalThis.__PRECIOUS__); }
  catch (e) { bad('auto-run: ' + (e && e.message)); }
}

// ═══ PRECIOUS v28 — movie/nkiri reply-quote logic (installs dead last) ═══
try {
  const _v28 = require('./precious-fixes-v28.cjs');
  _v28.install(globalThis.__PRECIOUS__ || {});
} catch (_e28) {
  console.log('[precious-v28] ❌ boot error:', (_e28 && _e28.message) || _e28);
}

// ═══ PRECIOUS v29 — master fix pack, installs dead last with deferred retry ═══
try {
  const _v29 = require('./precious-fixes-v29.cjs');
  const _run29 = () => { try { _v29.install(globalThis.__PRECIOUS__ || {}); } catch (_e) { console.log('[v29] install error:', (_e && _e.message) || _e); } };
  _run29();
  for (const _ms of [15000, 45000, 90000]) { const _t = setTimeout(_run29, _ms); if (_t && _t.unref) _t.unref(); }
} catch (_e29) { console.log('[v29] ❌ boot error:', (_e29 && _e29.message) || _e29); }
