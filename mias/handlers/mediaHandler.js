/**
 * MIAS — Media Handler  v2
 *
 * Centralized abstraction for sending all media types:
 *  image, video, audio, voice note, sticker, GIF, document, album.
 *
 * All thumbnail generation, MIME detection, and media upload
 * go through this file. Commands never touch Baileys directly.
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import { fetchBuffer, generateImageThumbnail, generateVideoThumbnail } from "./uploadHandler.js";
import { prepareExternalAdReply } from "./baileysHandler.js";

// ─── MIME helpers ─────────────────────────────────────────────────────────────

const MIME_MAP = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", mkv: "video/x-matroska", mov: "video/quicktime",
  avi: "video/x-msvideo", wmv: "video/x-ms-wmv", flv: "video/x-flv",
  mp3: "audio/mpeg", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac",
  opus: "audio/ogg; codecs=opus", wav: "audio/wav", flac: "audio/flac",
  pdf: "application/pdf",
  zip: "application/zip", rar: "application/x-rar-compressed",
  "7z": "application/x-7z-compressed",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  json: "application/json",
  apk: "application/vnd.android.package-archive",
  ipa: "application/octet-stream",
};

/**
 * Guess MIME type from a filename extension.
 * @param {string} filename
 * @param {string} [fallback]
 * @returns {string}
 */
export function guessMime(filename, fallback = "application/octet-stream") {
  const ext = (filename || "").split(".").pop()?.toLowerCase();
  return MIME_MAP[ext] || fallback;
}

// ─── Source normalizer (Buffer | URL | path) ──────────────────────────────────

