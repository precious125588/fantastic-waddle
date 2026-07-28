/**
 * NEW PAGE — Extra Commands  v2
 * 25 fully-implemented commands: vv, vvid, ss, calc, b64e, b64d, qr,
 * lyrics, anime, meme, cat, dog, ip, define, country, morse, binary,
 * pass, leet, rev, ocr, tts, colorhex, uuid, fake
 *
 * Uses GKTW helper + engines; zero stubs.
 */

import { forwardViewOnce, makeViewOnce, downloadFromMessage, sendButtons } from '../lib/gktw.js';
import { getImageEngine, getStickerEngine, readImageJimp, canvasTextImage } from '../lib/engines.js';
import { fetchBuffer, zeroGet, nxGet, prexzyGet } from '../lib/api.js';
import { isOwnerOrSudo, isBotOwner, senderNum } from '../lib/utils.js';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import fs from 'fs';

// ── Morse tables ──────────────────────────────────────────────────────────────
const MORSE_MAP = {
  a:'.-', b:'-...', c:'-.-.', d:'-..', e:'.', f:'..-.', g:'--.', h:'....',
  i:'..', j:'.---', k:'-.-', l:'.-..', m:'--', n:'-.', o:'---', p:'.--.',
  q:'--.-', r:'.-.', s:'...', t:'-', u:'..-', v:'...-', w:'.--', x:'-..-',
  y:'-.--', z:'--..',
  '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....',
  '6':'-....','7':'--...','8':'---..','9':'----.',
  '.':'.-.-.-',',':'--..--','?':'..--..','!':'-.-.--','/':'-..-.',
  ' ':'/'
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE_MAP).map(([k,v])=>[v,k]));

function toMorse(text)     { return text.toLowerCase().split('').map(c=>MORSE_MAP[c]||'?').join(' '); }
function fromMorse(code)   { return code.split(' ').map(c=>MORSE_REV[c]||'?').join(''); }
function toBinary(text)    { return text.split('').map(c=>c.charCodeAt(0).toString(2).padStart(8,'0')).join(' '); }
function fromBinary(bin)   { return bin.trim().split(/\s+/).map(b=>String.fromCharCode(parseInt(b,2))).join(''); }
function toLeet(text)      {
  const L={a:'4',e:'3',i:'1',o:'0',s:'5',t:'7',b:'8',g:'9',l:'1'};
  return text.split('').map(c=>L[c.toLowerCase()]||c).join('');
}
function genPassword(len=16){
  const chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(x=>chars[x%chars.length]).join('');
}
function safeEval(expr){
  // Safe numeric expression evaluator (no eval)
  const clean = expr.replace(/[^0-9+\-*/().\s^%]/g,'').trim();
  if (!clean) return null;
  try {
    // Use Function for simple math only
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${clean.replace(/\^/g,'**')})`)();
    if (!isFinite(result)) return null;
    return result;
  } catch { return null; }
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function getScreenshot(url) {
  // Use screenshotapi.net free endpoint (no key needed for low quality)
  try {
    const { default: axios } = await import('axios');
    const encoded = encodeURIComponent(url);
    const apiUrl = `https://api.screenshotone.com/take?url=${encoded}&format=jpg&viewport_width=1280&viewport_height=800&block_ads=true&timeout=15`;
    const alt = `https://s.wordpress.com/mshots/v1/${encoded}?w=1280&h=800`;
    const res = await axios.get(alt, { responseType: 'arraybuffer', timeout: 20000 });
    return Buffer.from(res.data);
  } catch { return null; }
}

async function getLyrics(song) {
  try {
    const { default: axios } = await import('axios');
    const search = await axios.get(`https://lyrist.vercel.app/api/${encodeURIComponent(song)}`, { timeout: 15000 });
    const d = search.data;
    if (d?.lyrics) return { ok:true, title: d.title||song, artist: d.artist||'Unknown', lyrics: d.lyrics };
  } catch {}
  // Fallback: lyrics.ovh
  try {
    const { default: axios } = await import('axios');
    const parts = song.split(' ');
    const artist = parts.slice(0,1).join(' ');
    const title  = parts.slice(1).join(' ') || artist;
    const { data } = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { timeout: 15000 });
    if (data?.lyrics) return { ok:true, title, artist, lyrics: data.lyrics };
  } catch {}
  return { ok:false, error:'Lyrics not found' };
}

async function getAnimeInfo(query) {
  try {
    const { default: axios } = await import('axios');
    const gql = {
      query: `query($s:String){Media(search:$s,type:ANIME){title{romaji english}description episodes status averageScore genres coverImage{large}siteUrl}}`,
      variables: { s: query },
    };
    const { data } = await axios.post('https://graphql.anilist.co', gql, {
      headers:{ 'Content-Type':'application/json' }, timeout:15000,
    });
    const m = data?.data?.Media;
    if (!m) return { ok:false, error:'Anime not found' };
    return { ok:true, data: m };
  } catch(e){ return { ok:false, error: e.message }; }
}

