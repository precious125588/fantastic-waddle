/**
 * MIAS — Message Handler
 *
 * Centralized abstraction for sending text messages and replies.
 * Every text-output path in every command must route through here.
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum WhatsApp message character limit */
const MAX_MSG_LENGTH = 65_536;

/** Chunk size used when splitting long messages */
const CHUNK_SIZE = 4_000;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _sanitize(text) {
  if (text === null || text === undefined) return "";
  return String(text);
}

function _chunk(text, size = CHUNK_SIZE) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size;
  }
  return chunks;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a plain text message.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} text
 * @param {object} [opts]
 * @param {object}  [opts.quoted]        - WAMessage to quote
 * @param {string[]}[opts.mentions]      - JIDs to mention
 * @param {object}  [opts.contextInfo]   - Extra context info
 * @param {boolean} [opts.linkPreview]   - Enable/disable link preview (default true)
 * @returns {Promise<object|null>}
 */
export async function sendText(sock, jid, text, opts = {}) {
  try {
    const body = _sanitize(text);
    if (!body) return null;

    const content = { text: body };

    if (opts.mentions?.length) content.mentions = opts.mentions;
    if (opts.contextInfo) content.contextInfo = opts.contextInfo;
    if (opts.linkPreview === false) content.linkPreview = false;

    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;

    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[sendText] Error:", err?.message);
    return null;
  }
}

/**
 * Send a reply to a specific message.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} text
 * @param {object} quoted   - WAMessage to quote (required)
 * @param {object} [opts]
 * @param {string[]}[opts.mentions]
 * @param {object}  [opts.contextInfo]
 * @returns {Promise<object|null>}
 */
export async function sendReply(sock, jid, text, quoted, opts = {}) {
  return sendText(sock, jid, text, { ...opts, quoted });
}

/**
 * Send a raw message content object directly (escape hatch).
 * Use only when higher-level helpers don't cover the needed type.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} content  - Raw Baileys message content
 * @param {object} [opts]
 * @returns {Promise<object|null>}
 */
export async function sendRaw(sock, jid, content, opts = {}) {
  try {
    return await sock.sendMessage(jid, content, opts);
  } catch (err) {
    console.error("[sendRaw] Error:", err?.message);
    return null;
  }
}

/**
 * Send a long message, automatically chunking it if it exceeds CHUNK_SIZE.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} text
 * @param {object} [opts]
 * @param {object}  [opts.quoted]      - Only applied to the first chunk
 * @param {number}  [opts.chunkSize]   - Override default chunk size
 * @param {number}  [opts.delayMs]     - Delay between chunks (default 300ms)
 * @returns {Promise<void>}
 */
export async function sendLong(sock, jid, text, opts = {}) {
  const body = _sanitize(text);
  const size = opts.chunkSize || CHUNK_SIZE;
  const delay = opts.delayMs ?? 300;

  if (body.length <= size) {
    return sendText(sock, jid, body, opts);
  }

  const chunks = _chunk(body, size);
  for (let i = 0; i < chunks.length; i++) {
    const chunkOpts = i === 0 ? { quoted: opts.quoted } : {};
    await sendText(sock, jid, chunks[i], chunkOpts);
    if (i < chunks.length - 1 && delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Send a text message with a typing indicator before it.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} text
 * @param {object} [opts]
 * @param {number}  [opts.typingMs=1000] - Duration to show typing indicator
 * @returns {Promise<object|null>}
 */
export async function sendWithTyping(sock, jid, text, opts = {}) {
  const typingMs = opts.typingMs ?? 1000;
  try {
    if (typeof sock.sendPresenceUpdate === "function") {
      await sock.sendPresenceUpdate("composing", jid);
    }
    await new Promise(r => setTimeout(r, typingMs));
  } catch {}

  try {
    if (typeof sock.sendPresenceUpdate === "function") {
      await sock.sendPresenceUpdate("paused", jid);
    }
  } catch {}

  return sendText(sock, jid, text, opts);
}

/**
 * Edit a previously sent text message in place.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} msgKey  - Key of the message to edit (msg.key)
 * @param {string} newText
 * @returns {Promise<object|null>}
 */
export async function editText(sock, jid, msgKey, newText) {
  try {
    return await sock.sendMessage(jid, { text: _sanitize(newText), edit: msgKey });
  } catch (err) {
    console.error("[editText] Error:", err?.message);
    return null;
  }
}

/**
 * Send a message with mentions.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   text
 * @param {string[]} jids    - JIDs to mention
 * @param {object}   [opts]
 * @returns {Promise<object|null>}
 */
export async function sendMention(sock, jid, text, jids = [], opts = {}) {
  return sendText(sock, jid, text, { ...opts, mentions: jids });
}
