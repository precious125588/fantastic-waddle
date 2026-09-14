#!/usr/bin/env node
/**
 * precious-fix-pack.cjs
 * ---------------------------------------------------------------------------
 * Drop-in repair for the PRECIOUS x MIAS MDX repo
 *   https://github.com/precious125588/fantastic-waddle
 *
 * Fixes four reported faults. Every patch is IDEMPOTENT (safe to run on every
 * boot) and every patch fails loudly instead of silently skipping.
 *
 *   1. PAIRING / "loads forever, couldn't link"
 *        mias/index.js computed its own credential folder (process.env.AUTH_DIR
 *        or <repo>/prezzy_auth) which is NOT on the Railway volume
 *        (/app/nexstore). It also hard-deleted that folder on a 401. Result:
 *        every redeploy / false logout wiped a valid link -> re-pair loop, and
 *        the web page sat on "waiting for WhatsApp..." forever.
 *        -> AUTH_DIR now resolves through sessionPaths.js (volume-aware) and a
 *           one-time migration pulls any old prezzy_auth session onto the
 *           volume. Destructive deletes become quarantine (rename aside).
 *
 *   2. "Quote the card with 1-4 and it goes silent"
 *        The .play card picker matched the reply to the stored chat with a raw
 *        string compare (entry.jid !== jid). WhatsApp hands out ":12@s.whatsapp.net"
 *        (linked-device suffix) and @lid on some messages and the bare jid on
 *        others, so the compare failed and the handler returned in silence.
 *        It also only accepted 1-4 with no fallback text, and the card handler
 *        was overwritten by later re-registrations.
 *        -> JID-normalised match, accepts typed/suffixed/paramsJson replies,
 *           and ALWAYS answers (progress + success + a real failure reason)
 *           instead of returning silently.
 *
 *   3. TikTok ".tiktok" native button did nothing when tapped
 *        buildTikTokPickerSections() emitted rows as { rowId: "1.3" }, but the
 *        Baileys native-flow single_select row schema expects the key "id"
 *        (the repo's own working menu builder uses `id:`). A row with no "id"
 *        delivers an empty selection -> tap swallowed.
 *        -> rows now carry id (and rowId kept for compatibility), and any
 *           incoming paramsJson is parsed for id/selectedRowId/rowId.
 *
 *   4. ".movie / .moviedl" found movies but never delivered a video
 *        CONFIG.MYNETNAIJA_API pointed at
 *          https://apis.davidcyril.name.ng/mynetnaija
 *        which returns HTTP 404 text/html for /search and /info (verified live).
 *        The SAME API host serves the real routes:
 *          /movies/search?q=<title>      (param name is q)
 *          /movies/info?url=<page>
 *        -> base path corrected (NO new API is introduced), the mynetnaija.ng
 *           page-URL allow-list guard that rejected every result is relaxed,
 *           HTTP 500 "upstream timeout" answers are retried, and when the info
 *           route has no direct file the bot says so and falls back to the
 *           existing link providers instead of dying.
 *
 * Usage:  node precious-fix-pack.cjs            (from the project root)
 *         node precious-fix-pack.cjs --check    (report only, change nothing)
 * ---------------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CHECK_ONLY = process.argv.includes('--check');
const MARK = '[precious-fix-pack]';

let applied = 0;
let already = 0;
let failed = 0;

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function write(rel, text) {
  if (CHECK_ONLY) return;
  fs.writeFileSync(path.join(ROOT, rel), text);
}

/**
 * Replace `from` with `to` in rel. If `to` (or `sentinel`) is already present
 * the patch counts as ALREADY APPLIED. If `from` is absent and the sentinel is
 * absent, the patch counts as FAILED and is reported.
 */
