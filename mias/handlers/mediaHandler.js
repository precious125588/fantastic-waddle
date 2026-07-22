/**
 * MIAS — Media Handler
 * Centralized media sending with proper thumbnail generation, MIME types,
 * metadata, and caching. All media commands should use these functions
 * instead of calling sock.sendMessage({ image/video/audio/sticker/document }) directly.
 *
 * Key fixes implemented here:
 *  - jpegThumbnail is always a Buffer (not a URL) so ALL recipients see it immediately
 *  - Proper MIME type detection and normalization
 *  - Thumbnail generation for images, videos, and audio artwork
 *  - Stream and buffer safety guards
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { generateImageThumbnail, generateVideoThumbnail, fetchBuffer } from "./uploadHandler.js";

const _require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _jid(msg) { return msg.key.remoteJid; }

/**
 * Normalize an image buffer input (Buffer, URL string, or file path).
 * @returns {Promise<Buffer>}
 */
async function _resolveBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === "string") {
    if (/^https?:\/\//i.test(input)) return fetchBuffer(input);
    if (fs.existsSync(input)) return fs.readFileSync(input);
  }
  throw new Error("Cannot resolve media: expected Buffer, URL, or file path");
}

/**
 * Detect MIME type from a buffer's magic bytes.
 */
function _detectMime(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.slice(0, 4).toString() === "RIFF") return "video/webm";
  if (buf[0] === 0x1A && buf[1] === 0x45) return "video/webm";
  if (buf.slice(4, 8).toString() === "ftyp") return "video/mp4";
  if (buf.slice(0, 3).toString() === "ID3" || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0)) return "audio/mpeg";
  if (buf.slice(0, 4).toString() === "OggS") return "audio/ogg; codecs=opus";
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WAVE") return "audio/wav";
  if (buf.slice(0, 4).toString() === "RIFF") return "audio/webm";
  return null;
}

// ─── Image ───────────────────────────────────────────────────────────────────

/**
 * Send an image message with a proper embedded thumbnail.
 * @param {object}        sock
 * @param {object}        msg           - Message to quote
 * @param {Buffer|string} image         - Buffer, URL, or file path
 * @param {string}        [caption=""]
 * @param {object}        [opts]        - { contextInfo, mentions, quoted }
 */
export async function sendImage(sock, msg, image, caption = "", opts = {}) {
  const jid = _jid(msg);
  const buf = await _resolveBuffer(image);
  const mime = _detectMime(buf) || "image/jpeg";

  // Generate embedded thumbnail so all recipients see a preview instantly
  let jpegThumbnail;
  try { jpegThumbnail = await generateImageThumbnail(buf, 320, 320); } catch {}

  const payload = {
    image: buf,
    caption,
    mimetype: mime,
    ...(jpegThumbnail ? { jpegThumbnail } : {}),
    ...(opts.contextInfo ? { contextInfo: opts.contextInfo } : {}),
    ...(opts.mentions ? { mentions: opts.mentions } : {}),
  };

  const sendOpts = { quoted: opts.quoted ?? msg };
  try {
    return await sock.sendMessage(jid, payload, sendOpts);
  } catch {
    // Fallback without thumbnail
    return await sock.sendMessage(jid, { image: buf, caption, mimetype: mime }, sendOpts);
  }
}

// ─── Video ───────────────────────────────────────────────────────────────────

/**
 * Send a video message with a proper embedded thumbnail.
 * @param {object}        sock
 * @param {object}        msg
 * @param {Buffer|string} video
 * @param {string}        [caption=""]
 * @param {object}        [opts]        - { gifPlayback, mimetype, contextInfo, mentions, quoted }
 */
