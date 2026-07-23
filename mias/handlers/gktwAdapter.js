/**
 * MIAS — GKTW Adapter Layer  v3
 *
 * ════════════════════════════════════════════════════════════════
 *  Architecture:
 *
 *  Commands → Handlers → Baileys Adapter → GKTW Helper → WhatsApp
 *
 *  Single integration point for @itsreimau/gktw.
 *  - Auto-detects @itsreimau/gktw if installed.
 *  - Falls back to raw @whiskeysockets/baileys for every feature.
 *  - Handlers never care which layer is active.
 *
 *  @itsreimau/gktw is optional — adapter falls back gracefully.
 *  When it becomes available: cd mias && npm install @itsreimau/gktw
 *  Zero code changes needed — adapter auto-routes everything.
 * ════════════════════════════════════════════════════════════════
 *
 * ONLY Handlers/Adapters may import this file.
 * Commands must NEVER import this directly.
 */

// ─── Lazy singletons ──────────────────────────────────────────────────────────
let _baileys = null;
let _gktw = null;
let _gktwAvailable = null; // null = unchecked, true/false = final result

// ─── Internal loader helpers ──────────────────────────────────────────────────

async function getBaileys() {
  if (!_baileys) {
    _baileys = await import("@whiskeysockets/baileys");
  }
  return _baileys;
}

async function getGktw() {
  if (_gktwAvailable === null) {
    try {
      _gktw = await import("@itsreimau/gktw");
      _gktwAvailable =
        typeof _gktw?.sendInteractive === "function" ||
        typeof _gktw?.default?.sendInteractive === "function";
      if (!_gktwAvailable) {
        _gktw = null;
        _gktwAvailable = false;
      }
    } catch {
      _gktwAvailable = false;
      _gktw = null;
    }
  }
  return _gktw;
}

// ─── Public: capability detection ─────────────────────────────────────────────

/** Returns true if @itsreimau/gktw is installed, loaded, and functional. */
export async function isGktwAvailable() {
  await getGktw();
  return _gktwAvailable === true;
}

/** Returns the raw GKTW module, or null if unavailable. */
export async function gktwModule() {
  return getGktw();
}

/** Returns the raw Baileys module. Always available. */
export async function baileysModule() {
  return getBaileys();
}

// ─── Proto helper ──────────────────────────────────────────────────────────────

export async function getProto() {
  const B = await getBaileys();
  return B.proto;
}

// ─── JID helpers ──────────────────────────────────────────────────────────────

export async function jidNormalizedUser(jid) {
  const B = await getBaileys();
  return B.jidNormalizedUser ? B.jidNormalizedUser(jid) : jid;
}

/**
 * Check if a JID is a newsletter / channel JID.
 * @param {string} jid
 * @returns {boolean}
 */
export async function isJidNewsletter(jid) {
  try {
    const B = await getBaileys();
    if (typeof B.isJidNewsletter === "function") return B.isJidNewsletter(jid);
  } catch {}
  return String(jid || "").endsWith("@newsletter");
}

/**
 * Check if a JID is a group JID.
 * @param {string} jid
 * @returns {boolean}
 */
export function isJidGroup(jid) {
  return String(jid || "").endsWith("@g.us");
}

/**
 * Check if a JID is a user JID.
 * @param {string} jid
 * @returns {boolean}
 */
export function isJidUser(jid) {
  return String(jid || "").endsWith("@s.whatsapp.net");
}

// ─── generateWAMessageFromContent ────────────────────────────────────────────

export async function generateWAMessageFromContent(jid, content, options) {
  const B = await getBaileys();
  return B.generateWAMessageFromContent(jid, content, options);
}

// ─── generateWAMessage ────────────────────────────────────────────────────────

export async function generateWAMessage(jid, content, options) {
  const B = await getBaileys();
  return B.generateWAMessage(jid, content, options);
}

