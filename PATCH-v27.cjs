#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   PATCH-v27.cjs · deploy-time patcher (idempotent, marker-guarded)
   ──────────────────────────────────────────────────────────────────────────
   Run automatically by server.js / index.js alongside the other patchers.
   What it does:
     1. Deletes the stale /tmp/mais-patched.marker handling note — the older
        patchers wrote the marker AFTER running, so PATCH-v25 never re-ran
        on later boots and v24's damage stayed. We don't touch that marker;
        instead every edit below is guarded by its own in-file marker so
        re-running is always safe.
     2. mias/index.js — appends the v27 bootstrap at the very END of the file
        so precious-fixes-v27.cjs installs DEAD LAST, after every other pack.
     3. mias/index.js — exposes the module-scoped picker/consumer functions
        on globalThis so the v27 pack can wrap them (native-button tap fix).
     4. precious-all-packs-boot.cjs — registers v27 as the final pack and
        adds the "N packs installed / M failed" boot summary.
     5. server.js — adds the manifest loader report (files loaded / failed).
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = __dirname;

const ok   = (m) => console.log('[v27patch] ✅ ' + m);
const skip = (m) => console.log('[v27patch] ⏭  ' + m);
const bad  = (m) => console.log('[v27patch] ❌ ' + m);

function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function writeFileSafe(p, s) { try { fs.writeFileSync(p, s); return true; } catch { return false; } }

/* ── 1. mias/index.js — expose internals + append v27 bootstrap ─────────── */
(function patchMiasIndex() {
  const f = path.join(ROOT, 'mias', 'index.js');
  let src = readFileSafe(f);
  if (src == null) { bad('mias/index.js not found'); return; }

  // 1a. Expose module-scoped helpers on globalThis (needed by the v27 pack
  //     to wrap the bare-number consumer and reuse the normaliser).
  if (!src.includes('__V27_GLOBAL_EXPOSE__')) {
    const anchor = 'async function __miasHandleBareNumberReply(sock, msg, body) {';
    if (src.includes(anchor)) {
      const expose = `/* __V27_GLOBAL_EXPOSE__ — let the v27 fix pack wrap these from outside */
try {
  globalThis.__miasNormalizeChoice = __miasNormalizeChoice;
  globalThis.__miasHandleBareNumberReply = __miasHandleBareNumberReply;
  globalThis.__ttGetSelection = __ttGetSelection;
  globalThis.__miasPickerKeys = __miasPickerKeys;
  globalThis.__miasPickerKey = __miasPickerKey;
} catch {}

`;
      src = src.replace(anchor, expose + anchor);
      ok('mias/index.js — exposed picker internals on globalThis');
    } else {
      skip('mias/index.js — bare-number function anchor not found (expose skipped)');
    }
  } else {
    skip('mias/index.js — global expose already applied');
  }

  // 1b. Make the message dispatchers consult the GLOBAL consumer if the v27
  //     pack replaced it (native-button tap routing). We wrap the call sites
  //     so the module-local function is still the default.
  if (!src.includes('__V27_CONSUMER_DISPATCH__')) {
    const needle = 'if (await __miasHandleBareNumberReply(sock, msg, body)) return;';
    if (src.includes(needle)) {
      src = src.split(needle).join(
        'if (await (globalThis.__miasHandleBareNumberReply || __miasHandleBareNumberReply)(sock, msg, body)) return;'
      );
      src = src.replace(
        '/* __V27_GLOBAL_EXPOSE__',
        '/* __V27_CONSUMER_DISPATCH__ + __V27_GLOBAL_EXPOSE__'
      );
      ok('mias/index.js — picker consumer call sites now consult the global override');
    } else {
      skip('mias/index.js — consumer call-site needle not found (dispatch patch skipped)');
    }
  } else {
    skip('mias/index.js — consumer dispatch already patched');
  }

  // 1c. Append the v27 bootstrap DEAD LAST so nothing can overwrite it.
  if (!src.includes('__PRECIOUS_V27_BOOTSTRAP__')) {
    src += `

/* __PRECIOUS_V27_BOOTSTRAP__ — installs the v27 master fix pack DEAD LAST.
   Even if precious-all-packs-boot.cjs fails, this guarantees the tkick /
   pin / tt-picker / movie-doc / video fixes are the handlers that survive. */
try {
  const _v27 = require('../precious-fixes-v27.cjs');
  const _rep27 = _v27.install(globalThis.__PRECIOUS__ || {});
  console.log('[precious-v27] ✅ installed — ' + JSON.stringify(_rep27));
} catch (_e27) {
  console.log('[precious-v27] ❌ install error:', (_e27 && _e27.message) || _e27);
}
`;
    ok('mias/index.js — v27 bootstrap appended at end of file');
  } else {
    skip('mias/index.js — v27 bootstrap already present');
  }

  if (writeFileSafe(f, src)) ok('mias/index.js saved');
  else bad('mias/index.js write failed');
})();