async function getRandomMeme() {
  try {
    const { default: axios } = await import('axios');
    const subs = ['memes','dankmemes','meirl'];
    const sub  = subs[Math.floor(Math.random()*subs.length)];
    const { data } = await axios.get(`https://meme-api.com/gimme/${sub}`, { timeout:12000 });
    if (data?.url) return { ok:true, url:data.url, title:data.title||'Meme' };
  } catch {}
  return { ok:false, error:'Could not fetch meme' };
}

async function getRandomCat() {
  try {
    const { default: axios } = await import('axios');
    const { data } = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout:10000 });
    if (data?.[0]?.url) return { ok:true, url:data[0].url };
  } catch {}
  try {
    const { default: axios } = await import('axios');
    const { data } = await axios.get('https://random.cat/meow', { timeout:10000 });
    if (data?.file) return { ok:true, url:data.file };
  } catch {}
  return { ok:false, error:'Could not fetch cat image' };
}

async function getRandomDog() {
  try {
    const { default: axios } = await import('axios');
    const { data } = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout:10000 });
    if (data?.message) return { ok:true, url:data.message };
  } catch {}
  return { ok:false, error:'Could not fetch dog image' };
}

async function getIpInfo(ip) {
  try {
    const { default: axios } = await import('axios');
    const { data } = await axios.get(`https://ipwho.is/${ip}`, { timeout:12000 });
    if (data?.success === false) return { ok:false, error: data.message };
    return { ok:true, data };
  } catch(e){ return { ok:false, error:e.message }; }
}

async function getDictDefinition(word) {
  try {
    const { default: axios } = await import('axios');
    const { data } = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { timeout:12000 });
    if (!Array.isArray(data) || !data[0]) return { ok:false, error:'Word not found' };
    const entry = data[0];
    const meanings = entry.meanings?.slice(0,3).map(m=>{
      const defs = m.definitions?.slice(0,2).map(d=>d.definition).join('\n  ');
      return `*${m.partOfSpeech}*\n  ${defs}`;
    }).join('\n\n') || 'No definition found';
    return { ok:true, word:entry.word, phonetic:entry.phonetic||'', meanings };
  } catch(e){ return { ok:false, error:e.message }; }
}

async function getCountryInfo(name) {
  try {
    const { default: axios } = await import('axios');
    const { data } = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fields=name,capital,population,region,subregion,currencies,languages,flags,area,timezones`, { timeout:12000 });
    if (!data?.[0]) return { ok:false, error:'Country not found' };
    return { ok:true, data:data[0] };
  } catch(e){ return { ok:false, error:e.message }; }
}

async function doOcr(buf) {
  // OCR via ocr.space free API
  try {
    const FormData = (await import('form-data')).default;
    const { default: axios } = await import('axios');
    const form = new FormData();
    form.append('file', buf, { filename:'image.jpg', contentType:'image/jpeg' });
    form.append('language','eng');
    form.append('isOverlayRequired','false');
    const { data } = await axios.post('https://api.ocr.space/parse/image', form, {
      headers: { ...form.getHeaders(), apikey:'K81884462488957' },
      timeout: 30000,
    });
    const text = data?.ParsedResults?.[0]?.ParsedText?.trim();
    if (!text) return { ok:false, error:'No text detected' };
    return { ok:true, text };
  } catch(e){ return { ok:false, error:e.message }; }
}

async function doTts(text, lang='en') {
  try {
    const gTTS = (await import('google-tts-api')).default || (await import('google-tts-api'));
    const getAudioUrl = gTTS.getAudioUrl || gTTS.default?.getAudioUrl;
    if (!getAudioUrl) throw new Error('google-tts-api not available');
    const url = getAudioUrl(text.slice(0,200), { lang, slow:false, host:'https://translate.google.com' });
    const buf = await fetchBuffer(url);
    return buf ? { ok:true, buf } : { ok:false, error:'Failed to fetch audio' };
  } catch(e){ return { ok:false, error:e.message }; }
}

async function hexToColorInfo(hex) {
  // Convert hex to rgb + name
  const clean = hex.replace('#','');
  if (!/^[0-9a-fA-F]{3,8}$/.test(clean)) return null;
  const full = clean.length === 3
    ? clean.split('').map(c=>c+c).join('')
    : clean;
  const r = parseInt(full.slice(0,2),16);
  const g = parseInt(full.slice(2,4),16);
  const b = parseInt(full.slice(4,6),16);
  const toH = v=>Math.round(v/255*100);
  try {
    const { default: axios } = await import('axios');
    const { data } = await axios.get(`https://www.thecolorapi.com/id?hex=${full}`, { timeout:10000 });
    return {
      hex:`#${full.toUpperCase()}`, name: data?.name?.value||`#${full}`,
      rgb:`rgb(${r},${g},${b})`, r, g, b,
      hsl: data?.hsl?.value || '', complementary: data?._links?.self?.href || '',
    };
  } catch {
    return { hex:`#${full.toUpperCase()}`, name:`#${full}`, rgb:`rgb(${r},${g},${b})`, r, g, b, hsl:'', complementary:'' };
  }
}

