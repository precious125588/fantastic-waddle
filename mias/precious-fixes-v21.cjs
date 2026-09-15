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

/* ── module ──────────────────────────────────────────────────────────────── */

function install(ctx) {
  const report = { nkiri: false, tgsticker: false, shazam: false, gst: false };
  const { cmd, CONFIG, sendReply, react } = ctx;
  const PREFIX = (CONFIG && CONFIG.PREFIX) || '.';

  const safeReact = (sock, msg, emoji) => { try { return react(sock, msg, emoji); } catch { return Promise.resolve(); } };

  /* ══════════════════════════════════════════════════════════════════════
     .nkiri — search → seasons → episodes → download-as-document
     ══════════════════════════════════════════════════════════════════════ */
  try {
    const nkiriSearch = async (sock, msg, args) => {
      const q = (args || []).join(' ').trim();
      if (!q) return sendReply(sock, msg, `🎬 *Nkiri Movies & Series*\n\nUsage: *${PREFIX}nkiri <title>*\nExample: *${PREFIX}nkiri avengers*`);
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

        // Build native-flow single_select list (tap → runs .nkpick <url>)
        const rows = results.map((r, i) => ({
          title: `${i + 1}. ${String(r.title || r.name || 'Unknown').slice(0, 60)}`,
          description: (r.categories || []).slice(0, 3).join(' • ') || (r.date || ''),
          rowId: `${PREFIX}nkpick ${r.url || r.link}`,
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
      const url = (args || [])[0];
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
          const rows = seasons.map(s => ({
            title: `📺 Season ${s}`,
            description: `${bySeason[s].length} episode${bySeason[s].length > 1 ? 's' : ''}`,
            rowId: `${PREFIX}nkseason ${url}|${s}`,
          }));
          const body = `🎬 *${r.title || 'Series'}*\n\nThis is a TV series with *${seasons.length}* season${seasons.length > 1 ? 's' : ''}. Pick a season:`;
          if (typeof ctx.sendNativeFlowListMenu === 'function') {
            await ctx.sendNativeFlowListMenu(sock, msg.key.remoteJid, msg, body, [{ title: 'Seasons', rows }], [{ text: '❌ Cancel', id: `${PREFIX}nkcancel` }]);
          } else {
            await sendReply(sock, msg, body + '\n\n' + rows.map(x => x.title).join('\n'));
          }
          return safeReact(sock, msg, '✅');
        }

        // MOVIE → straight to download (document)
        return nkDeliver(sock, msg, movieLinks[0] || links[0], r.title || 'Movie');
      } catch (e) {
        return sendReply(sock, msg, `❌ Error loading title: ${e.message}`);
      }
    };

    // pick a season → episode picker
    const nkSeason = async (sock, msg, args) => {
      const payload = (args || []).join(' ').trim();
      const [url, sStr] = payload.split('|');
      const season = parseInt(sStr, 10);
      if (!url || isNaN(season)) return sendReply(sock, msg, `❌ Invalid season selection.`);
      await safeReact(sock, msg, '⏳');
      try {
        const d = await dcGet('/movies/info', { url }, 30000);
        const r = d?.result || d?.data || {};
        const links = Array.isArray(r.downloadLinks) ? r.downloadLinks : [];
        const eps = [];
        for (const l of links) {
          const m = decodeURIComponent(l).match(/S(\d{1,2})E(\d{1,3})/i);
          if (m && parseInt(m[1], 10) === season) eps.push({ ep: parseInt(m[2], 10), url: l });
        }
        eps.sort((a, b) => a.ep - b.ep);
        if (!eps.length) return sendReply(sock, msg, `❌ No episodes found for Season ${season}.`);

        const rows = eps.map(e => ({
          title: `🎞️ Episode ${e.ep}`,
          description: 'Tap to download',
          rowId: `${PREFIX}nkep ${e.url}`,
        }));
        const body = `📺 *${r.title || 'Series'} — Season ${season}*\n\n*${eps.length}* episode${eps.length > 1 ? 's' : ''}. Pick an episode to download (sent as a document):`;
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
      const dlPage = (args || [])[0];
      if (!dlPage) return sendReply(sock, msg, `❌ Invalid episode selection.`);
      await safeReact(sock, msg, '⬇️');
      return nkDeliver(sock, msg, dlPage, null);
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

    const nkCancel = async (sock, msg) => safeReact(sock, msg, '👍');

    cmd(['nkiri', 'nkiri2', 'movie2'], { desc: 'Search & download Nkiri movies/series — .nkiri <title>', category: 'DOWNLOAD' }, nkiriSearch);
    cmd(['nkpick'],   { desc: 'Internal: nkiri title pick',   category: 'DOWNLOAD' }, nkPick);
    cmd(['nkseason'], { desc: 'Internal: nkiri season pick',  category: 'DOWNLOAD' }, nkSeason);
    cmd(['nkep'],     { desc: 'Internal: nkiri episode pick', category: 'DOWNLOAD' }, nkEp);
    cmd(['nkcancel'], { desc: 'Internal: nkiri cancel',       category: 'DOWNLOAD' }, nkCancel);
    report.nkiri = true;
  } catch (e) { console.log('[precious-v21] nkiri error:', e && e.message); }

  /* ══════════════════════════════════════════════════════════════════════
     .movie — native-flow picker mirroring Nkiri (no moviedl prompts)
     ══════════════════════════════════════════════════════════════════════ */
  try {
    const MOVIE_API = (CONFIG && CONFIG.MYNETNAIJA_API) || `${DC}/movies`;

    async function movieJson(pathOrUrl, params, timeout = 30000) {
      const url = /^https?:\/\//i.test(String(pathOrUrl || '')) ? String(pathOrUrl) : `${MOVIE_API}${pathOrUrl}`;
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const { data } = await axios.get(url, {
            params: params || {}, timeout,
            headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
            validateStatus: () => true,
          });
          if (data && data.success === false && /timeout/i.test(String(data.message || data.error || '')) && attempt < 3) {
            await new Promise(r => setTimeout(r, 900 * attempt));
            continue;
          }
          return data;
        } catch (e) {
          lastErr = e;
          if (attempt < 3) { await new Promise(r => setTimeout(r, 800 * attempt)); continue; }
        }
      }
      throw lastErr || new Error('movie provider request failed');
    }

    function movieList(data) {
      const list = data?.results || data?.data?.results || data?.data || data?.movies || [];
      return Array.isArray(list) ? list.filter(item => item && (item.url || item.link)) : [];
    }

    function movieInfo(data) {
      const d = data?.data || data || {};
      const download = d?.download || {};
      const fileUrl = download?.url || download?.download_url || download?.direct_url || d?.download_url || d?.file_url;
      return {
        title: d?.title || d?.name || 'Movie',
        description: d?.description || d?.overview || '',
        thumbnail: d?.thumbnail || d?.poster || d?.image || '',
        genre: d?.genre || d?.genres || '',
        fileUrl: (typeof fileUrl === 'string' && /^https?:\/\//i.test(fileUrl)) ? fileUrl : null,
        fileName: download?.file_name || '',
        fileExt: String(download?.file_ext || '').toLowerCase(),
        fileSize: download?.file_size || '',
      };
    }

    function movieMime(ext = '') {
      const value = String(ext).toLowerCase().replace(/^\./, '');
      return value === 'mp4' || value === 'm4v' ? 'video/mp4'
        : value === 'mkv' ? 'video/x-matroska'
        : value === 'webm' ? 'video/webm'
        : value === 'avi' ? 'video/x-msvideo'
        : 'application/octet-stream';
    }

    const movieSearch = async (sock, msg, args) => {
      const q = (args || []).join(' ').trim();
      if (!q) return sendReply(sock, msg, `🎬 *Movie Search*\n\nUsage: *${PREFIX}movie <title>*\nExample: *${PREFIX}movie avengers endgame*`);
      await safeReact(sock, msg, '🎬');
      const statusMsg = await sock.sendMessage(msg.key.remoteJid, { text: `🎬 *Movie Search*\n\n⏳ Searching for *${q}* ...` }, { quoted: msg }).catch(() => null);
      const skey = statusMsg?.key;
      try {
        let results = [];
        for (let i = 0; i < 3 && !results.length; i++) {
          try {
            const data = await movieJson('/search', { q }, 30000);
            const arr = movieList(data).slice(0, 20);
            if (arr.length) results = arr;
          } catch {}
        }
        if (!results.length) {
          if (skey) await ctx.editMessage?.(sock, msg.key.remoteJid, skey, `❌ No movie results for *${q}* (or the server is busy — try again).`).catch(() => {});
          else await sendReply(sock, msg, `❌ No movie results for *${q}*.`);
          return safeReact(sock, msg, '❌');
        }

        const rows = results.map((r, i) => ({
          title: `${i + 1}. ${String(r.title || r.name || 'Unknown').slice(0, 60)}`,
          description: (r.genre || r.genres || r.category || r.date || '').toString().slice(0, 72),
          rowId: `${PREFIX}movpick ${r.url || r.link}`,
        }));
        const body = `🎬 *Movie Results — "${q}"*\n\nFound *${results.length}* result${results.length > 1 ? 's' : ''}. Tap *Open Results* and pick one.`;
        if (skey) await sock.sendMessage(msg.key.remoteJid, { delete: skey }).catch(() => {});
        if (typeof ctx.sendNativeFlowListMenu === 'function') {
          await ctx.sendNativeFlowListMenu(sock, msg.key.remoteJid, msg, body,
            [{ title: 'Movie Results', rows }],
            [{ text: '❌ Cancel', id: `${PREFIX}movcancel` }]);
        } else {
          await sendReply(sock, msg, body + `\n\n⚠️ Native picker unavailable on this build.`);
        }
        return safeReact(sock, msg, '✅');
      } catch (e) {
        if (skey) await ctx.editMessage?.(sock, msg.key.remoteJid, skey, `❌ Movie search error: ${e.message}`).catch(() => {});
        return safeReact(sock, msg, '❌');
      }
    };

    const movPick = async (sock, msg, args) => {
      const pageUrl = (args || []).join(' ').trim();
      if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return sendReply(sock, msg, `❌ Invalid movie selection.`);
      await safeReact(sock, msg, '⬇️');
      const chat = msg.key.remoteJid;
      const statusMsg = await sock.sendMessage(chat, { text: `⬇️ *Movie Download*\n\n⏳ Resolving direct movie file...` }, { quoted: msg }).catch(() => null);
      const skey = statusMsg?.key;
      try {
        const data = await movieJson('/info', { url: pageUrl }, 30000);
        const info = movieInfo(data);
        if (!info.fileUrl) throw new Error('no direct movie file was returned by the provider');
        const filename = info.fileName || decodeURIComponent(info.fileUrl.split('/').pop() || `${info.title || 'movie'}.mp4`);
        const ext = info.fileExt || path.extname(filename || '') || '.mp4';
        const caption = [
          `🎬 *${info.title || filename.replace(/\.(mkv|mp4|avi|webm)$/i, '')}*`,
          info.genre ? `🏷️ ${Array.isArray(info.genre) ? info.genre.join(', ') : info.genre}` : '',
          info.fileSize ? `📦 Size: ${info.fileSize}` : '',
          info.description ? `\n📝 ${String(info.description).slice(0, 500)}` : '',
          `\n_Sent as document • native movie picker_`,
        ].filter(Boolean).join('\n');

        if (skey) await sock.sendMessage(chat, { delete: skey }).catch(() => {});
        await race(sock.sendMessage(chat, {
          document: { url: info.fileUrl },
          fileName: filename,
          mimetype: movieMime(ext),
          caption,
        }, { quoted: msg }), 120000, 'movie document send');
        return safeReact(sock, msg, '✅');
      } catch (e) {
        if (skey) await ctx.editMessage?.(sock, chat, skey, `❌ Movie download failed: ${e.message}`).catch(() => {});
        else await sendReply(sock, msg, `❌ Movie download failed: ${e.message}`);
        return safeReact(sock, msg, '❌');
      }
    };

    const movCancel = async (sock, msg) => safeReact(sock, msg, '👍');
    const moviedlRedirect = async (sock, msg) => sendReply(sock, msg, `🎬 Use *${PREFIX}movie <title>* and tap the native picker result.\n\n_This build no longer uses ${PREFIX}moviedl as the main flow._`);

    cmd(['movie'],     { desc: 'Search & download movies via native picker — .movie <title>', category: 'DOWNLOAD' }, movieSearch);
    cmd(['movpick'],   { desc: 'Internal: movie pick',    category: 'DOWNLOAD' }, movPick);
    cmd(['movcancel'], { desc: 'Internal: movie cancel',  category: 'DOWNLOAD' }, movCancel);
    cmd(['moviedl'],   { desc: 'Use .movie native picker instead', category: 'DOWNLOAD' }, moviedlRedirect);
  } catch (e) { console.log('[precious-v21] movie error:', e && e.message); }

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
