/**
 * MIAS — Download Handler
 * Centralized media download abstraction using @itsliaaa/baileys.
 * Commands should call these instead of using downloadContentFromMessage directly.
 */

/**
 * Download media from a Baileys message object into a Buffer.
 * Supports: image, video, audio, document, sticker, viewOnce
 *
 * @param {object} msg - The Baileys message object
 * @returns {Promise<{buffer: Buffer, mimetype: string, type: string} | null>}
 */
export async function downloadMedia(msg) {
  const { downloadContentFromMessage } = await import("@whiskeysockets/baileys");
  const m = msg?.message;
  if (!m) return null;

  const unwrap = (obj) =>
    obj?.viewOnceMessage?.message ||
    obj?.viewOnceMessageV2?.message ||
    obj?.ephemeralMessage?.message ||
    obj;

  const inner = unwrap(m);

  const typeMap = [
    ["imageMessage",    "image"],
    ["videoMessage",    "video"],
    ["audioMessage",    "audio"],
    ["stickerMessage",  "sticker"],
    ["documentMessage", "document"],
    ["ptvMessage",      "video"],
  ];

  let mediaMsg = null;
  let type = "";

  for (const [key, t] of typeMap) {
    if (inner[key]) { mediaMsg = inner[key]; type = t; break; }
  }

  if (!mediaMsg) return null;

  try {
    const stream = await downloadContentFromMessage(mediaMsg, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const mimetype = mediaMsg.mimetype || _defaultMime(type);
    return { buffer, mimetype, type };
  } catch {
    return null;
  }
}

/**
 * Download media from a quoted/replied message.
 */
export async function downloadQuotedMedia(msg) {
  const ctx = msg?.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage) return null;

  // Reconstruct a fake message object for the quoted content
  const fakeMsg = {
    key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant },
    message: ctx.quotedMessage,
  };
  return downloadMedia(fakeMsg);
}

/**
 * Fetch a URL as a Buffer.
 */
export async function fetchBuffer(url, timeout = 60000) {
  const axios = (await import("axios")).default;
  const resp = await axios.get(url, {
    responseType: "arraybuffer",
    timeout,
    maxRedirects: 5,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  return Buffer.from(resp.data);
}

function _defaultMime(type) {
  const map = {
    image: "image/jpeg",
    video: "video/mp4",
    audio: "audio/ogg; codecs=opus",
    sticker: "image/webp",
    document: "application/octet-stream",
  };
  return map[type] || "application/octet-stream";
}
