/* ══════════════════════════════════════════════════════════════════════════════
   PRECIOUS PLAY v2 — inserted into mias/index.js by PATCH.cjs (do not delete)

   .play <song name | link>
        → sends a PLAYER IMAGE CARD (thumbnail + Title, Author, Duration, Views)
        → the card lists the formats:

             1 = Audio
             2 = Document (.mp3)
             3 = Voice note
             4 = Video (mp4 with sound)

        → the user QUOTES (replies to) the card with a number 1–4 and receives
          exactly that format. The choice stays open for 20 minutes.

   Every name below is prefixed (_P2_ / _p2) and every helper that could clash
   with the host file is required locally inside the function body, so this
   fragment is safe to inject into a 39k-line module.
   ══════════════════════════════════════════════════════════════════════════════ */

const _P2_TTL = 20 * 60 * 1000;
const _P2_PENDING = new Map();
const _P2_BOUND = new WeakSet();

function _p2Views(v) {
  if (v === undefined || v === null || v === '') return 'N/A';
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return String(v).slice(0, 24);
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}

function _p2Dur(v) {
  if (v === undefined || v === null || v === '') return 'N/A';
  if (typeof v === 'string' && v.includes(':')) return v;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return String(v);
  const total = Math.round(n);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

function _p2YtId(u) {
  const m = String(u || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

function _p2ThumbOf(meta) {
  meta = meta || {};
  return meta.thumbUrl || meta.thumbnail || meta.cover || meta.image ||
    (meta.videoId ? 'https://img.youtube.com/vi/' + meta.videoId + '/hqdefault.jpg' : null);
}

async function _p2ThumbBuf(meta) {
  const u = _p2ThumbOf(meta);
  if (!u) return null;
  try {
    const r = await axios.get(u, {
      responseType: 'arraybuffer', timeout: 20000, maxRedirects: 5,
      validateStatus: function (s) { return s >= 200 && s < 400; },
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const b = Buffer.from(r.data || []);
    return b.length > 2000 ? b : null;
  } catch (e) {
    return null;
  }
}

async function _p2Get(url, timeout) {
  const r = await axios.get(url, {
    responseType: 'arraybuffer', timeout: timeout || 180000, maxRedirects: 5,
    validateStatus: function (s) { return s >= 200 && s < 400; },
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' },
  });
  const b = Buffer.from(r.data || []);
  if (b.length < 8000) throw new Error('file too small (' + b.length + ' bytes)');
  const head = b.slice(0, 5).toString('utf8').toLowerCase();
  if (head.startsWith('<!doc') || head.startsWith('<html')) throw new Error('got an HTML page, not media');
  return b;
}

function _p2Sweep() {
  const now = Date.now();
  for (const kv of _P2_PENDING) {
    if (!kv[1] || now - kv[1].ts > _P2_TTL) _P2_PENDING.delete(kv[0]);
  }
}

/* ── media resolvers ───────────────────────────────────────────────────────── */

async function _p2AudioBuf(meta) {
  const raw = meta.videoUrl || meta.url || '';
  const id = meta.videoId || _p2YtId(raw);
  const ytUrl = raw && _p2YtId(raw) ? raw : (id ? 'https://www.youtube.com/watch?v=' + id : raw);
  const tries = [];

  if (ytUrl) tries.push(async () => {
    const r = await dcGet('/download/ytmp3', { url: ytUrl }, 30000);
    const d = r && r.ok ? extractDcPlay(r.data) : null;
    return d ? (d.dlUrl || d.url || null) : null;
  });
  if (meta.title) tries.push(async () => {
    const r = await dcGet('/play', { query: meta.title }, 30000);
    const d = r && r.ok ? extractDcPlay(r.data) : null;
    return d ? (d.dlUrl || d.url || null) : null;
  });
  if (ytUrl) tries.push(async () => {
    const res = await axios.get(
      CONFIG.GIFTED_API + '/api/download/ytmp3?apikey=' + CONFIG.GIFTED_KEY +
      '&url=' + encodeURIComponent(ytUrl),
      { timeout: 60000 }
    );
    const r = res.data && (res.data.result || res.data.data);
    return r ? (r.download_url || r.url || r.audio || r.mp3 || null) : null;
  });
  if (ytUrl) tries.push(async () => {
    const res = await axios.post('https://co.wuk.sh/api/json',
      { url: ytUrl, downloadMode: 'audio', audioFormat: 'mp3' },
      { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 });
    return res.data && (res.data.url || res.data.audio) ? (res.data.url || res.data.audio) : null;
  });
  if (ytUrl) tries.push(async () => {
    const res = await axios.post('https://cobalt-api.kwiatekmiki.com/',
      { url: ytUrl, downloadMode: 'audio', audioFormat: 'mp3' },
      { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 });
    return res.data && res.data.url ? res.data.url : null;
  });

  for (const t of tries) {
    try {
      const u = await t();
      if (!u) continue;
      return await _p2Get(u, 180000);
    } catch (e) { /* next provider */ }
  }

  // last resort — bundled ytdl-core
  try {
    const mod = await import('@distube/ytdl-core').catch(function () { return null; });
    const ytdl = mod && (mod.default || mod);
    if (ytdl && ytUrl) {
      const info = await ytdl.getInfo(ytUrl, { requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } });
      const fmt = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
      const chunks = [];
      const stream = ytdl.downloadFromInfo(info, { format: fmt });
      await new Promise(function (resolve, reject) {
        stream.on('data', function (c) { chunks.push(c); });
        stream.on('end', resolve);
        stream.on('error', reject);
        setTimeout(function () { reject(new Error('ytdl timeout')); }, 120000);
      });
      const b = Buffer.concat(chunks);
      if (b.length > 8000) return b;
    }
  } catch (e) { /* give up */ }

  throw new Error('every audio provider failed — try again in a moment');
}

async function _p2VideoBuf(meta) {
  const raw = meta.videoUrl || meta.url || '';
  const id = meta.videoId || _p2YtId(raw);
  const ytUrl = raw && _p2YtId(raw) ? raw : (id ? 'https://www.youtube.com/watch?v=' + id : raw);
  const tries = [];

  if (ytUrl) tries.push(async () => {
    const r = await dcGet('/download/ytmp4', { url: ytUrl }, 40000);
    const d = r && r.ok ? extractDcPlay(r.data) : null;
    return d ? (d.dlUrl || d.url || null) : null;
  });
  if (ytUrl) tries.push(async () => {
    const res = await axios.get(
      CONFIG.GIFTED_API + '/api/download/ytmp4?apikey=' + CONFIG.GIFTED_KEY +
      '&url=' + encodeURIComponent(ytUrl),
      { timeout: 60000 }
    );
    const r = res.data && (res.data.result || res.data.data);
    return r ? (r.download_url || r.url || r.video || r.mp4 || null) : null;
  });
  if (ytUrl) tries.push(async () => {
    const res = await axios.post('https://co.wuk.sh/api/json',
      { url: ytUrl, downloadMode: 'video', videoQuality: '480' },
      { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 });
    return res.data && res.data.url ? res.data.url : null;
  });
  if (ytUrl) tries.push(async () => {
    const res = await axios.get('https://p.oceansaver.in/ajax/download.php?format=mp4&url=' + encodeURIComponent(ytUrl), { timeout: 30000 });
    const d = res.data || {};
    if (d.success && d.progress_url) {
      for (let i = 0; i < 12; i++) {
        await new Promise(function (r) { setTimeout(r, 3000); });
        const p = await axios.get(d.progress_url, { timeout: 20000 });
        const pd = p.data || {};
        if (pd.success === 1 && pd.download_url) return pd.download_url;
      }
    }
    return null;
  });

  for (const t of tries) {
    try {
      const u = await t();
      if (!u) continue;
      return await _p2Get(u, 240000);
    } catch (e) { /* next provider */ }
  }
  throw new Error('every video provider failed — try again in a moment');
}

/** ffmpeg → real voice note (ogg/opus). Returns null when unavailable. */
async function _p2ToPtt(buf) {
  try {
    const fsx = require('fs');
    const osx = require('os');
    const pathx = require('path');
    const cp = require('child_process');
    const dir = fsx.mkdtempSync(pathx.join(osx.tmpdir(), 'p2ptt-'));
    const inF = pathx.join(dir, 'in.bin');
    const outF = pathx.join(dir, 'out.ogg');
    fsx.writeFileSync(inF, buf);
    const r = cp.spawnSync('ffmpeg', [
      '-y', '-i', inF, '-vn', '-c:a', 'libopus',
      '-b:a', '64k', '-ar', '48000', '-ac', '1', outF,
    ], { timeout: 150000 });
    let out = null;
    try {
      if (r.status === 0 && fsx.existsSync(outF)) {
        const o = fsx.readFileSync(outF);
        if (o.length > 2000) out = o;
      }
    } catch (e) {}
    try { fsx.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    return out;
  } catch (e) {
    return null;
  }
}

/* ── delivery ──────────────────────────────────────────────────────────────── */

async function _p2Deliver(sock, entry, n, quotedKey) {
  const jid = entry.jid;
  const meta = entry.meta || {};
  const title = meta.title || 'audio';
  const safe = String(title).replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60) || 'audio';

  if (n === 4) {
    const vbuf = await _p2VideoBuf(meta);
    const thumb = await _p2ThumbBuf(meta).catch(function () { return null; });
    const payload = {
      video: vbuf,
      mimetype: 'video/mp4',
      fileName: safe + '.mp4',
      caption: '🎬 *' + title + '*\n👤 ' + (meta.artists || meta.author || 'Unknown') + '  ⏱️ ' + _p2Dur(meta.duration),
    };
    if (thumb) payload.jpegThumbnail = thumb;
    await sock.sendMessage(jid, payload, { quoted: quotedKey });
    return;
  }

  const abuf = await _p2AudioBuf(meta);

  if (n === 2) {
    await sock.sendMessage(jid, {
      document: abuf,
      mimetype: 'audio/mpeg',
      fileName: safe + '.mp3',
      caption: '📄 *' + title + '*\n👤 ' + (meta.artists || meta.author || 'Unknown') + '  ⏱️ ' + _p2Dur(meta.duration) + '  👁️ ' + _p2Views(meta.views),
    }, { quoted: quotedKey });
    return;
  }

  if (n === 3) {
    const ogg = await _p2ToPtt(abuf);
    if (ogg) {
      await sock.sendMessage(jid, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: quotedKey });
    } else {
      await sock.sendMessage(jid, { audio: abuf, mimetype: 'audio/mpeg', ptt: true }, { quoted: quotedKey });
    }
    return;
  }

  const thumb = await _p2ThumbBuf(meta).catch(function () { return null; });
  const payload = { audio: abuf, mimetype: 'audio/mpeg', ptt: false, fileName: safe + '.mp3' };
  const thumbUrl = _p2ThumbOf(meta);
  if (thumb || thumbUrl) {
    payload.contextInfo = {
      externalAdReply: {
        title: title,
        body: [meta.artists || meta.author, _p2Dur(meta.duration), _p2Views(meta.views) + ' views']
          .filter(Boolean).join(' • '),
        ...(thumb ? { thumbnail: thumb } : { thumbnailUrl: thumbUrl }),
        mediaType: 1,
        renderLargerThumbnail: true,
        showAdAttribution: false,
        ...(meta.videoUrl ? { sourceUrl: meta.videoUrl } : {}),
      },
    };
  }
  await sock.sendMessage(jid, payload, { quoted: quotedKey });
}

/* ── reply-to-card picker ──────────────────────────────────────────────────── */

function _p2Body(m) {
  const msg = (m && m.message) || {};
  const c =
    msg.conversation ||
    (msg.extendedTextMessage && msg.extendedTextMessage.text) ||
    (msg.imageMessage && msg.imageMessage.caption) ||
    (msg.videoMessage && msg.videoMessage.caption) ||
    (msg.buttonsResponseMessage && msg.buttonsResponseMessage.selectedButtonId) ||
    (msg.listResponseMessage && msg.listResponseMessage.singleSelectReply && msg.listResponseMessage.singleSelectReply.selectedRowId) ||
    (msg.templateButtonReplyMessage && msg.templateButtonReplyMessage.selectedId) ||
    '';
  return String(c || '').trim();
}

function _p2QuotedId(m) {
  const msg = (m && m.message) || {};
  const keys = ['extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage',
    'buttonsResponseMessage', 'listResponseMessage', 'templateButtonReplyMessage', 'conversation'];
  for (const k of keys) {
    const ctx = msg[k] && msg[k].contextInfo;
    if (ctx && ctx.stanzaId) return ctx.stanzaId;
  }
  return null;
}

async function _p2OnMsg(sock, m) {
  const jid = (m && m.key && m.key.remoteJid) || '';
  if (!jid) return;
  const body = _p2Body(m);
  if (!body) return;
  const digits = body.replace(/[^0-9]/g, '');
  if (digits.length !== 1) return;
  const n = Number(digits);
  if (n < 1 || n > 4) return;
  const qid = _p2QuotedId(m);
  if (!qid) return;
  const entry = _P2_PENDING.get(qid);
  if (!entry || entry.jid !== jid) return;
  _P2_PENDING.delete(qid);
  if (typeof react === 'function') await react(sock, m, '⏳').catch(function () {});
  try {
    await _p2Deliver(sock, entry, n, m);
    if (typeof react === 'function') await react(sock, m, '✅').catch(function () {});
  } catch (e) {
    const labels = { 1: 'audio', 2: 'document', 3: 'voice note', 4: 'video' };
    await sock.sendMessage(jid, {
      text: '❌ Could not send the ' + labels[n] + ' for *' + (entry.meta && entry.meta.title ? entry.meta.title : 'that song') + '*.\n_' + (e && e.message ? e.message : e) + '_',
    }, { quoted: m }).catch(function () {});
  }
}

function _p2Bind(sock) {
  try {
    if (!sock || !sock.ev || typeof sock.ev.on !== 'function') return;
    if (_P2_BOUND.has(sock)) return;
    _P2_BOUND.add(sock);
    sock.ev.on('messages.upsert', async function (evt) {
      if (!evt || evt.type !== 'notify') return;
      for (const m of (evt.messages || [])) {
        try { await _p2OnMsg(sock, m); } catch (e) { console.log('[play2] picker error:', e && e.message); }
      }
    });
    console.log('[play2] format-picker listener attached');
  } catch (e) {
    console.log('[play2] bind failed:', e && e.message);
  }
}

/* ── .play ─────────────────────────────────────────────────────────────────── */

cmd(["play", "music", "song"], { desc: "Play a song — card + pick 1 audio / 2 document / 3 voice / 4 video", category: "DOWNLOAD" }, async (sock, msg, args) => {
  const jid = msg.key.remoteJid;
  if (!args || !args.length) {
    await sendReply(sock, msg,
      '🎧 *' + CONFIG.BOT_NAME + ' PLAYER*\n\n' +
      'Usage: ' + CONFIG.PREFIX + 'play <song name or link>\n' +
      'Then quote the card with 1, 2, 3 or 4:\n' +
      '  1 = Audio   2 = Document   3 = Voice   4 = Video');
    return;
  }
  const query = args.join(' ').trim();
  const isUrl = /^https?:\/\//i.test(query);
  await react(sock, msg, '🎧').catch(function () {});

  const status = await sock.sendMessage(jid, {
    text: '🎧 *' + CONFIG.BOT_NAME + ' Player*\n\n🔍 Searching *' + query + '* …',
  }, { quoted: msg }).catch(function () { return null; });

  let meta = null;
  try {
    if (isUrl) {
      const vid = _p2YtId(query);
      const attempts = [
        function () { return dcGet('/download/ytmp3', { url: query }, 30000); },
        function () { return dcGet('/play', { query: query }, 30000); },
      ];
      if (vid) attempts.push(function () { return dcGet('/play', { query: 'https://www.youtube.com/watch?v=' + vid }, 30000); });
      for (const a of attempts) {
        try {
          const r = await a();
          const d = r && r.ok ? extractDcPlay(r.data) : null;
          if (d && (d.title || d.dlUrl)) {
            meta = { ...d, videoUrl: d.videoUrl || query, videoId: _p2YtId(d.videoUrl || query) };
            break;
          }
        } catch (e) {}
      }
    } else {
      try {
        const r = await dcGet('/play', { query: query }, 30000);
        const d = r && r.ok ? extractDcPlay(r.data) : null;
        if (d && (d.title || d.dlUrl)) meta = { ...d, videoId: _p2YtId(d.videoUrl) };
      } catch (e) {}
      if (!meta) {
        try {
          const res = await ytSearch(query);
          const v = res && res[0];
          if (v && v.url) meta = { title: v.title || query, videoUrl: v.url, videoId: _p2YtId(v.url) };
        } catch (e) {}
      }
    }
  } catch (e) {
    console.log('[play2] metadata error:', e && e.message);
  }

  if (!meta) meta = { title: query, videoUrl: isUrl ? query : '', videoId: _p2YtId(query) };
  if (!meta.videoUrl && meta.videoId) meta.videoUrl = 'https://www.youtube.com/watch?v=' + meta.videoId;

  const title = meta.title || query;
  const author = meta.artists || meta.author || meta.channel || 'Unknown';
  const card = [
    '🎧 *' + CONFIG.BOT_NAME + ' — PLAYER*',
    '',
    '🎵 *Title:*     ' + title,
    '👤 *Author:*    ' + author,
    '⏱️ *Duration:*  ' + _p2Dur(meta.duration),
    '👁️ *Views:*     ' + _p2Views(meta.views),
    '',
    '━━━━━━━━━━━━━━━━━━━━',
    '📥 *Choose a format — quote THIS message with the number:*',
    '',
    '  1️⃣  *Audio* — playable audio',
    '  2️⃣  *Document* — .mp3 file to download',
    '  3️⃣  *Voice* — voice note',
    '  4️⃣  *Video* — mp4 with sound',
    '',
    '_Example: reply to this card with_ `1` _for audio, `4` _for video._',
  ].join('\n');

  const thumb = await _p2ThumbBuf(meta).catch(function () { return null; });
  const sent = thumb
    ? await sock.sendMessage(jid, { image: thumb, caption: card }, { quoted: msg }).catch(function () { return null; })
    : await sock.sendMessage(jid, { text: card }, { quoted: msg }).catch(function () { return null; });

  if (status && status.key) { try { await sock.sendMessage(jid, { delete: status.key }); } catch (e) {} }

  if (!sent || !sent.key || !sent.key.id) {
    await sendReply(sock, msg, '❌ Could not send the player card for *' + title + '*.');
    return;
  }

  _p2Sweep();
  _P2_PENDING.set(sent.key.id, {
    jid: jid,
    meta: meta,
    user: (typeof getSender === 'function' ? String(getSender(msg) || '') : ''),
    ts: Date.now(),
  });
  setTimeout(function () { _P2_PENDING.delete(sent.key.id); }, _P2_TTL).unref && setTimeout(function () { _P2_PENDING.delete(sent.key.id); }, _P2_TTL);
  _p2Bind(sock);
  await react(sock, msg, '✅').catch(function () {});
});
