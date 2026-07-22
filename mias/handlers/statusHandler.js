/**
 * MIAS — Status Handler
 *
 * Centralized WhatsApp Status (Story) posting abstraction.
 * Commands must never post statuses directly via sock.sendMessage.
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_JID = "status@broadcast";

// ─── Internal helper ──────────────────────────────────────────────────────────

async function _normalizeJid(jid) {
  try {
    const B = await import("@whiskeysockets/baileys");
    if (typeof B.jidNormalizedUser === "function") return B.jidNormalizedUser(jid);
  } catch {}
  return jid?.split(":")[0] + "@s.whatsapp.net";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get audience JIDs for a status post (normalises a contact list).
 *
 * @param {string[]} jids   - JID list of status viewers
 * @returns {Promise<string[]>}
 */
export async function getStatusAudience(jids = []) {
  const normalized = [];
  for (const jid of jids) {
    try {
      normalized.push(await _normalizeJid(jid));
    } catch {
      normalized.push(jid);
    }
  }
  return normalized;
}

/**
 * Post a text status (story).
 *
 * @param {object}   sock
 * @param {string}   text
 * @param {object}   [opts]
 * @param {string}   [opts.backgroundColor]  - hex color e.g. "#075E54"
 * @param {number}   [opts.font]             - Font index 0-9
 * @param {string[]} [opts.audience]         - JIDs who can see the status
 * @returns {Promise<object|null>}
 */
export async function postTextStatus(sock, text, opts = {}) {
  try {
    const content = {
      text: String(text || ""),
      backgroundColor: opts.backgroundColor || "#075E54",
      font: opts.font ?? 0,
    };
    const sendOpts = {};
    if (opts.audience?.length) {
      sendOpts.statusJidList = await getStatusAudience(opts.audience);
    }
    return await sock.sendMessage(STATUS_JID, content, sendOpts);
  } catch (err) {
    console.error("[postTextStatus] Error:", err?.message);
    return null;
  }
}

/**
 * Post an image status (story).
 *
 * @param {object}        sock
 * @param {Buffer|string} image       - Buffer or URL
 * @param {object}        [opts]
 * @param {string}        [opts.caption]
 * @param {string[]}      [opts.audience]
 * @returns {Promise<object|null>}
 */
export async function postImageStatus(sock, image, opts = {}) {
  try {
    let buf;
    if (Buffer.isBuffer(image)) {
      buf = image;
    } else if (typeof image === "string") {
      const { fetchBuffer } = await import("./uploadHandler.js");
      buf = await fetchBuffer(image);
    } else {
      throw new Error("Invalid image source");
    }

    const content = {
      image: buf,
      caption: opts.caption || "",
      mimetype: opts.mimetype || "image/jpeg",
    };

    const sendOpts = {};
    if (opts.audience?.length) {
      sendOpts.statusJidList = await getStatusAudience(opts.audience);
    }
    return await sock.sendMessage(STATUS_JID, content, sendOpts);
  } catch (err) {
    console.error("[postImageStatus] Error:", err?.message);
    return null;
  }
}

/**
 * Post a video status (story).
 *
 * @param {object}        sock
 * @param {Buffer|string} video
 * @param {object}        [opts]
 * @param {string}        [opts.caption]
 * @param {string}        [opts.mimetype]
 * @param {string[]}      [opts.audience]
 * @returns {Promise<object|null>}
 */
export async function postVideoStatus(sock, video, opts = {}) {
  try {
    let buf;
    if (Buffer.isBuffer(video)) {
      buf = video;
    } else {
      const { fetchBuffer } = await import("./uploadHandler.js");
      buf = await fetchBuffer(video);
    }

    const content = {
      video: buf,
      caption: opts.caption || "",
      mimetype: opts.mimetype || "video/mp4",
    };

    const sendOpts = {};
    if (opts.audience?.length) {
      sendOpts.statusJidList = await getStatusAudience(opts.audience);
    }
    return await sock.sendMessage(STATUS_JID, content, sendOpts);
  } catch (err) {
    console.error("[postVideoStatus] Error:", err?.message);
    return null;
  }
}

/**
 * Post an audio status (story).
 *
 * @param {object}        sock
 * @param {Buffer|string} audio
 * @param {object}        [opts]
 * @param {string}        [opts.mimetype]
 * @param {string[]}      [opts.audience]
 * @returns {Promise<object|null>}
 */
export async function postAudioStatus(sock, audio, opts = {}) {
  try {
    let buf;
    if (Buffer.isBuffer(audio)) {
      buf = audio;
    } else {
      const { fetchBuffer } = await import("./uploadHandler.js");
      buf = await fetchBuffer(audio);
    }

    const content = {
      audio: buf,
      mimetype: opts.mimetype || "audio/mpeg",
      ptt: false,
    };

    const sendOpts = {};
    if (opts.audience?.length) {
      sendOpts.statusJidList = await getStatusAudience(opts.audience);
    }
    return await sock.sendMessage(STATUS_JID, content, sendOpts);
  } catch (err) {
    console.error("[postAudioStatus] Error:", err?.message);
    return null;
  }
}
