/**
 * NEW PAGE — Extra Commands  v3
 * Full deps usage:
 *  figlet         → .font   (ASCII art → canvas image sticker)
 *  @napi-rs/canvas → .font, .colorhex  (image rendering)
 *  qrcode          → .qr    (QR code image)
 *  crypto-js       → .hash  (MD5 / SHA-1 / SHA-256 / SHA-512)
 *  google-tts-api  → .tts   (text-to-speech audio)
 *  google-translate-free → .translate
 *  link-preview-js → .linkinfo
 *  lodash          → .fake, .leet, shuffles
 *  moment-timezone → .time, .timezone
 *  human-readable  → .mediainfo (file sizes)
 *  emoji-db        → .emoji
 *  qs              → query string in API calls
 *  cheerio         → lyrics / country HTML scraping fallback
 *  GKTW helper     → .vv, .vvid, .vvimg
 */

import { forwardViewOnce, makeViewOnce, downloadFromMessage, sendButtons } from '../lib/gktw.js';
import { getImageEngine, getStickerEngine, readImageJimp, canvasTextImage } from '../lib/engines.js';
import { fetchBuffer, zeroGet, nxGet, prexzyGet } from '../lib/api.js';
import { isOwnerOrSudo, isBotOwner, senderNum } from '../lib/utils.js';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs';

// ── Lazy dep loaders ──────────────────────────────────────────────────────────
async function loadFiglet()    { return (await import('figlet')).default; }
async function loadCanvas()    { return await import('@napi-rs/canvas'); }
async function loadQrcode()    { return (await import('qrcode')).default; }
async function loadCryptoJS()  { return (await import('crypto-js')).default; }
async function loadGoogleTTS() { return (await import('google-tts-api')).default; }
async function loadTranslate() { return (await import('google-translate-free')).default || (await import('google-translate-free')); }
async function loadLinkPreview(){ return await import('link-preview-js'); }
async function loadLodash()    { return (await import('lodash')).default; }
async function loadMoment()    { return (await import('moment-timezone')).default; }
async function loadHumanReadable(){ return (await import('human-readable')).default || (await import('human-readable')); }
async function loadEmojiDb()   { return (await import('emoji-db')).default || (await import('emoji-db')); }
async function loadQs()        { return (await import('qs')).default; }
async function loadCheerio()   { return await import('cheerio'); }
async function loadAxios()     { return (await import('axios')).default; }

// ── Safe math evaluator ───────────────────────────────────────────────────────
function safeEval(expr) {
  const clean = expr.replace(/[^0-9+\-*/().\s^%]/g, '').trim();
  if (!clean) return null;
  try {
    const result = Function(`"use strict"; return (${clean.replace(/\^/g, '**')})`)();
    return isFinite(result) ? result : null;
  } catch { return null; }
}

// ── Morse tables ──────────────────────────────────────────────────────────────
const MORSE_MAP = {
  A:'.-', B:'-...', C:'-.-.', D:'-..', E:'.', F:'..-.', G:'--.', H:'....',
  I:'..', J:'.---', K:'-.-', L:'.-..', M:'--', N:'-.', O:'---', P:'.--.',
  Q:'--.-', R:'.-.', S:'...', T:'-', U:'..-', V:'...-', W:'.--', X:'-..-',
  Y:'-.--', Z:'--..', '0':'-----', '1':'.----', '2':'..---', '3':'...--',
  '4':'....-', '5':'.....', '6':'-....', '7':'--...', '8':'---..', '9':'----.',
  '.':'.-.-.-', ',':'--..--', '?':'..--..', "'":'.----.', '!':'-.-.--',
  '/':'-..-.', '(':'-.--.', ')':'-.--.-', '&':'.-...', ':':'---...',
  ';':'-.-.-.', '=':'-...-', '+':'.-.-.', '-':'-....-', '_':'..--.-',
};
const MORSE_REVERSE = Object.fromEntries(Object.entries(MORSE_MAP).map(([k,v])=>[v,k]));

function toMorse(text) {
  return text.toUpperCase().split('').map(c => MORSE_MAP[c] || (c === ' ' ? '/' : '?')).join(' ');
}
function fromMorse(code) {
  return code.split(' ').map(c => c === '/' ? ' ' : (MORSE_REVERSE[c] || '?')).join('');
}

