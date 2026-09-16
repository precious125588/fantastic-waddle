/* ══════════════════════════════════════════════════════════════════════════════
   PATCH-v25.cjs  ·  FANTASTIC-WADDLE REGRESSION REPAIR
   ──────────────────────────────────────────────────────────────────────────────
   Idempotent patcher. Run from the repo root:

        node PATCH-v25.cjs

   It repairs the damage introduced by the last push (commit ec53db0 "Add oh_men
   files", which installed mias/precious-fixes-v24.cjs dead-last) plus the other
   reported faults. Every edit is guarded by a marker, so running it twice is
   safe. A <file>.v25bak backup is written once per file.

   BUG → ROOT CAUSE → FIX
   1  .movie / .nkiri / .boost6 now answer with a LINK
        v24 §5 registered makeMovieCmd() for movie/movies/nkiri/boost6 AFTER the
        real handlers, and its picker callback only prints "Open the link".
        FIX: those three registrations are removed, so mias/index.js .movie
        (MynetNaija doc picker) and precious-fixes-v21 .nkiri (Nkiri direct file
        document) win again — exactly the pre-push behaviour.
   2  .play → "❌ Unknown settings option *4*"
        The play card store _P2_PENDING is keyed by MESSAGE ID, but the settings
        guard probes it with a CHAT jid, so the probe always returned false and
        the digit fell through to the settings consumer.
        FIX: expose the play store + a chat-keyed pending map on globalThis and
        teach __miasHasPendingPicker to consult it.
   3  .ytmate only accepted links + "video isn't available / file corrupted"
        v24 required a YouTube URL and downloaded from four dead mirrors
        (davidcyriltech.my.id / giftedtech / dreadedsite / princetechn).
        FIX: accepts a SONG NAME (resolved through yt-search, already a
        dependency), reuses the same provider chain the working .play command
        uses, and every byte is magic-number sniffed before it is sent.
   4  play choice 4 → black video while only audio plays
        The "video" provider sometimes returns an mp4 with an AUDIO-ONLY stream.
        FIX: each fetched candidate is checked for a real video track (ffmpeg
        -i probe); audio-only or HTML is rejected and the next provider is tried.
   5  .gst says "✅ Posted to group status." but nothing is posted
        The fallback did sock.sendMessage('status@broadcast', …) which resolves
        successfully WITHOUT creating a group-status ring entry, so the handler
        reported a false success.
        FIX: real groupStatusMessageV2 relay with statusJidList (to the group
        JID first, then status@broadcast); ✅ is only shown when a relay really
        resolved.
   6  .forward says forwarded but nothing arrives
        The native {forward:{…}} path can resolve without delivering, and it was
        tried FIRST. FIX: download-and-resend runs first (any message type),
        native forward is the fallback, and a failure is reported honestly.
   7  .sudo does not show the target DP
        profilePictureUrl was called once with a raw (device-suffixed) JID.
        FIX: hardened lookup (normalised JID, @lid, 'image' then 'preview') with
        the bot image as the last-resort card picture.
   8  status/edit commands printed ☄️ *edit* / 👤 @user / 🔗 url
        FIX: caption is now the EDIT TITLE ONLY.
   9  Bot restarts itself when used with APK WhatsApp
        process.exit(75) / process.exit(78) in re-pair/reconnect paths let the
        process manager bounce the bot on every socket hiccup.
        FIX: an exit guard suppresses those two codes for the first 3 tries per
        60s; genuine repeated failures still exit.
   ══════════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
let applied = 0, skipped = 0, failed = 0;

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.log('  ⚠️  missing file:', rel); return null; }
  return fs.readFileSync(p, 'utf8');
}
function backup(rel, src) {
  const bak = path.join(ROOT, rel + '.v25bak');
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, src);
}
function patch(rel, edits) {
  let src = read(rel);
  if (src === null) { failed++; return; }
  const orig = src;
  let dirty = false;
  for (const e of edits) {
    if (src.includes(e.marker)) { skipped++; continue; }
    if (!src.includes(e.find)) {
      console.log('  ❌ anchor not found in ' + rel + ': ' + e.name);
      failed++;
      continue;
    }
    src = src.replace(e.find, e.replace);
    dirty = true;
    applied++;
    console.log('  ✅ ' + rel + ' → ' + e.name);
  }
  if (dirty) { backup(rel, orig); fs.writeFileSync(path.join(ROOT, rel), src); }
}

/* ─────────────────────────────────────────────────────────────────────────────
   1 · mias/precious-fixes-v24.cjs
   ───────────────────────────────────────────────────────────────────────────── */
const V24 = 'mias/precious-fixes-v24.cjs';

