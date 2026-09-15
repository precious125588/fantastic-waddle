/* ══════════════════════════════════════════════════════════════════════════
   precious-fixes-v21.cjs · PRECIOUS FIX PACK v21 (drop-in, installs LAST)
   ──────────────────────────────────────────────────────────────────────────
   WHY YOUR OLD CODE "CAME BACK":
     .play / .gst / .tgsticker / .shazam are re-registered by SEVERAL blocks
     inside mias/index.js (the base cmd(...) plus the late v20/v21/v23/JINX
     patches). The `commands` map is keyed by name, so the LAST registration
     always wins. Older builds shipped a `.cjs` patch that re-registered
     these commands AFTER your fix — restoring the dead-API handlers.
     This module installs from the very END of index.js (after every other
     patch) and re-registers the four commands ONE FINAL TIME, so the fixed
     handlers are always the ones that survive.

   WHAT IT FIXES:
     • .nkiri <title>  → search (max 20) → native-flow list → season list →
       episode list → download sent as a DOCUMENT (from-URL, so a huge file
       streams straight to WhatsApp and never touches RAM / never lags bot).
     • .tgsticker <t.me pack url> → Telegram sticker pack → WhatsApp stickers
       (animated .tgs and video .webm converted to animated WebP via ffmpeg).
     • .shazam (reply to audio/voice/video) → identifies the song via the
       David Cyril Shazam API (audio uploaded to Catbox first for a URL).
     • .gst — kept from v20 (timeout + watchdog + always-settle reaction).

   ONLY THESE APIS ARE USED:
       https://apis.davidcyril.name.ng/movies/search      (Nkiri search)
       https://apis.davidcyril.name.ng/movies/info        (seasons/episodes)
       https://apis.davidcyril.name.ng/nkiri/download     (direct link)
       https://apis.davidcyril.name.ng/telegram-sticker   (TG sticker packs)
       https://apis.davidcyril.name.ng/shazam             (song identify)
       https://apis.davidcyril.name.ng/uploader/catbox    (audio → URL)
   ══════════════════════════════════════════════════════════════════════════ */

'use strict';

const axios = require('axios');
const zlib  = require('zlib');
const os    = require('os');
const fs    = require('fs');
const path  = require('path');
const { spawn } = require('child_process');

const DC = 'https://apis.davidcyril.name.ng';

/* ── helpers ─────────────────────────────────────────────────────────────── */

const race = (p, ms, tag) => Promise.race([
  Promise.resolve(p),
  new Promise((_, rj) => setTimeout(() => rj(new Error((tag || 'op') + ' timed out after ' + Math.round(ms / 1000) + 's')), ms)),
]);

async function dcGet(p, params, timeout = 25000) {
  const { data } = await axios.get(DC + p, { params, timeout });
  return data;
}

const unwrap = (m) => (!m || typeof m !== 'object') ? m : (
  m.ephemeralMessage?.message ||
  m.viewOnceMessage?.message ||
  m.viewOnceMessageV2?.message ||
  m.viewOnceMessageV2Extension?.message ||
  m.documentWithCaptionMessage?.message || m);

function ffmpegBin() {
  try { const p = require('ffmpeg-static'); if (p && typeof p === 'string') return p; } catch {}
  return 'ffmpeg';
}

function runFfmpeg(args, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const pr = spawn(ffmpegBin(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    pr.stderr.on('data', d => { err += d.toString(); });
    const to = setTimeout(() => { try { pr.kill('SIGKILL'); } catch {} reject(new Error('ffmpeg timeout')); }, timeoutMs);
    pr.on('error', e => { clearTimeout(to); reject(e); });
    pr.on('close', c => { clearTimeout(to); c === 0 ? resolve() : reject(new Error('ffmpeg exited ' + c + ': ' + err.slice(-200))); });
  });
}

/* WhatsApp sticker EXIF metadata (pack name / publisher). */
async function tagSticker(webpBuf, pack, author) {
  try {
    const mod = await import('node-webpmux');
    const WebPMux = mod.default || mod;
    if (typeof WebPMux.Image?.initLib === 'function') { try { await WebPMux.Image.initLib(); } catch {} }
    const payload = Buffer.from(JSON.stringify({
      'sticker-pack-id': 'com.mias.tgsticker',
      'sticker-pack-name': String(pack || 'Telegram').slice(0, 120),
      'sticker-pack-publisher': String(author || 'MIAS MDX').slice(0, 120),
      emojis: ['🎭'],
    }), 'utf8');
    const header = Buffer.from([0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00]);
    header.writeUInt32LE(payload.length, 14);
    const img = new WebPMux.Image();
    await img.load(webpBuf);
    img.exif = Buffer.concat([header, payload]);
    const out = await img.save(null, { exif: true });
    return (out && out.length > 12 && out.slice(0,4).toString() === 'RIFF') ? out : webpBuf;
  } catch { return webpBuf; }
}

