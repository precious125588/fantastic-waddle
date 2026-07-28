/**
 * NEW PAGE — Sticker Commands  v3
 * Full deps usage:
 *  wa-sticker-formatter → all sticker creation (FULL / CROPPED types)
 *  @napi-rs/canvas      → .stickertext  (text rendered to canvas → sticker)
 *  node-webpmux         → sticker pack/author metadata injection
 *  fluent-ffmpeg        → .stickeranim  (video → animated sticker)
 *  ffmpeg-static        → ffmpeg binary path
 */
import { downloadMedia, quoted } from '../lib/utils.js';
import { fetchBuffer } from '../lib/api.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Lazy loaders ─────────────────────────────────────────────────────────────
async function loadWaSticker() { return await import('wa-sticker-formatter'); }
async function loadCanvas()    { return await import('@napi-rs/canvas'); }
async function loadWebpmux()   {
  const mod = await import('node-webpmux');
  return mod.default || mod;
}
async function loadFfmpeg()    { return (await import('fluent-ffmpeg')).default; }
async function loadFfmpegPath(){ return (await import('ffmpeg-static')).default; }

// ── Temp file helpers ─────────────────────────────────────────────────────────
function tmpPath(ext) {
  return path.join(os.tmpdir(), `np_stk_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
}

// ── Set WebP sticker metadata (pack name / author) via node-webpmux ───────────
async function setMeta(buf, pack = 'NEW PAGE', author = 'Bot', emojis = ['🎭']) {
  try {
    const WebPMux = await loadWebpmux();
    const img     = await WebPMux.Image.load(buf);
    const jsonStr = JSON.stringify({
      'sticker-pack-name':      pack,
      'sticker-pack-publisher': author,
      'emojis':                 emojis,
    });
    // EXIF minimal header + JSON payload
    const exifHeader = Buffer.from([
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x41, 0x57,
    ]);
    img.exif = Buffer.concat([exifHeader, Buffer.from(jsonStr, 'utf-8')]);
    return await img.getBuffer();
  } catch {
    return buf; // graceful fallback
  }
}

// ── Core sticker creator ───────────────────────────────────────────────────────
async function toSticker(buf, sock, jid, msg, pack = 'NEW PAGE', author = 'Bot', type = null) {
  try {
    const { Sticker, StickerTypes } = await loadWaSticker();
    const stickerType = type || StickerTypes.FULL;
    const sticker     = new Sticker(buf, { pack, author, type: stickerType, quality: 50 });
    let stickerBuf    = await sticker.toBuffer();
    // Inject pack/author metadata via node-webpmux
    stickerBuf = await setMeta(stickerBuf, pack, author);
    await sock.sendMessage(jid, { sticker: stickerBuf }, { quoted: msg });
    return true;
  } catch {
    try {
      // Fallback: send raw buffer
      await sock.sendMessage(jid, { sticker: buf }, { quoted: msg });
      return true;
    } catch { return false; }
  }
}

// ── Download media from message ────────────────────────────────────────────────
async function dlMedia(inner, type) {
  const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
  const stream = await downloadContentFromMessage(inner, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ─────────────────────────────────────────────────────────────────────────────

export async function handleSticker(sock, msg, { command, args, jid, sender, text, reply, quotedMsg, quotedType }) {
  switch (command) {

    // ── STICKER from image/video ──────────────────────────────────────────────
    case 'sticker':
    case 's': {
      const m   = await reply('🎨 Creating sticker...');
      let buf;
      const inner = quotedMsg?.imageMessage || quotedMsg?.videoMessage ||
                    msg.message?.imageMessage || msg.message?.videoMessage;
      if (inner) {
        try {
          const type = (inner === quotedMsg?.imageMessage || inner === msg.message?.imageMessage) ? 'image' : 'video';
          buf = await dlMedia(inner, type);
        } catch { buf = null; }
      }
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Reply to an image/video to make a sticker.', edit: m.key });
        return true;
      }
      const ok = await toSticker(buf, sock, jid, msg);
      if (!ok) await sock.sendMessage(jid, { text: '❌ Failed to create sticker.', edit: m.key });
      else     await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── STICKER → IMAGE ───────────────────────────────────────────────────────
    case 'toimage':
    case 'toimg': {
      const m      = await reply('🖼️ Converting sticker to image...');
      const stkMsg = quotedMsg?.stickerMessage || msg.message?.stickerMessage;
      if (!stkMsg) { await sock.sendMessage(jid, { text: '❌ Reply to a sticker.', edit: m.key }); return true; }
      try {
        const buf = await dlMedia(stkMsg, 'sticker');
        await sock.sendMessage(jid, { image: buf, caption: '🖼️ Converted!', mimetype: 'image/webp' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── TEXT STICKER — @napi-rs/canvas ────────────────────────────────────────
    case 'stickertext':
    case 'stext':
    case 'stxt': {
      if (!text) return reply('❌ Usage: .stickertext <text>\nExample: .stickertext Hello World');
      const m = await reply('✍️ Creating text sticker...');
      try {
        const { createCanvas } = await loadCanvas();
        const canvas = createCanvas(512, 512);
        const ctx    = canvas.getContext('2d');

        // Background: dark gradient
        const grad = ctx.createLinearGradient(0, 0, 512, 512);
        grad.addColorStop(0, '#0d0d0d');
        grad.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);

        // Word-wrap text
        const fontSize = Math.min(72, Math.floor(460 / Math.max(text.length, 5) * 2.5) + 24);
        ctx.font         = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle    = '#ffffff';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        const words = text.split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
          const test = line + (line ? ' ' : '') + w;
          if (ctx.measureText(test).width > 470 && line) { lines.push(line); line = w; }
          else line = test;
        }
        if (line) lines.push(line);
        const lh     = fontSize * 1.3;
        const startY = 256 - ((lines.length - 1) * lh) / 2;
        lines.forEach((l, i) => ctx.fillText(l, 256, startY + i * lh));

        // Subtle border
        ctx.strokeStyle = '#00ff99';
        ctx.lineWidth   = 4;
        ctx.strokeRect(8, 8, 496, 496);

        const buf = canvas.toBuffer('image/png');
        const ok  = await toSticker(buf, sock, jid, msg);
        if (!ok) await sock.sendMessage(jid, { text: '❌ Failed to create text sticker.', edit: m.key });
        else     await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── ANIMATED STICKER — fluent-ffmpeg + ffmpeg-static ─────────────────────
    case 'stickeranim':
    case 'sanim': {
      const m      = await reply('🎞️ Creating animated sticker...');
      const gifMsg = quotedMsg?.videoMessage || quotedMsg?.imageMessage ||
                     msg.message?.videoMessage || msg.message?.imageMessage;
      if (!gifMsg) { await sock.sendMessage(jid, { text: '❌ Reply to a GIF or video.', edit: m.key }); return true; }
      try {
        const isVid = !!(quotedMsg?.videoMessage || msg.message?.videoMessage);
        const buf   = await dlMedia(gifMsg, isVid ? 'video' : 'image');

        // Use fluent-ffmpeg to ensure proper WebM/webp output for animated sticker
        const ffmpeg     = await loadFfmpeg();
        const ffmpegPath = await loadFfmpegPath();
        const inFile     = path.join(os.tmpdir(), `np_anim_in_${Date.now()}.${isVid ? 'mp4' : 'gif'}`);
        const outFile    = path.join(os.tmpdir(), `np_anim_out_${Date.now()}.webp`);
        fs.writeFileSync(inFile, buf);

        await new Promise((resolve, reject) => {
          ffmpeg(inFile)
            .setFfmpegPath(ffmpegPath)
            .outputOptions([
              '-vf',      'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0',
              '-vcodec',  'libwebp',
              '-lossless','0',
              '-compression_level', '6',
              '-q:v',     '50',
              '-loop',    '0',
              '-preset',  'default',
              '-an',
              '-t',       '6',
            ])
            .output(outFile)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });

        let webpBuf = fs.readFileSync(outFile);
        webpBuf = await setMeta(webpBuf, 'NEW PAGE Anim', 'Bot', ['🎭']);
        await sock.sendMessage(jid, { sticker: webpBuf }, { quoted: msg });

        try { fs.unlinkSync(inFile); fs.unlinkSync(outFile); } catch {}
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        // Fallback: wa-sticker-formatter without ffmpeg
        try {
          const gifMsg2 = quotedMsg?.videoMessage || quotedMsg?.imageMessage || msg.message?.videoMessage || msg.message?.imageMessage;
          const isVid2  = !!(quotedMsg?.videoMessage || msg.message?.videoMessage);
          const buf2    = await dlMedia(gifMsg2, isVid2 ? 'video' : 'image');
          const { Sticker, StickerTypes } = await loadWaSticker();
          const sticker = new Sticker(buf2, { pack: 'NEW PAGE', author: 'Bot', type: StickerTypes.FULL, quality: 50 });
          const sBuf    = await setMeta(await sticker.toBuffer(), 'NEW PAGE Anim', 'Bot');
          await sock.sendMessage(jid, { sticker: sBuf }, { quoted: msg });
          await sock.sendMessage(jid, { delete: m.key });
        } catch { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      }
      break;
    }

    // ── CROP STICKER — wa-sticker-formatter CROPPED ───────────────────────────
    case 'stickercrop':
    case 'scrop': {
      const m      = await reply('✂️ Cropping sticker...');
      const stkMsg = quotedMsg?.stickerMessage || msg.message?.stickerMessage;
      if (!stkMsg) { await sock.sendMessage(jid, { text: '❌ Reply to a sticker.', edit: m.key }); return true; }
      try {
        const buf  = await dlMedia(stkMsg, 'sticker');
        const { Sticker, StickerTypes } = await loadWaSticker();
        const sticker = new Sticker(buf, { pack: 'NEW PAGE', author: 'Bot', type: StickerTypes.CROPPED, quality: 50 });
        const sBuf    = await setMeta(await sticker.toBuffer(), 'NEW PAGE', 'Bot');
        await sock.sendMessage(jid, { sticker: sBuf }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) { await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key }); }
      break;
    }

    // ── STICKER PACK/AUTHOR — node-webpmux metadata editor ───────────────────
    case 'setpack':
    case 'stickerpack': {
      if (!text) return reply('❌ Usage: .setpack <pack name> | <author>\nExample: .setpack My Pack | John');
      const m      = await reply('✏️ Setting sticker metadata...');
      const stkMsg = quotedMsg?.stickerMessage || msg.message?.stickerMessage;
      if (!stkMsg) { await sock.sendMessage(jid, { text: '❌ Reply to a sticker.', edit: m.key }); return true; }
      try {
        const parts  = text.split('|').map(s => s.trim());
        const pack   = parts[0] || 'NEW PAGE';
        const author = parts[1] || 'Bot';
        const buf    = await dlMedia(stkMsg, 'sticker');
        const newBuf = await setMeta(buf, pack, author);
        await sock.sendMessage(jid, { sticker: newBuf }, { quoted: msg });
        await sock.sendMessage(jid, {
          text: `✅ Sticker metadata updated!\n📦 Pack: *${pack}*\n✍️ Author: *${author}*`,
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