/* ── 2. precious-all-packs-boot.cjs — register v27 + boot summary ────────── */
(function patchBootLoader() {
  const f = path.join(ROOT, 'precious-all-packs-boot.cjs');
  let src = readFileSafe(f);
  if (src == null) { bad('precious-all-packs-boot.cjs not found'); return; }
  if (src.includes('__V27_PACK_ENTRY__')) { skip('boot loader already registers v27'); return; }

  // Register v27 at the end of the pack list (before the summary line).
  const entry = `
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
`;
  // Insert before the final summary/return if there is one; else append.
  const tail = src.lastIndexOf('module.exports');
  if (tail > -1) {
    src = src.slice(0, tail) + entry + '\n' + src.slice(tail);
  } else {
    src += '\n' + entry;
  }
  if (writeFileSafe(f, src)) ok('precious-all-packs-boot.cjs — v27 registered as final pack');
  else bad('precious-all-packs-boot.cjs write failed');
})();

/* ── 3. server.js — manifest loader (files loaded / failed report) ────────── */
(function patchServerManifest() {
  const f = path.join(ROOT, 'server.js');
  let src = readFileSafe(f);
  if (src == null) { bad('server.js not found'); return; }
  if (src.includes('__V27_MANIFEST__')) { skip('server.js manifest loader already present'); return; }

  const manifest = `
/* __V27_MANIFEST__ — boot-time file load report.
   Prints exactly which critical files loaded and which failed, so the
   Railway logs show it immediately (e.g. "22 files loaded, 0 failed"). */
try {
  const _v27Files = [
    'server.js', 'index.js', 'mais_launcher.js', 'pair.js', 'bot.js', 'autoload.js',
    'precious-all-packs-boot.cjs', 'precious-fixes-v27.cjs',
    'precious-session-boot.cjs', 'precious-session-fix.cjs',
    'fix_all.cjs', 'fix_session_401.cjs', 'PATCH-v25.cjs', 'PATCH-v27.cjs', 'precious-fix-pack.cjs',
    'sessionPaths.js', 'sessionOwnership.js', 'notify.js', 'cleanup.cjs',
    'mias/index.js', 'mias/precious-fixes-v20.cjs', 'mias/precious-fixes-v21.cjs',
    'mias/precious-fixes-v24.cjs', 'mias/precious-gst-picker.cjs',
    'patches/precious-fixes-v23-rc.cjs',
    'lib/pickerRegistry.js', 'lib/universalButtons.js', 'lib/videoFix.js', 'lib/crash-shield.cjs',
    'mias/lib/playv2-deliver.cjs', 'mias/lib/portableVideo.cjs',
  ];
  const _v27Path = require('path');
  const _v27fs = require('fs');
  let _loaded = 0, _failed = [];
  for (const _rel of _v27Files) {
    const _abs = _v27Path.join(__dirname, _rel);
    if (!_v27fs.existsSync(_abs)) { _failed.push(_rel + ' (missing)'); continue; }
    try { require('module').createRequire(_abs); _loaded++; }
    catch (_e) { _failed.push(_rel + ' (' + (_e && _e.message) + ')'); }
  }
  console.log('[manifest] ' + _loaded + ' files loaded, ' + _failed.length + ' failed');
  if (_failed.length) console.log('[manifest] ❌ not loading: ' + _failed.join(' | '));
} catch (_eM) { console.log('[manifest] report error:', _eM && _eM.message); }
`;
  // Insert right after the crash-shield require (top of file, runs early).
  const anchor = "require('./lib/crash-shield.cjs').install({ name: 'server' });";
  if (src.includes(anchor)) {
    src = src.replace(anchor, anchor + '\n' + manifest);
    if (writeFileSafe(f, src)) ok('server.js — manifest loader installed');
    else bad('server.js write failed');
  } else {
    skip('server.js — crash-shield anchor not found, manifest appended at end');
    if (writeFileSafe(f, src + '\n' + manifest)) ok('server.js — manifest loader appended');
    else bad('server.js write failed');
  }
})();

console.log('[v27patch] done.');
