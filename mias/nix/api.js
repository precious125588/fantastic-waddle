/**
 * NIX ASSISTANT — API Handler  v4.9.6
 * ─────────────────────────────────────────────────────────────
 * Primary  : ZeroAPI  (zeroapi2-production.up.railway.app)
 *   ALL endpoints wired: Social, File Hosting, Content, Apps,
 *   Universal, AI, Tools, Downloads
 * Fallback 1: Prexzy  (apis.prexzyvilla.site)
 * Fallback 2: HuggingFace / OpenAI-compatible
 * Fallback 3: Various free public APIs
 *
 * NEVER crashes — always returns a graceful error object.
 */

import axios from 'axios';

// ── Constants ────────────────────────────────────────────────
const ZERO_BASE   = 'https://zeroapi2-production.up.railway.app';
const ZERO_KEY    = process.env.ZERO_API_KEY || 'ZERO-ADMIN-4e8a479a618e7a43d0a4edd1';
const PREXZY_BASE = 'https://apis.prexzyvilla.site';
  const DAVIDCYRIL_BASE = 'https://apis.davidcyril.name.ng';
const HF_BASE     = 'https://api-inference.huggingface.co/models';
const HF_TOKEN    = process.env.HF_TOKEN    || '';
const OPENAI_KEY  = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

const _http = axios.create({
  timeout: 30000,
  headers: { 'User-Agent': 'Mozilla/5.0 (NixAssistant/1.0)', 'Accept': 'application/json' }
});

const ZERO_HEADERS = {
  'x-api-key': ZERO_KEY,
  'Authorization': `Bearer ${ZERO_KEY}`,
  'Content-Type': 'application/json'
};

// ── ZeroAPI helpers ──────────────────────────────────────────
export async function zeroGet(endpoint, params = {}, timeoutMs = 30000) {
  try {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const url = `${ZERO_BASE}${endpoint}${qs.toString() ? '?' + qs.toString() : ''}`;
    const { data } = await _http.get(url, { timeout: timeoutMs, headers: ZERO_HEADERS });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || 'ZeroAPI GET failed' };
  }
}

export async function zeroPost(endpoint, body = {}, timeoutMs = 30000) {
  try {
    const { data } = await _http.post(`${ZERO_BASE}${endpoint}`, body, {
      timeout: timeoutMs, headers: ZERO_HEADERS
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || 'ZeroAPI POST failed' };
  }
}

// ── Prexzy helper ────────────────────────────────────────────
export async function prexzyGet(endpoint, params = {}, timeoutMs = 30000) {
  try {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const url = `${PREXZY_BASE}${endpoint}${qs.toString() ? '?' + qs.toString() : ''}`;
    const { data } = await _http.get(url, { timeout: timeoutMs });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || 'Prexzy GET failed' };
  }
}

// ── Davidcyril API helper ───────────────────────────────────
  export async function davidcyrilGet(endpoint, params = {}, timeoutMs = 30000) {
    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      }
      const url = `${DAVIDCYRIL_BASE}${endpoint}${qs.toString() ? '?' + qs.toString() : ''}`;
      const { data } = await _http.get(url, { timeout: timeoutMs });
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e?.message || 'Davidcyril GET failed' };
    }
  }

  // ── Generic URL downloader ───────────────────────────────────