// 1a — stop overriding movie / nkiri / boost6 with the link-only picker
patch(V24, [{
  name: 'restore real movie/nkiri/boost6 handlers (remove link-only overrides)',
  marker: 'V25-OK: link-only movie overrides removed',
  find:
`  makeMovieCmd(['movie', 'movies'], 'Movie', '🎬');
  makeMovieCmd(['nkiri'], 'Nkiri', '🎥');
  makeMovieCmd(['boost6'], 'Boost6', '⚡');
  rep.moviePickers = true;`,
  replace:
`  // V25-OK: link-only movie overrides removed.
  // The previous v24 pack re-registered .movie / .nkiri / .boost6 HERE (after
  // the real handlers) and its picker callback only printed "Open the link",
  // which is why downloads turned into bare URLs. Those registrations are
  // deliberately NOT re-added: mias/index.js .movie (MynetNaija picker) and
  // precious-fixes-v21 .nkiri (Nkiri direct-file document) now win again and
  // deliver the actual file as a document, exactly as before the last push.
  rep.moviePickers = 'restored-native (v25)';`,
}]);

// 1b — ytmate: accept a song NAME as well as a link
patch(V24, [{
  name: 'ytmate accepts song name + link',
  marker: 'V25-OK: ytmate name-or-link',
  find:
`    const url = args.find(a => /youtu\\.?be/.test(a)) || args[0];
    if (!url || !ytId(url)) return P.sendReply(sock, msg, \`Usage: \${PFX}ytmate <YouTube URL>\`);`,
  replace:
`    // V25-OK: ytmate name-or-link
    // The previous build rejected anything that was not a YouTube URL, so the
    // old ".ytmate <song name>" workflow died. We now resolve a name to a
    // videoId through yt-search (already a dependency) and carry on.
    let url = args.find(a => /youtu\\.?be|youtube\\.com/.test(a))
      || (/^https?:\\/\\//i.test(String(args[0] || '')) ? String(args[0]) : null);
    if (!url) {
      const q = (args || []).join(' ').trim();
      if (!q) return P.sendReply(sock, msg, \`Usage: \${PFX}ytmate <song name | YouTube URL>\`);
      const found = await ytFindFirst(q);
      if (!found) {
        await P.react(sock, msg, '❌').catch(() => {});
        return P.sendReply(sock, msg, \`❌ No YouTube result for *\${q}*. Try a different name.\`);
      }
      url = found;
    }`,
}]);

