import axios from 'axios';

const ZERO_BASE  = 'https://zeroapi2-production.up.railway.app';
const ZERO_KEY   = process.env.ZERO_API_KEY || 'ZERO-ADMIN-4e8a479a618e7a43d0a4edd1';
const NX_BASE    = 'https://api.nexray.eu.cc';
const PREXZY     = 'https://apis.prexzyvilla.site';

const http = axios.create({
  timeout: 40000,
  headers: { 'User-Agent': 'Mozilla/5.0 (WhatsApp/2.24; +MAIS)' },
});

// ── Zero API ─────────────────────────────────────────────────────────────────
export async function zeroGet(path, params = {}) {
  try {
    const { data } = await http.get(`${ZERO_BASE}${path}`, {
      params,
      headers: { 'x-api-key': ZERO_KEY, Authorization: `Bearer ${ZERO_KEY}` },
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || 'ZeroAPI error' };
  }
}

export async function zeroPost(path, body = {}) {
  try {
    const { data } = await http.post(`${ZERO_BASE}${path}`, body, {
      headers: { 'x-api-key': ZERO_KEY, Authorization: `Bearer ${ZERO_KEY}` },
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || 'ZeroAPI error' };
  }
}

// ── Nexray API ────────────────────────────────────────────────────────────────
export async function nxGet(path, params = {}) {
  try {
    const { data } = await http.get(`${NX_BASE}${path}`, { params });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || 'Nexray error' };
  }
}

// ── Prexzy API ────────────────────────────────────────────────────────────────
export async function prexzyGet(path, params = {}) {
  try {
    const { data } = await http.get(`${PREXZY}${path}`, { params });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message || 'Prexzy error' };
  }
}

// ── Fetch buffer from URL ─────────────────────────────────────────────────────
export async function fetchBuffer(url) {
  try {
    const { data } = await http.get(url, { responseType: 'arraybuffer', timeout: 60000 });
    return Buffer.from(data);
  } catch { return null; }
}

// ── TikTok download ───────────────────────────────────────────────────────────
export async function tiktokDL(url) {
  // Try ZeroAPI first
  let r = await zeroGet('/dl/tiktok', { url });
  if (r.ok && (r.data?.result?.videoUrl || r.data?.result?.video)) {
    return { ok: true, data: r.data.result };
  }
  // Try Nexray fallback
  r = await nxGet('/download/tiktok', { url });
  if (r.ok && r.data?.result) return { ok: true, data: r.data.result };
  return { ok: false, error: 'TikTok download failed' };
}

// ── YouTube info ──────────────────────────────────────────────────────────────
export async function ytInfo(query) {
  try {
    const yts = (await import('yt-search')).default;
    const res = await yts(query);
    return { ok: true, videos: res.videos.slice(0, 5) };
  } catch (e) { return { ok: false, error: e.message }; }
}