async function _fetchBuf(url, minBytes = 1000, timeoutMs = 60000) {
  const { data } = await _http.get(url, { responseType: 'arraybuffer', timeout: timeoutMs,
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' } });
  const buf = Buffer.from(data);
  if (buf.length < minBytes) throw new Error(`too small: ${buf.length} bytes`);
  return buf;
}

// Extract the most likely download URL from any ZeroAPI response shape
function _extractUrl(d) {
  if (!d) return null;
  const inner = d?.data || d?.result || d;
  if (typeof inner === 'string' && inner.startsWith('http')) return inner;
  for (const k of ['download_url','download','url','audio','video','mp3','mp4','link','stream','file']) {
    const v = inner?.[k];
    if (v && typeof v === 'string' && v.startsWith('http')) return v;
  }
  // nested medias array
  const medias = inner?.medias || inner?.formats || inner?.links;
  if (Array.isArray(medias) && medias.length) {
    const best = medias.find(m => m?.url)?.url;
    if (best) return best;
  }
  return null;
}

// ════════════════════════════════════════════════════════════
//  SOCIAL MEDIA DOWNLOADS  (ZeroAPI /api/<platform>)
// ════════════════════════════════════════════════════════════

// Generic social downloader — tries ZeroAPI then Prexzy then cobalt
async function _socialDl(platform, url, prexzyEp = null) {
  // 1. ZeroAPI
  const r = await zeroGet(`/api/${platform}`, { url }, 60000);
  if (r.ok) {
    const dlUrl = _extractUrl(r.data);
    const d = r.data?.data || r.data?.result || r.data;
    if (dlUrl) return { ok: true, url: dlUrl, title: d?.title || platform, data: d };
  }

    // 2. Davidcyril API (faster fallback before Prexzy)
    try {
      const dcEp = `/download/${platform}?url=${encodeURIComponent(url)}`;
      const rDc = await _http.get(`${DAVIDCYRIL_BASE}${dcEp}`, { timeout: 60000 });
      if (rDc?.data) {
        const dlUrl = _extractUrl(rDc.data);
        if (dlUrl) return { ok: true, url: dlUrl, title: rDc.data?.result?.title || platform, data: rDc.data?.result || rDc.data };
      }
    } catch {}
    // 3. Prexzy
  if (prexzyEp) {
    try {
      const r2 = await prexzyGet(prexzyEp, { url }, 60000);
      if (r2.ok) {
        const dlUrl = _extractUrl(r2.data);
        if (dlUrl) return { ok: true, url: dlUrl, title: r2.data?.data?.title || platform, data: r2.data?.data || r2.data };
      }
    } catch {}
  }
  // 3. Cobalt universal fallback
  try {
    const { data } = await _http.post('https://api.cobalt.tools/',
      { url: url, videoQuality: '720', filenameStyle: 'basic' },
      { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 });
    if (data?.url) return { ok: true, url: data.url, title: platform, data };
  } catch {}
  return { ok: false, error: `${platform} download failed` };
}

export const nixTikTok     = (url) => _socialDl('tiktok',    url, '/download/tiktok');
export const nixInstagram  = (url) => _socialDl('instagram', url, '/download/instagram');
export const nixYouTube    = (url) => _socialDl('youtube',   url, '/download/ytdownload');
export const nixTwitter    = (url) => _socialDl('twitter',   url, '/download/twitter');
export const nixFacebook   = (url) => _socialDl('facebook',  url, '/download/facebook', '/facebook');
export const nixSnapchat   = (url) => _socialDl('snapchat',  url, null);
export const nixReddit     = (url) => _socialDl('reddit',    url, null);
export const nixThreads    = (url) => _socialDl('threads',   url, null);
export const nixPinterest  = (url) => _socialDl('pinterest', url, null);

// ── Universal auto-detect ────────────────────────────────────
export async function nixUniversal(url) {
  const r = await zeroGet('/api/universal', { url }, 60000);
  if (r.ok) {
    const dlUrl = _extractUrl(r.data);
    const d = r.data?.data || r.data;
    if (dlUrl) return { ok: true, url: dlUrl, title: d?.title || 'Download', data: d };
  }
  return _socialDl('universal', url);
}

// ════════════════════════════════════════════════════════════
//  FILE HOSTING  (/api/<host>)
// ════════════════════════════════════════════════════════════
async function _fileHostDl(host, url) {
  const r = await zeroGet(`/api/${host}`, { url }, 60000);
  if (r.ok) {
    const dlUrl = _extractUrl(r.data);
    if (dlUrl) return { ok: true, url: dlUrl, data: r.data?.data || r.data };
  }
  return { ok: false, error: `${host} download failed` };
}

export const nixMediaFire  = (url) => _fileHostDl('mediafire',  url);
export const nixGDrive     = (url) => _fileHostDl('gdrive',     url);
export const nixDropbox    = (url) => _fileHostDl('dropbox',    url);
export const nixMega       = (url) => _fileHostDl('mega',       url);
export const nixPixeldrain = (url) => _fileHostDl('pixeldrain', url);
export const nixStreamtape = (url) => _fileHostDl('streamtape', url);

// ════════════════════════════════════════════════════════════
//  CONTENT  (/api/movies | /api/anime | /api/adult)
// ════════════════════════════════════════════════════════════
export async function nixMovies(query, type = 'movie', season = null, episode = null) {
  const params = { url: query, type };
  if (season)  params.season  = season;
  if (episode) params.episode = episode;
  const r = await zeroGet('/api/movies', params, 30000);
  if (r.ok) return { ok: true, data: r.data?.data || r.data };
  // fallback: TMDB via prexzy
  try {
    const r2 = await prexzyGet('/search/movie', { query }, 20000);
    if (r2.ok) return { ok: true, data: r2.data?.data || r2.data };
  } catch {}
  return { ok: false };
}

export async function nixAnime(query, episode = 1) {
  const r = await zeroGet('/api/anime', { url: query, episode }, 30000);
  if (r.ok) return { ok: true, data: r.data?.data || r.data };
  try {
    const r2 = await prexzyGet('/anime/search', { query }, 20000);
    if (r2.ok) return { ok: true, data: r2.data?.data || r2.data };
  } catch {}
  return { ok: false };
}

export async function nixAdult(url) {
  // ZeroAPI adult endpoint — requires valid URL
  const r = await zeroGet('/api/adult', { url }, 60000);
  if (r.ok) {
    const dlUrl = _extractUrl(r.data);
    const d = r.data?.data || r.data;
    if (dlUrl && typeof dlUrl === 'string') return { ok: true, url: dlUrl, title: d?.title || 'Adult', data: d };
    // may return a stream url or array of medias
    const d2 = r.data?.data || r.data;
    if (d2) return { ok: true, url: null, title: d2?.title || 'Adult', data: d2 };
  }
  // Prexzy fallback
  try {
    const r2 = await prexzyGet('/nsfw/xget', { url }, 60000);
    if (r2.ok) {
      const dlUrl = _extractUrl(r2.data);
      if (dlUrl) return { ok: true, url: dlUrl, data: r2.data?.data || r2.data };
    }
  } catch {}
  return { ok: false, error: 'Adult download failed' };
}

// ── APK download ─────────────────────────────────────────────
export async function nixApk(packageId) {
  const r = await zeroGet('/api/apk', { url: packageId }, 60000);
  if (r.ok) {
    const dlUrl = _extractUrl(r.data);
    const d = r.data?.data || r.data;
    if (dlUrl) return { ok: true, url: dlUrl, title: d?.name || packageId, data: d };
  }
  try {
    const r2 = await prexzyGet('/download/apk', { packageName: packageId }, 60000);
    if (r2.ok) {
      const dlUrl = _extractUrl(r2.data);
      if (dlUrl) return { ok: true, url: dlUrl, data: r2.data?.data || r2.data };
    }
  } catch {}
  return { ok: false };
}

// ════════════════════════════════════════════════════════════
//  AI CHAT  (/ai/chat  →  /ai/gpt  →  Prexzy  →  Pollinations  →  HF  →  OAI)
// ════════════════════════════════════════════════════════════
export async function nixAiChat(prompt, systemPrompt = '') {
  const full = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  // 1. ZeroAPI /ai/chat (POST)
  try {
    const r = await zeroPost('/ai/chat', { message: prompt, system: systemPrompt || undefined }, 25000);
    if (r.ok) {
      const d = r.data?.data || r.data;
      const t = d?.text || d?.message || d?.result || d?.response || d?.answer || d?.reply;
      if (t && String(t).trim()) return String(t).trim();
    }
  } catch {}

  // 2. ZeroAPI /ai/gpt (GET)
  try {
    const r = await zeroGet('/ai/gpt', { q: prompt }, 25000);
    if (r.ok) {
      const d = r.data?.data || r.data;
      const t = d?.result || d?.answer || d?.response || d?.message || (typeof d === 'string' ? d : null);
      if (t && String(t).trim()) return String(t).trim();
    }
  } catch {}

  // 3. Prexzy
  try {
    const r = await prexzyGet('/ai/aichat', { prompt: full }, 20000);
    if (r.ok) {
      const d = r.data?.data || r.data;
      const t = d?.text || d?.message || d?.result || d?.response || d?.answer;
      if (t && String(t).trim()) return String(t).trim();
    }
  } catch {}

  // 4. Pollinations (always free, no key needed) — FIXED: use `messages` key
  try {
    const msgs = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }]
      : [{ role: 'user', content: prompt }];
    const { data } = await _http.post(
      'https://text.pollinations.ai/openai',
      { model: 'openai', messages: msgs, jsonMode: false, private: true },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    const t = data?.choices?.[0]?.message?.content;
    if (t && t.trim()) return t.trim();
  } catch {}

  // 5. HuggingFace (if token set)
  if (HF_TOKEN) {
    try {
      const { data } = await _http.post(
        `${HF_BASE}/mistralai/Mistral-7B-Instruct-v0.3`,
        { inputs: full, parameters: { max_new_tokens: 512, return_full_text: false } },
        { headers: { Authorization: `Bearer ${HF_TOKEN}` }, timeout: 30000 }
      );
      const t = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
      if (t && t.trim()) return t.trim();
    } catch {}
  }

  // 6. OpenAI-compatible (if key set)
  if (OPENAI_KEY) {
    try {
      const { data } = await _http.post(
        `${OPENAI_BASE}/chat/completions`,
        { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: full }], max_tokens: 512 },
        { headers: { Authorization: `Bearer ${OPENAI_KEY}` }, timeout: 30000 }
      );
      const t = data?.choices?.[0]?.message?.content;
      if (t && t.trim()) return t.trim();
    } catch {}
  }

  // 7. Toxicapis public fallback
  try {
    const { data } = await _http.get(
      `https://api.toxicapis.xyz/ai/gpt?apikey=toxicapis&q=${encodeURIComponent(prompt)}`,
      { timeout: 20000 }
    );
    const t = data?.result || data?.answer || data?.response;
    if (t && String(t).trim()) return String(t).trim();
  } catch {}

  return null;
}

