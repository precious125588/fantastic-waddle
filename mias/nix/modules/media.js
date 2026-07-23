/**
 * NIX — Media Tools Module
 *
 * All media sends and reactions are routed through the centralized
 * media/reaction handlers. Commands must NEVER call `sock.sendMessage`
 * directly for media, and must NEVER hand-roll reaction emojis.
 */
import { getOwnerName, greet } from '../owner.js';
import { stagedSend, sendNix, nixFooter, typingOn, typingOff } from '../ui.js';
import { nixDownload, nixGif, prexzyGet } from '../api.js';
import { httpClient as axios } from '../../lib/engineAccess.js';
import {
  sendImage,
  sendVideo,
  sendGif,
  sendAudio,
  sendDocument,
} from '../../handlers/mediaHandler.js';
import {
  reactDownload,
  reactSuccess,
  reactFail,
  reactCustom,
  withReactions,
} from '../../handlers/reactionHandler.js';
import { downloadViewOnce } from '../../handlers/downloadHandler.js';

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

  await reactDownload(sock, msg);
  await typingOn(sock, getJid(msg));
  const result = await nixDownload(url);
  await typingOff(sock, getJid(msg));

  if (!result.ok) {
    await reactFail(sock, msg);
    await sendNix(sock, msg, `❌ *Download Failed*\n\n${greet(owner)} I was unable to download from that link.\n_Make sure the URL is valid and publicly accessible._${nixFooter()}`);
    return;
  }

  const d = result.data;
  const mediaUrl = d?.url || d?.dl || d?.download || d?.video || d?.audio || d?.file;
  const title = d?.title || d?.caption || 'Downloaded Media';

  if (!mediaUrl) {
    await reactFail(sock, msg);
    await sendNix(sock, msg, `❌ *Download Failed*\n\n${greet(owner)} no downloadable media found in that link.${nixFooter()}`);
    return;
  }

  try {
    const resp = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 60000 });
    const buf = Buffer.from(resp.data);
    const ct = String(resp.headers['content-type'] || '');
    const jid = getJid(msg);
    const caption = `✅ *${title}*\n\n> 🧠 _Powered by Nix ⚡_`;

    if (ct.includes('video') || mediaUrl.includes('.mp4')) {
      // sendVideo auto-generates a jpeg thumbnail via mediaHandler._autoThumb
      await sendVideo(sock, jid, buf, { caption, quoted: msg });
    } else if (ct.includes('audio') || mediaUrl.includes('.mp3')) {
      await sendAudio(sock, jid, buf, { mimetype: 'audio/mp4', quoted: msg });
    } else if (ct.includes('image')) {
      await sendImage(sock, jid, buf, { caption, quoted: msg });
    } else {
      await sendDocument(sock, jid, buf, {
        fileName: title,
        caption: `✅ Downloaded${nixFooter()}`,
        quoted: msg,
      });
    }

    await reactSuccess(sock, msg);
  } catch {
    await reactFail(sock, msg);
    await sendNix(sock, msg, `⬇️ *Download Link*\n\n${greet(owner)} here's your media link:\n${mediaUrl}${nixFooter()}`);
  }
}