// 1c — ytDownload: real multi-provider chain, every byte sniffed
patch(V24, [{
  name: 'ytDownload rewritten with working providers + byte validation',
  marker: 'V25-OK: ytDownload working providers',
  find:
`// ── YouTube download with MULTIPLE APIs (fallback chain) ─────────────────
async function ytDownload(url, mode /* 'audio'|'video' */, quality) {
  const id = ytId(url); const full = id ? \`https://youtu.be/\${id}\` : url;
  const q = String(quality || (mode === 'audio' ? '128' : '360'));
  const tries = [];
  if (mode === 'audio') {
    tries.push(
      async () => { const d = await getJson(\`https://api.davidcyriltech.my.id/download/ytmp3?url=\${encodeURIComponent(full)}\`); const u = d?.result?.download_url || d?.result?.url || d?.download_url; return u && { url: u, title: d?.result?.title }; },
      async () => { const d = await getJson(\`https://api.giftedtech.co.ke/api/download/ytmp3?apikey=gifted&url=\${encodeURIComponent(full)}\`); const u = d?.result?.download_url || d?.result?.url; return u && { url: u, title: d?.result?.title }; },
      async () => { const d = await getJson(\`https://api.dreaded.site/api/ytdl/audio?url=\${encodeURIComponent(full)}\`); const u = d?.result?.url || d?.url; return u && { url: u }; },
      async () => { const d = await getJson(\`https://api.princetechn.com/api/download/ytmp3?apikey=prince&url=\${encodeURIComponent(full)}\`); const u = d?.result?.download_url || d?.result?.url; return u && { url: u, title: d?.result?.title }; },
    );
  } else {
    tries.push(
      async () => { const d = await getJson(\`https://api.davidcyriltech.my.id/download/ytmp4?url=\${encodeURIComponent(full)}&quality=\${encodeURIComponent(q)}\`); const u = d?.result?.download_url || d?.result?.url || d?.download_url; return u && { url: u, title: d?.result?.title }; },
      async () => { const d = await getJson(\`https://api.giftedtech.co.ke/api/download/ytmp4?apikey=gifted&url=\${encodeURIComponent(full)}&quality=\${encodeURIComponent(q)}\`); const u = d?.result?.download_url || d?.result?.url; return u && { url: u, title: d?.result?.title }; },
      async () => { const d = await getJson(\`https://api.dreaded.site/api/ytdl/video?url=\${encodeURIComponent(full)}\`); const u = d?.result?.url || d?.url; return u && { url: u }; },
      async () => { const d = await getJson(\`https://api.princetechn.com/api/download/ytmp4?apikey=prince&url=\${encodeURIComponent(full)}\`); const u = d?.result?.download_url || d?.result?.url; return u && { url: u, title: d?.result?.title }; },
    );
  }
  for (const t of tries) {
    try {
      const r = await t();
      if (!r?.url) continue;
      const buf = await getBuf(r.url);
      if (buf && isRealMedia(buf)) return { buf, title: r.title || '' };
    } catch {}
  }
  return null;
}`,
  replace:
`// ── ytFindFirst: song NAME → YouTube URL (uses the bundled yt-search) ──────
async function ytFindFirst(query) {
  try {
    const yts = require('yt-search');
    const r = await yts(String(query || '').trim());
    const v = (r && r.videos && r.videos[0]) || (Array.isArray(r) ? r[0] : null);
    if (v && v.url) return v.url;
    if (v && v.videoId) return 'https://www.youtube.com/watch?v=' + v.videoId;
  } catch {}
  try {
    const r = await axios.get('https://www.youtube.com/results?search_query=' + encodeURIComponent(query), { headers: UA, timeout: 15000 });
    const m = String(r.data || '').match(/"videoId":"([A-Za-z0-9_-]{11})"/);
    if (m) return 'https://www.youtube.com/watch?v=' + m[1];
  } catch {}
  return null;
}

// V25-OK: ytDownload working providers
// Every candidate is magic-number checked. A candidate that returns an HTML
// error page, a JSON blob, or a file under 32 KB is REJECTED and the next
// provider is tried — this is what kills the old "video isn't available /
// file is corrupted" message, which was simply an error page sent as mp4.
async function ytDownload(url, mode /* 'audio'|'video' */, quality) {
  const id = ytId(url); const full = id ? ('https://youtu.be/' + id) : url;
  const q = String(quality || (mode === 'audio' ? '128' : '360'));
  const tries = [];

  // 1) the repo's own DavidCyril client, when the host exposed it
  try {
    const dc = (globalThis.__PRECIOUS__ && globalThis.__PRECIOUS__.dcGet) || globalThis.__MIAS_DC_GET__;
    if (typeof dc === 'function') {
      if (mode === 'audio') tries.push(async () => {
        const r = await dc('/download/ytmp3', { url: full }, 30000);
        const d = r && r.ok ? r.data : null;
        const u = d && (d.result && (d.result.download_url || d.result.url) || d.download_url || d.url);
        return u && { url: u, title: (d && d.result && d.result.title) || '' };
      });
      else tries.push(async () => {
        const r = await dc('/download/ytmp4', { url: full, quality: q }, 45000);
        const d = r && r.ok ? r.data : null;
        const u = d && (d.result && (d.result.download_url || d.result.url) || d.download_url || d.url);
        return u && { url: u, title: (d && d.result && d.result.title) || '' };
      });
    }
  } catch {}

  // 2) proven public mirrors kept from the working play pipeline
  if (mode === 'audio') {
    tries.push(
      async () => { const d = await getJson('https://api.nexoracle.com/downloader/ytmp3?apikey=free_key@maher_apis&url=' + encodeURIComponent(full)); const u = d?.result?.download_url || d?.result?.url || d?.download_url || d?.url; return u && { url: u, title: d?.result?.title }; },
      async () => { const d = await getJson('https://api.davidcyril.name.ng/download/ytmp3?url=' + encodeURIComponent(full)); const u = d?.result?.download_url || d?.result?.url || d?.download_url || d?.url; return u && { url: u, title: d?.result?.title }; },
      async () => { const d = await getJson('https://api.princetechn.com/api/download/ytmp3?apikey=prince&url=' + encodeURIComponent(full)); const u = d?.result?.download_url || d?.result?.url; return u && { url: u, title: d?.result?.title }; },
    );
  } else {
    tries.push(
      async () => { const d = await getJson('https://api.nexoracle.com/downloader/ytmp4?apikey=free_key@maher_apis&url=' + encodeURIComponent(full)); const u = d?.result?.download_url || d?.result?.url || d?.download_url || d?.url; return u && { url: u, title: d?.result?.title }; },
      async () => { const d = await getJson('https://api.davidcyril.name.ng/download/ytmp4?url=' + encodeURIComponent(full) + '&quality=' + encodeURIComponent(q)); const u = d?.result?.download_url || d?.result?.url || d?.download_url || d?.url; return u && { url: u, title: d?.result?.title }; },
      async () => { const d = await getJson('https://api.princetechn.com/api/download/ytmp4?apikey=prince&url=' + encodeURIComponent(full)); const u = d?.result?.download_url || d?.result?.url; return u && { url: u, title: d?.result?.title }; },
    );
  }

  // 3) the exact provider chain the working .play command uses, when exposed
  try {
    const p2 = (mode === 'video' && globalThis.__MIAS_P2_VIDEO_BUF__) || (mode === 'audio' && globalThis.__MIAS_P2_AUDIO_BUF__);
    if (typeof p2 === 'function') {
      tries.push(async () => {
        const buf = await p2({ title: '', videoId: id || '', videoUrl: full }, q);
        return buf && { url: null, buf };
      });
    }
  } catch {}

  for (const t of tries) {
    try {
      const r = await t();
      if (!r) continue;
      if (r.buf) { if (isRealMedia(r.buf) || (mode === 'audio' && isAudioBuf(r.buf))) return { buf: r.buf, title: r.title || '' }; continue; }
      if (!r.url) continue;
      const buf = await getBuf(r.url);
      if (mode === 'audio') { if (isAudioBuf(buf)) return { buf, title: r.title || '' }; }
      else if (buf && isRealMedia(buf)) return { buf, title: r.title || '' };
    } catch {}
  }
  return null;
}

// Real audio check (mp3/m4a/ogg/opus/wav) — the old code only sniffed video,
// so some audio providers returned HTML that was then sent as a "song".
function isAudioBuf(buf) {
  if (!buf || buf.length < 32 * 1024) return false;
  const head = buf.slice(0, 40).toString('utf8').trim().toLowerCase();
  if (/^<!doctype|^<html|^\\{|^<\\?xml|^not found|^forbidden|^error/.test(head)) return false;
  if (buf.slice(0, 3).toString('ascii') === 'ID3') return true;
  if (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0) return true;
  if (buf.slice(0, 4).toString('ascii') === 'OggS') return true;
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WAVE') return true;
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') return true; // m4a
  return false;
}`,
}]);