// ════════════════════════════════════════════════════════════
//  IMAGE GENERATION  (/ai/txt2img)
// ════════════════════════════════════════════════════════════
export async function nixGenerateImage(prompt) {
  // 1. ZeroAPI
  try {
    const r = await zeroGet('/ai/txt2img', { prompt }, 60000);
    const imgUrl = _extractUrl(r.data);
    if (imgUrl) {
      const buf = await _fetchBuf(imgUrl, 1000, 30000);
      if (buf) return buf;
    }
  } catch {}

  // 2. Prexzy
  try {
    const r = await prexzyGet('/ai/txt2img', { prompt }, 60000);
    const imgUrl = _extractUrl(r.data);
    if (imgUrl) {
      const buf = await _fetchBuf(imgUrl, 1000, 30000);
      if (buf) return buf;
    }
  } catch {}

  // 3. Pollinations (free, always available)
  try {
    const buf = await _fetchBuf(
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&private=true`,
      1000, 40000
    );
    if (buf) return buf;
  } catch {}

  return null;
}

// ════════════════════════════════════════════════════════════
//  TTS  (/tools/tts)
// ════════════════════════════════════════════════════════════
export async function nixTTS(text, lang = 'en') {
  // 1. ZeroAPI
  try {
    const r = await zeroGet('/tools/tts', { text: text.slice(0, 500), lang }, 25000);
    if (r.ok) {
      const d = r.data?.data || r.data;
      const url = d?.url || d?.audio || d?.result || (typeof d === 'string' && d.startsWith('http') ? d : null);
      if (url) {
        const buf = await _fetchBuf(url, 500, 20000);
        if (buf) return buf;
      }
    }
  } catch {}

  // 2. StreamElements (reliable, free)
  try {
    const buf = await _fetchBuf(
      `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${encodeURIComponent(text.slice(0, 500))}`,
      1000, 18000
    );
    if (buf) return buf;
  } catch {}

  // 3. Google TTS
  try {
    const buf = await _fetchBuf(
      `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 200))}&tl=${lang}&client=tw-ob`,
      500, 15000
    );
    if (buf) return buf;
  } catch {}

  // 4. TikTok TTS
  try {
    const { data } = await _http.post(
      'https://tiktok-tts.weilbyte.net/api/generate',
      { text: text.slice(0, 300), voice: 'en_us_001' },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    if (data?.data) {
      const buf = Buffer.from(data.data, 'base64');
      if (buf.length > 500) return buf;
    }
  } catch {}

  return null;
}

// ════════════════════════════════════════════════════════════
//  SPOTIFY  (/api/spotify)
// ════════════════════════════════════════════════════════════
export async function nixSpotifyDl(url) {
  // 1. ZeroAPI /api/spotify
  try {
    const r = await zeroGet('/api/spotify', { url }, 60000);
    if (r.ok) {
      const d = r.data?.data || r.data;
      const dlUrl = d?.download_url || d?.download || d?.url || d?.audio || d?.mp3;
      if (dlUrl) return { dlUrl, title: d?.title || d?.name || 'Spotify Track', artist: d?.artist || '', cover: d?.cover || d?.thumbnail || d?.image || null };
    }
  } catch {}

  // 2. ZeroAPI /download/spotify (legacy path)
  try {
    const r = await zeroGet('/download/spotify', { url }, 60000);
    if (r.ok) {
      const d = r.data?.data || r.data;
      const dlUrl = d?.download_url || d?.download || d?.url || d?.audio || d?.mp3;
      if (dlUrl) return { dlUrl, title: d?.title || 'Spotify Track', artist: d?.artist || '', cover: d?.cover || null };
    }
  } catch {}

  // 3. Prexzy
  try {
    const r = await prexzyGet('/download/spotify', { url }, 60000);
    if (r.ok) {
      const d = r.data?.data || r.data;
      const dlUrl = d?.download || d?.url || d?.audio;
      if (dlUrl) return { dlUrl, title: d?.title || 'Spotify Track', artist: '', cover: null };
    }
  } catch {}

  // 4. spotifydown.com
  try {
    const trackId = url.split('/track/')[1]?.split('?')[0];
    if (trackId) {
      const { data } = await _http.get(
        `https://api.spotifydown.com/download/${trackId}`,
        { headers: { 'Sec-Fetch-Dest': 'empty', Origin: 'https://spotifydown.com', Referer: 'https://spotifydown.com/' }, timeout: 30000 }
      );
      if (data?.success && data?.link) return { dlUrl: data.link, title: data?.metadata?.title || 'Spotify', artist: data?.metadata?.artists || '', cover: data?.metadata?.cover || null };
    }
  } catch {}

  return null;
}