export async function viewOnce(sock, msg) {
  const owner = getOwnerName();
  const ctx = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!ctx) {
    await sendNix(sock, msg, `👁️ *View Once*\n\n${greet(owner)} reply to a view-once message with \`.nix viewonce\` to reveal it.${nixFooter()}`);
    return;
  }

  // Build a synthetic wrapper so downloadViewOnce sees the quoted content
  // as if it were the top-level message.
  const wrapper = { message: ctx };

  try {
    await reactCustom(sock, msg, '👁️');
    const result = await downloadViewOnce(wrapper);
    if (!result?.buffer) {
      await reactFail(sock, msg);
      await sendNix(sock, msg, `👁️ *View Once*\n\n${greet(owner)} the replied message is not a view-once media.${nixFooter()}`);
      return;
    }

    const jid = getJid(msg);
    const caption = `👁️ *View Once Revealed*\n\n> 🧠 _Powered by Nix ⚡_`;
    if (result.type === 'image') {
      await sendImage(sock, jid, result.buffer, { caption, quoted: msg });
    } else {
      await sendVideo(sock, jid, result.buffer, { caption, quoted: msg });
    }
    await reactSuccess(sock, msg);
  } catch {
    await reactFail(sock, msg);
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

  await reactCustom(sock, msg, '🎬');
  const result = await nixGif(keyword);
  if (!result.ok) {
    await reactFail(sock, msg);
    await sendNix(sock, msg, `❌ *GIF Not Found*\n\n${greet(owner)} I couldn't find a GIF for "${keyword}".${nixFooter()}`);
    return;
  }

  const url = result.data?.url || result.data?.gif;
  if (!url) {
    await reactFail(sock, msg);
    await sendNix(sock, msg, `❌ *GIF Not Found*\n\n${greet(owner)} no GIF available for "${keyword}".${nixFooter()}`);
    return;
  }

  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
    const buf = Buffer.from(resp.data);
    await sendGif(sock, getJid(msg), buf, {
      caption: `🎬 *${keyword}*\n> 🧠 _Nix ⚡_`,
      quoted: msg,
    });
    await reactSuccess(sock, msg);
  } catch {
    await reactFail(sock, msg);
    await sendNix(sock, msg, `🎬 *GIF Found*\n\n${url}${nixFooter()}`);
  }
}

export async function meme(sock, msg) {
  const owner = getOwnerName();
  await reactCustom(sock, msg, '😂');

  const trySend = async (url, title) => {
    const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
    const buf = Buffer.from(resp.data);
    await sendImage(sock, getJid(msg), buf, {
      caption: `😂 *${title}*\n\n> 🧠 _Nix ⚡_`,
      quoted: msg,
    });
  };

  try {
    const r = await prexzyGet('/fun/meme');
    const d = r.ok ? (r.data?.data || r.data) : null;
    const url = d?.url || d?.image || d?.meme;
    if (url) {
      await trySend(url, 'Random Meme');
      await reactSuccess(sock, msg);
      return;
    }
  } catch {}

  // Fallback: meme-api
  try {
    const { data } = await axios.get('https://meme-api.com/gimme', { timeout: 10000 });
    const url = data?.url;
    if (url) {
      await trySend(url, data.title || 'Random Meme');
      await reactSuccess(sock, msg);
      return;
    }
  } catch {}

  await reactFail(sock, msg);
  await sendNix(sock, msg, `❌ *Meme Failed*\n\n${greet(owner)} I couldn't fetch a meme right now.${nixFooter()}`);
}

export async function lastMedia(sock, msg, args) {
  const owner = getOwnerName();
  const num = args[0];
  const targetJid = num ? `${num.replace(/[^0-9]/g, '')}@s.whatsapp.net` : getJid(msg);
  await reactCustom(sock, msg, '📸');
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
  await reactCustom(sock, msg, '📸');
  await sendNix(sock, msg, `📸 *Media From ${num}*\n\n${greet(owner)} fetching media received from \`${num}\`...\n\n_This feature requires message history access. Open the chat with this contact to view media._${nixFooter()}`);
}

export async function mediaSent(sock, msg, args) {
  const owner = getOwnerName();
  const num = args[0];
  if (!num) {
    await sendNix(sock, msg, `📤 *Media Sent to Contact*\n\nUsage: \`.nix mediasent <number>\`\nExample: \`.nix mediasent 2349012345678\`${nixFooter()}`);
    return;
  }
  await reactCustom(sock, msg, '📤');
  await sendNix(sock, msg, `📤 *Media Sent to ${num}*\n\n${greet(owner)} fetching media you sent to \`${num}\`...\n\n_This feature requires message history access. Open the chat with this contact to view sent media._${nixFooter()}`);
}