async function _resolveSource(src) {
  if (!src) throw new Error("Media source is required");
  if (Buffer.isBuffer(src)) return src;
  if (typeof src === "string") {
    if (src.startsWith("http://") || src.startsWith("https://")) {
      return fetchBuffer(src);
    }
    // Local file path
    const { readFile } = await import("fs/promises");
    return readFile(src);
  }
  throw new Error("Unsupported media source type: expected Buffer, URL, or file path");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send an image.
 *
 * @param {object}        sock
 * @param {string}        jid
 * @param {Buffer|string} image       - Buffer, URL, or file path
 * @param {object}        [opts]
 * @param {string}        [opts.caption]
 * @param {string}        [opts.mimetype]
 * @param {object}        [opts.quoted]
 * @param {object}        [opts.contextInfo]
 * @param {Buffer}        [opts.thumbnail]    - Custom JPEG thumbnail
 * @param {boolean}       [opts.viewOnce]     - View-once image
 * @param {string[]}      [opts.mentions]     - JIDs to mention
 * @returns {Promise<object|null>}
 */
export async function sendImage(sock, jid, image, opts = {}) {
  try {
    const buf = await _resolveSource(image);
    const content = {
      image: buf,
      caption: opts.caption || "",
      mimetype: opts.mimetype || "image/jpeg",
    };
    if (opts.viewOnce) content.viewOnce = true;
    if (opts.thumbnail) content.jpegThumbnail = opts.thumbnail;
    if (opts.contextInfo) content.contextInfo = opts.contextInfo;
    if (opts.mentions?.length) content.mentions = opts.mentions;

    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[sendImage] Error:", err?.message);
    return null;
  }
}

/**
 * Send a video.
 *
 * @param {object}        sock
 * @param {string}        jid
 * @param {Buffer|string} video
 * @param {object}        [opts]
 * @param {string}        [opts.caption]
 * @param {string}        [opts.mimetype]
 * @param {boolean}       [opts.gifPlayback]  - Play as silent looping GIF
 * @param {number}        [opts.seconds]      - Duration hint in seconds
 * @param {object}        [opts.quoted]
 * @param {object}        [opts.contextInfo]
 * @param {Buffer}        [opts.thumbnail]    - Custom JPEG thumbnail
 * @param {boolean}       [opts.viewOnce]
 * @param {string[]}      [opts.mentions]
 * @returns {Promise<object|null>}
 */
export async function sendVideo(sock, jid, video, opts = {}) {
  try {
    const buf = await _resolveSource(video);
    const content = {
      video: buf,
      caption: opts.caption || "",
      mimetype: opts.mimetype || "video/mp4",
    };
    if (opts.gifPlayback) content.gifPlayback = true;
    if (opts.seconds != null) content.seconds = opts.seconds;
    if (opts.viewOnce) content.viewOnce = true;
    if (opts.contextInfo) content.contextInfo = opts.contextInfo;
    if (opts.mentions?.length) content.mentions = opts.mentions;

    // Auto-generate thumbnail if not provided
    if (!opts.thumbnail) {
      try {
        const thumb = await generateVideoThumbnail(buf);
        if (thumb) content.jpegThumbnail = thumb;
      } catch {}
    } else {
      content.jpegThumbnail = opts.thumbnail;
    }

    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[sendVideo] Error:", err?.message);
    return null;
  }
}

/**
 * Send a GIF (video with gifPlayback = true).
 *
 * @param {object}        sock
 * @param {string}        jid
 * @param {Buffer|string} gif         - mp4 buffer / URL (WhatsApp renders as GIF)
 * @param {object}        [opts]
 * @param {string}        [opts.caption]
 * @param {object}        [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendGif(sock, jid, gif, opts = {}) {
  return sendVideo(sock, jid, gif, { ...opts, gifPlayback: true, mimetype: "video/mp4" });
}

/**
 * Send an audio message.
 *
 * @param {object}        sock
 * @param {string}        jid
 * @param {Buffer|string} audio
 * @param {object}        [opts]
 * @param {boolean}       [opts.ptt]       - Send as voice note (push-to-talk)
 * @param {string}        [opts.mimetype]
 * @param {number}        [opts.seconds]   - Duration hint
 * @param {object}        [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendAudio(sock, jid, audio, opts = {}) {
  try {
    const buf = await _resolveSource(audio);
    const content = {
      audio: buf,
      mimetype: opts.mimetype || "audio/mpeg",
      ptt: !!opts.ptt,
    };
    if (opts.seconds != null) content.seconds = opts.seconds;

    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[sendAudio] Error:", err?.message);
    return null;
  }
}

/**
 * Send a voice note (push-to-talk audio). Alias for sendAudio with ptt: true.
 *
 * @param {object}        sock
 * @param {string}        jid
 * @param {Buffer|string} audio
 * @param {object}        [opts]
 * @param {string}        [opts.mimetype]   - Default: "audio/ogg; codecs=opus"
 * @param {number}        [opts.seconds]
 * @param {object}        [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendVoiceNote(sock, jid, audio, opts = {}) {
  return sendAudio(sock, jid, audio, {
    ...opts,
    ptt: true,
    mimetype: opts.mimetype || "audio/ogg; codecs=opus",
  });
}

/**
 * Send a sticker (WebP).
 *
 * @param {object}        sock
 * @param {string}        jid
 * @param {Buffer|string} sticker
 * @param {object}        [opts]
 * @param {boolean}       [opts.isAnimated]  - Whether the sticker is animated
 * @param {object}        [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendSticker(sock, jid, sticker, opts = {}) {
  try {
    const buf = await _resolveSource(sticker);
    const content = {
      sticker: buf,
      mimetype: "image/webp",
    };
    if (opts.isAnimated) content.isAnimated = true;

    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[sendSticker] Error:", err?.message);
    return null;
  }
}

/**
 * Send a document / file.
 *
 * @param {object}        sock
 * @param {string}        jid
 * @param {Buffer|string} document
 * @param {object}        [opts]
 * @param {string}        [opts.filename]  - Original filename shown to receiver
 * @param {string}        [opts.mimetype]
 * @param {string}        [opts.caption]
 * @param {Buffer}        [opts.thumbnail]
 * @param {object}        [opts.quoted]
 * @param {object}        [opts.contextInfo]
 * @returns {Promise<object|null>}
 */
export async function sendDocument(sock, jid, document, opts = {}) {
  try {
    const buf = await _resolveSource(document);
    const filename = opts.filename || "file";
    const content = {
      document: buf,
      mimetype: opts.mimetype || guessMime(filename),
      fileName: filename,
      caption: opts.caption || "",
    };
    if (opts.thumbnail) content.jpegThumbnail = opts.thumbnail;
    if (opts.contextInfo) content.contextInfo = opts.contextInfo;

    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[sendDocument] Error:", err?.message);
    return null;
  }
}

/**
 * Send a document with code content (alias used by codeHandler).
 * @param {object} sock
 * @param {string} jid
 * @param {Buffer} buf
 * @param {object} opts
 */
export async function sendCodeDocument(sock, jid, buf, opts = {}) {
  return sendDocument(sock, jid, buf, opts);
}

/**
 * Send a media item directly from a URL, auto-detecting the type from the URL.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} url
 * @param {object} [opts]
 * @param {"image"|"video"|"audio"|"document"} [opts.type] - Override type detection
 * @param {string} [opts.caption]
 * @param {string} [opts.filename]
 * @param {object} [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendMediaFromUrl(sock, jid, url, opts = {}) {
  try {
    const buf = await fetchBuffer(url);
    const filename = opts.filename || url.split("/").pop()?.split("?")[0] || "file";
    const mime = guessMime(filename);

    // Auto-detect type from MIME or URL
    let type = opts.type;
    if (!type) {
      if (mime.startsWith("image/")) type = "image";
      else if (mime.startsWith("video/")) type = "video";
      else if (mime.startsWith("audio/")) type = "audio";
      else type = "document";
    }

    switch (type) {
      case "image":   return sendImage(sock, jid, buf, { ...opts, mimetype: mime });
      case "video":   return sendVideo(sock, jid, buf, { ...opts, mimetype: mime });
      case "audio":   return sendAudio(sock, jid, buf, { ...opts, mimetype: mime });
      default:        return sendDocument(sock, jid, buf, { ...opts, mimetype: mime, filename });
    }
  } catch (err) {
    console.error("[sendMediaFromUrl] Error:", err?.message);
    return null;
  }
}

/**
 * Send an album (sequence of images/videos).
 * WhatsApp renders consecutive media from the same sender as an album.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object[]} items    - [{type: "image"|"video", data: Buffer|string, caption?}]
 * @param {object}   [opts]
 * @param {string}   [opts.caption]   - Caption for the first item only
 * @param {object}   [opts.quoted]
 * @param {number}   [opts.delayMs]   - Delay between items (default 200ms)
 * @returns {Promise<void>}
 */
export async function sendAlbum(sock, jid, items, opts = {}) {
  if (!items?.length) return;
  const delay = opts.delayMs ?? 200;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemOpts = {
      caption: i === 0 ? (item.caption || opts.caption || "") : (item.caption || ""),
      quoted: i === 0 ? opts.quoted : undefined,
    };

    try {
      if (item.type === "video") {
        await sendVideo(sock, jid, item.data, itemOpts);
      } else {
        await sendImage(sock, jid, item.data, itemOpts);
      }
    } catch (err) {
      console.error(`[sendAlbum] Item ${i} failed:`, err?.message);
    }

    if (i < items.length - 1 && delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Prepare a JPEG thumbnail Buffer from an image source.
 *
 * @param {Buffer|string} image
 * @param {object}        [opts]
 * @param {number}        [opts.width=300]
 * @param {number}        [opts.height=150]
 * @returns {Promise<Buffer|null>}
 */
export async function prepareThumbnail(image, opts = {}) {
  try {
    const buf = await _resolveSource(image);
    return await generateImageThumbnail(buf, opts);
  } catch {
    return null;
  }
}