// ════════════════════════════════════════════════════════════
//  YOUTUBE  (/api/youtube)
// ════════════════════════════════════════════════════════════
export async function nixYtDl(url, type = 'audio') {
  // 1. ZeroAPI /api/youtube
  try {
    const r = await zeroGet('/api/youtube', { url, type }, 60000);
    if (r.ok) {
      const d = r.data?.data || r.data;
      const dlUrl = _extractUrl(d);
      if (dlUrl) return { dlUrl, title: d?.title || 'YouTube' };
    }
  } catch {}

  // 2. ZeroAPI /download/youtube (legacy)
  try {
    const r = await zeroGet('/download/youtube', { url, type }, 60000);
    if (r.ok) {
      const d = r.data?.data || r.data;
      const dlUrl = _extractUrl(d);
      if (dlUrl) return { dlUrl, title: d?.title || 'YouTube' };
    }
  } catch {}

  // 3. Prexzy
  try {
    const r = await prexzyGet('/download/ytdownload', { url, type, format: type === 'audio' ? 'mp3' : 'mp4' }, 60000);
    if (r.ok) {
      const d = r.data?.data || r.data;
      const dlUrl = d?.url || d?.download;
      if (dlUrl) return { dlUrl, title: d?.title || 'YouTube' };
    }
  } catch {}

  // 4. Cobalt fallback
  try {
    const { data } = await _http.post('https://co.wuk.sh/api/json',
      { url, downloadMode: type === 'audio' ? 'audio' : 'video', videoQuality: '720', filenameStyle: 'basic' },
      { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 30000 });
    if (data?.url) return { dlUrl: data.url, title: 'YouTube' };
  } catch {}

  return null;
}