export async function sendVideo(sock, msg, video, caption = "", opts = {}) {
  const jid = _jid(msg);
  const buf = await _resolveBuffer(video);
  const mime = opts.mimetype || _detectMime(buf) || "video/mp4";

  // Generate video thumbnail for immediate preview
  let jpegThumbnail;
  try { jpegThumbnail = await generateVideoThumbnail(buf); } catch {}

  const payload = {
    video: buf,
    caption,
    mimetype: mime,
    gifPlayback: opts.gifPlayback ?? false,
    ...(jpegThumbnail ? { jpegThumbnail } : {}),
    ...(opts.contextInfo ? { contextInfo: opts.contextInfo } : {}),
    ...(opts.mentions ? { mentions: opts.mentions } : {}),
  };

  const sendOpts = { quoted: opts.quoted ?? msg };
  try {
    return await sock.sendMessage(jid, payload, sendOpts);
  } catch {
    // Try as document if video send fails
    try {
      return await sock.sendMessage(jid, {
        document: buf,
        mimetype: mime,
        fileName: `video_${Date.now()}.mp4`,
        caption,
      }, sendOpts);
    } catch {}
  }
}

// ─── GIF ─────────────────────────────────────────────────────────────────────

/**
 * Send a GIF (gifPlayback: true video).
 */
export async function sendGif(sock, msg, gif, caption = "", opts = {}) {
  return sendVideo(sock, msg, gif, caption, { ...opts, gifPlayback: true });
}

// ─── Audio ───────────────────────────────────────────────────────────────────

/**
 * Send an audio message with optional artwork as contextInfo.externalAdReply.
 * @param {object}        sock
 * @param {object}        msg
 * @param {Buffer|string} audio
 * @param {object}        [opts]
 * @param {string}        [opts.mimetype]     - audio/mpeg | audio/ogg; codecs=opus
 * @param {boolean}       [opts.ptt=false]    - Voice note
 * @param {string}        [opts.title]        - Song title (for externalAdReply)
 * @param {string}        [opts.artist]       - Artist name
 * @param {Buffer|string} [opts.artwork]      - Album art buffer or URL
 * @param {string}        [opts.sourceUrl]    - Source URL for the song
 */
export async function sendAudio(sock, msg, audio, opts = {}) {
  const jid = _jid(msg);
  const buf = await _resolveBuffer(audio);
  const mime = opts.mimetype || _detectMime(buf) || "audio/mpeg";
  const isPtt = opts.ptt ?? false;

  const payload = {
    audio: buf,
    mimetype: mime,
    ptt: isPtt,
  };

  // Add artwork as jpegThumbnail in contextInfo for ALL recipients
  if (opts.title || opts.artwork) {
    let thumbBuf = null;
    if (opts.artwork) {
      try {
        const artBuf = await _resolveBuffer(opts.artwork);
        thumbBuf = await generateImageThumbnail(artBuf, 300, 300);
      } catch {}
    }

    payload.contextInfo = {
      externalAdReply: {
        title: opts.title || "Audio",
        body: [opts.artist, opts.duration].filter(Boolean).join(" • ") || " ",
        mediaType: 1,
        renderLargerThumbnail: false,
        showAdAttribution: false,
        ...(thumbBuf ? { thumbnail: thumbBuf } : {}),
        ...(opts.sourceUrl ? { sourceUrl: opts.sourceUrl } : {}),
      },
    };
  }

  const sendOpts = { quoted: opts.quoted ?? msg };
  try {
    return await sock.sendMessage(jid, payload, sendOpts);
  } catch {
    // Fallback without contextInfo
    return await sock.sendMessage(jid, { audio: buf, mimetype: mime, ptt: isPtt }, sendOpts);
  }
}

// ─── Sticker ─────────────────────────────────────────────────────────────────

/**
 * Send a sticker. Input should be a WebP buffer.
 */
export async function sendSticker(sock, msg, sticker, opts = {}) {
  const jid = _jid(msg);
  const buf = await _resolveBuffer(sticker);
  const sendOpts = { quoted: opts.quoted ?? msg };
  try {
    return await sock.sendMessage(jid, { sticker: buf }, sendOpts);
  } catch {}
}

// ─── Document ────────────────────────────────────────────────────────────────