async function generateQr(text) {
  try {
    const qrcode = (await import('qrcode')).default;
    return await qrcode.toBuffer(text, { type:'png', width:400, margin:2 });
  } catch(e){ return null; }
}

async function generateFakeIdentity() {
  const firstNames = ['James','Maria','Ahmed','Priya','Lucas','Sofia','Kai','Amara','Liam','Nora'];
  const lastNames  = ['Johnson','Garcia','Ahmed','Patel','Müller','Silva','Kim','Osei','Smith','Rossi'];
  const countries  = ['United States','Brazil','Nigeria','India','Germany','Japan','France','Australia'];
  const fn = firstNames[Math.floor(Math.random()*firstNames.length)];
  const ln = lastNames[Math.floor(Math.random()*lastNames.length)];
  const bYear = 1980 + Math.floor(Math.random()*30);
  const bMon  = String(1+Math.floor(Math.random()*12)).padStart(2,'0');
  const bDay  = String(1+Math.floor(Math.random()*28)).padStart(2,'0');
  const country = countries[Math.floor(Math.random()*countries.length)];
  const phone = `+1${Math.floor(2000000000+Math.random()*7999999999)}`;
  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${bYear}@gmail.com`;
  const ip    = Array.from({length:4},()=>Math.floor(Math.random()*256)).join('.');
  return { name:`${fn} ${ln}`, dob:`${bYear}-${bMon}-${bDay}`, country, phone, email, ip };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleExtra(sock, msg, { command, args, jid, sender, text, reply, quotedMsg, quotedType, mentionedJids }) {

  switch (command) {

    // ──────────────────── VIEW ONCE ─────────────────────────────────────────

    case 'vv':
    case 'viewonce':
    case 'view': {
      if (!quotedMsg) return reply('❌ Reply to a view-once image/video with .vv');
      const m = await reply('🔓 Unlocking view-once...');
      const ok = await forwardViewOnce(sock, jid, msg, quotedMsg, quotedType);
      if (!ok) {
        await sock.sendMessage(jid, { text: '❌ Could not unlock — reply to a view-once image or video.', edit: m.key });
      } else {
        await sock.sendMessage(jid, { delete: m.key });
      }
      break;
    }

    case 'vvid':
    case 'vvideo': {
      const m = await reply('📹 Converting to view-once video...');
      // Get the video from quoted or current message
      const vidMsg = quotedMsg?.videoMessage || msg.message?.videoMessage;
      if (!vidMsg) {
        await sock.sendMessage(jid, { text: '❌ Reply to a video to send as view-once.', edit: m.key });
        return true;
      }
      try {
        const buf = await downloadFromMessage(vidMsg, 'video');
        if (!buf) throw new Error('Could not download video');
        await sock.sendMessage(jid, {
          video: buf,
          mimetype: vidMsg.mimetype || 'video/mp4',
          viewOnce: true,
          caption: '👁 View once video',
        }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch(e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'vvimg':
    case 'vvimage': {
      const m = await reply('🖼 Converting to view-once image...');
      const imgMsg = quotedMsg?.imageMessage || msg.message?.imageMessage;
      if (!imgMsg) {
        await sock.sendMessage(jid, { text: '❌ Reply to an image to send as view-once.', edit: m.key });
        return true;
      }
      try {
        const buf = await downloadFromMessage(imgMsg, 'image');
        if (!buf) throw new Error('Could not download image');
        await sock.sendMessage(jid, {
          image: buf,
          mimetype: imgMsg.mimetype || 'image/jpeg',
          viewOnce: true,
          caption: '👁 View once image',
        }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch(e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    // ──────────────────── SCREENSHOT ────────────────────────────────────────

    case 'ss':
    case 'screenshot':
    case 'webshot': {
      if (!text) return reply('❌ Usage: .ss <url>\nExample: .ss https://example.com');
      let url = text.trim();
      if (!url.startsWith('http')) url = 'https://' + url;
      const m = await reply(`📸 Taking screenshot of *${url}*...`);
      const buf = await getScreenshot(url);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Screenshot failed. Check the URL and try again.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        image: buf,
        caption: `📸 *SCREENSHOT*\n🔗 ${url}`,
        mimetype: 'image/jpeg',
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ──────────────────── CALCULATOR ────────────────────────────────────────

    case 'calc':
    case 'calculate':
    case 'math': {
      if (!text) return reply('❌ Usage: .calc <expression>\nExample: .calc 2 + 2 * 10');
      const result = safeEval(text);
      if (result === null) return reply('❌ Invalid expression. Use numbers and +, -, *, /, ^, ()');
      await reply(
        `🧮 *CALCULATOR*\n━━━━━━━━━━━━━━\n` +
        `📝 Expression: \`${text}\`\n` +
        `✅ Result: *${Number.isInteger(result) ? result : parseFloat(result.toFixed(10))}*`
      );
      break;
    }

    // ──────────────────── BASE64 ─────────────────────────────────────────────

    case 'b64e':
    case 'base64encode':
    case 'encode': {
      if (!text) return reply('❌ Usage: .b64e <text>');
      const encoded = Buffer.from(text, 'utf-8').toString('base64');
      await reply(`🔒 *BASE64 ENCODE*\n━━━━━━━━━━━━━━\n📝 Input: ${text.slice(0,100)}\n\n✅ Encoded:\n\`${encoded}\``);
      break;
    }

    case 'b64d':
    case 'base64decode':
    case 'decode': {
      if (!text) return reply('❌ Usage: .b64d <base64text>');
      try {
        const decoded = Buffer.from(text.trim(), 'base64').toString('utf-8');
        await reply(`🔓 *BASE64 DECODE*\n━━━━━━━━━━━━━━\n📝 Input: ${text.slice(0,60)}...\n\n✅ Decoded:\n${decoded}`);
      } catch {
        await reply('❌ Invalid base64 string.');
      }
      break;
    }

    // ──────────────────── QR CODE ────────────────────────────────────────────

    case 'qr':
    case 'qrcode': {
      if (!text) return reply('❌ Usage: .qr <text or URL>');
      const m = await reply('📱 Generating QR code...');
      const buf = await generateQr(text);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to generate QR code.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        image: buf,
        caption: `📱 *QR CODE*\n📝 Content: ${text.slice(0, 60)}${text.length > 60 ? '...' : ''}`,
        mimetype: 'image/png',
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ──────────────────── LYRICS ─────────────────────────────────────────────

    case 'lyrics':
    case 'lyric': {
      if (!text) return reply('❌ Usage: .lyrics <artist - song>\nExample: .lyrics Ed Sheeran Shape of You');
      const m = await reply(`🎵 Finding lyrics for *${text}*...`);
      const res = await getLyrics(text);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const lyricsPreview = res.lyrics.slice(0, 3000);
      await sock.sendMessage(jid, {
        text:
          `🎵 *LYRICS*\n━━━━━━━━━━━━━━\n` +
          `🎤 *${res.title}* — ${res.artist}\n\n` +
          `${lyricsPreview}${res.lyrics.length > 3000 ? '\n\n_...lyrics truncated_' : ''}`,
        edit: m.key,
      });
      break;
    }

    // ──────────────────── ANIME ──────────────────────────────────────────────

    case 'anime':
    case 'animesearch': {
      if (!text) return reply('❌ Usage: .anime <title>\nExample: .anime Naruto');
      const m = await reply(`🎌 Searching anime: *${text}*...`);
      const res = await getAnimeInfo(text);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const title = d.title?.english || d.title?.romaji || text;
      const desc  = (d.description || 'No description').replace(/<[^>]+>/g,'').slice(0, 300);
      const genres = (d.genres || []).slice(0,5).join(', ');

      // Try to send cover image
      if (d.coverImage?.large) {
        const imgBuf = await fetchBuffer(d.coverImage.large);
        if (imgBuf) {
          await sock.sendMessage(jid, {
            image: imgBuf,
            caption:
              `🎌 *${title}*\n━━━━━━━━━━━━━━\n` +
              `📝 ${desc}\n\n` +
              `⭐ Score: *${d.averageScore || 'N/A'}/100*\n` +
              `📺 Episodes: *${d.episodes || '?'}*\n` +
              `🔖 Status: *${d.status || 'N/A'}*\n` +
              `🎭 Genres: _${genres || 'N/A'}_\n` +
              `🔗 ${d.siteUrl || ''}`,
            mimetype: 'image/jpeg',
          }, { quoted: msg });
          await sock.sendMessage(jid, { delete: m.key });
          return true;
        }
      }
      await sock.sendMessage(jid, {
        text:
          `🎌 *${title}*\n━━━━━━━━━━━━━━\n` +
          `📝 ${desc}\n\n` +
          `⭐ Score: *${d.averageScore || 'N/A'}/100*\n` +
          `📺 Episodes: *${d.episodes || '?'}*\n` +
          `🔖 Status: *${d.status || 'N/A'}*\n` +
          `🎭 Genres: _${genres || 'N/A'}_\n` +
          `🔗 ${d.siteUrl || ''}`,
        edit: m.key,
      });
      break;
    }

    // ──────────────────── MEME ───────────────────────────────────────────────

    case 'meme':
    case 'randmeme': {
      const m = await reply('😂 Fetching meme...');
      const res = await getRandomMeme();
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const buf = await fetchBuffer(res.url);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Could not load meme image.', edit: m.key });
        return true;
      }
      const ext = res.url.endsWith('.gif') ? 'gif' : 'jpeg';
      await sock.sendMessage(jid, {
        image: buf,
        caption: `😂 ${res.title}`,
        mimetype: `image/${ext}`,
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ──────────────────── CAT ────────────────────────────────────────────────

    case 'cat':
    case 'randomcat': {
      const m = await reply('🐱 Fetching a cat...');
      const res = await getRandomCat();
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const buf = await fetchBuffer(res.url);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Could not load cat image.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        image: buf,
        caption: '🐱 Meow! Here is a cat for you 🐾',
        mimetype: 'image/jpeg',
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ──────────────────── DOG ────────────────────────────────────────────────

    case 'dog':
    case 'randomdog': {
      const m = await reply('🐶 Fetching a dog...');
      const res = await getRandomDog();
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const buf = await fetchBuffer(res.url);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Could not load dog image.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        image: buf,
        caption: '🐶 Woof! Here is a dog for you 🦴',
        mimetype: 'image/jpeg',
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ──────────────────── IP INFO ────────────────────────────────────────────

    case 'ip':
    case 'ipinfo':
    case 'ipcheck': {
      if (!text) return reply('❌ Usage: .ip <ip address>\nExample: .ip 8.8.8.8');
      const m = await reply(`🌐 Looking up IP: *${text}*...`);
      const res = await getIpInfo(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      await sock.sendMessage(jid, {
        text:
          `🌐 *IP INFO*\n━━━━━━━━━━━━━━\n` +
          `📡 IP: *${d.ip}*\n` +
          `🌍 Country: *${d.country} (${d.country_code})*\n` +
          `📍 City: *${d.city || 'N/A'}*\n` +
          `🏘 Region: *${d.region || 'N/A'}*\n` +
          `📮 Postal: *${d.postal || 'N/A'}*\n` +
          `🏢 ISP: *${d.connection?.isp || d.org || 'N/A'}*\n` +
          `🌐 Timezone: *${d.timezone?.id || d.timezone || 'N/A'}*\n` +
          `🗺 Lat/Long: *${d.latitude}, ${d.longitude}*\n` +
          `🔒 VPN/Proxy: *${d.security?.vpn || d.proxy ? 'Detected' : 'No'}*`,
        edit: m.key,
      });
      break;
    }

    // ──────────────────── DICTIONARY ────────────────────────────────────────

    case 'define':
    case 'dict':
    case 'meaning': {
      if (!text) return reply('❌ Usage: .define <word>\nExample: .define ephemeral');
      const m = await reply(`📖 Looking up *${text}*...`);
      const res = await getDictDefinition(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        text:
          `📖 *DICTIONARY*\n━━━━━━━━━━━━━━\n` +
          `📝 Word: *${res.word}*${res.phonetic ? `  (${res.phonetic})` : ''}\n\n` +
          res.meanings,
        edit: m.key,
      });
      break;
    }

    // ──────────────────── COUNTRY ────────────────────────────────────────────

    case 'country':
    case 'countryinfo': {
      if (!text) return reply('❌ Usage: .country <country name>\nExample: .country Nigeria');
      const m = await reply(`🌍 Fetching info for *${text}*...`);
      const res = await getCountryInfo(text);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const name = d.name?.common || text;
      const cap  = d.capital?.[0] || 'N/A';
      const pop  = (d.population||0).toLocaleString();
      const area = (d.area||0).toLocaleString();
      const lang = Object.values(d.languages||{}).slice(0,3).join(', ') || 'N/A';
      const curr = Object.entries(d.currencies||{}).slice(0,2)
        .map(([k,v])=>`${v.name} (${v.symbol||k})`).join(', ') || 'N/A';
      const tz   = (d.timezones||['N/A']).slice(0,2).join(', ');
      await sock.sendMessage(jid, {
        text:
          `🌍 *COUNTRY — ${name}*\n━━━━━━━━━━━━━━\n` +
          `🏛 Capital: *${cap}*\n` +
          `🌐 Region: *${d.region || 'N/A'}* / _${d.subregion || 'N/A'}_\n` +
          `👥 Population: *${pop}*\n` +
          `📐 Area: *${area} km²*\n` +
          `💬 Languages: _${lang}_\n` +
          `💰 Currency: _${curr}_\n` +
          `🕐 Timezone: *${tz}*\n` +
          `🚩 Flag: ${d.flags?.emoji || ''}`,
        edit: m.key,
      });
      break;
    }

    // ──────────────────── MORSE ──────────────────────────────────────────────

    case 'morse':
    case 'tomorse': {
      if (!text) return reply('❌ Usage: .morse <text>\nExample: .morse Hello World');
      const result = toMorse(text);
      await reply(`📡 *MORSE CODE*\n━━━━━━━━━━━━━━\n📝 Input: ${text}\n\n📡 Morse:\n\`${result}\``);
      break;
    }

    case 'unmorse':
    case 'frommorse':
    case 'decodemorse': {
      if (!text) return reply('❌ Usage: .unmorse <morse code>\nExample: .unmorse .... . .-.. .-.. ---');
      const result = fromMorse(text);
      await reply(`🔓 *DECODE MORSE*\n━━━━━━━━━━━━━━\n📡 Morse: ${text.slice(0,80)}\n\n✅ Text: *${result}*`);
      break;
    }

    // ──────────────────── BINARY ─────────────────────────────────────────────

    case 'binary':
    case 'tobinary':
    case 'bin': {
      if (!text) return reply('❌ Usage: .binary <text>\nExample: .binary Hello');
      const result = toBinary(text.slice(0, 50));
      await reply(`💻 *BINARY ENCODE*\n━━━━━━━━━━━━━━\n📝 Input: ${text.slice(0,50)}\n\n💻 Binary:\n\`${result}\``);
      break;
    }

    case 'unbinary':
    case 'frombinary':
    case 'bin2text': {
      if (!text) return reply('❌ Usage: .unbinary <binary>\nExample: .unbinary 01001000 01100101');
      try {
        const result = fromBinary(text);
        await reply(`🔓 *BINARY DECODE*\n━━━━━━━━━━━━━━\n💻 Binary: ${text.slice(0,80)}\n\n✅ Text: *${result}*`);
      } catch {
        await reply('❌ Invalid binary input. Use 8-bit groups separated by spaces.');
      }
      break;
    }

    // ──────────────────── PASSWORD GENERATOR ────────────────────────────────

    case 'pass':
    case 'password':
    case 'genpass': {
      const len = Math.min(Math.max(parseInt(text) || 16, 8), 64);
      const passwords = Array.from({ length: 3 }, () => genPassword(len));
      await reply(
        `🔑 *PASSWORD GENERATOR*\n━━━━━━━━━━━━━━\n` +
        `📏 Length: *${len}* characters\n\n` +
        passwords.map((p, i) => `${i+1}. \`${p}\``).join('\n') +
        `\n\n⚠️ _Store securely — not saved anywhere!_`
      );
      break;
    }

    // ──────────────────── LEET SPEAK ────────────────────────────────────────

    case 'leet':
    case 'l33t': {
      if (!text) return reply('❌ Usage: .leet <text>\nExample: .leet Hello World');
      const result = toLeet(text);
      await reply(`💻 *L33T SP34K*\n━━━━━━━━━━━━━━\n📝 Input: ${text}\n\n✅ Leet: *${result}*`);
      break;
    }

    // ──────────────────── REVERSE TEXT ──────────────────────────────────────

    case 'rev':
    case 'reverse':
    case 'reversetext': {
      if (!text) return reply('❌ Usage: .rev <text>\nExample: .rev Hello World');
      const result = [...text].reverse().join('');
      await reply(`🔄 *REVERSE TEXT*\n━━━━━━━━━━━━━━\n📝 Input: ${text}\n\n✅ Reversed: *${result}*`);
      break;
    }

    // ──────────────────── OCR ────────────────────────────────────────────────

    case 'ocr':
    case 'readtext':
    case 'textfromimage': {
      const m = await reply('🔍 Reading text from image...');
      const imgMsg = quotedMsg?.imageMessage || msg.message?.imageMessage;
      if (!imgMsg) {
        await sock.sendMessage(jid, { text: '❌ Reply to an image to extract text.', edit: m.key });
        return true;
      }
      try {
        const buf = await downloadFromMessage(imgMsg, 'image');
        if (!buf) throw new Error('Failed to download image');
        const res = await doOcr(buf);
        if (!res.ok) {
          await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
          return true;
        }
        await sock.sendMessage(jid, {
          text: `🔍 *OCR — TEXT EXTRACTED*\n━━━━━━━━━━━━━━\n${res.text}`,
          edit: m.key,
        });
      } catch(e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    // ──────────────────── TTS ────────────────────────────────────────────────

    case 'tts':
    case 'speak':
    case 'voice': {
      if (!text) return reply('❌ Usage: .tts <text>\nOptionally prefix lang: .tts es Hola Mundo');
      const parts = text.split(' ');
      let lang = 'en', input = text;
      const LANGS = ['en','es','fr','de','pt','ar','hi','ja','ko','zh','ru','it','tr','nl','pl'];
      if (LANGS.includes(parts[0]) && parts.length > 1) {
        lang = parts[0];
        input = parts.slice(1).join(' ');
      }
      const m = await reply(`🗣 Generating speech in *${lang}*...`);
      const res = await doTts(input, lang);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        audio: res.buf,
        mimetype: 'audio/mpeg',
        ptt: true,
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ──────────────────── COLOR HEX ──────────────────────────────────────────

    case 'colorhex':
    case 'color':
    case 'hexcolor': {
      if (!text) return reply('❌ Usage: .colorhex <hex>\nExample: .colorhex #FF5733');
      const info = await hexToColorInfo(text.trim());
      if (!info) return reply('❌ Invalid hex color. Example: .colorhex #FF5733');
      await reply(
        `🎨 *COLOR INFO*\n━━━━━━━━━━━━━━\n` +
        `🔷 Hex: *${info.hex}*\n` +
        `🔴 R: *${info.r}*  🟢 G: *${info.g}*  🔵 B: *${info.b}*\n` +
        `💡 RGB: *${info.rgb}*\n` +
        `🌈 HSL: *${info.hsl || 'N/A'}*\n` +
        `📛 Name: *${info.name}*`
      );
      break;
    }

    // ──────────────────── UUID ───────────────────────────────────────────────

    case 'uuid':
    case 'genid':
    case 'randomid': {
      const count = Math.min(parseInt(text) || 1, 5);
      const ids = Array.from({ length: count }, () => crypto.randomUUID());
      await reply(
        `🆔 *UUID GENERATOR*\n━━━━━━━━━━━━━━\n` +
        ids.map((id, i) => `${i+1}. \`${id}\``).join('\n')
      );
      break;
    }

    // ──────────────────── FAKE IDENTITY ─────────────────────────────────────

    case 'fake':
    case 'fakeid':
    case 'fakeinfo': {
      const id = await generateFakeIdentity();
      await reply(
        `🎭 *FAKE IDENTITY*\n━━━━━━━━━━━━━━\n` +
        `👤 Name: *${id.name}*\n` +
        `🎂 DOB: *${id.dob}*\n` +
        `🌍 Country: *${id.country}*\n` +
        `📞 Phone: *${id.phone}*\n` +
        `📧 Email: *${id.email}*\n` +
        `🌐 IP: *${id.ip}*\n\n` +
        `⚠️ _This is fake data for testing only._`
      );
      break;
    }

    // ──────────────────── HASH ───────────────────────────────────────────────

    case 'hash':
    case 'md5':
    case 'sha256': {
      if (!text) return reply('❌ Usage: .hash <text>\nExample: .hash Hello World');
      const algo = command === 'md5' ? 'md5' : command === 'sha256' ? 'sha256' : 'sha256';
      const hash = crypto.createHash(algo).update(text).digest('hex');
      await reply(
        `#️⃣ *${algo.toUpperCase()} HASH*\n━━━━━━━━━━━━━━\n` +
        `📝 Input: ${text.slice(0,100)}\n\n` +
        `✅ Hash:\n\`${hash}\``
      );
      break;
    }

    // ──────────────────── SHORTEN / EXPAND URL ──────────────────────────────

    case 'short':
    case 'shorten':
    case 'shorturl': {
      if (!text) return reply('❌ Usage: .short <url>');
      let url = text.trim();
      if (!url.startsWith('http')) url = 'https://' + url;
      const m = await reply('🔗 Shortening URL...');
      try {
        const { default: axios } = await import('axios');
        const { data } = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { timeout:12000 });
        await sock.sendMessage(jid, {
          text: `🔗 *URL SHORTENER*\n━━━━━━━━━━━━━━\n📋 Original: ${url.slice(0,80)}\n✅ Short: *${data}*`,
          edit: m.key,
        });
      } catch(e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    // ──────────────────── FONT STYLER ────────────────────────────────────────

    case 'font':
    case 'styletext':
    case 'fancy': {
      if (!text) return reply('❌ Usage: .font <text>\nExample: .font Hello World');
      const bold    = text.replace(/[a-z]/g, c => String.fromCodePoint(c.charCodeAt(0)-32+120302+32));
      const bubble  = [...text].map(c=>{
        const code=c.charCodeAt(0);
        if(code>=65&&code<=90) return String.fromCodePoint(code-65+9398);
        if(code>=97&&code<=122) return String.fromCodePoint(code-97+9424);
        return c;
      }).join('');
      await reply(
        `✨ *FONT STYLER*\n━━━━━━━━━━━━━━\n` +
        `📝 Original: ${text}\n\n` +
        `*Bold*: *${text}*\n` +
        `_Italic_: _${text}_\n` +
        `~Strike~: ~${text}~\n` +
        `\`Mono\`: \`${text}\`\n` +
        `🔵 Bubble: ${bubble}`
      );
      break;
    }

    // ──────────────────── TEMPERATURE CONVERTER ─────────────────────────────

    case 'temp':
    case 'temperature':
    case 'tempconvert': {
      if (!text) return reply('❌ Usage: .temp <value> <unit>\nExample: .temp 100 C\nUnits: C, F, K');
      const parts = text.trim().split(/\s+/);
      const val   = parseFloat(parts[0]);
      const unit  = (parts[1] || 'C').toUpperCase();
      if (isNaN(val)) return reply('❌ Invalid number.');
      let c, f, k;
      if (unit === 'C')      { c=val; f=val*9/5+32; k=val+273.15; }
      else if (unit === 'F') { c=(val-32)*5/9; f=val; k=(val-32)*5/9+273.15; }
      else if (unit === 'K') { c=val-273.15; f=(val-273.15)*9/5+32; k=val; }
      else return reply('❌ Invalid unit. Use C, F, or K');
      await reply(
        `🌡 *TEMPERATURE CONVERTER*\n━━━━━━━━━━━━━━\n` +
        `🔵 Celsius:    *${c.toFixed(2)} °C*\n` +
        `🔴 Fahrenheit: *${f.toFixed(2)} °F*\n` +
        `🟣 Kelvin:     *${k.toFixed(2)} K*`
      );
      break;
    }

    // ──────────────────── UNIT CONVERTER ────────────────────────────────────

    case 'unit':
    case 'convert':
    case 'unitconvert': {
      if (!text) return reply('❌ Usage: .unit <value> <from> <to>\nExample: .unit 10 km miles\nSupports: km/miles/m/ft/cm/inch, kg/lbs/g/oz, L/ml/gal');
      const [valStr, from, to] = text.trim().split(/\s+/);
      const val = parseFloat(valStr);
      if (isNaN(val) || !from || !to) return reply('❌ Usage: .unit <value> <from> <to>');
      // Conversion to SI base
      const toSI = {
        // Length
        km:1000,m:1,cm:0.01,mm:0.001,
        miles:1609.344,ft:0.3048,inch:0.0254,yd:0.9144,
        // Mass
        kg:1,g:0.001,mg:0.000001,lbs:0.453592,oz:0.028349,
        // Volume
        l:1,ml:0.001,gal:3.78541,pt:0.473176,qt:0.946353,
      };
      const f = toSI[from.toLowerCase()], t = toSI[to.toLowerCase()];
      if (!f || !t) return reply(`❌ Unknown unit. Supported: km, m, cm, mm, miles, ft, inch, kg, g, lbs, oz, l, ml, gal`);
      const result = (val * f / t);
      await reply(
        `📐 *UNIT CONVERTER*\n━━━━━━━━━━━━━━\n` +
        `📝 ${val} ${from} = *${parseFloat(result.toFixed(6))} ${to}*`
      );
      break;
    }

    // ──────────────────── COIN FLIP ──────────────────────────────────────────

    case 'coin':
    case 'flip':
    case 'coinflip': {
      const result = Math.random() < 0.5 ? '🪙 HEADS' : '🪙 TAILS';
      await reply(`🪙 *COIN FLIP*\n━━━━━━━━━━━━━━\nResult: *${result}*`);
      break;
    }

    // ──────────────────── DICE ───────────────────────────────────────────────

    case 'dice':
    case 'roll':
    case 'rolldice': {
      const sides = parseInt(text) || 6;
      const val   = Math.floor(Math.random() * sides) + 1;
      await reply(`🎲 *DICE ROLL (d${sides})*\n━━━━━━━━━━━━━━\nResult: *${val}*`);
      break;
    }

    // ──────────────────── RANDOM NUMBER ─────────────────────────────────────

    case 'random':
    case 'rand':
    case 'randnum': {
      const [minStr, maxStr] = (text || '1 100').split(/[\s-]+/);
      const min = parseInt(minStr) || 1;
      const max = parseInt(maxStr) || 100;
      if (min >= max) return reply('❌ Min must be less than Max.\nExample: .random 1 100');
      const result = Math.floor(Math.random() * (max - min + 1)) + min;
      await reply(`🔢 *RANDOM NUMBER*\n━━━━━━━━━━━━━━\nRange: *${min} — ${max}*\n🎯 Result: *${result}*`);
      break;
    }

    default:
      return false;
  }
  return true;
}