// ════════════════════════════════════════════════════════════
//  TOOLS  (/tools/weather | /tools/wiki | /tools/translate)
// ════════════════════════════════════════════════════════════
export async function nixWeather(city) {
  try {
    const r = await zeroGet('/tools/weather', { city });
    if (r.ok) return { ok: true, data: r.data?.data || r.data };
  } catch {}
  try {
    const r = await prexzyGet('/tools/weather', { city });
    if (r.ok) return { ok: true, data: r.data?.data || r.data };
  } catch {}
  try {
    const { data } = await _http.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 10000 });
    return { ok: true, data };
  } catch {}
  return { ok: false };
}

export async function nixWiki(query) {
  try {
    const r = await zeroGet('/tools/wiki', { q: query });
    if (r.ok) return { ok: true, data: r.data?.data || r.data };
  } catch {}
  try {
    const r = await prexzyGet('/tools/wiki', { query });
    if (r.ok) return { ok: true, data: r.data?.data || r.data };
  } catch {}
  try {
    const { data } = await _http.get(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
      { timeout: 10000 }
    );
    return { ok: true, data };
  } catch {}
  return { ok: false };
}

export async function nixTranslate(text, toLang = 'en', fromLang = 'auto') {
  try {
    const r = await zeroGet('/tools/translate', { text, to: toLang, from: fromLang });
    if (r.ok) return { ok: true, data: r.data?.data || r.data };
  } catch {}
  try {
    const r = await prexzyGet('/tools/translate', { text, lang: toLang });
    if (r.ok) return { ok: true, data: r.data?.data || r.data };
  } catch {}
  try {
    const { data } = await _http.get(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`,
      { timeout: 10000 }
    );
    if (data?.responseStatus === 200) return { ok: true, data: { translated: data.responseData?.translatedText } };
  } catch {}
  return { ok: false };
}

// ════════════════════════════════════════════════════════════
//  SEARCH  (/search/* proxied through ZeroAPI)
// ════════════════════════════════════════════════════════════
export async function nixSearch(query, type = 'web') {
  // Web search via Prexzy (ZeroAPI proxies it internally)
  try {
    const r = await prexzyGet(`/search/${type}`, { query: query, q: query });
    if (r.ok) return { ok: true, data: r.data?.data || r.data };
  } catch {}
  // DuckDuckGo fallback
  try {
    const { data } = await _http.get(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
      { timeout: 10000 }
    );
    return { ok: true, data };
  } catch {}
  return { ok: false };
}

export async function nixYouTubeSearch(query) {
  try {
    const r = await zeroGet('/api/youtube', { q: query, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` }, 20000);
    if (r.ok) return { ok: true, data: r.data?.data || r.data };
  } catch {}
  try {
    const r = await prexzyGet('/search/youtube', { query }, 20000);
    if (r.ok) return { ok: true, data: r.data?.data || r.data };
  } catch {}
  return { ok: false };
}