/* Convert a TG sticker buffer (.tgs lottie / .webm video / static image) → WhatsApp animated/static WebP. */
async function tgToWebp(buffer, url) {
  const isTgs  = /\.tgs(\?|$)/i.test(url || '');
  const isWebm = /\.webm(\?|$)/i.test(url || '');
  const isAnim = isTgs || isWebm;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tgstk-'));
  try {
    let input = buffer;
    let inExt = isWebm ? 'webm' : (isTgs ? 'tgs' : 'img');
    if (isTgs) {
      // .tgs is gzip-compressed Lottie JSON — ffmpeg's lottie decoder wants it raw.
      try { input = zlib.gunzipSync(buffer); inExt = 'json'; } catch { inExt = 'tgs'; }
    }
    const inPath  = path.join(dir, 'in.' + inExt);
    const outPath = path.join(dir, 'out.webp');
    fs.writeFileSync(inPath, input);

    if (!isAnim) {
      // static image → 512x512 static webp
      await runFfmpeg(['-y', '-i', inPath, '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-c:v', 'libwebp', '-lossless', '0', '-q:v', '70', '-preset', 'picture', '-loop', '0', outPath], 60000);
      return fs.readFileSync(outPath);
    }

    // animated → try progressively smaller encodes until < 500 KiB
    const attempts = [
      { fps: 15, t: 6, q: 58 }, { fps: 12, t: 5, q: 45 },
      { fps: 10, t: 4, q: 36 }, { fps: 8,  t: 3, q: 26 },
    ];
    let smallest = null, lastErr = null;
    for (const a of attempts) {
      try {
        await runFfmpeg(['-y', '-i', inPath, '-t', String(a.t), '-vf',
          'fps=' + a.fps + ',scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
          '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(a.q), '-loop', '0', '-an', outPath], 90000);
        const enc = fs.readFileSync(outPath);
        if (!smallest || enc.length < smallest.length) smallest = enc;
        if (enc.length <= 500 * 1024) break;
      } catch (e) { lastErr = e; }
    }
    if (!smallest) throw lastErr || new Error('animated encode failed');
    return smallest;
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

const NKIRI_PICK_TTL_MS = 10 * 60 * 1000;
const _nkiriPickStore = new Map();
const JX_PLAY_TTL_MS = 20 * 60 * 1000;
const _jxPlayPending = new Map();
const _jxPlayLatestByChat = new Map();

function _nkiriGetState(jid) {
  const state = _nkiriPickStore.get(jid);
  if (!state) return null;
  if (Date.now() - Number(state.ts || 0) > NKIRI_PICK_TTL_MS) {
    _nkiriPickStore.delete(jid);
    return null;
  }
  return state;
}

function _nkiriSetState(jid, next) {
  if (!jid || !next || typeof next !== 'object') return null;
  const state = { ...next, ts: Date.now() };
  _nkiriPickStore.set(jid, state);
  setTimeout(() => {
    const current = _nkiriPickStore.get(jid);
    if (current && current.ts === state.ts) _nkiriPickStore.delete(jid);
  }, NKIRI_PICK_TTL_MS + 1000).unref?.();
  return state;
}

function _nkiriClearState(jid) {
  if (jid) _nkiriPickStore.delete(jid);
}

function _jxPlaySweep() {
  const now = Date.now();
  for (const [key, entry] of _jxPlayPending.entries()) {
    if (!entry || now - Number(entry.ts || 0) > JX_PLAY_TTL_MS) _jxPlayPending.delete(key);
  }
  for (const [chatKey, key] of _jxPlayLatestByChat.entries()) {
    if (!_jxPlayPending.has(key)) _jxPlayLatestByChat.delete(chatKey);
  }
}

/* ── module ──────────────────────────────────────────────────────────────── */

function install(ctx) {
  const report = { nkiri: false, play: false, tgsticker: false, shazam: false, gst: false };
  const { cmd, CONFIG, sendReply, react } = ctx;
  const PREFIX = (CONFIG && CONFIG.PREFIX) || '.';

  const safeReact = (sock, msg, emoji) => { try { return react(sock, msg, emoji); } catch { return Promise.resolve(); } };

  /* ══════════════════════════════════════════════════════════════════════
     .nkiri — search → seasons → episodes → download-as-document
     ══════════════════════════════════════════════════════════════════════ */
  try {
    const nkiriSearch = async (sock, msg, args) => {
      const q = (args || []).join(' ').trim();
      if (!q) return sendReply(sock, msg, `🎬 *Nkiri Movies & Series*\n\nUsage: *${PREFIX}nkiri <title>* or *${PREFIX}movie <title>*\nExample: *${PREFIX}nkiri avengers*`);
      await safeReact(sock, msg, '🎬');
      const statusMsg = await sock.sendMessage(msg.key.remoteJid, { text: `🎬 *Nkiri Search*\n\n⏳ Searching for *${q}* ...` }, { quoted: msg }).catch(() => null);
      const skey = statusMsg?.key;
      try {
        // search (max 20) — the upstream (nkiri.com) can be slow, so retry.
        let results = [];
        for (let i = 0; i < 3 && !results.length; i++) {
          try {
            const d = await dcGet('/movies/search', { q, limit: 20 }, 30000);
            const arr = d?.results || d?.data?.results || d?.data || [];
            if (Array.isArray(arr) && arr.length) results = arr.slice(0, 20);
          } catch {}
        }
        if (!results.length) {
          if (skey) await ctx.editMessage?.(sock, msg.key.remoteJid, skey, `❌ No results for *${q}* (or the server is busy — try again).`).catch(() => {});
          else await sendReply(sock, msg, `❌ No results for *${q}*. Try again.`);
          return safeReact(sock, msg, '❌');
        }

        // Build native-flow single_select list with SHORT ids.
        // WhatsApp single_select row ids can silently fail when a full
        // movie URL is stuffed into the payload; cancel still works because
        // its quick-reply id is tiny. Cache the search results and only send
        // `.nkpick <index>` through the button payload.
        const chat = msg.key.remoteJid;
        _nkiriSetState(chat, {
          stage: 'results',
          query: q,
          results: results.map((r) => ({
            title: String(r.title || r.name || 'Unknown'),
            url: r.url || r.link || '',
            categories: Array.isArray(r.categories) ? r.categories.slice(0, 3) : [],
            date: r.date || '',
          })),
        });
        const rows = results.map((r, i) => ({
          title: `${i + 1}. ${String(r.title || r.name || 'Unknown').slice(0, 60)}`,
          description: (r.categories || []).slice(0, 3).join(' • ') || (r.date || ''),
          id: `${PREFIX}nkpick ${i + 1}`,
          rowId: `${PREFIX}nkpick ${i + 1}`,
        }));
        const body = `🎬 *Nkiri — "${q}"*\n\nFound *${results.length}* result${results.length > 1 ? 's' : ''}. Tap *Open Results* and pick one.`;
        if (skey) await sock.sendMessage(msg.key.remoteJid, { delete: skey }).catch(() => {});
        if (typeof ctx.sendNativeFlowListMenu === 'function') {
          await ctx.sendNativeFlowListMenu(sock, msg.key.remoteJid, msg, body,
            [{ title: 'Search Results', rows }],
            [{ text: '❌ Cancel', id: `${PREFIX}nkcancel` }]);
        } else {
          const text = body + '\n\n' + rows.map(r => r.title).join('\n');
          await sendReply(sock, msg, text);
        }
        return safeReact(sock, msg, '✅');
      } catch (e) {
        if (skey) await ctx.editMessage?.(sock, msg.key.remoteJid, skey, `❌ Search error: ${e.message}`).catch(() => {});
        return safeReact(sock, msg, '❌');
      }
    };

    // pick a title → info → if series: season list; if movie: download directly
    const nkPick = async (sock, msg, args) => {
      const chat = msg.key.remoteJid;
      const token = (args || []).join(' ').trim();
      let url = token;
      let pickedTitle = '';
      if (/^\d+$/.test(token)) {
        const state = _nkiriGetState(chat);
        const idx = Number(token) - 1;
        const picked = state?.stage === 'results' ? state.results?.[idx] : null;
        if (!picked?.url) return sendReply(sock, msg, `❌ That picker expired. Run *${PREFIX}nkiri <title>* again.`);
        url = picked.url;
        pickedTitle = picked.title || '';
      }
      if (!url || !/^https?:\/\//i.test(url)) return sendReply(sock, msg, `❌ Invalid selection.`);
      await safeReact(sock, msg, '⏳');
      try {
        const d = await dcGet('/movies/info', { url }, 30000);
        const r = d?.result || d?.data || {};
        const links = Array.isArray(r.downloadLinks) ? r.downloadLinks : [];
        if (!links.length) return sendReply(sock, msg, `❌ No download links found for *${r.title || url}*.`);

        // Group links by season using SxxEyy in the filename.
        const bySeason = {};
        const movieLinks = [];
        for (const l of links) {
          const m = decodeURIComponent(l).match(/S(\d{1,2})E(\d{1,3})/i);
          if (m) {
            const s = parseInt(m[1], 10);
            (bySeason[s] = bySeason[s] || []).push({ ep: parseInt(m[2], 10), url: l });
          } else movieLinks.push(l);
        }
        const seasons = Object.keys(bySeason).map(Number).sort((a, b) => a - b);

        if (seasons.length) {
          // TV SERIES → season picker
          const seasonRows = seasons.map((s) => ({
            season: s,
            episodes: (bySeason[s] || []).slice().sort((a, b) => a.ep - b.ep),
          }));
          _nkiriSetState(chat, {
            stage: 'seasons',
            title: r.title || pickedTitle || 'Series',
            sourceUrl: url,
            seasons: seasonRows,
          });
          const rows = seasons.map(s => ({
            title: `📺 Season ${s}`,
            description: `${bySeason[s].length} episode${bySeason[s].length > 1 ? 's' : ''}`,
            id: `${PREFIX}nkseason ${s}`,
            rowId: `${PREFIX}nkseason ${s}`,
          }));
          const body = `🎬 *${r.title || pickedTitle || 'Series'}*\n\nThis is a TV series with *${seasons.length}* season${seasons.length > 1 ? 's' : ''}. Pick a season:`;
          if (typeof ctx.sendNativeFlowListMenu === 'function') {
            await ctx.sendNativeFlowListMenu(sock, msg.key.remoteJid, msg, body, [{ title: 'Seasons', rows }], [{ text: '❌ Cancel', id: `${PREFIX}nkcancel` }]);
          } else {
            await sendReply(sock, msg, body + '\n\n' + rows.map(x => x.title).join('\n'));
          }
          return safeReact(sock, msg, '✅');
        }

        // MOVIE → straight to download (document)
        _nkiriClearState(chat);
        return nkDeliver(sock, msg, movieLinks[0] || links[0], r.title || pickedTitle || 'Movie');
      } catch (e) {
        return sendReply(sock, msg, `❌ Error loading title: ${e.message}`);
      }
    };

    // pick a season → episode picker
    const nkSeason = async (sock, msg, args) => {
      const chat = msg.key.remoteJid;
      const payload = (args || []).join(' ').trim();
      let season = NaN;
      let title = 'Series';
      let eps = [];

      if (/^\d+$/.test(payload)) {
        const state = _nkiriGetState(chat);
        season = parseInt(payload, 10);
        const seasonEntry = state?.stage === 'seasons'
          ? (state.seasons || []).find((entry) => Number(entry.season) === season)
          : null;
        if (!seasonEntry) return sendReply(sock, msg, `❌ That season picker expired. Run *${PREFIX}nkiri <title>* again.`);
        title = state.title || title;
        eps = (seasonEntry.episodes || []).slice().sort((a, b) => a.ep - b.ep);
      } else {
        const [url, sStr] = payload.split('|');
        season = parseInt(sStr, 10);
        if (!url || isNaN(season)) return sendReply(sock, msg, `❌ Invalid season selection.`);
        await safeReact(sock, msg, '⏳');
        try {
          const d = await dcGet('/movies/info', { url }, 30000);
          const r = d?.result || d?.data || {};
          title = r.title || title;
          const links = Array.isArray(r.downloadLinks) ? r.downloadLinks : [];
          for (const l of links) {
            const m = decodeURIComponent(l).match(/S(\d{1,2})E(\d{1,3})/i);
            if (m && parseInt(m[1], 10) === season) eps.push({ ep: parseInt(m[2], 10), url: l });
          }
          eps.sort((a, b) => a.ep - b.ep);
        } catch (e) {
          return sendReply(sock, msg, `❌ Error loading season: ${e.message}`);
        }
      }

      if (isNaN(season)) return sendReply(sock, msg, `❌ Invalid season selection.`);
      await safeReact(sock, msg, '⏳');
      try {
        if (!eps.length) return sendReply(sock, msg, `❌ No episodes found for Season ${season}.`);

        _nkiriSetState(chat, { stage: 'episodes', title, season, episodes: eps });
        const rows = eps.map(e => ({
          title: `🎞️ Episode ${e.ep}`,
          description: 'Tap to download',
          id: `${PREFIX}nkep ${e.ep}`,
          rowId: `${PREFIX}nkep ${e.ep}`,
        }));
        const body = `📺 *${title} — Season ${season}*\n\n*${eps.length}* episode${eps.length > 1 ? 's' : ''}. Pick an episode to download (sent as a document):`;
        if (typeof ctx.sendNativeFlowListMenu === 'function') {
          await ctx.sendNativeFlowListMenu(sock, msg.key.remoteJid, msg, body, [{ title: `Season ${season} Episodes`, rows }], [{ text: '❌ Cancel', id: `${PREFIX}nkcancel` }]);
        } else {
          await sendReply(sock, msg, body + '\n\n' + rows.map(x => x.title).join('\n'));
        }
        return safeReact(sock, msg, '✅');
      } catch (e) {
        return sendReply(sock, msg, `❌ Error loading season: ${e.message}`);
      }
    };

    // pick an episode → resolve direct link → send as document
    const nkEp = async (sock, msg, args) => {
      const chat = msg.key.remoteJid;
      const token = (args || []).join(' ').trim();
      let dlPage = token;
      let titleHint = null;
      if (/^\d+$/.test(token)) {
        const state = _nkiriGetState(chat);
        const picked = state?.stage === 'episodes'
          ? (state.episodes || []).find((entry) => Number(entry.ep) === Number(token))
          : null;
        if (!picked?.url) return sendReply(sock, msg, `❌ That episode picker expired. Run *${PREFIX}nkiri <title>* again.`);
        dlPage = picked.url;
        titleHint = state.title ? `${state.title} S${String(state.season || '').padStart(2, '0')}E${String(picked.ep).padStart(2, '0')}` : null;
      }
      if (!dlPage) return sendReply(sock, msg, `❌ Invalid episode selection.`);
      await safeReact(sock, msg, '⬇️');
      return nkDeliver(sock, msg, dlPage, titleHint);
    };

    // resolve downloadwella page → direct link → send document FROM URL (never buffered)
    async function nkDeliver(sock, msg, dlPageUrl, titleHint) {
      const chat = msg.key.remoteJid;
      const statusMsg = await sock.sendMessage(chat, { text: `⬇️ *Nkiri Download*\n\n⏳ Resolving direct link...` }, { quoted: msg }).catch(() => null);
      const skey = statusMsg?.key;
      try {
        const d = await dcGet('/nkiri/download', { url: dlPageUrl }, 45000);
        if (!d?.success || !d?.download_url) throw new Error(d?.error || d?.message || 'no download url');
        const directUrl = d.download_url;
        const filename = d.filename || decodeURIComponent(directUrl.split('/').pop() || 'nkiri.mkv');
        const size = d.size || '';
        const caption = `🎬 *${titleHint || filename.replace(/\.(mkv|mp4|avi)$/i, '')}*${size ? `\n📦 Size: ${size}` : ''}\n\n_Sent as document • powered by Nkiri_`;

        if (skey) await sock.sendMessage(chat, { delete: skey }).catch(() => {});

        // Send from URL — WhatsApp/Baileys streams it, so even a multi-GB file
        // never fills the bot's RAM or blocks the event loop.
        await race(sock.sendMessage(chat, {
          document: { url: directUrl },
          fileName: filename,
          mimetype: 'video/x-matroska',
          caption,
        }, { quoted: msg }), 120000, 'document send');

        return safeReact(sock, msg, '✅');
      } catch (e) {
        if (skey) await ctx.editMessage?.(sock, chat, skey, `❌ Download failed: ${e.message}\n\n_The file may be too large or the link expired._`).catch(() => {});
        else await sendReply(sock, msg, `❌ Download failed: ${e.message}`);
        return safeReact(sock, msg, '❌');
      }
    }

    const nkCancel = async (sock, msg) => {
      _nkiriClearState(msg?.key?.remoteJid);
      return safeReact(sock, msg, '👍');
    };

    cmd(['nkiri', 'nkiri2', 'movie2', 'movie'], { desc: 'Search & download Nkiri movies/series — .nkiri <title>', category: 'DOWNLOAD' }, nkiriSearch);
    cmd(['nkpick'],   { desc: 'Internal: nkiri title pick',   category: 'DOWNLOAD' }, nkPick);
    cmd(['nkseason'], { desc: 'Internal: nkiri season pick',  category: 'DOWNLOAD' }, nkSeason);
    cmd(['nkep'],     { desc: 'Internal: nkiri episode pick', category: 'DOWNLOAD' }, nkEp);
    cmd(['nkcancel'], { desc: 'Internal: nkiri cancel',       category: 'DOWNLOAD' }, nkCancel);
    cmd(['moviedl'],  { desc: 'Use .movie native picker instead', category: 'DOWNLOAD' }, async (sock, msg) => {
      await sendReply(sock, msg, `🎬 Use *${PREFIX}movie <title>* and pick from the native Nkiri list.\n\n_The movie flow now uses buttons only — no ${PREFIX}moviedl step needed._`);
    });
    report.nkiri = true;
  } catch (e) { console.log('[precious-v21] nkiri error:', e && e.message); }

  /* ══════════════════════════════════════════════════════════════════════
     .play — keep current banner, add emoji numbers + native picker buttons
     ══════════════════════════════════════════════════════════════════════ */
  try {
    const PLAY_HEADER = '───── 𝑷𝑹𝑬𝑪𝑰𝑶𝑼𝑺 x PLAYER ─────';
    const playNormChat = (jid) => String(jid || '').replace(/:\d+(?=@)/, '');
    const playSender = (msg) => String(msg?.key?.participant || msg?.key?.remoteJid || '');
    const playSameChat = (a, b) => playNormChat(a) === playNormChat(b);
    const playQuotedId = (msg) => {
      const c = msg?.message?.extendedTextMessage?.contextInfo
        || msg?.message?.imageMessage?.contextInfo
        || msg?.message?.videoMessage?.contextInfo
        || msg?.message?.documentMessage?.contextInfo
        || msg?.message?.buttonsResponseMessage?.contextInfo
        || msg?.message?.listResponseMessage?.contextInfo
        || msg?.message?.interactiveResponseMessage?.contextInfo
        || msg?.message?.messageContextInfo;
      return c?.stanzaId || c?.quotedMessage?.key?.id || null;
    };
    const playYtId = (input) => {
      const raw = String(input || '').trim();
      if (!raw) return '';
      const m = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{6,})/i);
      if (m) return m[1];
      if (/^[A-Za-z0-9_-]{6,}$/.test(raw)) return raw;
      return '';
    };
    const playExtract = (data) => {
      const d = data?.result || data?.data || data || {};
      const dlUrl = d.download_url || d.dl_url || d.url || d.audio || d.mp3 || d.link || null;
      const videoUrl = d.video_url || d.source || d.video || d.watch_url || d.youtube_url || null;
      return {
        title: d.title || d.song || d.name || null,
        artists: d.artist || d.artists || d.author || d.channel || null,
        duration: d.duration || d.length || d.timestamp || null,
        views: d.views || d.view_count || null,
        dlUrl,
        videoUrl,
        videoId: playYtId(videoUrl || d.videoId || d.id || ''),
        thumb: d.thumbnail || d.thumb || d.image || null,
      };
    };
    const playStore = (keyId, jid, msg, meta) => {
      if (!keyId || !jid || !meta) return;
      _jxPlaySweep();
      const entry = { jid: playNormChat(jid), user: playSender(msg), meta: { ...meta }, ts: Date.now() };
      _jxPlayPending.set(String(keyId), entry);
      _jxPlayLatestByChat.set(playNormChat(jid), String(keyId));
      const timer = setTimeout(() => {
        const cur = _jxPlayPending.get(String(keyId));
        if (cur && cur.ts === entry.ts) _jxPlayPending.delete(String(keyId));
        const latest = _jxPlayLatestByChat.get(playNormChat(jid));
        if (latest === String(keyId)) _jxPlayLatestByChat.delete(playNormChat(jid));
      }, JX_PLAY_TTL_MS + 1000);
      timer?.unref?.();
    };
    const playFind = (msg) => {
      _jxPlaySweep();
      const jid = msg?.key?.remoteJid || '';
      const user = playSender(msg);
      const quoted = playQuotedId(msg);
      if (quoted) {
        const entry = _jxPlayPending.get(String(quoted));
        if (entry && playSameChat(entry.jid, jid) && (!entry.user || !user || entry.user === user)) return entry;
      }
      const latestKey = _jxPlayLatestByChat.get(playNormChat(jid));
      if (!latestKey) return null;
      const latest = _jxPlayPending.get(String(latestKey));
      if (!latest || !playSameChat(latest.jid, jid)) return null;
      if (latest.user && user && latest.user !== user) return null;
      return latest;
    };
    const playDur = (v) => typeof ctx._p2Dur === 'function' ? ctx._p2Dur(v) : String(v || '0:00');
    const playViews = (v) => typeof ctx._p2Views === 'function' ? ctx._p2Views(v) : String(v || '0');
    const playThumb = async (meta) => {
      if (typeof ctx._p2ThumbBuf === 'function') {
        try {
          const b = await ctx._p2ThumbBuf(meta);
          if (Buffer.isBuffer(b) && b.length) return b;
        } catch {}
      }
      if (meta?.thumb) {
        try {
          const r = await axios.get(meta.thumb, { responseType: 'arraybuffer', timeout: 20000 });
          const b = Buffer.from(r.data || []);
          if (b.length) return b;
        } catch {}
      }
      return null;
    };
    const playEnrich = async (meta, query) => {
      const out = { ...(meta || {}) };
      if (!out.videoUrl && out.videoId) out.videoUrl = `https://www.youtube.com/watch?v=${out.videoId}`;
      if (!out.videoId && out.videoUrl) out.videoId = playYtId(out.videoUrl);
      if ((!out.title || !out.artists || !out.views || !out.duration) && out.videoUrl) {
        try {
          const { data } = await axios.get(`https://www.youtube.com/oembed?url=${encodeURIComponent(out.videoUrl)}&format=json`, { timeout: 15000 });
          if (data?.title && !out.title) out.title = data.title;
          if (data?.author_name && !out.artists) out.artists = data.author_name;
          if (data?.thumbnail_url && !out.thumb) out.thumb = data.thumbnail_url;
        } catch {}
      }
      if ((!out.title || !out.artists || !out.videoUrl) && query) {
        try {
          const ytSearch = require('yt-search');
          const res = await ytSearch(query);
          const hit = Array.isArray(res?.videos) ? res.videos[0] : (Array.isArray(res) ? res[0] : null);
          if (hit) {
            if (!out.title && hit.title) out.title = hit.title;
            if (!out.artists && (hit.author?.name || hit.author)) out.artists = hit.author?.name || hit.author;
            if (!out.duration && (hit.timestamp || hit.duration?.timestamp)) out.duration = hit.timestamp || hit.duration?.timestamp;
            if (!out.views && hit.views) out.views = hit.views;
            if (!out.videoUrl && hit.url) out.videoUrl = hit.url;
            if (!out.videoId && hit.videoId) out.videoId = hit.videoId;
            if (!out.thumb && hit.thumbnail) out.thumb = hit.thumbnail;
          }
        } catch {}
      }
      if (!out.title) out.title = query || out.videoUrl || 'Unknown title';
      if (!out.artists) out.artists = 'Unknown';
      return out;
    };
    const playCardText = (meta) => [
      PLAY_HEADER,
      '',
      'TITLE     : ' + (meta.title || 'Unknown title'),
      'AUTHOR    : ' + (meta.artists || 'Unknown'),
      'DURATION  : ' + playDur(meta.duration),
      'VIEWS     : ' + playViews(meta.views),
      '',
      '────────────────────────',
      'Reply here with a number:',
      '  1️⃣ - Audio',
      '  2️⃣ - Document (.mp3)',
      '  3️⃣ - Voice note',
      '  4️⃣ - Video (.mp4)',
      '  5️⃣ - Video (view once) 👁️',
      '  6️⃣ - Voice note (view once) 🎙️',
    ].join('\n');
    const playSections = () => [{
      title: 'Formats',
      rows: [
        { id: `${PREFIX}jxplaypick 1`, rowId: `${PREFIX}jxplaypick 1`, title: '1️⃣ Audio', description: 'Send standard audio' },
        { id: `${PREFIX}jxplaypick 2`, rowId: `${PREFIX}jxplaypick 2`, title: '2️⃣ Document (.mp3)', description: 'Send MP3 as document' },
        { id: `${PREFIX}jxplaypick 3`, rowId: `${PREFIX}jxplaypick 3`, title: '3️⃣ Voice note', description: 'Send as push-to-talk' },
        { id: `${PREFIX}jxplaypick 4`, rowId: `${PREFIX}jxplaypick 4`, title: '4️⃣ Video (.mp4)', description: 'Send MP4 video' },
        { id: `${PREFIX}jxplaypick 5`, rowId: `${PREFIX}jxplaypick 5`, title: '5️⃣ Video (view once) 👁️', description: 'Send video as view once' },
        { id: `${PREFIX}jxplaypick 6`, rowId: `${PREFIX}jxplaypick 6`, title: '6️⃣ Voice note (view once) 🎙️', description: 'Send voice note as view once' },
      ],
    }];
    const playSearch = async (sock, msg, args) => {
      const jid = msg.key.remoteJid;
      const query = (args || []).join(' ').trim();
      if (!query) return sendReply(sock, msg, `${PLAY_HEADER}\n\nUsage: ${PREFIX}play <song name or link>`);
      await safeReact(sock, msg, '⏳');
      const status = await sock.sendMessage(jid, { text: `${PLAY_HEADER}\nSearching "${query}" ...` }, { quoted: msg }).catch(() => null);
      try {
        const isUrl = /^https?:\/\//i.test(query);
        let meta = null;
        if (isUrl) {
          try {
            const r = await dcGet('/download/ytmp3', { url: query }, 30000);
            meta = playExtract(r);
            if (query && !meta.videoUrl) meta.videoUrl = query;
          } catch {}
        } else {
          try {
            const r = await dcGet('/play', { query }, 30000);
            meta = playExtract(r);
          } catch {}
          if (!meta?.title && !meta?.videoUrl) {
            try {
              const ytSearch = require('yt-search');
              const res = await ytSearch(query);
              const hit = Array.isArray(res?.videos) ? res.videos[0] : (Array.isArray(res) ? res[0] : null);
              if (hit) meta = {
                title: hit.title || query,
                artists: hit.author?.name || hit.author || 'Unknown',
                duration: hit.timestamp || hit.duration?.timestamp || null,
                views: hit.views || null,
                videoUrl: hit.url || '',
                videoId: hit.videoId || playYtId(hit.url || ''),
                thumb: hit.thumbnail || null,
              };
            } catch {}
          }
        }
        meta = await playEnrich(meta || {}, query);
        const card = playCardText(meta);
        const thumb = await playThumb(meta);
        if (status?.key) await sock.sendMessage(jid, { delete: status.key }).catch(() => {});
        let sent = null;
        if (typeof ctx.sendNativeFlowListMenu === 'function') {
          sent = await ctx.sendNativeFlowListMenu(sock, jid, msg, card, playSections(), [{ text: '❌ Cancel', id: `${PREFIX}jxplaycancel` }], `${CONFIG.BOT_NAME} • Player`, thumb ? { headerImage: thumb, headerText: 'PLAYER' } : {});
        }
        if (!sent?.key?.id) {
          sent = thumb
            ? await sock.sendMessage(jid, { image: thumb, caption: card }, { quoted: msg }).catch(() => null)
            : await sock.sendMessage(jid, { text: card }, { quoted: msg }).catch(() => null);
        }
        if (!sent?.key?.id) throw new Error('could not send player card');
        playStore(sent.key.id, jid, msg, meta);
        await safeReact(sock, msg, '✅');
      } catch (e) {
        if (status?.key) await ctx.editMessage?.(sock, jid, status.key, `❌ Play search failed: ${e.message}`).catch(() => {});
        else await sendReply(sock, msg, `❌ Play search failed: ${e.message}`);
        await safeReact(sock, msg, '❌');
      }
    };
    const playDeliver = async (sock, msg, mode) => {
      const entry = playFind(msg);
      if (!entry?.meta) return sendReply(sock, msg, `❌ That player card expired. Run *${PREFIX}play <song>* again.`);
      const meta = entry.meta;
      const jid = msg.key.remoteJid;
      const title = String(meta.title || 'audio').trim();
      const status = await sock.sendMessage(jid, { text: `⬇️ ${PLAY_HEADER}\nPreparing *${title}* ...` }, { quoted: msg }).catch(() => null);
      try {
        if (mode === 4 || mode === 5) {
          const videoBuf = typeof ctx._p2VideoBuf === 'function' ? await ctx._p2VideoBuf(meta) : null;
          if (!Buffer.isBuffer(videoBuf) || !videoBuf.length) throw new Error('video buffer unavailable');
          await sock.sendMessage(jid, { video: videoBuf, mimetype: 'video/mp4', fileName: `${title.replace(/[^\w\-. ]+/g, ' ').trim() || 'video'}.mp4`, viewOnce: mode === 5 }, { quoted: msg });
        } else {
          const audioBuf = typeof ctx._p2AudioBuf === 'function' ? await ctx._p2AudioBuf(meta) : null;
          if (!Buffer.isBuffer(audioBuf) || !audioBuf.length) throw new Error('audio buffer unavailable');
          if (mode === 2) {
            await sock.sendMessage(jid, { document: audioBuf, mimetype: 'audio/mpeg', fileName: `${title.replace(/[^\w\-. ]+/g, ' ').trim() || 'audio'}.mp3` }, { quoted: msg });
          } else if (mode === 3 || mode === 6) {
            let out = audioBuf;
            try {
              if (mode === 3 && typeof ctx._p2ToPtt === 'function') out = await ctx._p2ToPtt(audioBuf, 'audio/mpeg');
            } catch {}
            await sock.sendMessage(jid, { audio: out, mimetype: mode === 3 ? 'audio/ogg; codecs=opus' : 'audio/mpeg', ptt: true, viewOnce: mode === 6 }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { audio: audioBuf, mimetype: 'audio/mpeg', ptt: false, fileName: `${title.replace(/[^\w\-. ]+/g, ' ').trim() || 'audio'}.mp3` }, { quoted: msg });
          }
        }
        if (status?.key) await sock.sendMessage(jid, { delete: status.key }).catch(() => {});
        await safeReact(sock, msg, '✅');
      } catch (e) {
        if (status?.key) await ctx.editMessage?.(sock, jid, status.key, `❌ Download failed: ${e.message}`).catch(() => {});
        else await sendReply(sock, msg, `❌ Download failed: ${e.message}`);
        await safeReact(sock, msg, '❌');
      }
    };
    const playPick = async (sock, msg, args) => {
      const token = Number(String((args || []).join(' ').trim() || '0'));
      if (!Number.isInteger(token) || token < 1 || token > 6) return sendReply(sock, msg, `❌ Invalid player option. Use 1-6.`);
      return playDeliver(sock, msg, token);
    };
    const playCancel = async (sock, msg) => {
      const jid = playNormChat(msg?.key?.remoteJid || '');
      const latestKey = _jxPlayLatestByChat.get(jid);
      if (latestKey) _jxPlayPending.delete(latestKey);
      _jxPlayLatestByChat.delete(jid);
      return safeReact(sock, msg, '👍');
    };
    cmd(['play', 'music', 'song'], { desc: 'Play song — native picker with emoji-numbered formats', category: 'DOWNLOAD' }, playSearch);
    cmd(['jxplaypick'], { desc: 'Internal: player format pick', category: 'DOWNLOAD' }, playPick);
    cmd(['jxplaycancel'], { desc: 'Internal: player cancel', category: 'DOWNLOAD' }, playCancel);
    report.play = true;
  } catch (e) { console.log('[precious-v21] play error:', e && e.message); }

  /* ══════════════════════════════════════════════════════════════════════
     .tgsticker — Telegram sticker pack → WhatsApp stickers
     ══════════════════════════════════════════════════════════════════════ */
  try {
    const tgHandler = async (sock, msg, args) => {
      const input = (args || []).join(' ').trim();
      const m = input.match(/(?:https?:\/\/)?t\.me\/addstickers\/([A-Za-z0-9_]+)/i) || input.match(/^([A-Za-z0-9_]{3,})$/);
      if (!m) return sendReply(sock, msg, `🎭 *Telegram Sticker → WhatsApp*\n\nUsage: *${PREFIX}tgsticker <pack link>*\nExample: *${PREFIX}tgsticker https://t.me/addstickers/HotCherry*`);
      const packUrl = `https://t.me/addstickers/${m[1]}`;
      await safeReact(sock, msg, '🎭');
      const chat = msg.key.remoteJid;
      const statusMsg = await sock.sendMessage(chat, { text: `🎭 *TG Sticker*\n\n⏳ Fetching pack *${m[1]}* ...` }, { quoted: msg }).catch(() => null);
      const skey = statusMsg?.key;
      try {
        const d = await dcGet('/telegram-sticker', { url: packUrl }, 30000);
        if (!d?.status || !d?.result?.sticker?.length) throw new Error(d?.message || 'pack not found or empty');
        const packName = d.result.title || d.result.name || m[1];
        const stickers = d.result.sticker.slice(0, 30); // cap to keep it fast
        if (skey) await ctx.editMessage?.(sock, chat, skey, `🎭 *${packName}*\n\n⬇️ Converting ${stickers.length} sticker${stickers.length > 1 ? 's' : ''} ...`).catch(() => {});

        let sent = 0, failed = 0;
        for (const st of stickers) {
          try {
            const resp = await race(axios.get(st.url, { responseType: 'arraybuffer', timeout: 25000 }), 30000, 'sticker fetch');
            const buf = Buffer.from(resp.data);
            const webp = await tgToWebp(buf, st.url);
            const tagged = await tagSticker(webp, packName, CONFIG.BOT_NAME || 'MIAS MDX');
            await race(sock.sendMessage(chat, { sticker: tagged }, { quoted: msg }), 30000, 'sticker send');
            sent++;
            // small gap so WhatsApp doesn't rate-limit a burst
            await new Promise(r => setTimeout(r, 600));
          } catch (e) { failed++; console.log('[tgsticker] one sticker failed:', e && e.message); }
        }
        if (skey) await sock.sendMessage(chat, { delete: skey }).catch(() => {});
        await sendReply(sock, msg, `🎭 *${packName}*\n\n✅ Sent *${sent}* sticker${sent !== 1 ? 's' : ''}${failed ? ` (${failed} failed)` : ''}.`);
        return safeReact(sock, msg, sent ? '✅' : '❌');
      } catch (e) {
        if (skey) await ctx.editMessage?.(sock, chat, skey, `❌ TG Sticker error: ${e.message}`).catch(() => {});
        else await sendReply(sock, msg, `❌ TG Sticker error: ${e.message}`);
        return safeReact(sock, msg, '❌');
      }
    };
    cmd(['tgsticker', 'tgstickers', 'tgs'], { desc: 'Telegram sticker pack → WhatsApp stickers', category: 'STICKER' }, tgHandler);
    report.tgsticker = true;
  } catch (e) { console.log('[precious-v21] tgsticker error:', e && e.message); }

  /* ══════════════════════════════════════════════════════════════════════
     .shazam — identify a song from a replied audio / voice / video
     ══════════════════════════════════════════════════════════════════════ */
  try {
    const shazamHandler = async (sock, msg) => {
      const chat = msg.key.remoteJid;
      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const src = unwrap(q || msg.message || {});
      const aud = src?.audioMessage, vid = src?.videoMessage;
      if (!aud && !vid) return sendReply(sock, msg, `🎵 *Shazam*\n\nReply to an *audio, voice note or video* with *${PREFIX}shazam* to identify the song.`);
      await safeReact(sock, msg, '🎵');
      const statusMsg = await sock.sendMessage(chat, { text: `🎵 *Shazam*\n\n⬡ Downloading audio...\n◻ Identifying song...` }, { quoted: msg }).catch(() => null);
      const skey = statusMsg?.key;
      try {
        const dl = ctx.downloadContentFromMessage;
        if (typeof dl !== 'function') throw new Error('media downloader unavailable');
        let buf = Buffer.from([]);
        const stream = await dl(aud || vid, aud ? 'audio' : 'video');
        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
        if (!buf || buf.length < 15000) throw new Error('audio too short — need at least ~5 seconds');
        if (buf.length > 8 * 1024 * 1024) buf = buf.slice(0, 8 * 1024 * 1024); // keep it light

        if (skey) await ctx.editMessage?.(sock, chat, skey, `🎵 *Shazam*\n\n⬢ Audio ready ✅\n⬡ Identifying song...`).catch(() => {});

        // 1) upload to Catbox to get a public URL  2) ask the Shazam API
        let audioUrl = null;
        try {
          const FD = (await import('form-data')).default;
          const form = new FD();
          form.append('file', buf, { filename: aud ? 'audio.ogg' : 'audio.mp4', contentType: aud ? 'audio/ogg' : 'video/mp4' });
          const up = await race(axios.post(`${DC}/uploader/catbox`, form, { headers: form.getHeaders(), timeout: 45000 }), 50000, 'catbox upload');
          if (up.data?.success && up.data?.url) audioUrl = up.data.url;
        } catch (e) { console.log('[shazam] catbox upload failed:', e && e.message); }
        if (!audioUrl) throw new Error('could not upload audio for identification');

        const d = await dcGet('/shazam', { url: audioUrl }, 40000);
        if (!d?.success || !d?.result) throw new Error(d?.message || 'song not recognised');
        const r = d.result;
        const title = r.title || r.track || 'Unknown';
        const artist = r.artist || r.subtitle || 'Unknown artist';
        const lines = [
          `🎵 *Song Identified!*`, ``,
          `🎤 *Title:* ${title}`,
          `👤 *Artist:* ${artist}`,
          r.album ? `💿 *Album:* ${r.album}` : null,
          r.genre ? `🎼 *Genre:* ${r.genre}` : null,
          r.release_date ? `📅 *Released:* ${r.release_date}` : null,
          r.shazam_url ? `🔗 ${r.shazam_url}` : null,
        ].filter(Boolean).join('\n');

        if (skey) await sock.sendMessage(chat, { delete: skey }).catch(() => {});
        // send cover art if present
        if (r.cover) {
          try {
            await race(sock.sendMessage(chat, { image: { url: r.cover }, caption: lines }, { quoted: msg }), 30000, 'cover send');
          } catch { await sendReply(sock, msg, lines); }
        } else {
          await sendReply(sock, msg, lines);
        }
        return safeReact(sock, msg, '✅');
      } catch (e) {
        if (skey) await ctx.editMessage?.(sock, chat, skey, `🎵 *Shazam*\n\n❌ ${e.message}`).catch(() => {});
        else await sendReply(sock, msg, `🎵 *Shazam*\n\n❌ ${e.message}`);
        return safeReact(sock, msg, '❌');
      }
    };
    cmd(['shazam', 'whatmusic', 'findsong'], { desc: 'Identify a song from audio/voice note', category: 'TOOLS' }, shazamHandler);
    report.shazam = true;
  } catch (e) { console.log('[precious-v21] shazam error:', e && e.message); }

  /* ══════════════════════════════════════════════════════════════════════
     .gst — re-pin the v20 fixed handler (timeout + watchdog + always settle)
     ══════════════════════════════════════════════════════════════════════ */
  try {
    const genId = () => 'PREC' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const innerOf = (m) => {
      if (!m) return null;
      if (m.imageMessage) return { kind: 'image', raw: m.imageMessage };
      if (m.videoMessage) return { kind: 'video', raw: m.videoMessage };
      if (m.audioMessage) return { kind: 'audio', raw: m.audioMessage };
      if (m.stickerMessage) return { kind: 'sticker', raw: m.stickerMessage };
      if (m.documentMessage) return { kind: 'document', raw: m.documentMessage };
      return null;
    };
    const textOf = (m) => m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || m?.videoMessage?.caption || '';
    const bufOf = async (inner) => {
      const dl = ctx.downloadContentFromMessage;
      if (typeof dl !== 'function') return null;
      let b = Buffer.from([]);
      const stream = await dl(inner.raw, inner.kind === 'document' ? 'document' : inner.kind);
      for await (const c of stream) b = Buffer.concat([b, c]);
      return b;
    };
    async function postStatus(sock, chat, memberJids, payload) {
      const opts = { statusJidList: memberJids, messageId: genId() };
      const errs = [];
      try { await race(sock.sendMessage('status@broadcast', { ...payload, contextInfo: { isGroupStatus: true, mentionedJid: [] } }, opts), 45000, 'status upload'); return true; }
      catch (e) { errs.push('broadcast: ' + (e && e.message)); }
      try { await race(sock.sendMessage(chat, { ...payload, contextInfo: { isGroupStatus: true } }), 30000, 'in-chat'); return true; }
      catch (e) { errs.push('in-chat: ' + (e && e.message)); }
      throw new Error(errs.join(' | ') || 'all posting failed');
    }
    const gstHandler = async (sock, msg, args) => {
      const chat = msg.key.remoteJid;
      if (!String(chat || '').endsWith('@g.us')) return sendReply(sock, msg, '👥 *Group Status* is group-only.');
      let settled = false;
      const reactOnce = async (emoji) => { if (settled) return; settled = true; try { await (ctx.forceReaction || react)(sock, msg, emoji); } catch {} };
      await reactOnce('🌀'); settled = false;
      const watchdog = setTimeout(() => reactOnce('❌'), 90000);
      try {
        const text = (args || []).join(' ').trim();
        const ctxi = msg.message?.extendedTextMessage?.contextInfo || msg.message?.imageMessage?.contextInfo || msg.message?.videoMessage?.contextInfo || null;
        const quoted = ctxi?.quotedMessage ? unwrap(ctxi.quotedMessage) : null;
        const qInner = innerOf(quoted) || innerOf(unwrap(msg.message || {}));
        const quotedText = quoted ? textOf(quoted) : '';
        if (!qInner && !text && !quotedText) {
          clearTimeout(watchdog);
          await reactOnce('❌');
          return sendReply(sock, msg, `📢 *Group Status*\n\nReply to media + *${PREFIX}gst*, or *${PREFIX}gst <text>* for a text status.`);
        }
        let memberJids = [];
        try { const meta = await race(sock.groupMetadata(chat), 15000, 'groupMetadata'); memberJids = (meta?.participants || []).map(p => (typeof p.id === 'string' ? p.id : String(p.id || ''))).filter(Boolean); } catch {}
        let payload;
        if (qInner) {
          const buf = await race(bufOf(qInner), 60000, 'media download');
          if (!buf || !buf.length) throw new Error('could not download the media');
          payload = qInner.kind === 'image' ? { image: buf, caption: text || qInner.raw.caption || '' }
                  : qInner.kind === 'video' ? { video: buf, caption: text || qInner.raw.caption || '' }
                  : qInner.kind === 'audio' ? { audio: buf, mimetype: 'audio/mpeg' }
                  : qInner.kind === 'sticker' ? { sticker: buf }
                  : { document: buf, mimetype: qInner.raw.mimetype || 'application/octet-stream', fileName: qInner.raw.fileName || 'file' };
        } else {
          payload = { text: text || quotedText };
        }
        await postStatus(sock, chat, memberJids, payload);
        clearTimeout(watchdog);
        await reactOnce('✅');
        await sendReply(sock, msg, '✅ Posted to group status.').catch(() => {});
      } catch (e) {
        clearTimeout(watchdog);
        await reactOnce('❌');
        await sendReply(sock, msg, `❌ Group status failed: ${e.message}`).catch(() => {});
      }
    };
    cmd(['gst', 'gstatus', 'groupstatus'], { desc: 'Post to group status', category: 'GROUP' }, gstHandler);
    report.gst = true;
  } catch (e) { console.log('[precious-v21] gst error:', e && e.message); }

  console.log('[precious-v21] installed → nkiri:' + report.nkiri + ' tgsticker:' + report.tgsticker + ' shazam:' + report.shazam + ' gst:' + report.gst);
  return report;
}

module.exports = { install };
