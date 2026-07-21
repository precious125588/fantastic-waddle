/**
 * NIX — Media Tools Module
 */
import { getOwnerName, greet } from '../owner.js';
import { stagedSend, sendNix, reactNix, nixFooter, typingOn, typingOff } from '../ui.js';
import { nixDownload, nixGif, prexzyGet } from '../api.js';
import axios from 'axios';

function getJid(msg) { return msg.key.remoteJid; }
function getQuotedMsg(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
}
function cleanNumber(n) { return String(n || '').replace(/[^0-9]/g, ''); }
function toJid(n) { const c = cleanNumber(n); return c ? `${c}@s.whatsapp.net` : null; }

export async function download(sock, msg, args) {
  const owner = getOwnerName();
  const url = args[0] || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation;
  if (!url || !url.startsWith('http')) {
    await sendNix(sock, msg, `⬇️ *Download*\n\nUsage: \`.nix download <url>\`\nSupports: TikTok, Instagram, YouTube, Twitter/X, Facebook, Pinterest\n\nExample: \`.nix download https://vm.tiktok.com/...\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '⬇️');
  await typingOn(sock, getJid(msg));
  const result = await nixDownload(url);
  await typingOff(sock, getJid(msg));
  if (!result.ok) {
    await sendNix(sock, msg, `❌ *Download Failed*\n\n${greet(owner)} I was unable to download from that link.\n_Make sure the URL is valid and publicly accessible._${nixFooter()}`);
    return;
  }
  const d = result.data;
  const mediaUrl = d?.url || d?.dl || d?.download || d?.video || d?.audio || d?.file;
  const title = d?.title || d?.caption || 'Downloaded Media';
  if (!mediaUrl) {
    await sendNix(sock, msg, `❌ *Download Failed*\n\n${greet(owner)} no downloadable media found in that link.${nixFooter()}`);
    return;
  }
  try {
    const resp = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 60000 });
    const buf = Buffer.from(resp.data);
    const ct = resp.headers['content-type'] || '';
    const jid = getJid(msg);
    if (ct.includes('video') || mediaUrl.includes('.mp4')) {
      await sock.sendMessage(jid, { video: buf, caption: `✅ *${title}*\n\n> 🧠 _Powered by Nix ⚡_` }, { quoted: msg });
    } else if (ct.includes('audio') || mediaUrl.includes('.mp3')) {
      await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mp4' }, { quoted: msg });
    } else if (ct.includes('image')) {
      await sock.sendMessage(jid, { image: buf, caption: `✅ *${title}*\n\n> 🧠 _Powered by Nix ⚡_` }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { document: buf, fileName: title, caption: `✅ Downloaded${nixFooter()}` }, { quoted: msg });
    }
    await reactNix(sock, msg, '✅');
  } catch {
    await sendNix(sock, msg, `⬇️ *Download Link*\n\n${greet(owner)} here's your media link:\n${mediaUrl}${nixFooter()}`);
  }
}

export async function viewOnce(sock, msg) {
  const owner = getOwnerName();
  try {
    const ctx = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!ctx) {
      await sendNix(sock, msg, `👁️ *View Once*\n\n${greet(owner)} reply to a view-once message with \`.nix viewonce\` to reveal it.${nixFooter()}`);
      return;
    }
    const voMsg = ctx?.viewOnceMessage?.message || ctx?.viewOnceMessageV2?.message || ctx;
    const imageMsg = voMsg?.imageMessage;
    const videoMsg = voMsg?.videoMessage;
    if (!imageMsg && !videoMsg) {
      await sendNix(sock, msg, `👁️ *View Once*\n\n${greet(owner)} the replied message is not a view-once media.${nixFooter()}`);
      return;
    }
    await reactNix(sock, msg, '👁️');
    const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
    const mediaMsg = imageMsg || videoMsg;
    const type = imageMsg ? 'image' : 'video';
    const stream = await downloadContentFromMessage(mediaMsg, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    const jid = getJid(msg);
    if (type === 'image') {
      await sock.sendMessage(jid, { image: buf, caption: `👁️ *View Once Revealed*\n\n> 🧠 _Powered by Nix ⚡_` }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { video: buf, caption: `👁️ *View Once Revealed*\n\n> 🧠 _Powered by Nix ⚡_` }, { quoted: msg });
    }
    await reactNix(sock, msg, '✅');
  } catch {
    await sendNix(sock, msg, `❌ *View Once Failed*\n\nNix is currently unable to reveal this message.${nixFooter()}`);
  }
}

export async function gif(sock, msg, args) {
  const owner = getOwnerName();
  const keyword = args.join(' ');
  if (!keyword) {
    await sendNix(sock, msg, `🎬 *GIF Search*\n\nUsage: \`.nix gif <keyword>\`\nExample: \`.nix gif funny cat\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🎬');
  const result = await nixGif(keyword);
  if (!result.ok) {
    await sendNix(sock, msg, `❌ *GIF Not Found*\n\n${greet(owner)} I couldn't find a GIF for "${keyword}".${nixFooter()}`);
    return;
  }
  const url = result.data?.url || result.data?.gif;
  if (!url) {
    await sendNix(sock, msg, `❌ *GIF Not Found*\n\n${greet(owner)} no GIF available for "${keyword}".${nixFooter()}`);
    return;
  }
  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
    const buf = Buffer.from(resp.data);
    await sock.sendMessage(getJid(msg), { video: buf, gifPlayback: true, caption: `🎬 *${keyword}*\n> 🧠 _Nix ⚡_` }, { quoted: msg });
    await reactNix(sock, msg, '✅');
  } catch {
    await sendNix(sock, msg, `🎬 *GIF Found*\n\n${url}${nixFooter()}`);
  }
}

export async function meme(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '😂');
  try {
    const r = await prexzyGet('/fun/meme');
    const d = r.ok ? (r.data?.data || r.data) : null;
    const url = d?.url || d?.image || d?.meme;
    if (url) {
      const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
      const buf = Buffer.from(resp.data);
      await sock.sendMessage(getJid(msg), { image: buf, caption: `😂 *Random Meme*\n\n> 🧠 _Nix ⚡_` }, { quoted: msg });
      await reactNix(sock, msg, '✅');
      return;
    }
  } catch {}
  // Fallback: meme-api
  try {
    const { data } = await axios.get('https://meme-api.com/gimme', { timeout: 10000 });
    const url = data?.url;
    if (url) {
      const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
      const buf = Buffer.from(resp.data);
      await sock.sendMessage(getJid(msg), { image: buf, caption: `😂 *${data.title || 'Random Meme'}*\n\n> 🧠 _Nix ⚡_` }, { quoted: msg });
      await reactNix(sock, msg, '✅');
      return;
    }
  } catch {}
  await sendNix(sock, msg, `❌ *Meme Failed*\n\n${greet(owner)} I couldn't fetch a meme right now.${nixFooter()}`);
}

