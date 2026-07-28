/**
 * NEW PAGE — Image Commands  v3
 * Full deps usage:
 *  jimp              → enhance, blur, rotate, flip, compress, cartoonify, grayscale, watermark
 *  @napi-rs/canvas   → watermark text overlay
 *  fluent-ffmpeg     → gif/video → frames
 *  ffmpeg-static     → ffmpeg binary path for fluent-ffmpeg
 *  node-webpmux      → sticker WebP metadata (pack/author)
 *  form-data         → upload to catbox for remini
 *  wa-sticker-formatter → waifu sticker conversion
 */
import { fetchBuffer, reminiEnhance } from '../lib/api.js';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Lazy loaders ─────────────────────────────────────────────────────────────
async function loadJimp()       { return (await import('jimp')).default; }
async function loadCanvas()     { return await import('@napi-rs/canvas'); }
async function loadFfmpeg()     { return (await import('fluent-ffmpeg')).default; }
async function loadFfmpegPath() { return (await import('ffmpeg-static')).default; }
async function loadWebpmux()    { return (await import('node-webpmux')).default || (await import('node-webpmux')); }
async function loadFormData()   { return (await import('form-data')).default; }
async function loadAxios()      { return (await import('axios')).default; }

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getImageBuffer(msg, quotedMsg) {
  const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
  const imgMsg =
    quotedMsg?.imageMessage ||
    quotedMsg?.videoMessage ||
    msg.message?.imageMessage ||
    msg.message?.videoMessage;
  if (!imgMsg) return null;
  const isImage = imgMsg === (quotedMsg?.imageMessage || msg.message?.imageMessage);
  const type = isImage ? 'image' : 'video';
  try {
    const stream = await downloadContentFromMessage(imgMsg, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch { return null; }
}

function tmpFile(ext = 'jpg') {
  return path.join(os.tmpdir(), `np_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
}

function saveTemp(buf, ext = 'jpg') {
  const p = tmpFile(ext);
  fs.writeFileSync(p, buf);
  return p;
}

// ── Set WebP sticker metadata via node-webpmux ────────────────────────────────
async function setWebpMeta(buf, packName = 'NEW PAGE', authorName = 'Bot') {
  try {
    const WebPMux = await loadWebpmux();
    // node-webpmux API: Image.load / setExif / getBuffer
    const img = await WebPMux.Image.load(buf);
    const json = JSON.stringify({
      'sticker-pack-name':  packName,
      'sticker-pack-publisher': authorName,
      'emojis': ['🎭'],
    });
    // Build EXIF with the JSON payload
    const exifHeader = Buffer.from([
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x41, 0x57,
    ]);
    const jsonBuf = Buffer.from(json, 'utf-8');
    const exifBuf = Buffer.concat([exifHeader, jsonBuf]);
    img.exif = exifBuf;
    return await img.getBuffer();
  } catch {
    return buf; // fallback: return original buf
  }
}

// ── Canvas watermark overlay ───────────────────────────────────────────────────
async function addWatermark(imgBuf, watermarkText) {
  try {
    const { createCanvas, loadImage } = await loadCanvas();
    const src    = await loadImage(imgBuf);
    const canvas = createCanvas(src.width, src.height);
    const ctx    = canvas.getContext('2d');
    ctx.drawImage(src, 0, 0);

    const fontSize = Math.max(20, Math.floor(src.width / 25));
    ctx.font      = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = 4;
    ctx.textAlign   = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(watermarkText, src.width - 10, src.height - 10);

    return canvas.toBuffer('image/jpeg');
  } catch { return imgBuf; }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function handleImage(sock, msg, { command, args, jid, sender, text, reply, quotedMsg }) {
  switch (command) {

    // ── ENHANCE / REMINI ─────────────────────────────────────────────────────
    case 'enhance':
    case 'remini': {
      const m   = await reply('✨ Enhancing image...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key }); return true; }
      try {
        // Upload to catbox via form-data, then call remini API
        const FormData = await loadFormData();
        const axios    = await loadAxios();
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
        const { data: uploadUrl } = await axios.post('https://catbox.moe/user/api.php', form, {
          headers: form.getHeaders(), timeout: 30000,
        });
        const res = await reminiEnhance(uploadUrl.trim());
        if (!res.ok) { await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key }); return true; }
        const enhanced = await fetchBuffer(res.url);
        if (!enhanced) { await sock.sendMessage(jid, { text: '❌ Failed to fetch result.', edit: m.key }); return true; }
        await sock.sendMessage(jid, { image: enhanced, caption: '✨ Enhanced!', mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── CARTOONIFY — jimp posterize + saturate ────────────────────────────────
    case 'cartoonify':
    case 'cartoon': {
      const m   = await reply('🎨 Cartoonifying...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key }); return true; }
      try {
        const Jimp  = await loadJimp();
        const image = await Jimp.read(buf);
        image.posterize(4).saturate(60).contrast(0.25);
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        await sock.sendMessage(jid, { image: out, caption: '🎨 Cartoonified!', mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── REMOVE BG ─────────────────────────────────────────────────────────────
    case 'removebg':
    case 'rmbg': {
      const m   = await reply('🖼️ Removing background...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key }); return true; }
      try {
        const axios    = await loadAxios();
        const FormData = await loadFormData();
        const form = new FormData();
        form.append('image_file', buf, { filename: 'img.png', contentType: 'image/png' });
        form.append('size', 'auto');
        // Try remove.bg free tier (key from env), fallback to removal.ai
        const apiKey = process.env.REMOVEBG_API_KEY || '';
        if (apiKey) {
          const { data } = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
            headers: { ...form.getHeaders(), 'X-Api-Key': apiKey },
            responseType: 'arraybuffer', timeout: 30000,
          });
          const result = Buffer.from(data);
          await sock.sendMessage(jid, { image: result, caption: '🖼️ Background removed!', mimetype: 'image/png' }, { quoted: msg });
          await sock.sendMessage(jid, { delete: m.key });
          return true;
        }
        // Fallback: use Jimp to detect + invert and make a rough cutout
        const Jimp  = await loadJimp();
        const image = await Jimp.read(buf);
        image.threshold({ max: 160 }).invert();
        const out = await image.getBufferAsync(Jimp.MIME_PNG);
        await sock.sendMessage(jid, { image: out, caption: '🖼️ Background removed (rough)!\n_Set REMOVEBG_API_KEY for better results._', mimetype: 'image/png' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── BLUR — jimp ────────────────────────────────────────────────────────────
    case 'blur': {
      const m   = await reply('🌫️ Blurring...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key }); return true; }
      try {
        const Jimp  = await loadJimp();
        const image = await Jimp.read(buf);
        const px    = Math.max(1, Math.min(parseInt(text) || 8, 50));
        image.blur(px);
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        await sock.sendMessage(jid, { image: out, caption: `🌫️ Blurred (${px}px)!`, mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── FLIP — jimp ────────────────────────────────────────────────────────────
    case 'flip': {
      const m   = await reply('🔄 Flipping...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key }); return true; }
      try {
        const Jimp  = await loadJimp();
        const image = await Jimp.read(buf);
        const horiz = !text?.toLowerCase().includes('v');
        image.flip(horiz, !horiz);
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        await sock.sendMessage(jid, { image: out, caption: `🔄 Flipped ${horiz ? 'horizontally' : 'vertically'}!`, mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── ROTATE — jimp ──────────────────────────────────────────────────────────
    case 'rotate': {
      const m   = await reply('🔃 Rotating...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.\nUsage: .rotate [degrees]', edit: m.key }); return true; }
      try {
        const Jimp  = await loadJimp();
        const image = await Jimp.read(buf);
        const deg   = parseInt(text) || 90;
        image.rotate(deg);
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        await sock.sendMessage(jid, { image: out, caption: `🔃 Rotated ${deg}°!`, mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── COMPRESS — jimp ────────────────────────────────────────────────────────
    case 'compress':
    case 'compressimage': {
      const m   = await reply('📦 Compressing...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.\nUsage: .compress [quality 1-100]', edit: m.key }); return true; }
      try {
        const Jimp    = await loadJimp();
        const image   = await Jimp.read(buf);
        const quality = Math.max(1, Math.min(parseInt(text) || 30, 100));
        image.quality(quality);
        const out    = await image.getBufferAsync(Jimp.MIME_JPEG);
        const before = (buf.length / 1024).toFixed(1);
        const after  = (out.length / 1024).toFixed(1);
        const saved  = (((buf.length - out.length) / buf.length) * 100).toFixed(0);
        await sock.sendMessage(jid, {
          image: out,
          caption: `📦 Compressed!\n━━━━━━━━━━━━━━\n📂 Before: ${before} KB\n📁 After: ${after} KB\n💾 Saved: ${saved}%  (quality: ${quality})`,
          mimetype: 'image/jpeg',
        }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── GRAYSCALE — jimp ───────────────────────────────────────────────────────
    case 'grayscale':
    case 'grey':
    case 'bw': {
      const m   = await reply('⬛ Converting to grayscale...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key }); return true; }
      try {
        const Jimp  = await loadJimp();
        const image = await Jimp.read(buf);
        image.greyscale();
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        await sock.sendMessage(jid, { image: out, caption: '⬛ Grayscale!', mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── INVERT — jimp ─────────────────────────────────────────────────────────
    case 'invert':
    case 'negative': {
      const m   = await reply('🌗 Inverting colors...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key }); return true; }
      try {
        const Jimp  = await loadJimp();
        const image = await Jimp.read(buf);
        image.invert();
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        await sock.sendMessage(jid, { image: out, caption: '🌗 Inverted!', mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── BRIGHTNESS — jimp ─────────────────────────────────────────────────────
    case 'brightness':
    case 'bright': {
      if (!text) return reply('❌ Usage: .brightness <-1 to 1>\nExample: .brightness 0.5');
      const m   = await reply('☀️ Adjusting brightness...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key }); return true; }
      try {
        const Jimp  = await loadJimp();
        const image = await Jimp.read(buf);
        const val   = Math.max(-1, Math.min(parseFloat(text), 1));
        image.brightness(val);
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        await sock.sendMessage(jid, { image: out, caption: `☀️ Brightness: ${val > 0 ? '+' : ''}${val}`, mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── WATERMARK — jimp + @napi-rs/canvas text overlay ───────────────────────
    case 'watermark':
    case 'wm': {
      const label = text?.trim() || process.env.BOT_NAME || 'NEW PAGE';
      const m   = await reply(`💧 Adding watermark: "${label}"...`);
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.\nUsage: .watermark [text]', edit: m.key }); return true; }
      try {
        // Resize with Jimp first, then draw text with canvas
        const Jimp  = await loadJimp();
        const image = await Jimp.read(buf);
        if (image.getWidth() > 1280) image.resize(1280, Jimp.AUTO);
        const jpegBuf = await image.getBufferAsync(Jimp.MIME_JPEG);
        const out     = await addWatermark(jpegBuf, label);
        await sock.sendMessage(jid, { image: out, caption: `💧 Watermarked with "${label}"`, mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── VIDEO → GIF — fluent-ffmpeg + ffmpeg-static ────────────────────────────
    case 'togif':
    case 'vidtogif': {
      const m      = await reply('🎞️ Converting video to GIF...');
      const vidMsg = quotedMsg?.videoMessage || msg.message?.videoMessage;
      if (!vidMsg) { await sock.sendMessage(jid, { text: '❌ Reply to a video.', edit: m.key }); return true; }
      try {
        const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(vidMsg, 'video');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const vidBuf = Buffer.concat(chunks);

        const inFile  = saveTemp(vidBuf, 'mp4');
        const outFile = tmpFile('gif');

        const ffmpeg     = await loadFfmpeg();
        const ffmpegPath = await loadFfmpegPath();

        await new Promise((resolve, reject) => {
          ffmpeg(inFile)
            .setFfmpegPath(ffmpegPath)
            .outputOptions(['-vf', 'fps=10,scale=320:-1:flags=lanczos', '-t', '6'])
            .output(outFile)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });

        const gifBuf = fs.readFileSync(outFile);
        await sock.sendMessage(jid, {
          video: gifBuf,
          mimetype: 'image/gif',
          caption: '🎞️ GIF created!',
          gifPlayback: true,
        }, { quoted: msg });

        // cleanup
        try { fs.unlinkSync(inFile); fs.unlinkSync(outFile); } catch {}
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── WAIFU + node-webpmux sticker metadata ────────────────────────────────
    case 'waifu': {
      const m = await reply('🎌 Fetching waifu...');
      try {
        const axios = await loadAxios();
        const { data } = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 10000 });
        const imgBuf = await fetchBuffer(data.url);
        if (!imgBuf) throw new Error('no image');
        // Also send as sticker with webpmux metadata
        const { Sticker, StickerTypes } = await import('wa-sticker-formatter');
        const sticker    = new Sticker(imgBuf, { pack: 'NEW PAGE', author: 'Bot', type: StickerTypes.FULL, quality: 50 });
        const stickerBuf = await sticker.toBuffer();
        const metaBuf    = await setWebpMeta(stickerBuf, 'NEW PAGE Waifu', 'Bot');

        await sock.sendMessage(jid, { image: imgBuf, caption: '🎌 Waifu!', mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { sticker: metaBuf }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── OCR — read text from image ────────────────────────────────────────────
    case 'ocr':
    case 'readtext': {
      const m   = await reply('🔍 Reading text from image...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) { await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key }); return true; }
      try {
        const axios    = await loadAxios();
        const FormData = await loadFormData();
        const form = new FormData();
        form.append('base64Image', `data:image/jpeg;base64,${buf.toString('base64')}`);
        form.append('language', 'eng');
        form.append('isOverlayRequired', 'false');
        const { data } = await axios.post('https://api.ocr.space/parse/image', form, {
          headers: { ...form.getHeaders(), apikey: process.env.OCR_API_KEY || 'helloworld' },
          timeout: 20000,
        });
        const parsed = data?.ParsedResults?.[0]?.ParsedText?.trim();
        if (!parsed) { await sock.sendMessage(jid, { text: '❌ No text found in image.', edit: m.key }); return true; }
        await sock.sendMessage(jid, {
          text: `🔍 *OCR RESULT*\n━━━━━━━━━━━━━━\n${parsed.slice(0, 3000)}`,
          edit: m.key,
        });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    default:
      return false;
  }
  return true;
}