export async function ytDL(url, type = 'mp4') {
  try {
    const ytdl = await import('@vreden/youtube_scraper');
    if (type === 'mp3') {
      const res = await ytdl.ytmp3(url);
      return { ok: true, data: res };
    }
    const res = await ytdl.ytmp4(url);
    return { ok: true, data: res };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── GPT / AI ──────────────────────────────────────────────────────────────────
export async function askGPT(prompt) {
  let r = await zeroGet('/ai/gpt', { prompt });
  if (r.ok && r.data?.result) return { ok: true, result: r.data.result };
  r = await nxGet('/ai/gpt4', { text: prompt });
  if (r.ok && r.data?.result) return { ok: true, result: r.data.result };
  return { ok: false, error: 'AI unavailable' };
}

// ── Gemini ────────────────────────────────────────────────────────────────────
export async function askGemini(prompt) {
  let r = await zeroGet('/ai/gemini', { prompt });
  if (r.ok && r.data?.result) return { ok: true, result: r.data.result };
  return { ok: false, error: 'Gemini unavailable' };
}

// ── Translate ─────────────────────────────────────────────────────────────────
export async function translate(text, to = 'en') {
  try {
    const gtrans = (await import('google-translate-free')).default;
    const res = await gtrans.translate(text, { to });
    return { ok: true, result: res.text || res };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Weather ───────────────────────────────────────────────────────────────────
export async function getWeather(city) {
  const r = await nxGet('/tools/weather', { city });
  if (r.ok && r.data?.result) return { ok: true, data: r.data.result };
  const r2 = await zeroGet('/tools/weather', { city });
  if (r2.ok && r2.data?.result) return { ok: true, data: r2.data.result };
  return { ok: false, error: 'Weather unavailable' };
}

// ── GitHub stalk ──────────────────────────────────────────────────────────────
export async function githubStalk(username) {
  try {
    const { data } = await http.get(`https://api.github.com/users/${username}`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    return { ok: true, data };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── NPM info ──────────────────────────────────────────────────────────────────
export async function npmInfo(pkg) {
  try {
    const { data } = await http.get(`https://registry.npmjs.org/${pkg}`);
    return { ok: true, data };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Internet speed test ───────────────────────────────────────────────────────
export async function speedTest() {
  try {
    const start = Date.now();
    await http.get('https://www.google.com', { timeout: 8000 });
    const ping = Date.now() - start;
    // Simple download speed estimation
    const dlStart = Date.now();
    const { data: blob } = await http.get(
      'https://speed.cloudflare.com/__down?bytes=1000000',
      { responseType: 'arraybuffer', timeout: 20000 }
    );
    const dlTime = (Date.now() - dlStart) / 1000;
    const dlMbps = ((blob.byteLength * 8) / 1e6 / dlTime).toFixed(2);
    return { ok: true, ping, download: dlMbps };
  } catch (e) { return { ok: true, ping: 0, download: '?', error: e.message }; }
}

// ── Sticker search ────────────────────────────────────────────────────────────
export async function stickerSearch(query) {
  const r = await zeroGet('/sticker/search', { query });
  if (r.ok) return r;
  return { ok: false, error: 'Sticker search failed' };
}

// ── Image AI ──────────────────────────────────────────────────────────────────
export async function imagineAI(prompt) {
  const r = await zeroGet('/ai/imagine', { prompt });
  if (r.ok && r.data?.result) return { ok: true, url: r.data.result };
  return { ok: false, error: 'Image generation failed' };
}

// ── Remini enhance ────────────────────────────────────────────────────────────
export async function reminiEnhance(url) {
  const r = await nxGet('/tools/remini', { url });
  if (r.ok && r.data?.result) return { ok: true, url: r.data.result };
  return { ok: false, error: 'Enhance failed' };
}

// ── Facebook download ─────────────────────────────────────────────────────────
export async function fbDL(url) {
  const r = await zeroGet('/dl/facebook', { url });
  if (r.ok && r.data?.result) return { ok: true, data: r.data.result };
  return { ok: false, error: 'Facebook download failed' };
}

// ── Instagram download ────────────────────────────────────────────────────────
export async function igDL(url) {
  const r = await zeroGet('/dl/instagram', { url });
  if (r.ok && r.data?.result) return { ok: true, data: r.data.result };
  return { ok: false, error: 'Instagram download failed' };
}

// ── Twitter download ──────────────────────────────────────────────────────────
export async function twitterDL(url) {
  const r = await zeroGet('/dl/twitter', { url });
  if (r.ok && r.data?.result) return { ok: true, data: r.data.result };
  return { ok: false, error: 'Twitter download failed' };
}

// ── Spotify search ────────────────────────────────────────────────────────────
export async function spotifySearch(query) {
  const r = await zeroGet('/music/spotify', { query });
  if (r.ok && r.data?.result) return { ok: true, data: r.data.result };
  return { ok: false, error: 'Spotify search failed' };
}

// ── SoundCloud ────────────────────────────────────────────────────────────────
export async function soundcloudDL(url) {
  const r = await zeroGet('/dl/soundcloud', { url });
  if (r.ok && r.data?.result) return { ok: true, data: r.data.result };
  return { ok: false, error: 'SoundCloud download failed' };
}

// ── MediaFire download ────────────────────────────────────────────────────────
export async function mediafireDL(url) {
  const r = await nxGet('/dl/mediafire', { url });
  if (r.ok && r.data?.result) return { ok: true, url: r.data.result };
  return { ok: false, error: 'MediaFire download failed' };
}

// ── Pinterest download ────────────────────────────────────────────────────────
export async function pinterestDL(url) {
  const r = await zeroGet('/dl/pinterest', { url });
  if (r.ok && r.data?.result) return { ok: true, data: r.data.result };
  return { ok: false, error: 'Pinterest download failed' };
}

// ── Quotes ────────────────────────────────────────────────────────────────────
export async function randomQuote() {
  try {
    const { data } = await http.get('https://api.quotable.io/random', { timeout: 8000 });
    return { ok: true, quote: data.content, author: data.author };
  } catch {
    const quotes = [
      { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
      { quote: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
      { quote: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
      { quote: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
    ];
    return { ok: true, ...quotes[Math.floor(Math.random() * quotes.length)] };
  }
}

// ── Joke ──────────────────────────────────────────────────────────────────────
export async function randomJoke() {
  try {
    const { data } = await http.get('https://official-joke-api.appspot.com/random_joke', { timeout: 8000 });
    return { ok: true, setup: data.setup, punchline: data.punchline };
  } catch {
    const jokes = [
      { setup: "Why don't scientists trust atoms?", punchline: "Because they make up everything!" },
      { setup: "What do you call a fake noodle?", punchline: "An impasta!" },
      { setup: "Why did the scarecrow win an award?", punchline: "Because he was outstanding in his field!" },
    ];
    return { ok: true, ...jokes[Math.floor(Math.random() * jokes.length)] };
  }
}

// ── Trivia ────────────────────────────────────────────────────────────────────
export async function getTrivia() {
  try {
    const { data } = await http.get('https://opentdb.com/api.php?amount=1&type=multiple', { timeout: 8000 });
    const q = data.results?.[0];
    if (!q) throw new Error('no data');
    return {
      ok: true,
      question: q.question,
      correct: q.correct_answer,
      options: [...q.incorrect_answers, q.correct_answer].sort(() => Math.random() - 0.5),
    };
  } catch {
    return { ok: true, question: 'What is 2+2?', correct: '4', options: ['3', '4', '5', '6'] };
  }
}

// ── Phone lookup ──────────────────────────────────────────────────────────────
export async function phoneLookup(number) {
  const r = await nxGet('/tools/phone', { number });
  if (r.ok && r.data?.result) return { ok: true, data: r.data.result };
  return { ok: false, error: 'Phone lookup failed' };
}