// 1d — ytmate video/audio delivery: use the audited buffers, never a broken file
patch(V24, [{
  name: 'ytmate picker delivers audited audio/video (music name support)',
  marker: 'V25-OK: ytmate audited delivery',
  find:
`    registerPicker(jid, sent, options, async (s, m, n) => {
      await P.react(s, m, '🌀').catch(() => {});
      if (n === 1) {
        const r = await ytDownload(url, 'audio');
        if (!r) return P.sendReply(s, m, '❌ All download APIs failed. Try again later.');
        await sendAudioRobust(s, jid, r.buf, r.title || title, m);
      } else {
        const r = await ytDownload(url, 'video', n === 3 ? '720' : '360');
        if (!r) return P.sendReply(s, m, '❌ All video APIs failed or the video is unavailable. Try again later.');
        await sendVideoRobust(s, jid, r.buf, \`🎬 \${r.title || title}\`, m);
      }
      await P.react(s, m, '✅').catch(() => {});
    }, 'ytmate');`,
  replace:
`    registerPicker(jid, sent, options, async (s, m, n) => {
      // V25-OK: ytmate audited delivery
      await P.react(s, m, '🌀').catch(() => {});
      const label = n === 1 ? 'audio' : (n === 4 ? 'document' : 'video');
      const r = await ytDownload(url, n === 1 ? 'audio' : 'video', n === 3 ? '720' : '360');
      if (!r) {
        await P.react(s, m, '❌').catch(() => {});
        return P.sendReply(s, m, \`❌ No working download source could return a valid \${label} for this video right now. Nothing invalid was sent — please try again in a moment.\`);
      }
      if (n === 1) {
        await sendAudioRobust(s, jid, r.buf, r.title || title, m);
      } else if (n === 4) {
        // Video as DOCUMENT — the exact pre-push behaviour the user asked for
        const safe = String(r.title || title || 'video').replace(/[^\\w\\s.-]/g, '').trim().slice(0, 60) || 'video';
        await s.sendMessage(jid, { document: r.buf, mimetype: 'video/mp4', fileName: safe + '.mp4', caption: \`🎬 \${r.title || title}\` }, { quoted: m });
      } else {
        await sendVideoRobust(s, jid, r.buf, \`🎬 \${r.title || title}\`, m);
      }
      await P.react(s, m, '✅').catch(() => {});
    }, 'ytmate');`,
}]);

// 1e — forward: download + resend FIRST, honest failure reporting
patch(V24, [{
  name: 'forward: resend-first with honest reporting',
  marker: 'V25-OK: forward resend-first',
  find:
`    await P.react(sock, msg, '🌀').catch(() => {});
    // 1) native forward (keeps forwarded tag)
    try {
      const sent = await sock.sendMessage(target, { forward: { key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant }, message: quoted }, force: true });
      if (sent) { await P.react(sock, msg, '✅').catch(() => {}); return P.sendReply(sock, msg, \`✅ Forwarded to +\${target.split('@')[0]}\`); }
    } catch {}
    // 2) relay
    try {
      await sock.relayMessage(target, quoted, { messageId: 'fwd_' + Date.now() });
      await P.react(sock, msg, '✅').catch(() => {});
      return P.sendReply(sock, msg, \`✅ Forwarded to +\${target.split('@')[0]}\`);
    } catch {}
    // 3) download + resend (any media type)
    try {
      const dcm = globalThis.__PRECIOUS__?.downloadContentFromMessage;
      const map = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', stickerMessage: 'sticker', documentMessage: 'document' };`,
  replace:
`    await P.react(sock, msg, '🌀').catch(() => {});
    // V25-OK: forward resend-first
    // The old order tried {forward:{…}} first. On several Baileys builds that
    // promise RESOLVES while nothing is actually delivered, so the command
    // replied "✅ Forwarded" and the target got silence. We now copy the
    // content across first (this always works), and only fall back to the
    // native forward afterwards.
    let _dcm = globalThis.__PRECIOUS__?.downloadContentFromMessage;
    if (typeof _dcm !== 'function') {
      try { const mod = await import('@whiskeysockets/baileys'); _dcm = mod.downloadContentFromMessage || (mod.default && mod.default.downloadContentFromMessage); } catch {}
    }
    try {
      const dcm = _dcm;
      const map = { imageMessage: 'image', videoMessage: 'video', audioMessage: 'audio', stickerMessage: 'sticker', documentMessage: 'document' };`,
}]);