// ════════════════════════════════════════════════════════════
//  STICKER  (convert image/video buf → webp)
// ════════════════════════════════════════════════════════════
export async function nixMakeSticker(inputBuf, isVideo = false) {
  try {
    const r = await zeroPost('/tools/sticker', { buffer: inputBuf.toString('base64'), video: isVideo }, 30000);
    if (r.ok) {
      const d = r.data?.data || r.data;
      const url = d?.url || d?.sticker;
      if (url) return await _fetchBuf(url, 100, 20000);
    }
  } catch {}
  return null;
}

// ════════════════════════════════════════════════════════════
//  NSFW / ADULT CONTENT (hentai endpoints)
// ════════════════════════════════════════════════════════════
const ZERO_NSFW = {
  htimig:     '/api/adult',
  xsearch:    '/api/adult',
  xdl:        '/api/adult',
  xget:       '/api/adult',
  xhsearch:   '/api/adult',
  xhdl:       '/api/adult',
  phsearch:   '/api/adult',
  phdl:       '/api/adult',
  hentaivid:  '/api/adult',
};

export async function nixNsfw(cmd, query = '') {
  // 1. ZeroAPI adult endpoint
  try {
    const params = query ? { url: query, q: query } : {};
    const r = await zeroGet(ZERO_NSFW[cmd] || '/api/adult', params, 60000);
    if (r.ok) {
      const dlUrl = _extractUrl(r.data);
      if (dlUrl) return { ok: true, url: dlUrl, data: r.data?.data || r.data };
    }
  } catch {}
  // 2. Prexzy nsfw endpoint
  try {
    const PREXZY_MAP = { htimig: '/nsfw/hentai', xsearch: '/search/xsearch', xdl: '/download/xdl', xget: '/nsfw/xget', xhsearch: '/search/xhsearch', xhdl: '/download/xhdl', phsearch: '/search/phsearch', phdl: '/download/phdl', hentaivid: '/nsfw/hentaivid' };
    const ep = PREXZY_MAP[cmd];
    if (ep) {
      const qp = query ? { query, url: query } : {};
      const r2 = await prexzyGet(ep, qp, 60000);
      if (r2.ok) {
        const dlUrl = _extractUrl(r2.data);
        if (dlUrl) return { ok: true, url: dlUrl, data: r2.data?.data || r2.data };
      }
    }
  } catch {}
  return { ok: false, error: `NSFW/${cmd} failed` };
}
