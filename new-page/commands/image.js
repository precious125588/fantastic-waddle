import { fetchBuffer, reminiEnhance } from '../lib/api.js';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getImageBuffer(msg, quotedMsg) {
  const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
  const imgMsg =
    quotedMsg?.imageMessage ||
    quotedMsg?.videoMessage ||
    msg.message?.imageMessage ||
    msg.message?.videoMessage;
  if (!imgMsg) return null;
  const type = (imgMsg === msg.message?.imageMessage || imgMsg === quotedMsg?.imageMessage) ? 'image' : 'video';
  try {
    const stream = await downloadContentFromMessage(imgMsg, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch { return null; }
}

async function saveTemp(buf, ext = 'jpg') {
  const tmp = path.join(os.tmpdir(), `np_${Date.now()}.${ext}`);
  fs.writeFileSync(tmp, buf);
  return tmp;
}

export async function handleImage(sock, msg, { command, args, jid, sender, text, reply, quotedMsg }) {
  switch (command) {

    case 'enhance':
    case 'remini': {
      const m = await reply('✨ Enhancing image...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key });
        return true;
      }
      // Upload to catbox first for remini
      try {
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('fileToUpload', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
        const { default: axios } = await import('axios');
        const { data: uploadUrl } = await axios.post('https://catbox.moe/user/api.php', form, {
          headers: form.getHeaders(),
          timeout: 30000,
        });
        const res = await reminiEnhance(uploadUrl.trim());
        if (!res.ok) {
          await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
          return true;
        }
        const enhanced = await fetchBuffer(res.url);
        if (!enhanced) {
          await sock.sendMessage(jid, { text: '❌ Failed to fetch enhanced image.', edit: m.key });
          return true;
        }
        await sock.sendMessage(jid, { image: enhanced, caption: '✨ Enhanced!', mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'cartoonify':
    case 'cartoon': {
      const m = await reply('🎨 Cartoonifying...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key });
        return true;
      }
      try {
        const Jimp = (await import('jimp')).default;
        const image = await Jimp.read(buf);
        image.posterize(4).saturate(50).contrast(0.2);
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        await sock.sendMessage(jid, { image: out, caption: '🎨 Cartoonified!', mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'removebg':
    case 'rmbg': {
      const m = await reply('🖼 Removing background...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key });
        return true;
      }
      try {
        const { default: axios } = await import('axios');
        const FormData = (await import('form-data')).default;
        const form = new FormData();
        form.append('image_file', buf, { filename: 'image.jpg', contentType: 'image/jpeg' });
        form.append('size', 'auto');
        const { data } = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
          headers: { ...form.getHeaders(), 'X-Api-Key': 'ZHGmbT7u7z22HjKkCQq5Ufbq' },
          responseType: 'arraybuffer',
          timeout: 30000,
        });
        const out = Buffer.from(data);
        await sock.sendMessage(jid, { image: out, caption: '✅ Background removed!', mimetype: 'image/png' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        // Fallback: use Jimp to lighten background
        try {
          const Jimp = (await import('jimp')).default;
          const image = await Jimp.read(buf);
          image.threshold({ max: 200, replace: 0 });
          const out = await image.getBufferAsync(Jimp.MIME_PNG);
          await sock.sendMessage(jid, { image: out, caption: '✅ Background removed (approx)!', mimetype: 'image/png' }, { quoted: msg });
          await sock.sendMessage(jid, { delete: m.key });
        } catch (e2) {
          await sock.sendMessage(jid, { text: `❌ ${e2.message}`, edit: m.key });
        }
      }
      break;
    }

    case 'blur': {
      const m = await reply('🌫 Blurring image...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key });
        return true;
      }
      try {
        const Jimp = (await import('jimp')).default;
        const image = await Jimp.read(buf);
        const radius = parseInt(args[0]) || 5;
        image.blur(Math.max(1, Math.min(radius, 50)));
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        await sock.sendMessage(jid, { image: out, caption: `🌫 Blurred (radius: ${radius})`, mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'flip': {
      const m = await reply('🔄 Flipping image...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key });
        return true;
      }
      try {
        const Jimp = (await import('jimp')).default;
        const image = await Jimp.read(buf);
        const horiz = !text || text.toLowerCase() !== 'v';
        image.flip(horiz, !horiz);
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        await sock.sendMessage(jid, { image: out, caption: `🔄 Flipped ${horiz ? 'horizontally' : 'vertically'}`, mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'rotate': {
      const m = await reply('🔃 Rotating image...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key });
        return true;
      }
      try {
        const Jimp = (await import('jimp')).default;
        const image = await Jimp.read(buf);
        const deg = parseInt(text) || 90;
        image.rotate(deg);
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        await sock.sendMessage(jid, { image: out, caption: `🔃 Rotated ${deg}°`, mimetype: 'image/jpeg' }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'compress':
    case 'compressimage': {
      const m = await reply('📦 Compressing image...');
      const buf = await getImageBuffer(msg, quotedMsg);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Reply to an image.', edit: m.key });
        return true;
      }
      try {
        const Jimp = (await import('jimp')).default;
        const image = await Jimp.read(buf);
        const quality = parseInt(text) || 30;
        image.quality(Math.max(1, Math.min(quality, 100)));
        const out = await image.getBufferAsync(Jimp.MIME_JPEG);
        const before = (buf.length / 1024).toFixed(1);
        const after = (out.length / 1024).toFixed(1);
        await sock.sendMessage(jid, {
          image: out,
          caption: `📦 Compressed!\nBefore: ${before} KB → After: ${after} KB (quality: ${quality})`,
          mimetype: 'image/jpeg',
        }, { quoted: msg });
        await sock.sendMessage(jid, { delete: m.key });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'waifu': {
      const m = await reply('🎌 Fetching waifu...');
      try {
        const res = await fetchBuffer('https://api.waifu.pics/sfw/waifu');
        const { default: axios } = await import('axios');
        const { data } = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 10000 });
        const imgBuf = await fetchBuffer(data.url);
        if (!imgBuf) throw new Error('no image');
        await sock.sendMessage(jid, { image: imgBuf, caption: '🎌 Waifu!', mimetype: 'image/jpeg' }, { quoted: msg });
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