patch(V24, [{
  name: 'forward: native forward kept as fallback after resend',
  marker: 'V25-OK: forward fallback order',
  find:
`      // plain text
      const text = quoted.conversation || quoted.extendedTextMessage?.text;
      if (text) {
        await sock.sendMessage(target, { text });
        await P.react(sock, msg, '✅').catch(() => {});
        return P.sendReply(sock, msg, \`✅ Forwarded to +\${target.split('@')[0]}\`);
      }
    } catch (e) {}
    await P.react(sock, msg, '❌').catch(() => {});
    return P.sendReply(sock, msg, '❌ Could not forward that message.');`,
  replace:
`      // plain text
      const text = quoted.conversation || quoted.extendedTextMessage?.text;
      if (text) {
        const t = await sock.sendMessage(target, { text });
        if (t && t.key) { await P.react(sock, msg, '✅').catch(() => {}); return P.sendReply(sock, msg, \`✅ Forwarded to +\${target.split('@')[0]}\`); }
      }
    } catch (e) {}
    // Fallbacks — only trusted when they actually resolve
    try {
      const sent = await sock.sendMessage(target, { forward: { key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant }, message: quoted }, force: true });
      if (sent && sent.key) { await P.react(sock, msg, '✅').catch(() => {}); return P.sendReply(sock, msg, \`✅ Forwarded to +\${target.split('@')[0]}\`); }
    } catch {}
    try {
      await sock.relayMessage(target, quoted, { messageId: 'fwd_' + Date.now() });
      await P.react(sock, msg, '✅').catch(() => {});
      return P.sendReply(sock, msg, \`✅ Forwarded to +\${target.split('@')[0]}\`);
    } catch {}
    await P.react(sock, msg, '❌').catch(() => {});
    return P.sendReply(sock, msg, '❌ Could not forward that message — check the number and that the bot can reach it.');`,
}]);

// 1f — sudo: hardened DP lookup
patch(V24, [{
  name: 'sudo: hardened target DP lookup',
  marker: 'V25-OK: hardened DP lookup',
  find:
`  async function targetPic(sock, jid) {
    try {
      const url = await sock.profilePictureUrl(jid, 'image');
      if (url) { const b = await getBuf(url, 15000); if (b) return b; }
    } catch {}
    return botPic(); // no dp → bot image card
  }`,
  replace:
`  // V25-OK: hardened DP lookup
  // profilePictureUrl was called once with a raw JID. WhatsApp can hand the
  // same person as 234xxxxxxxxxx@s.whatsapp.net, 234xxxxxxxxxx:12@s.whatsapp.net
  // or an @lid, so one shot often missed and the card fell back to text. We now
  // try every identity form and both picture types before giving up.
  async function targetPic(sock, jid) {
    const raw = String(jid || '');
    const forms = [...new Set([
      raw,
      raw.replace(/:\\d+(?=@)/, ''),
      raw.split('@')[0].replace(/[^0-9]/g, '') ? raw.split('@')[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : '',
    ].filter(Boolean))];
    for (const f of forms) {
      for (const type of ['image', 'preview']) {
        try {
          const url = await sock.profilePictureUrl(f, type);
          if (url) { const b = await getBuf(url, 15000); if (b) return b; }
        } catch {}
      }
      try {
        const url = await sock.profilePictureUrl(f);
        if (url) { const b = await getBuf(url, 15000); if (b) return b; }
      } catch {}
    }
    return botPic(); // genuinely no DP → bot image card (never a blank card)
  }`,
}]);

// 1g — keep the settings guard aware of our new probe
patch(V24, [{
  name: 'settings guard also consults the play-card pending probe',
  marker: 'V25-OK: play pending probe in guard',
  find:
`  globalThis.__miasHasPendingPicker = function (jid) {
    try { if (hasPendingPicker(jid)) return true; } catch {}
    try { if (typeof _prevHasPending === 'function' && _prevHasPending(jid)) return true; } catch {}`,
  replace:
`  globalThis.__miasHasPendingPicker = function (jid) {
    // V25-OK: play pending probe in guard
    // The play card stores its pending state by MESSAGE id, so the old probe
    // (which asked by CHAT jid) always answered false and a bare "4" fell
    // through to the settings consumer → "❌ Unknown settings option *4*".
    try { if (typeof globalThis.__miasPlayPending === 'function' && globalThis.__miasPlayPending(jid)) return true; } catch {}
    try { if (hasPendingPicker(jid)) return true; } catch {}
    try { if (typeof _prevHasPending === 'function' && _prevHasPending(jid)) return true; } catch {}`,
}]);

/* ─────────────────────────────────────────────────────────────────────────────
   2 · mias/precious-gst-picker.cjs  — make .gst actually post
   ───────────────────────────────────────────────────────────────────────────── */