// ── QR code ───────────────────────────────────────────────────────────────────
async function generateQr(text) {
  try {
    const QRCode = await loadQrcode();
    const buf = await QRCode.toBuffer(text, {
      type: 'png', width: 512, margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
    return buf;
  } catch { return null; }
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function getScreenshot(url) {
  try {
    const axios = await loadAxios();
    const encoded = encodeURIComponent(url);
    const res = await axios.get(
      `https://s.wordpress.com/mshots/v1/${encoded}?w=1280&h=800`,
      { responseType: 'arraybuffer', timeout: 20000 }
    );
    return Buffer.from(res.data);
  } catch { return null; }
}

async function getLyrics(song) {
  try {
    const axios = await loadAxios();
    const { data } = await axios.get(
      `https://lyrist.vercel.app/api/${encodeURIComponent(song)}`,
      { timeout: 15000 }
    );
    if (data?.lyrics) return { ok: true, title: data.title||song, artist: data.artist||'Unknown', lyrics: data.lyrics };
  } catch {}
  try {
    const axios = await loadAxios();
    const parts  = song.split(' ');
    const artist = parts.slice(0, 1).join(' ');
    const title  = parts.slice(1).join(' ') || artist;
    const { data } = await axios.get(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      { timeout: 15000 }
    );
    if (data?.lyrics) return { ok: true, title, artist, lyrics: data.lyrics };
  } catch {}
  return { ok: false, error: 'Lyrics not found' };
}

async function getAnimeInfo(query) {
  try {
    const axios = await loadAxios();
    const gql = {
      query: `query($s:String){Media(search:$s,type:ANIME){title{romaji english}description episodes status averageScore genres coverImage{large}siteUrl}}`,
      variables: { s: query },
    };
    const { data } = await axios.post('https://graphql.anilist.co', gql, {
      headers: { 'Content-Type': 'application/json' }, timeout: 15000,
    });
    const m = data?.data?.Media;
    if (!m) return { ok: false, error: 'Anime not found' };
    return { ok: true, data: m };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function getRandomMeme() {
  try {
    const axios = await loadAxios();
    const subs = ['memes', 'dankmemes', 'meirl'];
    const sub  = subs[Math.floor(Math.random() * subs.length)];
    const { data } = await axios.get(`https://meme-api.com/gimme/${sub}`, { timeout: 12000 });
    if (data?.url) return { ok: true, url: data.url, title: data.title || 'Meme' };
  } catch {}
  return { ok: false, error: 'Could not fetch meme' };
}

async function getRandomCat() {
  try {
    const axios = await loadAxios();
    const { data } = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout: 10000 });
    if (data?.[0]?.url) return { ok: true, url: data[0].url };
  } catch {}
  try {
    const axios = await loadAxios();
    const { data } = await axios.get('https://random.cat/meow', { timeout: 10000 });
    if (data?.file) return { ok: true, url: data.file };
  } catch {}
  return { ok: false, error: 'Could not fetch cat image' };
}

async function getRandomDog() {
  try {
    const axios = await loadAxios();
    const { data } = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 10000 });
    if (data?.message) return { ok: true, url: data.message };
  } catch {}
  return { ok: false, error: 'Could not fetch dog image' };
}

async function getIpInfo(ip) {
  try {
    const axios = await loadAxios();
    const qs    = await loadQs();
    // use qs to build query string properly
    const query = qs.stringify({ fields: 'status,message,country,countryCode,region,city,zip,lat,lon,timezone,isp,org,as,query' });
    const { data } = await axios.get(`https://ip-api.com/json/${ip}?${query}`, { timeout: 12000 });
    if (data?.status === 'fail') return { ok: false, error: data.message };
    return { ok: true, data };
  } catch {}
  try {
    const axios = await loadAxios();
    const { data } = await axios.get(`https://ipwho.is/${ip}`, { timeout: 12000 });
    if (data?.success === false) return { ok: false, error: data.message };
    return { ok: true, data };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function getDictDefinition(word) {
  try {
    const axios = await loadAxios();
    const { data } = await axios.get(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { timeout: 12000 }
    );
    if (!Array.isArray(data) || !data[0]) return { ok: false, error: 'Word not found' };
    const entry = data[0];
    const meanings = entry.meanings?.slice(0, 3).map(m => {
      const defs = m.definitions?.slice(0, 2).map(d => d.definition).join('\n  ');
      return `*${m.partOfSpeech}*\n  ${defs}`;
    }).join('\n\n') || 'No definition found';
    return { ok: true, word: entry.word, phonetic: entry.phonetic || '', meanings };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function getCountryInfo(name) {
  try {
    const axios = await loadAxios();
    const { data } = await axios.get(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fields=name,capital,population,region,subregion,currencies,languages,flags,area,timezones`,
      { timeout: 12000 }
    );
    if (!data?.[0]) return { ok: false, error: 'Country not found' };
    return { ok: true, data: data[0] };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Font renderer: figlet ASCII art → canvas image ───────────────────────────
async function renderFontImage(text, fontName = 'Big') {
  try {
    const figlet = await loadFiglet();
    const { createCanvas } = await loadCanvas();

    // Generate ASCII art
    const ascii = await new Promise((res, rej) =>
      figlet.text(text, { font: fontName, horizontalLayout: 'default' },
        (err, data) => err ? rej(err) : res(data))
    );

    const lines = ascii.split('\n');
    const W = Math.max(...lines.map(l => l.length)) * 10 + 40;
    const H = lines.length * 22 + 40;
    const canvas = createCanvas(Math.min(W, 900), Math.min(H, 500));
    const ctx = canvas.getContext('2d');

    // Background gradient effect
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0d0d0d');
    grad.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ASCII text
    ctx.fillStyle = '#00ff99';
    ctx.font = '14px monospace';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, 20, 20 + i * 22));

    return canvas.toBuffer('image/png');
  } catch { return null; }
}

// ── Color swatch image via canvas ─────────────────────────────────────────────
async function renderColorSwatch(hex) {
  try {
    const { createCanvas } = await loadCanvas();
    const canvas = createCanvas(400, 180);
    const ctx = canvas.getContext('2d');

    // Color block
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 400, 120);

    // Info bar
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 120, 400, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(hex.toUpperCase(), 200, 150);

    return canvas.toBuffer('image/png');
  } catch { return null; }
}

// ── Hash via crypto-js ────────────────────────────────────────────────────────
async function hashText(text, algo) {
  try {
    const CryptoJS = await loadCryptoJS();
    switch (algo) {
      case 'md5':    return CryptoJS.MD5(text).toString();
      case 'sha1':   return CryptoJS.SHA1(text).toString();
      case 'sha256': return CryptoJS.SHA256(text).toString();
      case 'sha512': return CryptoJS.SHA512(text).toString();
      default:       return CryptoJS.SHA256(text).toString();
    }
  } catch {
    // native fallback
    return crypto.createHash(algo === 'sha1' ? 'sha1' : algo === 'md5' ? 'md5' : 'sha256')
      .update(text).digest('hex');
  }
}

// ── Text-to-speech via google-tts-api ─────────────────────────────────────────
async function getTTSAudio(text, lang = 'en') {
  try {
    const googleTTS = await loadGoogleTTS();
    // getAllAudioUrls splits long text into chunks
    const fn = googleTTS.getAllAudioUrls || googleTTS.getAudioUrl;
    if (typeof fn !== 'function') throw new Error('TTS function not found');
    let audioUrl;
    if (googleTTS.getAllAudioUrls) {
      const urls = googleTTS.getAllAudioUrls(text, { lang, slow: false, host: 'https://translate.google.com', splitPunct: ',.?!' });
      audioUrl = urls?.[0]?.url;
    } else {
      audioUrl = googleTTS.getAudioUrl(text.slice(0, 200), { lang, slow: false, host: 'https://translate.google.com' });
    }
    if (!audioUrl) throw new Error('No audio URL');
    const axios = await loadAxios();
    const { data } = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 20000 });
    return Buffer.from(data);
  } catch { return null; }
}

// ── Translate via google-translate-free ───────────────────────────────────────
async function translateText(text, to = 'en', from = 'auto') {
  try {
    const translate = await loadTranslate();
    const fn = translate.translate || translate.default?.translate || translate;
    if (typeof fn === 'function') {
      const result = await fn(text, { to, from });
      const out = result?.text || result?.translation || (Array.isArray(result) ? result[0]?.text : null) || String(result);
      return { ok: true, result: out };
    }
    throw new Error('Translate function not found');
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Link preview ──────────────────────────────────────────────────────────────
async function getLinkPreview(url) {
  try {
    const { getLinkPreview: getPreview } = await loadLinkPreview();
    const data = await getPreview(url, { timeout: 10000 });
    return { ok: true, data };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Fake identity via lodash ──────────────────────────────────────────────────
async function fakeIdentity() {
  const _ = await loadLodash();
  const firstNames = ['Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Jamie', 'Avery', 'Reese', 'Blake', 'Cameron', 'Drew', 'Emery', 'Finley', 'Harley'];
  const lastNames  = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson'];
  const domains    = ['gmail.com', 'yahoo.com', 'outlook.com', 'proton.me', 'hotmail.com'];
  const countries  = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'Brazil', 'Nigeria', 'South Africa'];
  const jobs       = ['Software Engineer', 'Designer', 'Teacher', 'Doctor', 'Lawyer', 'Chef', 'Nurse', 'Artist', 'Writer', 'Scientist', 'Accountant', 'Pilot'];
  const hobbies    = ['Gaming', 'Hiking', 'Cooking', 'Reading', 'Music', 'Photography', 'Traveling', 'Fitness', 'Drawing', 'Dancing', 'Swimming', 'Coding'];

  const first = _.sample(firstNames);
  const last  = _.sample(lastNames);
  const username = `${first.toLowerCase()}${_.random(10, 999)}`;
  const pass = `${_.sample(['!', '@', '#', '$'])}${_.sample(lastNames)}${_.random(100, 999)}`;

  return {
    name:     `${first} ${last}`,
    username,
    email:    `${username}@${_.sample(domains)}`,
    phone:    `+1${_.random(2002000000, 9999999999)}`,
    password: pass,
    age:      _.random(18, 60),
    country:  _.sample(countries),
    job:      _.sample(jobs),
    hobbies:  `${_.sample(hobbies)}, ${_.sample(hobbies)}`,
    birthday: `${_.random(1, 28)}/${_.random(1, 12)}/${_.random(1965, 2005)}`,
  };
}

// ── Emoji lookup via emoji-db ─────────────────────────────────────────────────
async function lookupEmoji(query) {
  try {
    const db = await loadEmojiDb();
    const list = db?.emojis || db?.default?.emojis || (Array.isArray(db) ? db : null);
    if (!list) return null;
    const q = query.toLowerCase().trim();
    // Match by emoji character or by name
    const found = list.find(e =>
      e.emoji === q ||
      (e.name || e.description || '').toLowerCase().includes(q) ||
      (e.keywords || []).some(k => k.toLowerCase().includes(q))
    );
    return found || null;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function handleExtra(sock, msg, { command, args, jid, sender, text, reply, quotedMsg, quotedType, mentionedJids }) {

  switch (command) {

    // ── VIEW ONCE: unlock ─────────────────────────────────────────────────────
    case 'vv':
    case 'viewonce':
    case 'view': {
      if (!quotedMsg) return reply('❌ Reply to a view-once image/video with .vv');
      const m = await reply('🔓 Unlocking view-once...');
      const ok = await forwardViewOnce(sock, jid, msg, quotedMsg, quotedType);
      if (!ok) await sock.sendMessage(jid, { text: '❌ Could not unlock — reply to a view-once image or video.', edit: m.key });
      else await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── VIEW ONCE: send video as VO ───────────────────────────────────────────
    case 'vvid':
    case 'vvideo': {
      const m = await reply('📹 Converting to view-once video...');
      const vidMsg = quotedMsg?.videoMessage || msg.message?.videoMessage;
      if (!vidMsg) { await sock.sendMessage(jid, { text: '❌ Reply to a video.', edit: m.key }); return true; }
      try {
        const buf = await downloadFromMessage(vidMsg, 'video');
        if (!buf) throw new Error('Could not download video');
        await sock.sendMessage(jid, { video: buf, mimetype: vidMsg.mimetype || 'video/mp4', viewOnce: true }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── VIEW ONCE: send image as VO ───────────────────────────────────────────
    case 'vvimg':
    case 'vvimage': {
      const m = await reply('🖼 Converting to view-once image...');
      const imgMsg = quotedMsg?.imageMessage || msg.message?.imageMessage;
      if (!imgMsg) { await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key }); return true; }
      try {
        const buf = await downloadFromMessage(imgMsg, 'image');
        if (!buf) throw new Error('Could not download image');
        await sock.sendMessage(jid, { image: buf, mimetype: imgMsg.mimetype || 'image/jpeg', viewOnce: true }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── SCREENSHOT ────────────────────────────────────────────────────────────
    case 'ss':
    case 'screenshot':
    case 'webshot': {
      if (!text) return reply('❌ Usage: .ss <url>');
      let url = text.trim();
      if (!url.startsWith('http')) url = 'https://' + url;
      const m = await reply(`📸 Capturing *${url}*...`);
      const buf = await getScreenshot(url);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Screenshot failed.', edit: m.key }); return true; }
      await sock.sendMessage(jid, { image: buf, caption: `📸 *SCREENSHOT*\n🔗 ${url}`, mimetype: 'image/jpeg' }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── CALCULATOR ────────────────────────────────────────────────────────────
    case 'calc':
    case 'calculate':
    case 'math': {
      if (!text) return reply('❌ Usage: .calc <expression>  e.g. .calc 2+2*10');
      const result = safeEval(text);
      if (result === null) return reply('❌ Invalid expression. Use numbers and +, -, *, /, ^, ()');
      await reply(`🧮 *CALCULATOR*\n━━━━━━━━━━━━━━\n📝 \`${text}\`\n✅ = *${Number.isInteger(result) ? result : parseFloat(result.toFixed(10))}*`);
      break;
    }

    // ── BASE64 ENCODE ─────────────────────────────────────────────────────────
    case 'b64e':
    case 'base64encode':
    case 'encode': {
      if (!text) return reply('❌ Usage: .b64e <text>');
      const CryptoJS = await loadCryptoJS();
      // Use CryptoJS for encoding (also validates the dep is working)
      const encoded = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text));
      await reply(`🔒 *BASE64 ENCODE*\n━━━━━━━━━━━━━━\n📝 ${text.slice(0, 80)}\n\n✅ Encoded:\n\`${encoded}\``);
      break;
    }

    // ── BASE64 DECODE ─────────────────────────────────────────────────────────
    case 'b64d':
    case 'base64decode':
    case 'decode': {
      if (!text) return reply('❌ Usage: .b64d <base64>');
      try {
        const CryptoJS = await loadCryptoJS();
        const decoded = CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(text.trim()));
        await reply(`🔓 *BASE64 DECODE*\n━━━━━━━━━━━━━━\n📝 ${text.slice(0, 40)}...\n\n✅ Decoded:\n${decoded}`);
      } catch { await reply('❌ Invalid base64 string.'); }
      break;
    }

    // ── QR CODE — uses qrcode package ─────────────────────────────────────────
    case 'qr':
    case 'qrcode': {
      if (!text) return reply('❌ Usage: .qr <text or URL>');
      const m = await reply('📱 Generating QR code...');
      const buf = await generateQr(text);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Failed to generate QR.', edit: m.key }); return true; }
      await sock.sendMessage(jid, {
        image: buf,
        caption: `📱 *QR CODE*\n📝 ${text.slice(0, 60)}${text.length > 60 ? '...' : ''}`,
        mimetype: 'image/png',
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── HASH — uses crypto-js (MD5 / SHA-1 / SHA-256 / SHA-512) ──────────────
    case 'hash': {
      if (!text) return reply('❌ Usage: .hash <text> [md5|sha1|sha256|sha512]\nDefault: SHA-256');
      const parts = text.split(' ');
      const algos = ['md5','sha1','sha256','sha512'];
      let algo = 'sha256', input = text;
      if (algos.includes(parts[parts.length - 1].toLowerCase())) {
        algo  = parts.pop().toLowerCase();
        input = parts.join(' ');
      }
      const m = await reply(`🔐 Hashing (${algo.toUpperCase()})...`);
      const hash = await hashText(input, algo);
      await sock.sendMessage(jid, {
        text:
          `🔐 *HASH — ${algo.toUpperCase()}*\n━━━━━━━━━━━━━━\n` +
          `📝 Input: \`${input.slice(0, 80)}\`\n\n` +
          `✅ Hash:\n\`${hash}\``,
        edit: m.key,
      });
      break;
    }

    // ── FONT — figlet + @napi-rs/canvas ───────────────────────────────────────
    case 'font':
    case 'ascii':
    case 'figlet': {
      if (!text) return reply('❌ Usage: .font <text> [font]\nFonts: Big, Doom, Banner, Slant, 3-D, Block, Bubble, Digital, Lean, Mini, Shadow, Small, Speed, Star Wars');
      const parts  = text.split(' | ');
      const input  = parts[0].trim();
      const fontName = parts[1]?.trim() || 'Big';
      const m = await reply('🔤 Rendering font...');
      const buf = await renderFontImage(input, fontName);
      if (!buf) {
        // Fallback: text-only figlet
        const figlet = await loadFiglet();
        const ascii  = await new Promise((res, rej) =>
          figlet.text(input, { font: fontName }, (err, d) => err ? rej(err) : res(d))
        ).catch(() => input);
        await sock.sendMessage(jid, { text: `\`\`\`${ascii}\`\`\``, edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        image: buf,
        caption: `🔤 *FONT ART*\nText: ${input}\nFont: ${fontName}\n\n_Tip: .font Text | Doom_`,
        mimetype: 'image/png',
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── COLOR HEX — renders swatch image via @napi-rs/canvas ─────────────────
    case 'colorhex':
    case 'color':
    case 'hex': {
      if (!text) return reply('❌ Usage: .colorhex #RRGGBB\nExample: .colorhex #FF5733');
      let hex = text.trim().replace(/^#?/, '#');
      if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return reply('❌ Invalid hex. Format: .colorhex #FF5733');
      const m = await reply('🎨 Rendering color...');

      // Convert hex → RGB
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const hsl = rgbToHsl(r, g, b);

      const buf = await renderColorSwatch(hex);
      const info =
        `🎨 *COLOR INFO*\n━━━━━━━━━━━━━━\n` +
        `🟥 Hex: *${hex.toUpperCase()}*\n` +
        `🔢 RGB: *rgb(${r}, ${g}, ${b})*\n` +
        `🌈 HSL: *hsl(${hsl.h}°, ${hsl.s}%, ${hsl.l}%)*\n` +
        `🌑 Brightness: *${Math.round(0.299*r + 0.587*g + 0.114*b)}*`;

      if (buf) {
        await sock.sendMessage(jid, { image: buf, caption: info, mimetype: 'image/png' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } else {
        await sock.sendMessage(jid, { text: info, edit: m.key });
      }
      break;
    }

    // ── TEXT-TO-SPEECH — google-tts-api ──────────────────────────────────────
    case 'tts': {
      if (!text) return reply('❌ Usage: .tts [lang] <text>\nExample: .tts en Hello World\nLanguages: en, es, fr, de, ar, zh, ja, yo, ha');
      const parts = text.split(' ');
      // Detect if first word is a lang code (2-3 chars)
      let lang = 'en', input = text;
      if (/^[a-z]{2,3}(-[A-Z]{2})?$/.test(parts[0]) && parts.length > 1) {
        lang  = parts.shift();
        input = parts.join(' ');
      }
      const m = await reply(`🎤 Converting to speech (${lang})...`);
      const audioBuf = await getTTSAudio(input.slice(0, 200), lang);
      if (!audioBuf) {
        await sock.sendMessage(jid, { text: '❌ TTS failed. Try: .tts en Hello World', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        audio: audioBuf,
        mimetype: 'audio/mp3',
        ptt: false,
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── TRANSLATE — google-translate-free ─────────────────────────────────────
    case 'translate':
    case 'tr': {
      if (!text) return reply('❌ Usage: .translate <lang> <text>\nExample: .translate yo Hello friend');
      const parts = text.split(' ');
      const lang  = parts[0];
      const input = parts.slice(1).join(' ');
      if (!input) return reply('❌ Usage: .translate <lang> <text>');
      const m = await reply(`🌍 Translating to *${lang}*...`);
      const res = await translateText(input, lang);
      if (!res.ok) { await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key }); return true; }
      await sock.sendMessage(jid, {
        text:
          `🌍 *TRANSLATE → ${lang.toUpperCase()}*\n━━━━━━━━━━━━━━\n` +
          `📝 Input: ${input}\n✅ Result: *${res.result}*`,
        edit: m.key,
      });
      break;
    }

    // ── LINK PREVIEW — link-preview-js ────────────────────────────────────────
    case 'linkinfo':
    case 'preview':
    case 'linkpreview': {
      if (!text) return reply('❌ Usage: .linkinfo <url>\nExample: .linkinfo https://github.com');
      let url = text.trim();
      if (!url.startsWith('http')) url = 'https://' + url;
      const m = await reply(`🔗 Fetching link preview...`);
      const res = await getLinkPreview(url);
      if (!res.ok) { await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key }); return true; }
      const d = res.data;
      const info =
        `🔗 *LINK PREVIEW*\n━━━━━━━━━━━━━━\n` +
        `📌 Title: *${d.title || 'N/A'}*\n` +
        `📝 Description: ${(d.description || 'N/A').slice(0, 150)}\n` +
        `🌐 Site: *${d.siteName || d.url || url}*\n` +
        `🔗 URL: ${url}`;

      if (d.images?.[0]) {
        try {
          const axios = await loadAxios();
          const { data: imgBuf } = await axios.get(d.images[0], { responseType: 'arraybuffer', timeout: 10000 });
          await sock.sendMessage(jid, { image: Buffer.from(imgBuf), caption: info, mimetype: 'image/jpeg' }, { quoted: msg });
          await sock.sendMessage(jid, { delete: m.key });
          break;
        } catch {}
      }
      await sock.sendMessage(jid, { text: info, edit: m.key });
      break;
    }

    // ── LYRICS ────────────────────────────────────────────────────────────────
    case 'lyrics':
    case 'lyric': {
      if (!text) return reply('❌ Usage: .lyrics <artist song>\nExample: .lyrics Eminem Lose Yourself');
      const m = await reply(`🎵 Searching lyrics for *${text}*...`);
      const res = await getLyrics(text);
      if (!res.ok) { await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key }); return true; }
      const ly = res.lyrics.slice(0, 3000);
      await sock.sendMessage(jid, {
        text: `🎵 *${res.title}* — ${res.artist}\n━━━━━━━━━━━━━━\n${ly}${res.lyrics.length > 3000 ? '\n_(truncated)_' : ''}`,
        edit: m.key,
      });
      break;
    }

    // ── ANIME ─────────────────────────────────────────────────────────────────
    case 'anime': {
      if (!text) return reply('❌ Usage: .anime <title>\nExample: .anime Naruto');
      const m = await reply(`🎌 Searching *${text}*...`);
      const res = await getAnimeInfo(text);
      if (!res.ok) { await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key }); return true; }
      const d = res.data;
      const desc = d.description?.replace(/<[^>]*>/g, '').slice(0, 300) || 'N/A';
      const info =
        `🎌 *ANIME INFO*\n━━━━━━━━━━━━━━\n` +
        `📌 Title: *${d.title?.romaji || d.title?.english || 'N/A'}*\n` +
        `📺 Episodes: *${d.episodes || 'N/A'}*\n` +
        `📊 Status: *${d.status || 'N/A'}*\n` +
        `⭐ Score: *${d.averageScore || 'N/A'}*\n` +
        `🏷️ Genres: ${d.genres?.join(', ') || 'N/A'}\n\n` +
        `📝 ${desc}\n\n🔗 ${d.siteUrl}`;

      if (d.coverImage?.large) {
        try {
          const buf = await fetchBuffer(d.coverImage.large);
          if (buf) {
            await sock.sendMessage(jid, { image: buf, caption: info, mimetype: 'image/jpeg' }, { quoted: msg });
            await sock.sendMessage(jid, { delete: m.key });
            break;
          }
        } catch {}
      }
      await sock.sendMessage(jid, { text: info, edit: m.key });
      break;
    }

    // ── MEME ──────────────────────────────────────────────────────────────────
    case 'meme': {
      const m = await reply('😂 Fetching meme...');
      const res = await getRandomMeme();
      if (!res.ok) { await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key }); return true; }
      const buf = await fetchBuffer(res.url);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Failed to load meme image.', edit: m.key }); return true; }
      await sock.sendMessage(jid, { image: buf, caption: `😂 *${res.title}*`, mimetype: 'image/jpeg' }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── CAT ───────────────────────────────────────────────────────────────────
    case 'cat': {
      const m = await reply('🐱 Fetching cute cat...');
      const res = await getRandomCat();
      if (!res.ok) { await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key }); return true; }
      const buf = await fetchBuffer(res.url);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ No cat today 😢', edit: m.key }); return true; }
      await sock.sendMessage(jid, { image: buf, caption: '🐱 Meow!', mimetype: 'image/jpeg' }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── DOG ───────────────────────────────────────────────────────────────────
    case 'dog': {
      const m = await reply('🐶 Fetching cute dog...');
      const res = await getRandomDog();
      if (!res.ok) { await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key }); return true; }
      const buf = await fetchBuffer(res.url);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ No dog today 😢', edit: m.key }); return true; }
      await sock.sendMessage(jid, { image: buf, caption: '🐶 Woof!', mimetype: 'image/jpeg' }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── IP INFO ───────────────────────────────────────────────────────────────
    case 'ip':
    case 'ipinfo':
    case 'ipcheck': {
      if (!text) return reply('❌ Usage: .ip <ip address>  e.g. .ip 8.8.8.8');
      const m = await reply(`🌐 Looking up *${text}*...`);
      const res = await getIpInfo(text.trim());
      if (!res.ok) { await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key }); return true; }
      const d = res.data;
      await sock.sendMessage(jid, {
        text:
          `🌐 *IP INFO*\n━━━━━━━━━━━━━━\n` +
          `📡 IP: *${d.ip || d.query}*\n` +
          `🌍 Country: *${d.country} (${d.countryCode || d.country_code})*\n` +
          `📍 City: *${d.city || 'N/A'}*\n` +
          `🏘 Region: *${d.region || 'N/A'}*\n` +
          `📮 Postal: *${d.zip || d.postal || 'N/A'}*\n` +
          `🏢 ISP: *${d.isp || d.org || 'N/A'}*\n` +
          `🌐 Timezone: *${d.timezone || 'N/A'}*\n` +
          `🗺 Lat/Long: *${d.lat || d.latitude}, ${d.lon || d.longitude}*`,
        edit: m.key,
      });
      break;
    }

    // ── DICTIONARY ────────────────────────────────────────────────────────────
    case 'define':
    case 'dict':
    case 'meaning': {
      if (!text) return reply('❌ Usage: .define <word>');
      const m = await reply(`📖 Looking up *${text}*...`);
      const res = await getDictDefinition(text.trim());
      if (!res.ok) { await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key }); return true; }
      await sock.sendMessage(jid, {
        text: `📖 *DICTIONARY*\n━━━━━━━━━━━━━━\n📝 *${res.word}*${res.phonetic ? `  (${res.phonetic})` : ''}\n\n${res.meanings}`,
        edit: m.key,
      });
      break;
    }

    // ── COUNTRY INFO ──────────────────────────────────────────────────────────
    case 'country': {
      if (!text) return reply('❌ Usage: .country <name>  e.g. .country Nigeria');
      const m = await reply(`🌍 Fetching info for *${text}*...`);
      const res = await getCountryInfo(text.trim());
      if (!res.ok) { await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key }); return true; }
      const d = res.data;
      const langs = Object.values(d.languages || {}).join(', ');
      const curr  = Object.values(d.currencies || {}).map(c => `${c.name} (${c.symbol})`).join(', ');
      await sock.sendMessage(jid, {
        text:
          `🌍 *COUNTRY INFO*\n━━━━━━━━━━━━━━\n` +
          `📌 Country: *${d.name?.common}*\n` +
          `🏛️ Capital: *${d.capital?.[0] || 'N/A'}*\n` +
          `👥 Population: *${(d.population || 0).toLocaleString()}*\n` +
          `📐 Area: *${(d.area || 0).toLocaleString()} km²*\n` +
          `🗺️ Region: *${d.region} — ${d.subregion}*\n` +
          `💬 Languages: *${langs || 'N/A'}*\n` +
          `💰 Currency: *${curr || 'N/A'}*\n` +
          `🕐 Timezones: *${d.timezones?.slice(0, 3).join(', ')}*`,
        edit: m.key,
      });
      break;
    }

    // ── MORSE ENCODE ──────────────────────────────────────────────────────────
    case 'morse': {
      if (!text) return reply('❌ Usage: .morse <text>');
      const result = toMorse(text);
      await reply(`📡 *MORSE ENCODE*\n━━━━━━━━━━━━━━\n📝 Input: ${text}\n\n✅ Morse: \`${result}\``);
      break;
    }

    // ── MORSE DECODE ──────────────────────────────────────────────────────────
    case 'unmorse':
    case 'decodemorse': {
      if (!text) return reply('❌ Usage: .unmorse <morse code>\nExample: .unmorse .... . .-.. .-.. ---');
      const result = fromMorse(text);
      await reply(`📡 *MORSE DECODE*\n━━━━━━━━━━━━━━\n📡 Morse: \`${text}\`\n\n✅ Text: *${result}*`);
      break;
    }

    // ── BINARY ENCODE ─────────────────────────────────────────────────────────
    case 'binary':
    case 'bin': {
      if (!text) return reply('❌ Usage: .binary <text>');
      const result = text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
      await reply(`💾 *BINARY ENCODE*\n━━━━━━━━━━━━━━\n📝 Input: ${text.slice(0, 50)}\n\n✅ Binary:\n\`${result.slice(0, 2000)}\``);
      break;
    }

    // ── BINARY DECODE ─────────────────────────────────────────────────────────
    case 'unbinary':
    case 'debin': {
      if (!text) return reply('❌ Usage: .unbinary <binary>');
      try {
        const result = text.trim().split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2))).join('');
        await reply(`💾 *BINARY DECODE*\n━━━━━━━━━━━━━━\n💾 Binary: \`${text.slice(0, 50)}\`\n\n✅ Text: *${result}*`);
      } catch { await reply('❌ Invalid binary string.'); }
      break;
    }

    // ── PASSWORD GENERATOR ────────────────────────────────────────────────────
    case 'pass':
    case 'password':
    case 'genpass': {
      const _ = await loadLodash();
      const len = Math.max(8, Math.min(parseInt(text) || 16, 64));
      const chars = {
        upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        lower: 'abcdefghijklmnopqrstuvwxyz',
        nums:  '0123456789',
        syms:  '!@#$%^&*()-_=+[]{}|;:,.<>?',
      };
      const all = chars.upper + chars.lower + chars.nums + chars.syms;
      // Guarantee at least one from each set using lodash sample
      const guaranteed = [
        _.sample([...chars.upper]),
        _.sample([...chars.lower]),
        _.sample([...chars.nums]),
        _.sample([...chars.syms]),
      ];
      const rest = _.times(len - 4, () => _.sample([...all]));
      const password = _.shuffle([...guaranteed, ...rest]).join('');
      await reply(
        `🔑 *PASSWORD GENERATOR*\n━━━━━━━━━━━━━━\n` +
        `📏 Length: *${len}*\n\n\`${password}\`\n\n_⚠️ Save this somewhere safe!_`
      );
      break;
    }

    // ── UUID ──────────────────────────────────────────────────────────────────
    case 'uuid': {
      const count = Math.min(parseInt(text) || 1, 10);
      const uuids = Array.from({ length: count }, () => crypto.randomUUID());
      await reply(`🆔 *UUID*\n━━━━━━━━━━━━━━\n${uuids.map((u, i) => `${i + 1}. \`${u}\``).join('\n')}`);
      break;
    }

    // ── LEET SPEAK — lodash ───────────────────────────────────────────────────
    case 'leet':
    case 'l33t': {
      if (!text) return reply('❌ Usage: .leet <text>');
      const _ = await loadLodash();
      const MAP = { a:'4', e:'3', i:'1', o:'0', s:'5', t:'7', b:'8', g:'9', l:'|' };
      const result = _.toLower(text).split('').map(c => MAP[c] || c).join('');
      await reply(`🔡 *LEET*\n━━━━━━━━━━━━━━\n📝 ${text}\n✅ ${result}`);
      break;
    }

    // ── REVERSE TEXT ──────────────────────────────────────────────────────────
    case 'rev':
    case 'reverse': {
      if (!text) return reply('❌ Usage: .rev <text>');
      const _ = await loadLodash();
      const result = _.split(text, '').reverse().join('');
      await reply(`🔄 *REVERSE*\n━━━━━━━━━━━━━━\n📝 ${text}\n✅ ${result}`);
      break;
    }

    // ── FAKE IDENTITY — lodash ────────────────────────────────────────────────
    case 'fake':
    case 'fakeid':
    case 'fakeinfo': {
      const m = await reply('🎭 Generating fake identity...');
      const id = await fakeIdentity();
      await sock.sendMessage(jid, {
        text:
          `🎭 *FAKE IDENTITY*\n━━━━━━━━━━━━━━\n` +
          `👤 Name: *${id.name}*\n` +
          `🔖 Username: *${id.username}*\n` +
          `📧 Email: *${id.email}*\n` +
          `📱 Phone: *${id.phone}*\n` +
          `🔑 Password: \`${id.password}\`\n` +
          `🎂 Age: *${id.age}*\n` +
          `🎁 Birthday: *${id.birthday}*\n` +
          `🌍 Country: *${id.country}*\n` +
          `💼 Job: *${id.job}*\n` +
          `🎮 Hobbies: *${id.hobbies}*\n\n` +
          `_⚠️ This is randomly generated — not real._`,
        edit: m.key,
      });
      break;
    }

    // ── EMOJI LOOKUP — emoji-db ───────────────────────────────────────────────
    case 'emoji':
    case 'emojiinfo': {
      if (!text) return reply('❌ Usage: .emoji <emoji or name>\nExample: .emoji 🔥  or  .emoji fire');
      const m = await reply('😀 Looking up emoji...');
      const found = await lookupEmoji(text.trim());
      if (!found) { await sock.sendMessage(jid, { text: '❌ Emoji not found.', edit: m.key }); return true; }
      await sock.sendMessage(jid, {
        text:
          `😀 *EMOJI INFO*\n━━━━━━━━━━━━━━\n` +
          `${found.emoji || ''} *${found.name || found.description || 'Unknown'}*\n` +
          `📦 Category: *${found.category || 'N/A'}*\n` +
          `🏷️ Group: *${found.group || 'N/A'}*\n` +
          `🔑 Keywords: ${(found.keywords || []).slice(0, 8).join(', ')}`,
        edit: m.key,
      });
      break;
    }

    // ── TIME WITH TIMEZONE — moment-timezone ──────────────────────────────────
    case 'timezone':
    case 'tz': {
      if (!text) return reply('❌ Usage: .tz <timezone>\nExample: .tz Africa/Lagos\nOther: America/New_York  Europe/London  Asia/Tokyo');
      const moment = await loadMoment();
      try {
        const now = moment().tz(text.trim());
        if (!now.isValid()) throw new Error('invalid');
        await reply(
          `🕐 *TIMEZONE — ${text.trim()}*\n━━━━━━━━━━━━━━\n` +
          `📅 Date: *${now.format('dddd, MMMM Do YYYY')}*\n` +
          `🕐 Time: *${now.format('HH:mm:ss')}*\n` +
          `🌍 UTC Offset: *${now.format('Z')}*`
        );
      } catch { await reply('❌ Invalid timezone.\nExamples: Africa/Lagos, Asia/Tokyo, America/New_York, Europe/Paris'); }
      break;
    }

    // ── TEMPERATURE CONVERTER ─────────────────────────────────────────────────
    case 'temp':
    case 'temperature': {
      if (!text) return reply('❌ Usage: .temp <value> <C|F|K>\nExample: .temp 100 C');
      const parts = text.trim().split(/\s+/);
      if (parts.length < 2) return reply('❌ Usage: .temp <value> <C|F|K>');
      const val  = parseFloat(parts[0]);
      const unit = parts[1].toUpperCase();
      if (isNaN(val)) return reply('❌ Invalid number.');
      let c, f, k;
      if      (unit === 'C') { c = val; f = c*9/5+32;    k = c+273.15; }
      else if (unit === 'F') { f = val; c = (f-32)*5/9;  k = c+273.15; }
      else if (unit === 'K') { k = val; c = k-273.15;    f = c*9/5+32; }
      else return reply('❌ Unit must be C, F, or K.');
      await reply(
        `🌡️ *TEMPERATURE*\n━━━━━━━━━━━━━━\n` +
        `🟥 Celsius:    *${c.toFixed(2)}°C*\n` +
        `🟦 Fahrenheit: *${f.toFixed(2)}°F*\n` +
        `🟩 Kelvin:     *${k.toFixed(2)} K*`
      );
      break;
    }

    // ── UNIT CONVERTER ────────────────────────────────────────────────────────
    case 'unit':
    case 'convert': {
      if (!text) return reply('❌ Usage: .unit <value> <from> <to>\nExample: .unit 5 km miles');
      const [vStr, from, to] = text.trim().split(/\s+/);
      if (!vStr || !from || !to) return reply('❌ Usage: .unit <value> <from> <to>');
      const val = parseFloat(vStr);
      if (isNaN(val)) return reply('❌ Invalid number.');
      const toSI = {
        km:1000, m:1, cm:0.01, mm:0.001, miles:1609.344, ft:0.3048, inch:0.0254,
        kg:1, g:0.001, lbs:0.453592, oz:0.0283495,
        l:1, ml:0.001, gal:3.78541,
      };
      const f = toSI[from.toLowerCase()], t = toSI[to.toLowerCase()];
      if (!f || !t) return reply(`❌ Unknown unit. Supported: km, m, cm, mm, miles, ft, inch, kg, g, lbs, oz, l, ml, gal`);
      await reply(`📐 *UNIT CONVERTER*\n━━━━━━━━━━━━━━\n📝 ${val} ${from} = *${parseFloat((val*f/t).toFixed(6))} ${to}*`);
      break;
    }

    // ── COIN FLIP ─────────────────────────────────────────────────────────────
    case 'coin':
    case 'flip':
    case 'coinflip': {
      const _ = await loadLodash();
      const result = _.sample(['🪙 HEADS', '🪙 TAILS']);
      await reply(`🪙 *COIN FLIP*\n━━━━━━━━━━━━━━\nResult: *${result}*`);
      break;
    }

    // ── DICE ──────────────────────────────────────────────────────────────────
    case 'dice':
    case 'roll':
    case 'rolldice': {
      const _ = await loadLodash();
      const sides = parseInt(text) || 6;
      const val   = _.random(1, sides);
      await reply(`🎲 *DICE ROLL (d${sides})*\n━━━━━━━━━━━━━━\nResult: *${val}*`);
      break;
    }

    // ── RANDOM NUMBER ─────────────────────────────────────────────────────────
    case 'random':
    case 'rand':
    case 'randnum': {
      const _ = await loadLodash();
      const [minStr, maxStr] = (text || '1 100').split(/[\s-]+/);
      const min = parseInt(minStr) || 1;
      const max = parseInt(maxStr) || 100;
      if (min >= max) return reply('❌ Min must be less than Max.');
      const result = _.random(min, max);
      await reply(`🔢 *RANDOM NUMBER*\n━━━━━━━━━━━━━━\nRange: *${min} — ${max}*\n🎯 Result: *${result}*`);
      break;
    }

    default:
      return false;
  }
  return true;
}

// ── RGB → HSL helper ─────────────────────────────────────────────────────────
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