function patch(rel, label, from, to, sentinel) {
  const src = read(rel);
  if (src === null) {
    console.log(`${MARK} FAIL  ${label} — ${rel} not found`);
    failed++;
    return false;
  }
  const marker = sentinel || to;
  if (src.includes(marker)) {
    console.log(`${MARK} ok    ${label} — already applied`);
    already++;
    return true;
  }
  if (!src.includes(from)) {
    console.log(`${MARK} FAIL  ${label} — anchor not found in ${rel} (file changed upstream)`);
    failed++;
    return false;
  }
  write(rel, src.replace(from, to));
  console.log(`${MARK} FIX   ${label} — patched ${rel}`);
  applied++;
  return true;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH 1 — session path + non-destructive logout  (mias/index.js)
   ═══════════════════════════════════════════════════════════════════════════ */

const AUTH_FROM = `const AUTH_DIR = process.env.AUTH_DIR
  ? path.resolve(process.env.AUTH_DIR)
  : path.join(__dirname, "prezzy_auth");
console.log(\`[MAIS MDX] AUTH_DIR = \${AUTH_DIR}\`);`;

const AUTH_TO = `// ── PRECIOUS FIX: session folder must live on the mounted volume ──────────
// The old code used process.env.AUTH_DIR or <repo>/prezzy_auth. <repo> is the
// container image layer on Railway, so every redeploy threw the WhatsApp
// credentials away and the bot asked to be paired again (that is the
// "loads forever / couldn't link" symptom on the web page).
// sessionPaths.js already knows the mounted volume (/app/nexstore/pairing) and
// migrates any session an older build left in prezzy_auth / auth_info_baileys.
const _sessionPaths = (() => {
  const tries = [
    () => require("./../sessionPaths"),
    () => require("../sessionPaths"),
    () => require("../nexstore_modules/sessionPaths"),
    () => require("./sessionPaths"),
  ];
  for (const t of tries) { try { return t(); } catch {} }
  return null;
})();

function _resolveAuthDir() {
  if (process.env.AUTH_DIR && String(process.env.AUTH_DIR).trim()) {
    return path.resolve(String(process.env.AUTH_DIR).trim());
  }
  if (_sessionPaths && typeof _sessionPaths.ensureSessionRoot === "function") {
    return _sessionPaths.ensureSessionRoot();
  }
  return path.join(__dirname, "prezzy_auth");
}

const AUTH_DIR = _resolveAuthDir();

// Move a legacy off-volume session onto the volume ONCE, so a link the user
// already has survives this upgrade.
try {
  if (_sessionPaths && typeof _sessionPaths.legacySessionDirs === "function") {
    const _root = AUTH_DIR;
    for (const legacyRoot of _sessionPaths.legacySessionDirs()) {
      if (!legacyRoot || path.resolve(legacyRoot) === path.resolve(_root)) continue;
      if (!fs.existsSync(legacyRoot)) continue;
      for (const entry of fs.readdirSync(legacyRoot)) {
        if (!entry || entry.startsWith(".")) continue;
        const srcDir = path.join(legacyRoot, entry);
        const dstDir = path.join(_root, entry);
        try {
          if (!fs.statSync(srcDir).isDirectory()) continue;
          if (fs.existsSync(dstDir)) continue;
          fs.mkdirSync(_root, { recursive: true });
          fs.renameSync(srcDir, dstDir);
          console.log(\`[MAIS MDX] migrated session \${entry} -> \${dstDir}\`);
        } catch (e) {
          console.log(\`[MAIS MDX] session migrate skipped (\${entry}): \${e && e.message}\`);
        }
      }
    }
  }
} catch (e) {
  console.log("[MAIS MDX] legacy session migration failed:", e && e.message);
}

console.log(\`[MAIS MDX] AUTH_DIR = \${AUTH_DIR}\`);
console.log(\`[MAIS MDX] volume mounted = \${_sessionPaths && _sessionPaths.isVolumeMounted ? (_sessionPaths.isVolumeMounted() ? "YES" : "NO") : "unknown"}\`);

// PRECIOUS FIX: never hard-delete credentials. A false 401 used to wipe the
// folder out from under the running bot -> endless re-pair. Rename aside.
function _preciousQuarantineAuthDir(why) {
  try {
    const target = AUTH_DIR;
    if (!fs.existsSync(target)) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = target.replace(/[\\\\/]+$/, "") + ".quarantine-" + stamp;
    fs.renameSync(target, dest);
    try {
      fs.writeFileSync(path.join(dest, ".quarantine-reason"), String(why || "unknown") + "\\n" + new Date().toISOString() + "\\n");
    } catch {}
    console.log(\`[MAIS MDX] quarantined \${target} -> \${dest} (\${why || "unknown"})\`);
    return dest;
  } catch (e) {
    console.log("[MAIS MDX] quarantine failed:", e && e.message);
    return null;
  }
}`;

patch(
  'mias/index.js',
  '1. AUTH_DIR on the mounted volume (+migration, +quarantine)',
  AUTH_FROM,
  AUTH_TO,
  '_preciousQuarantineAuthDir'
);

// 1b — every destructive delete of the session folder becomes a quarantine.
(function patchDestructiveDeletes() {
  const rel = 'mias/index.js';
  const src = read(rel);
  if (src === null) return;

  const patterns = [
    /fs\.rmSync\(\s*AUTH_DIR\s*,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\s*\)/g,
    /fs\.rmSync\(\s*AUTH_DIR\s*,\s*\{\s*force:\s*true\s*,\s*recursive:\s*true\s*\}\s*\)/g,
    /fs\.rm\(\s*AUTH_DIR\s*,\s*\{\s*recursive:\s*true\s*,\s*force:\s*true\s*\}\s*/g,
    /fs\.rmdirSync\(\s*AUTH_DIR\s*,\s*\{\s*recursive:\s*true\s*\}\s*\)/g,
    /deleteFolderRecursive\(\s*AUTH_DIR\s*\)/g,
  ];

  let out = src;
  let hits = 0;
  for (const re of patterns) {
    out = out.replace(re, () => {
      hits++;
      return `_preciousQuarantineAuthDir("session delete replaced by fix-pack")`;
    });
  }
  if (hits === 0) {
    console.log(`${MARK} ok    1b. no hard AUTH_DIR delete left (or already converted)`);
    already++;
    return;
  }
  write(rel, out);
  console.log(`${MARK} FIX   1b. converted ${hits} destructive session delete(s) -> quarantine`);
  applied++;
})();

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH 2 — numeric reply to a quoted card must never be silent
   ═══════════════════════════════════════════════════════════════════════════ */

// 2a — normalised chat identity helper + normalised pending key.
patch(
  'mias/index.js',
  '2a. play-card picker: JID-normalised match',
  `const _P2_TTL = 20 * 60 * 1000;
const _P2_PENDING = new Map();`,
  `const _P2_TTL = 20 * 60 * 1000;
const _P2_PENDING = new Map();

// PRECIOUS FIX (silent numbered reply):
// WhatsApp can deliver the command message with ":12@s.whatsapp.net" and the
// reply with the bare jid (or @lid). A raw string compare therefore failed and
// the handler returned with no output at all — the "quote it with a number and
// nothing happens" bug. Compare on the normalised chat identity instead.
function _p2NormJid(jid) {
  let s = String(jid || "");
  if (!s) return "";
  s = s.replace(/:\\d+(?=@)/, "");
  try {
    if (typeof resolveLid === "function") {
      const r = resolveLid(s);
      if (r) s = String(r).replace(/:\\d+(?=@)/, "");
    }
  } catch {}
  return s;
}
function _p2NumOnly(jid) {
  return String(_p2NormJid(jid) || "").replace(/[^0-9]/g, "");
}
function _p2SameChat(a, b) {
  const na = _p2NumOnly(a);
  const nb = _p2NumOnly(b);
  if (na && nb) return na === nb;
  return _p2NormJid(a) === _p2NormJid(b);
}`,
  '_p2SameChat'
);

// 2b — body must also read interactive/native-flow and paramsJson replies.
patch(
  'mias/index.js',
  '2b. play-card picker: read native-flow / paramsJson replies',
  `    (msg.buttonsResponseMessage && msg.buttonsResponseMessage.selectedButtonId) ||
    (msg.listResponseMessage && msg.listResponseMessage.singleSelectReply && msg.listResponseMessage.singleSelectReply.selectedRowId) ||
    (msg.templateButtonReplyMessage && msg.templateButtonReplyMessage.selectedId) ||
    '';
  return String(c || '').trim();
}`,
  `    (msg.buttonsResponseMessage && msg.buttonsResponseMessage.selectedButtonId) ||
    (msg.listResponseMessage && msg.listResponseMessage.singleSelectReply && msg.listResponseMessage.singleSelectReply.selectedRowId) ||
    (msg.templateButtonReplyMessage && msg.templateButtonReplyMessage.selectedId) ||
    // PRECIOUS FIX: native-flow taps arrive as paramsJson, not plain text.
    (msg.interactiveResponseMessage && msg.interactiveResponseMessage.nativeFlowResponseMessage && msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson) ||
    (msg.interactiveResponseMessage && msg.interactiveResponseMessage.buttonReply && msg.interactiveResponseMessage.buttonReply.id) ||
    (msg.interactiveResponseMessage && msg.interactiveResponseMessage.buttonReply && msg.interactiveResponseMessage.buttonReply.displayText) ||
    '';
  let out = String(c || '').trim();
  // Pull the real id out of {"id":"1","selectedRowId":"1",...}
  if (out && (out[0] === '{' || out[0] === '[')) {
    try {
      const seen = new Set();
      const queue = [JSON.parse(out)];
      while (queue.length) {
        const cur = queue.shift();
        if (cur === null || cur === undefined) continue;
        if (typeof cur === 'string') { out = cur; break; }
        if (typeof cur !== 'object' || seen.has(cur)) continue;
        seen.add(cur);
        for (const k of ['id', 'selectedId', 'selectedRowId', 'selectedButtonId', 'rowId', 'body', 'text']) {
          if (cur[k] !== undefined) queue.unshift(cur[k]);
        }
        for (const v of Object.values(cur)) if (v && typeof v === 'object') queue.push(v);
      }
    } catch {}
  }
  return out;
}`,
  'PRECIOUS FIX: native-flow taps arrive as paramsJson'
);

// 2c — the match itself + a real answer instead of silence.
patch(
  'mias/index.js',
  '2c. play-card picker: normalised match, never silent',
  `  const digits = body.replace(/[^0-9]/g, '');
  if (digits.length !== 1) return;
  const n = Number(digits);
  if (n < 1 || n > 4) return;
  const qid = _p2QuotedId(m);
  if (!qid) return;
  const entry = _P2_PENDING.get(qid);
  if (!entry || entry.jid !== jid) return;
  _P2_PENDING.delete(qid);`,
  `  const digits = String(body).replace(/[^0-9]/g, '');
  if (digits.length !== 1) return;
  const n = Number(digits);
  const qid = _p2QuotedId(m);
  if (!qid) return;
  const entry = _P2_PENDING.get(qid);
  // PRECIOUS FIX: normalised chat compare (was entry.jid !== jid -> silent).
  if (!entry || !_p2SameChat(entry.jid, jid)) return;
  if (n < 1 || n > 4) {
    // The card is still open — say WHY nothing was sent instead of going quiet.
    _P2_PENDING.delete(qid);
    await sock.sendMessage(jid, {
      text: '⚠️ *' + n + '* is not a format on that card. Quote it again with *1* audio, *2* document, *3* voice, *4* video.',
    }, { quoted: m }).catch(function () {});
    return;
  }
  _P2_PENDING.delete(qid);`
);

// 2d — store the normalised chat id when the card is sent.
patch(
  'mias/index.js',
  '2d. play-card picker: store normalised chat id',
  `  _P2_PENDING.set(sent.key.id, {
    jid: jid,
    meta: meta,`,
  `  _P2_PENDING.set(sent.key.id, {
    jid: _p2NormJid(jid),`,
  'jid: _p2NormJid(jid),'
);

// 2e — the final word on .play. Before this patch three separate blocks
// re-registered play/music/song (__playV21 at ~37206, then __preciousPlayPicker
// at ~39561), so the player card was dead code. Register the card handler LAST
// and keep the search picker reachable through the fallback below it.
patch(
  'mias/index.js',
  '2e. play: card picker registered last (was overwritten)',
  `for (const name of ["play", "music", "song"]) {
  const entry = commands.get(name) || { category: "DOWNLOAD" };
  entry.handler = __preciousPlayPicker;
  entry._origHandler = __preciousPlayPicker;
  entry.__preciousPlayPicker = true;
  commands.set(name, entry);
}`,
  `for (const name of ["play", "music", "song"]) {
  const entry = commands.get(name) || { category: "DOWNLOAD" };
  entry.handler = __preciousPlayPicker;
  entry._origHandler = __preciousPlayPicker;
  entry.__preciousPlayPicker = true;
  commands.set(name, entry);
}

// ── PRECIOUS FIX (play card was dead code) ────────────────────────────────
// __preciousPlayPicker above replaced the player-card handler, so quoting the
// card with 1-4 hit a picker that had never seen that card -> silence.
// Re-register the card handler as the LAST writer, and keep the YouTube search
// list available as an explicit fallback (\${CONFIG.PREFIX}playsearch <song>).
try {
  const _card = commands.get("play") && commands.get("play").__playCardHandler;
  const _cardHandler = (typeof _p2ResolveCardRegistrar === "function") ? _p2ResolveCardRegistrar() : null;
  if (_cardHandler) {
    for (const name of ["play", "music", "song"]) {
      const entry = commands.get(name) || { category: "DOWNLOAD" };
      entry.handler = _cardHandler;
      entry._origHandler = _cardHandler;
      entry.__playCardHandler = _cardHandler;
      commands.set(name, entry);
    }
    console.log("[precious-fix-pack] play card handler registered (quote 1-4 enabled)");
  } else {
    console.log("[precious-fix-pack] play card registrar unavailable — keeping search picker");
  }
} catch (e) {
  console.log("[precious-fix-pack] play re-register failed:", e && e.message);
}

// Explicit search-list entry point so nothing the old handler did is lost.
try {
  if (!commands.has("playsearch")) {
    const entry = { category: "DOWNLOAD", desc: "Search YouTube and pick a result" };
    entry.handler = async (sock, msg, args) => {
      const p = commands.get("play");
      const fn = (p && p.__preciousPlayPicker) ? p.__preciousPlayPicker : null;
      if (typeof fn === "function") return fn(sock, msg, args);
      return sendReply(sock, msg, "Usage: " + CONFIG.PREFIX + "play <song name or YouTube URL>");
    };
    commands.set("playsearch", entry);
  }
} catch {}`
);

// 2f — capture the card handler so 2e can register it last.
patch(
  'mias/index.js',
  '2f. play card handler captured for late registration',
  `cmd(["play", "music", "song"], { desc: "Play a song — card + pick 1 audio / 2 document / 3 voice / 4 video", category: "DOWNLOAD" }, async (sock, msg, args) => {
  const jid = msg.key.remoteJid;`,
  `const _p2PlayCardImpl = async (sock, msg, args) => {
  const jid = msg.key.remoteJid;`,
  '_p2PlayCardImpl'
);

// 2g — close 2f's function and expose it, right before the next command.
patch(
  'mias/index.js',
  '2g. play card implementation exported (registrar + command entry)',
  `  _p2Bind(sock);
  await react(sock, msg, '✅').catch(function () {});
});

cmd(["playvid","playvideo","vidplay"], { desc: "Download song as video (mp4)", category: "DOWNLOAD" }, async (sock, msg, args) => {`,
  `  _p2Bind(sock);
  await react(sock, msg, '✅').catch(function () {});
};

// The .play command entry (kept, so help/menu listings still show .play).
cmd(["play", "music", "song"], { desc: "Play a song — card + pick 1 audio / 2 document / 3 voice / 4 video", category: "DOWNLOAD" }, _p2PlayCardImpl);

// Registrar used by the late re-registration block near the end of the file,
// which is what actually makes the card handler win over older overrides.
function _p2ResolveCardRegistrar() { return _p2PlayCardImpl; }

cmd(["playvid","playvideo","vidplay"], { desc: "Download song as video (mp4)", category: "DOWNLOAD" }, async (sock, msg, args) => {`,
  'category: "DOWNLOAD" }, _p2PlayCardImpl);'
);

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH 3 — movie API: SAME host, correct route (no new API)
   ═══════════════════════════════════════════════════════════════════════════ */

patch(
  'mias/index.js',
  '3a. movie API base -> /movies on the same host',
  `  MYNETNAIJA_API: process.env.MYNETNAIJA_API || "https://apis.davidcyril.name.ng/mynetnaija",`,
  `  // PRECIOUS FIX: /mynetnaija returns HTTP 404 text/html on that API.
  // The same host serves the real routes: /movies/search?q= and /movies/info?url=
  MYNETNAIJA_API: process.env.MYNETNAIJA_API || "https://apis.davidcyril.name.ng/movies",`
);

patch(
  'mias/index.js',
  '3b. movie info: retrying JSON helper + relaxed page-URL guard',
  `async function _fetchMynetMovieInfo(pageUrl) {
  if (!pageUrl || !/^https?:\\/\\/(?:www\\.)?mynetnaija\\.ng\\//i.test(pageUrl)) return null;
  const { data } = await axios.get(\`\${CONFIG.MYNETNAIJA_API}/info\`, {
    params: { url: pageUrl },
    timeout: 30000,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!data?.success) return null;
  return _mynetMovieInfo(data);
}`,
  `// PRECIOUS FIX: the movie API answers HTTP 500 {"success":false,
// "message":"timeout of 12000ms exceeded"} when its own upstream is slow.
// That is transient — retry it and return the parsed body either way instead
// of throwing into the catch-all that made .moviedl look broken.
async function _dcMovieJson(url, params, timeoutMs) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.get(url, {
        params: params || {},
        timeout: timeoutMs || 20000,
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        validateStatus: function () { return true; },
      });
      const data = res.data;
      if (data && data.success === false && /timeout/i.test(String(data.message || data.error || "")) && attempt < 3) {
        console.warn("[movie] provider timeout, retrying (" + attempt + "/3)");
        await new Promise(function (r) { setTimeout(r, 900 * attempt); });
        continue;
      }
      return { ok: !!(data && (data.success === true || data.results || data.data || data.result)), data: data };
    } catch (e) {
      lastErr = e;
      if (attempt < 3) { await new Promise(function (r) { setTimeout(r, 800 * attempt); }); continue; }
    }
  }
  console.warn("[movie] provider request failed:", (lastErr && lastErr.message) || "unknown");
  return { ok: false, data: null };
}

async function _fetchMynetMovieInfo(pageUrl) {
  // The old guard rejected every URL that was not on mynetnaija.ng, which meant
  // even a correct search result could never be resolved. Accept any http(s)
  // page and let the API decide.
  if (!pageUrl || !/^https?:\\/\\//i.test(pageUrl)) return null;
  const r = await _dcMovieJson(\`\${CONFIG.MYNETNAIJA_API}/info\`, { url: pageUrl });
  if (!r.ok || !r.data) return null;
  return _mynetMovieInfo(r.data);
}`
);

patch(
  'mias/index.js',
  '3c. movie search: use the retrying helper',
  `    const { data } = await axios.get(\`\${CONFIG.MYNETNAIJA_API}/search\`, {
      params: { q },
      timeout: 30000,
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    const results = _mynetMovieList(data).slice(0, 10);
    if (data?.success && results.length) {`,
  `    const _searchRes = await _dcMovieJson(\`\${CONFIG.MYNETNAIJA_API}/search\`, { q: q });
    const data = _searchRes.data;
    const results = _mynetMovieList(data).slice(0, 10);
    if (data?.success && results.length) {`,
  '_dcMovieJson(`${CONFIG.MYNETNAIJA_API}/search`, { q: q })'
);

// 3d — do not dead-end when the info route has no direct file: fall through to
// the existing link providers instead of returning.
patch(
  'mias/index.js',
  '3d. moviedl: no direct file -> fall back instead of dead-ending',
  `      if (!info.fileUrl) {
        const fallback = info.sourceUrl || pageUrl;
        await sendReply(sock, msg, \`⚠️ *\${info.title}* was found, but the provider did not return a direct file URL yet.\\n\\n🔗 \${fallback}\`);
        return;
      }`,
  `      if (!info.fileUrl) {
        // PRECIOUS FIX: do not stop here. The movie API has the title but no
        // direct file for it, so continue into the link providers below and
        // only report the page URL if those find nothing either.
        console.warn("[moviedl] no direct file for " + info.title + " — trying link providers");
        __miasMapDelete(_mynetMoviePicks, jid);
      } else {`
);

patch(
  'mias/index.js',
  '3e. moviedl: close the fileUrl branch',
  `      try { await sock.sendMessage(jid, { delete: status.key }); } catch {}
      __miasMapDelete(_mynetMoviePicks, jid);
      await react(sock, msg, "✅");
      return;
    }
  } catch (error) {
    console.warn("[moviedl] MynetNaija direct download failed:", error?.message || error);
    await sendReply(sock, msg, \`❌ MynetNaija download failed: \${error?.message || "unknown error"}\\n\\nTry the command again or use a direct MynetNaija result number.\`);
    return;
  }`,
  `      try { await sock.sendMessage(jid, { delete: status.key }); } catch {}
      __miasMapDelete(_mynetMoviePicks, jid);
      await react(sock, msg, "✅");
      return;
      }
    }
  } catch (error) {
    console.warn("[moviedl] movie API direct download failed:", error?.message || error);
    // Fall through to the link providers below rather than dead-ending.
  }`
);

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH 4 — TikTok native single-select rows need an `id` key
   ═══════════════════════════════════════════════════════════════════════════ */

(function patchTikTokRows() {
  const rel = 'mias/features/tiktok.js';
  const src = read(rel);
  if (src === null) {
    console.log(`${MARK} FAIL  4. ${rel} not found`);
    failed++;
    return;
  }
  if (/id:\s*"1\.1",\s*rowId:\s*"1\.1"/.test(src)) {
    console.log(`${MARK} ok    4. TikTok rows already carry id`);
    already++;
    return;
  }
  const out = src.replace(/rowId:\s*"([0-9.]+)"/g, (m, id) => `id: "${id}", rowId: "${id}"`);
  const n = (src.match(/rowId:\s*"[0-9.]+"/g) || []).length;
  write(rel, out);
  console.log(`${MARK} FIX   4. TikTok native rows: added id to ${n} row(s) in ${rel}`);
  applied++;
})();

/* ═══════════════════════════════════════════════════════════════════════════
   PATCH 5 — accept native-flow selections that still use the old key names
   ═══════════════════════════════════════════════════════════════════════════ */

patch(
  'mias/index.js',
  '5. normalise choice: accept rowId / paramsJson from any native button',
  `  let source = String(raw || "").trim();`,
  `  let source = String(raw || "").trim();
  // PRECIOUS FIX: some clients deliver the tapped row as {"rowId":"1.3"} or as
  // a bare rowId string. Treat those exactly like a typed "1.3".
  if (/^\\{\\s*"rowId"/.test(source) || /^\\{\\s*"id"/.test(source)) {
    try { const _o = JSON.parse(source); if (_o && (_o.id || _o.rowId)) source = String(_o.id || _o.rowId); } catch {}
  }`
);

/* ═══════════════════════════════════════════════════════════════════════════
   summary
   ═══════════════════════════════════════════════════════════════════════════ */

console.log(`${MARK} done — applied=${applied} already=${already} failed=${failed}${CHECK_ONLY ? ' (check only, nothing written)' : ''}`);
if (failed > 0) {
  console.log(`${MARK} ${failed} patch(es) did NOT apply. Re-run after checking that mias/index.js is the original repo copy.`);
  process.exitCode = 1;
}