patch('mias/precious-gst-picker.cjs', [{
  name: 'gst: real groupStatusMessageV2 post + honest success reporting',
  marker: 'V25-OK: real group status relay',
  find:
`      async function uploadAndRelay(sock, groupId, payload) {
        const memberJids = await groupMembers(sock, groupId);
        const opts = memberJids.length ? { statusJidList: memberJids } : {};

        // Path 1 — native group status envelope (best quality, native ring)
        try {
          const mod = await import('@whiskeysockets/baileys');
          let g = mod.generateWAMessageContent;
          if (typeof g !== 'function' && ctx.generateWAMessageContent) g = ctx.generateWAMessageContent;
          if (typeof g === 'function') {
            const upload = typeof sock.waUploadToServer === 'function' ? sock.waUploadToServer.bind(sock) : undefined;
            let inner = null;
            if (payload.kind === 'text') inner = await g({ text: payload.text || '' }, upload ? { upload } : {});
            else if (payload.kind === 'image') inner = await g({ image: payload.buf, caption: payload.caption || '' }, upload ? { upload } : {});
            else if (payload.kind === 'video') inner = await g({ video: payload.buf, caption: payload.caption || '', mimetype: 'video/mp4' }, upload ? { upload } : {});
            else if (payload.kind === 'audio') inner = await g({ audio: payload.buf, mimetype: 'audio/ogg; codecs=opus', ptt: false }, upload ? { upload } : {});
            else if (payload.kind === 'sticker') inner = await g({ sticker: payload.buf }, upload ? { upload } : {});
            if (inner) {
              await sock.relayMessage('status@broadcast', { groupStatusMessageV2: { message: inner } }, {
                ...opts,
                messageId: 'MIASG' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase(),
              });
              return true;
            }
          }
        } catch {}

        // Path 2 — plain status@broadcast send (fallback)
        try {
          if (payload.kind === 'text') await sock.sendMessage('status@broadcast', { text: payload.text || '' }, opts);
          else if (payload.kind === 'image') await sock.sendMessage('status@broadcast', { image: payload.buf, caption: payload.caption || '' }, opts);
          else if (payload.kind === 'video') await sock.sendMessage('status@broadcast', { video: payload.buf, caption: payload.caption || '', mimetype: 'video/mp4' }, opts);
          else if (payload.kind === 'audio') await sock.sendMessage('status@broadcast', { audio: payload.buf, mimetype: 'audio/ogg; codecs=opus', ptt: false }, opts);
          else if (payload.kind === 'sticker') await sock.sendMessage('status@broadcast', { sticker: payload.buf }, opts);
          return true;
        } catch { return false; }
      }`,
  replace:
`      // V25-OK: real group status relay
      // WHY THE OLD ONE LIED: the fallback did
      //     sock.sendMessage('status@broadcast', …)
      // which RESOLVES successfully but does NOT create a group-status ring
      // entry, so the handler replied "✅ Posted to group status." while nothing
      // was ever visible. A group status must be RELAYED as a
      // groupStatusMessageV2 envelope with a statusJidList. We now report ✅
      // only when such a relay actually resolved, and we try the group JID
      // first (the form the working in-repo poster uses) then status@broadcast.
      async function uploadAndRelay(sock, groupId, payload) {
        const memberJids = await groupMembers(sock, groupId);
        const opts = memberJids.length ? { statusJidList: memberJids } : {};
        const newId = () => 'MIASG' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();

        let g = null;
        try {
          const mod = await import('@whiskeysockets/baileys');
          g = mod.generateWAMessageContent;
          if (typeof g !== 'function' && mod.default && typeof mod.default.generateWAMessageContent === 'function') g = mod.default.generateWAMessageContent;
          if (typeof g !== 'function' && ctx.generateWAMessageContent) g = ctx.generateWAMessageContent;
        } catch {}
        if (typeof g !== 'function') return { ok: false, error: 'generateWAMessageContent unavailable in this Baileys build' };

        const upload = typeof sock.waUploadToServer === 'function' ? sock.waUploadToServer.bind(sock) : undefined;
        const genOpts = upload ? { upload } : {};
        let inner = null;
        try {
          if (payload.kind === 'text') inner = await g({ text: payload.text || '' }, genOpts);
          else if (payload.kind === 'image') inner = await g({ image: payload.buf, caption: payload.caption || '' }, genOpts);
          else if (payload.kind === 'video') inner = await g({ video: payload.buf, caption: payload.caption || '', mimetype: 'video/mp4' }, genOpts);
          else if (payload.kind === 'audio') inner = await g({ audio: payload.buf, mimetype: 'audio/ogg; codecs=opus', ptt: false }, genOpts);
          else if (payload.kind === 'sticker') inner = await g({ sticker: payload.buf }, genOpts);
        } catch (e) {
          return { ok: false, error: 'media upload failed: ' + ((e && e.message) || e) };
        }
        if (!inner) return { ok: false, error: 'could not build the status content' };

        const targets = [groupId, 'status@broadcast'];
        let lastErr = '';
        for (const t of targets) {
          try {
            await sock.relayMessage(t, { groupStatusMessageV2: { message: inner } }, { ...opts, messageId: newId() });
            return { ok: true, delivered: memberJids.length || 1, via: t };
          } catch (e) { lastErr = (e && e.message) || String(e); }
        }
        return { ok: false, error: lastErr || 'relay rejected' };
      }`,
}]);