/**
 * Send a document/file.
 * @param {object}        sock
 * @param {object}        msg
 * @param {Buffer|string} document
 * @param {object}        [opts]
 * @param {string}        [opts.fileName]
 * @param {string}        [opts.mimetype]
 * @param {string}        [opts.caption]
 * @param {Buffer}        [opts.thumbnail] - Document preview thumbnail
 */
export async function sendDocument(sock, msg, document, opts = {}) {
  const jid = _jid(msg);
  const buf = await _resolveBuffer(document);
  const mime = opts.mimetype || _detectMime(buf) || "application/octet-stream";
  const fileName = opts.fileName || `file_${Date.now()}`;

  const payload = {
    document: buf,
    mimetype: mime,
    fileName,
    ...(opts.caption ? { caption: opts.caption } : {}),
    ...(opts.thumbnail ? { jpegThumbnail: opts.thumbnail } : {}),
  };

  const sendOpts = { quoted: opts.quoted ?? msg };
  try {
    return await sock.sendMessage(jid, payload, sendOpts);
  } catch {}
}

/**
 * Send a JavaScript source file as a document.
 * WhatsApp renders this as "Javascript code / View code" natively.
 *
 * @param {object} sock
 * @param {object} msg
 * @param {string} code        - JavaScript source code string
 * @param {string} [fileName]  - File name (e.g. "ping.js")
 */
export async function sendCodeDocument(sock, msg, code, fileName = "code.js") {
  const jid = _jid(msg);
  const buf = Buffer.from(String(code ?? ""), "utf8");

  // WhatsApp shows "Javascript code" + "View code" with this exact mimetype
  const payload = {
    document: buf,
    mimetype: "application/javascript",
    fileName: fileName.endsWith(".js") ? fileName : fileName + ".js",
    fileLength: buf.length,
  };

  const sendOpts = { quoted: msg };
  try {
    return await sock.sendMessage(jid, payload, sendOpts);
  } catch (e1) {
    // Fallback: send as text/plain
    try {
      return await sock.sendMessage(jid, {
        document: buf,
        mimetype: "text/plain",
        fileName: fileName.endsWith(".js") ? fileName : fileName + ".js",
      }, sendOpts);
    } catch {
      // Last resort: send as code blocks
      let remaining = code;
      while (remaining.length > 0) {
        const chunk = remaining.slice(0, 3500);
        remaining = remaining.slice(3500);
        await sock.sendMessage(jid, { text: "```\n" + chunk + "\n```" }, { quoted: msg }).catch(() => {});
      }
    }
  }
}

// ─── Album ───────────────────────────────────────────────────────────────────

/**
 * Send multiple images/videos as a media album.
 * @param {object}   sock
 * @param {object}   msg
 * @param {Array}    media - Array of { type: 'image'|'video', buffer: Buffer, caption?: string }
 */
export async function sendAlbum(sock, msg, media) {
  const jid = _jid(msg);
  const messages = [];

  for (const item of media.slice(0, 10)) {
    try {
      const buf = await _resolveBuffer(item.buffer || item.image || item.video);
      const type = item.type || (item.image ? "image" : "video");
      let thumb;
      if (type === "image") {
        try { thumb = await generateImageThumbnail(buf); } catch {}
      } else {
        try { thumb = await generateVideoThumbnail(buf); } catch {}
      }
      messages.push({
        [type]: buf,
        caption: item.caption || "",
        mimetype: item.mimetype || (type === "image" ? "image/jpeg" : "video/mp4"),
        ...(thumb ? { jpegThumbnail: thumb } : {}),
      });
    } catch {}
  }

  if (!messages.length) return;

  // Send as a sequence (WhatsApp auto-groups consecutive media from the same sender)
  for (let i = 0; i < messages.length; i++) {
    try {
      await sock.sendMessage(jid, messages[i], { quoted: i === 0 ? msg : undefined });
      if (i < messages.length - 1) await new Promise(r => setTimeout(r, 300));
    } catch {}
  }
}
