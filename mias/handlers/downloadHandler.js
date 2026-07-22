/**
 * MIAS — Download Handler
 *
 * Centralized media download abstraction.
 * Commands must never call downloadContentFromMessage directly.
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import { downloadContentFromMessage as _dlContent, getContentType } from "./gktwAdapter.js";
import { fetchBuffer } from "./uploadHandler.js";

// ─── Internal helpers ─────────────────────────────────────────────────────────

const TYPE_MAP = {
  imageMessage:    "image",
  videoMessage:    "video",
  audioMessage:    "audio",
  documentMessage: "document",
  stickerMessage:  "sticker",
};

async function _streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Download media from a WAMessage object.
 *
 * @param {object} msg              - WAMessage
 * @param {string} [mediaType]      - "image"|"video"|"audio"|"document"|"sticker"
 *                                    (auto-detected if omitted)
 * @returns {Promise<Buffer|null>}
 */
export async function downloadMedia(msg, mediaType) {
  try {
    const m = msg?.message;
    if (!m) return null;

    // Auto-detect content type
    const type = mediaType || (await getContentType(m)) || Object.keys(m)[0];
    const baileysType = TYPE_MAP[type] || type.replace("Message", "");

    const msgContent = m[type] || m;

    // If message has directPath or url, try direct download
    if (msgContent?.url || msgContent?.directPath) {
      const stream = await _dlContent(msgContent, baileysType);
      return _streamToBuffer(stream);
    }

    // Try every known key
    for (const [key, val] of Object.entries(m)) {
      if (TYPE_MAP[key] && val?.directPath) {
        const stream = await _dlContent(val, TYPE_MAP[key]);
        return _streamToBuffer(stream);
      }
    }

    return null;
  } catch (err) {
    console.error("[downloadMedia] Error:", err?.message);
    return null;
  }
}

/**
 * Download media from a quoted (replied-to) message.
 *
 * @param {object} msg   - WAMessage that quotes another
 * @returns {Promise<{buffer: Buffer, type: string}|null>}
 */
export async function downloadQuotedMedia(msg) {
  try {
    const m = msg?.message;
    if (!m) return null;

    // Find contextInfo in any message type
    const inner = (
      m.extendedTextMessage ||
      m.imageMessage ||
      m.videoMessage ||
      m.documentMessage ||
      m.audioMessage ||
      m.stickerMessage ||
      {}
    );

    const quotedMsg = inner?.contextInfo?.quotedMessage;
    if (!quotedMsg) return null;

    const type = Object.keys(quotedMsg)[0];
    const baileysType = TYPE_MAP[type] || type.replace("Message", "");
    const content = quotedMsg[type];

    if (!content) return null;

    const stream = await _dlContent(content, baileysType);
    const buffer = await _streamToBuffer(stream);
    return { buffer, type: baileysType };
  } catch (err) {
    console.error("[downloadQuotedMedia] Error:", err?.message);
    return null;
  }
}

/**
 * Download a view-once message (automatically bypasses the restriction).
 *
 * @param {object} msg   - WAMessage containing a view-once media message
 * @returns {Promise<{buffer: Buffer, type: string}|null>}
 */
export async function downloadViewOnce(msg) {
  try {
    const m = msg?.message;
    if (!m) return null;

    // View-once messages are wrapped in viewOnceMessage or viewOnceMessageV2
    const wrapper = m.viewOnceMessage || m.viewOnceMessageV2 || m.viewOnceMessageV2Extension;
    const inner = wrapper?.message || m;

    const type = Object.keys(inner)[0];
    const baileysType = TYPE_MAP[type] || type.replace("Message", "");
    const content = inner[type];

    if (!content) return null;

    const stream = await _dlContent(content, baileysType);
    const buffer = await _streamToBuffer(stream);
    return { buffer, type: baileysType };
  } catch (err) {
    console.error("[downloadViewOnce] Error:", err?.message);
    return null;
  }
}

/**
 * Fetch a remote URL into a Buffer (re-export for convenience).
 * @param {string} url
 * @param {object} [opts]
 * @returns {Promise<Buffer>}
 */
export { fetchBuffer };

/**
 * Get the content type string of a message.
 * @param {object} msg  - WAMessage
 * @returns {Promise<string|null>}
 */
export async function getMessageType(msg) {
  try {
    const m = msg?.message;
    if (!m) return null;
    return (await getContentType(m)) || Object.keys(m)[0] || null;
  } catch {
    return null;
  }
}