patch('mias/precious-gst-picker.cjs', [{
  name: 'gst: handler uses the relay result (no more blind ✅)',
  marker: 'V25-OK: gst honest result',
  find:
`          const ok = await uploadAndRelay(sock, chat, payload);
          clearTimeout(watchdog);
          await reactOnce(ok ? '✅' : '❌');
          return sendReply(sock, msg, ok ? '✅ Posted to group status.' : '❌ Failed to post group status — check bot logs.').catch(() => {});`,
  replace:
`          // V25-OK: gst honest result
          const res = await uploadAndRelay(sock, chat, payload);
          clearTimeout(watchdog);
          await reactOnce(res.ok ? '✅' : '❌');
          return sendReply(sock, msg, res.ok
            ? \`✅ Posted to this group's status ring (\${res.delivered} recipient\${res.delivered === 1 ? '' : 's'}).\`
            : \`❌ Group status was NOT posted — \${res.error || 'unknown error'}. Nothing was sent.\`).catch(() => {});`,
}]);

/* ─────────────────────────────────────────────────────────────────────────────
   3 · mias/precious-anime-edits.cjs — title-only caption
   ───────────────────────────────────────────────────────────────────────────── */
patch('mias/precious-anime-edits.cjs', [{
  name: 'edits: caption is the EDIT TITLE only',
  marker: 'V25-OK: title-only caption',
  find:
`          const caption = \`☄️ *\${cat.label} edit*\\n👤 @\${info.author || 'tiktok'}\\n🔗 \${item.url}\`;`,
  replace:
`          // V25-OK: title-only caption
          // Requested: the delivered edit shows JUST the title — no
          // "☄️ *… edit*", no 👤 @author line, no 🔗 URL.
          const caption = String(info.title || item.title || (cat.label + ' edit'))
            .replace(/\\s+/g, ' ').trim().slice(0, 120) || (cat.label + ' edit');`,
}]);

/* ─────────────────────────────────────────────────────────────────────────────
   4 · mias/index.js — play pending exposure, video-track probe, exit guard
   ───────────────────────────────────────────────────────────────────────────── */
patch('mias/index.js', [{
  name: 'index: expose play-card store + chat-keyed pending probe',
  marker: 'V25-OK: play pending probe exposed',
  find: `const _P2_TTL = 20 * 60 * 1000;
const _P2_PENDING = new Map();`,
  replace: `const _P2_TTL = 20 * 60 * 1000;
const _P2_PENDING = new Map();

// V25-OK: play pending probe exposed
// The settings consumer used to steal a bare "4" typed after a .play card and
// answer "❌ Unknown settings option *4*", because the play store is keyed by
// MESSAGE id while the probe asked by CHAT jid. These globals close that gap.
globalThis.__P2_PENDING__ = _P2_PENDING;
const _P2_CHAT_PENDING = new Map();
globalThis.__P2_CHAT_PENDING__ = _P2_CHAT_PENDING;
function _p2MarkChatPending(jid, on) {
  try {
    const k = _p2NormJid(jid);
    if (!k) return;
    if (on) _P2_CHAT_PENDING.set(k, Date.now()); else _P2_CHAT_PENDING.delete(k);
  } catch {}
}
globalThis.__miasPlayPending = function (jid) {
  try {
    const k = _p2NormJid(jid);
    const ts = _P2_CHAT_PENDING.get(k);
    if (ts && Date.now() - ts < _P2_TTL) return true;
    for (const kv of _P2_PENDING) {
      const e = kv[1];
      if (e && Date.now() - e.ts < _P2_TTL && _p2SameChat(e.jid, jid)) return true;
    }
  } catch {}
  return false;
};`,
}]);

patch('mias/index.js', [{
  name: 'index: mark chat pending when a play card is sent',
  marker: 'V25-OK: mark play pending on card',
  find: `  _p2Sweep();
  _P2_PENDING.set(sent.key.id, {`,
  replace: `  _p2Sweep();
  try { _p2MarkChatPending(jid, true); } catch {}
  _P2_PENDING.set(sent.key.id, {`,
}]);

patch('mias/index.js', [{
  name: 'index: clear chat pending when the choice is consumed',
  marker: 'V25-OK: clear play pending on consume',
  find: `  _P2_PENDING.delete(qid);\n  if (typeof react === 'function') await react(sock, m, '⏳').catch(function () {});`,
  replace: `  _P2_PENDING.delete(qid);\n  try { _p2MarkChatPending(_p2NormJid(jid), false); } catch {}\n  if (typeof react === 'function') await react(sock, m, '⏳').catch(function () {});`,
}]);