// ─── downloadContentFromMessage ───────────────────────────────────────────────

export async function downloadContentFromMessage(message, type) {
  const B = await getBaileys();
  return B.downloadContentFromMessage(message, type);
}

// ─── prepareWAMessageMedia ────────────────────────────────────────────────────

export async function prepareWAMessageMedia(content, options) {
  const B = await getBaileys();
  return B.prepareWAMessageMedia(content, options);
}

// ─── getContentType ───────────────────────────────────────────────────────────

export async function getContentType(message) {
  const B = await getBaileys();
  if (typeof B.getContentType === "function") return B.getContentType(message);
  // Fallback: first key that isn't __type or server/client fields
  const skip = new Set(["senderKeyDistributionMessage", "messageContextInfo"]);
  const key = Object.keys(message || {}).find(k => !skip.has(k));
  return key || null;
}

// ─── Group metadata ───────────────────────────────────────────────────────────

/**
 * Fetch group metadata for a group JID.
 * @param {object} sock
 * @param {string} jid
 * @returns {Promise<object|null>}
 */
export async function getGroupMetadata(sock, jid) {
  try {
    if (typeof sock.groupMetadata === "function") {
      return await sock.groupMetadata(jid);
    }
  } catch (err) {
    console.error("[getGroupMetadata] Error:", err?.message);
  }
  return null;
}

/**
 * Fetch all groups the bot is participating in.
 * @param {object} sock
 * @returns {Promise<object>}
 */
export async function groupFetchAllParticipating(sock) {
  try {
    if (typeof sock.groupFetchAllParticipating === "function") {
      return await sock.groupFetchAllParticipating();
    }
  } catch (err) {
    console.error("[groupFetchAllParticipating] Error:", err?.message);
  }
  return {};
}

// ─── Poll message ──────────────────────────────────────────────────────────────

/**
 * Send a poll message.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   question      - Poll question text
 * @param {string[]} options       - Array of answer choices (2–12)
 * @param {object}   [opts]
 * @param {number}   [opts.selectableCount]  - Max selectable options (default 1)
 * @param {object}   [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendPoll(sock, jid, question, options, opts = {}) {
  try {
    if (!question || !Array.isArray(options) || options.length < 2) {
      throw new Error("Poll requires a question and at least 2 options");
    }
    const pollOptions = options.slice(0, 12).map(o => String(o).trim()).filter(Boolean);

    const content = {
      poll: {
        name: String(question).trim(),
        values: pollOptions,
        selectableCount: opts.selectableCount ?? 1,
      },
    };

    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;

    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[sendPoll] Error:", err?.message);
    return null;
  }
}

// ─── Smart send (GKTW-first, Baileys fallback) ────────────────────────────────

/**
 * Send a message using GKTW when available, falling back to Baileys.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} content
 * @param {object} [opts]
 * @returns {Promise<object|null>}
 */
export async function smartSend(sock, jid, content, opts = {}) {
  try {
    const gktw = await getGktw();
    if (gktw) {
      const fn = gktw.sendMessage || gktw.default?.sendMessage;
      if (typeof fn === "function") {
        return await fn(sock, jid, content, opts);
      }
    }
    return await sock.sendMessage(jid, content, opts);
  } catch (err) {
    // Final fallback
    try {
      return await sock.sendMessage(jid, content, opts);
    } catch (innerErr) {
      console.error("[smartSend] Error:", innerErr?.message);
      return null;
    }
  }
}

// ─── Interactive message (native-flow) ────────────────────────────────────────