export async function lastMedia(sock, msg, args) {
  const owner = getOwnerName();
  const num = args[0];
  const targetJid = num ? `${num.replace(/[^0-9]/g, '')}@s.whatsapp.net` : getJid(msg);
  await reactNix(sock, msg, '📸');
  try {
    const msgs = await sock.fetchMessagesFromWA?.(targetJid, 20) || [];
    const mediaMsg = msgs.find(m => m.message?.imageMessage || m.message?.videoMessage || m.message?.audioMessage || m.message?.documentMessage);
    if (!mediaMsg) {
      await sendNix(sock, msg, `📸 *Last Media*\n\n${greet(owner)} no recent media found in this chat.${nixFooter()}`);
      return;
    }
    await sendNix(sock, msg, `📸 *Last Media Found*\n\n${greet(owner)} I found the last media sent.\n_Timestamp: ${new Date(mediaMsg.messageTimestamp * 1000).toLocaleString()}_${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `📸 *Last Media*\n\n${greet(owner)} I was unable to fetch media history for this chat.${nixFooter()}`);
  }
}

export async function mediaFrom(sock, msg, args) {
  const owner = getOwnerName();
  const num = args[0];
  if (!num) {
    await sendNix(sock, msg, `📸 *Media From Contact*\n\nUsage: \`.nix mediafrom <number>\`\nExample: \`.nix mediafrom 2349012345678\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '📸');
  await sendNix(sock, msg, `📸 *Media From ${num}*\n\n${greet(owner)} fetching media received from \`${num}\`...\n\n_This feature requires message history access. Open the chat with this contact to view media._${nixFooter()}`);
}

export async function mediaSent(sock, msg, args) {
  const owner = getOwnerName();
  const num = args[0];
  if (!num) {
    await sendNix(sock, msg, `📤 *Media Sent to Contact*\n\nUsage: \`.nix mediasent <number>\`\nExample: \`.nix mediasent 2349012345678\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '📤');
  await sendNix(sock, msg, `📤 *Media Sent to ${num}*\n\n${greet(owner)} fetching media you sent to \`${num}\`...\n\n_This feature requires message history access. Open the chat with this contact to view sent media._${nixFooter()}`);
}