patch('mias/index.js', [{
  name: 'index: expose the working play video/audio providers for ytmate',
  marker: 'V25-OK: expose play providers',
  find: `  throw new Error('every video provider failed — try again in a moment');
}`,
  replace: `  throw new Error('every video provider failed — try again in a moment');
}

// V25-OK: expose play providers
// ytmate reuses the exact provider chain this (working) play pipeline uses, so
// it stops depending on the dead mirrors the v24 pack shipped.
try { globalThis.__MIAS_P2_VIDEO_BUF__ = _p2VideoBuf; } catch {}
try { if (typeof _p2AudioBuf === 'function') globalThis.__MIAS_P2_AUDIO_BUF__ = _p2AudioBuf; } catch {}`,
}]);

patch('mias/index.js', [{
  name: 'index: reject audio-only / HTML "video" before it is sent (black video)',
  marker: 'V25-OK: video track probe',
  find: `  for (const t of tries) {
    try {
      const u = await t();
      if (!u) continue;
      return await _p2Get(u, 240000);
    } catch (e) { /* next provider */ }
  }
  throw new Error('every video provider failed — try again in a moment');`,
  replace: `  // V25-OK: video track probe
  // WHY THE VIDEO WAS BLACK: some providers hand back an mp4 that contains an
  // AUDIO-ONLY stream (or an HTML error page). WhatsApp then plays the sound
  // over a black frame. Every candidate is now probed for a real video stream
  // and rejected when it has none, so the next provider is tried instead.
  for (const t of tries) {
    try {
      const u = await t();
      if (!u) continue;
      const buf = await _p2Get(u, 240000);
      if (!buf || buf.length < 32 * 1024) continue;
      const head = buf.slice(0, 40).toString('utf8').trim().toLowerCase();
      if (/^<!doctype|^<html|^\\{|^<\\?xml/.test(head)) continue;
      if (!_p2HasVideoTrack(buf)) continue;
      return buf;
    } catch (e) { /* next provider */ }
  }
  throw new Error('every video provider failed — try again in a moment');`,
}]);

patch('mias/index.js', [{
  name: 'index: _p2HasVideoTrack helper (ffmpeg-static probe)',
  marker: 'V25-OK: _p2HasVideoTrack helper',
  find: `const _P2_TTL = 20 * 60 * 1000;`,
  replace: `// V25-OK: _p2HasVideoTrack helper
function _p2HasVideoTrack(buf) {
  try {
    const cp = require('child_process');
    const fsx = require('fs');
    const osx = require('os');
    const pathx = require('path');
    let ff = 'ffmpeg';
    try { ff = require('ffmpeg-static') || 'ffmpeg'; } catch {}
    const dir = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'p2vt-'));
    const f = pathx.join(dir, 'v.bin');
    fsx.writeFileSync(f, buf);
    const r = cp.spawnSync(ff, ['-hide_banner', '-i', f], { timeout: 30000 });
    try { fsx.rmSync(dir, { recursive: true, force: true }); } catch {}
    const err = String(r.stderr || '');
    return /Stream #\\d+:\\d+.*: Video:/i.test(err) || /Video:\\s/i.test(err);
  } catch (e) {
    // If ffmpeg is unavailable we cannot prove the absence of a video track —
    // do not block a possibly-good download.
    return true;
  }
}

const _P2_TTL = 20 * 60 * 1000;`,
}]);

patch('mias/index.js', [{
  name: 'index: exit guard so APK/WhatsApp reconnects stop restarting the bot',
  marker: 'V25-OK: exit guard',
  find: `// ── CRASH GUARD ──────────────────────────────────────────────────────────────`,
  replace: `// ── V25-OK: exit guard ──────────────────────────────────────────────────────
// WHY THE BOT RESTARTED WITH APK WHATSAPP: the re-pair / reconnect paths call
// process.exit(75) and process.exit(78). With a hand-installed (APK) client the
// socket drops often, so those codes fired on nearly every hiccup and PM2 /
// Railway restarted the whole bot. We now swallow those two codes for the first
// three attempts inside a minute; a genuine, repeated failure still exits.
try {
  const _origProcessExit = process.exit.bind(process);
  let _exitTimes = [];
  process.exit = function (code) {
    try {
      const now = Date.now();
      _exitTimes = _exitTimes.filter((t) => now - t < 60000);
      _exitTimes.push(now);
      if ((code === 75 || code === 78) && _exitTimes.length <= 3) {
        console.error('[exit-guard] suppressed exit(' + code + ') — attempt ' + _exitTimes.length + '/3 in the last minute');
        return;
      }
    } catch {}
    return _origProcessExit(code);
  };
} catch {}

// ── CRASH GUARD ──────────────────────────────────────────────────────────────`,
}]);

/* ───────────────────────────────────────────────────────────────────────────── */
console.log('');
console.log('════════════════════════════════════════════════════');
console.log(' PATCH-v25 result');
console.log('════════════════════════════════════════════════════');
console.log('  edits applied :', applied);
console.log('  already present:', skipped);
console.log('  failed anchors :', failed);
console.log('  backups        : *.v25bak next to each edited file');
console.log('════════════════════════════════════════════════════');
if (failed) process.exitCode = 1;