/**
 * Send an interactive/native-flow message.
 * Routes through GKTW when available; falls back to Baileys proto; then plain text.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} params
 * @param {string} [params.body]
 * @param {string} [params.footer]
 * @param {string} [params.header]
 * @param {object[]} [params.buttons]
 * @param {object} [params.contextInfo]
 * @param {object} [params.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendInteractiveMessage(sock, jid, params) {
  const {
    body = "",
    footer = "",
    header = "",
    buttons = [],
    contextInfo = {},
    quoted = null,
  } = params;

  // ── GKTW path ──────────────────────────────────────────────────────────────
  const gktw = await getGktw();
  if (gktw) {
    const fn = gktw.sendInteractive || gktw.default?.sendInteractive;
    if (typeof fn === "function") {
      try {
        return await fn(sock, jid, { body, footer, header, buttons, contextInfo, quoted });
      } catch {
        // fall through to Baileys proto
      }
    }
  }

  // ── Baileys proto path ─────────────────────────────────────────────────────
  try {
    const B = await getBaileys();
    const proto = B.proto;
    const NF = proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton;

    const builtButtons = buttons.map((btn, i) => {
      if (btn.url || btn.type === "url") {
        return NF.create({
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: btn.text || `Link ${i + 1}`,
            url: btn.url || "",
            merchant_url: btn.url || "",
          }),
        });
      }
      if (btn.copyCode || btn.type === "copy") {
        return NF.create({
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: btn.text || "Copy",
            copy_code: btn.copyCode || btn.id || "",
          }),
        });
      }
      if (btn.phone || btn.type === "call") {
        return NF.create({
          name: "cta_call",
          buttonParamsJson: JSON.stringify({
            display_text: btn.text || "Call",
            phone_number: btn.phone || "",
          }),
        });
      }
      return NF.create({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: btn.text || `Option ${i + 1}`,
          id: btn.id || String(i),
        }),
      });
    });

    const msgContent = proto.Message.create({
      interactiveMessage: proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: body }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
        header: proto.Message.InteractiveMessage.Header.create({
          title: header,
          hasMediaAttachment: false,
        }),
        contextInfo: Object.keys(contextInfo).length ? contextInfo : undefined,
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: builtButtons,
          messageParamsJson: "{}",
          messageVersion: 1,
        }),
      }),
    });

    const wam = await B.generateWAMessageFromContent(jid, msgContent, {
      userJid: sock.user?.id,
      quoted: quoted || undefined,
    });
    await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });
    return wam;
  } catch {
    // ── Plain-text fallback ──────────────────────────────────────────────────
    const btnLines = buttons.map((b, i) => `[${i + 1}] ${b.text}`).join("\n");
    const text = [
      header ? `*${header}*` : null,
      body,
      btnLines || null,
      footer ? `_${footer}_` : null,
    ].filter(Boolean).join("\n\n");

    const sendOpts = {};
    if (quoted) sendOpts.quoted = quoted;
    return sock.sendMessage(jid, { text }, sendOpts);
  }
}

// ─── fetchLatestBaileysVersion ────────────────────────────────────────────────

export async function fetchLatestBaileysVersion() {
  try {
    const B = await getBaileys();
    if (typeof B.fetchLatestBaileysVersion === "function") {
      return B.fetchLatestBaileysVersion();
    }
    if (typeof B.fetchLatestWaWebVersion === "function") {
      return B.fetchLatestWaWebVersion();
    }
  } catch {}
  return { version: [2, 3000, 1017531287], isLatest: false };
}

// ─── makeInMemoryStore ────────────────────────────────────────────────────────

export async function makeInMemoryStore(opts) {
  const B = await getBaileys();
  if (typeof B.makeInMemoryStore === "function") {
    return B.makeInMemoryStore(opts);
  }
  return null;
}

// ─── useMultiFileAuthState ────────────────────────────────────────────────────

export async function useMultiFileAuthState(folder) {
  const B = await getBaileys();
  return B.useMultiFileAuthState(folder);
}

// ─── makeWASocket ─────────────────────────────────────────────────────────────

export async function makeWASocket(config) {
  const B = await getBaileys();
  return B.makeWASocket(config);
}

// ─── Export raw Baileys getters for adapters that need them ───────────────────
export { getBaileys, getGktw };
