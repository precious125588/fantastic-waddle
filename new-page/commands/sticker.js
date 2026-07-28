import { downloadMedia, quoted } from '../lib/utils.js';
import { fetchBuffer } from '../lib/api.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function toSticker(buf, sock, jid, msg, packName = 'NEW PAGE', authorName = 'Bot') {
  try {
    const { Sticker, StickerTypes } = await import('wa-sticker-formatter');
    const sticker = new Sticker(buf, {
      pack: packName,
      author: authorName,
      type: StickerTypes.FULL,
      quality: 50,
    });
    const stickerBuf = await sticker.toBuffer();
    await sock.sendMessage(jid, { sticker: stickerBuf }, { quoted: msg });
    return true;
  } catch (e) {
    // Fallback: send as webp
    try {
      await sock.sendMessage(jid, { sticker: buf }, { quoted: msg });
      return true;
    } catch {
      return false;
    }
  }
}

export async function handleSticker(sock, msg, { command, args, jid, sender, text, reply, quotedMsg, quotedType }) {
  switch (command) {

    case 'sticker':
    case 's': {
      const m = await reply('🎨 Creating sticker...');
      let buf;
      if (quotedMsg) {
        const inner = quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.stickerMessage;
        if (inner) {
          try {
            const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
            const type = quotedMsg.imageMessage ? 'image' : quotedMsg.videoMessage ? 'video' : 'sticker';
            const stream = await downloadContentFromMessage(inner, type);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            buf = Buffer.concat(chunks);
          } catch { buf = null; }
        }
      } else {
        const imgMsg = msg.message?.imageMessage || msg.message?.videoMessage;
        if (imgMsg) {
          try {
            const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
            const type = msg.message.imageMessage ? 'image' : 'video';
            const stream = await downloadContentFromMessage(imgMsg, type);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            buf = Buffer.concat(chunks);
          } catch { buf = null; }
        }
      }
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Reply to an image/video to make a sticker.', edit: m.key });
        return true;
      }
      const ok = await toSticker(buf, sock, jid, msg);
      if (!ok) {
        await sock.sendMessage(jid, { text: '❌ Failed to create sticker.', edit: m.key });
      } else {
        await sock.sendMessage(jid, { delete: m.key });
      }
      break;
    }

    case 'toimage':
    case 'toimg': {
      const m = await reply('🖼 Converting sticker to image...');
      const stickerMsg = quotedMsg?.stickerMessage || msg.message?.stickerMessage;
      if (!stickerMsg) {
        await sock.sendMessage(jid, { text: '❌ Reply to a sticker.', edit: m.key });
        return true;
      }
      try {
        const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        await sock.sendMessage(jid, { image: buf, caption: '🖼 Converted!', mimetype: 'image/webp' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'stickertext':
    case 'stext': {
      if (!text) return reply('❌ Usage: .stickertext <text>');
      const m = await reply('✍️ Creating text sticker...');
      try {
        const { createCanvas } = await import('@napi-rs/canvas');
        const canvas = createCanvas(512, 512);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 64px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Word wrap
        const words = text.split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
          const test = line + (line ? ' ' : '') + w;
          if (ctx.measureText(test).width > 460 && line) {
            lines.push(line);
            line = w;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);
        const lh = 75;
        const startY = 256 - ((lines.length - 1) * lh) / 2;
        lines.forEach((l, i) => ctx.fillText(l, 256, startY + i * lh));
        const buf = canvas.toBuffer('image/png');
        const ok = await toSticker(buf, sock, jid, msg);
        if (!ok) await sock.sendMessage(jid, { text: '❌ Failed to create sticker.', edit: m.key });
        else await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'stickeranim':
    case 'sanim': {
      const m = await reply('🎞 Creating animated sticker...');
      const gifMsg = quotedMsg?.videoMessage || quotedMsg?.imageMessage || msg.message?.videoMessage || msg.message?.imageMessage;
      if (!gifMsg) {
        await sock.sendMessage(jid, { text: '❌ Reply to a GIF or video.', edit: m.key });
        return true;
      }
      try {
        const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
        const type = gifMsg === msg.message?.videoMessage || gifMsg === quotedMsg?.videoMessage ? 'video' : 'image';
        const stream = await downloadContentFromMessage(gifMsg, type);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        const { Sticker, StickerTypes } = await import('wa-sticker-formatter');
        const sticker = new Sticker(buf, { pack: 'NEW PAGE', author: 'Bot', type: StickerTypes.FULL, quality: 50 });
        const stickerBuf = await sticker.toBuffer();
        await sock.sendMessage(jid, { sticker: stickerBuf }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'stickercrop':
    case 'scrop': {
      const m = await reply('✂️ Cropping sticker...');
      const stickerMsg = quotedMsg?.stickerMessage || msg.message?.stickerMessage;
      if (!stickerMsg) {
        await sock.sendMessage(jid, { text: '❌ Reply to a sticker.', edit: m.key });
        return true;
      }
      try {
        const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buf = Buffer.concat(chunks);
        const { Sticker, StickerTypes } = await import('wa-sticker-formatter');
        const sticker = new Sticker(buf, { pack: 'NEW PAGE', author: 'Bot', type: StickerTypes.CROPPED, quality: 50 });
        const stickerBuf = await sticker.toBuffer();
        await sock.sendMessage(jid, { sticker: stickerBuf }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    default:
      return false;
  }
  return true;
}
