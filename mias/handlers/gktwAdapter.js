/**
 * MIAS — GKTW Adapter Layer
 *
 * ════════════════════════════════════════════════════════════════
 *  Architecture:
 *
 *  Commands → Handlers → Baileys Adapter → GKTW Helper → WhatsApp
 *
 *  This file is the GKTW integration point.
 *  - Tries @itsreimau/gktw if installed.
 *  - Falls back to raw @whiskeysockets/baileys for every feature.
 *  - Provides a unified interface so Handlers never care which layer is used.
 * ════════════════════════════════════════════════════════════════
 *
 * ONLY the Baileys Adapter / Handlers may import this file.
 * Commands must NEVER import this directly.
 */

// ─── Lazy singletons ──────────────────────────────────────────────────────────
let _baileys = null;
let _gktw = null;
let _gktwAvailable = null; // null = unchecked, true/false = result

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
      _gktwAvailable = true;
    } catch {
      _gktwAvailable = false;
      _gktw = null;
    }
  }
  return _gktw;
}

// ─── Public: capability detection ─────────────────────────────────────────────

/** Returns true if @itsreimau/gktw is installed and loaded. */
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

// ─── jidNormalizedUser ────────────────────────────────────────────────────────

export async function jidNormalizedUser(jid) {
  const B = await getBaileys();
  return B.jidNormalizedUser ? B.jidNormalizedUser(jid) : jid;
}

// ─── getContentType ───────────────────────────────────────────────────────────

export async function getContentType(message) {
  const B = await getBaileys();
  return B.getContentType ? B.getContentType(message) : Object.keys(message || {})[0];
}

// ─── Smart sendMessage — tries GKTW first, falls back to Baileys ──────────────

/**
 * Smart send: automatically picks GKTW or Baileys based on message type support.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} content
 * @param {object} [opts]
 * @returns {Promise<object|null>}
 */
export async function smartSend(sock, jid, content, opts = {}) {
  const gktw = await getGktw();

  // Determine message type for feature detection
  const msgType = Object.keys(content)[0];

  // Types that GKTW may handle differently
  const gktwPreferred = ["interactive", "nativeFlowMessage", "buttonsMessage", "listMessage"];

  if (gktw && _gktwAvailable && gktwPreferred.includes(msgType)) {
    try {
      // Attempt GKTW send
      if (typeof gktw.sendMessage === "function") {
        return await gktw.sendMessage(sock, jid, content, opts);
      }
    } catch (err) {
      // Fall through to Baileys
    }
  }

  // Default: Baileys
  return sock.sendMessage(jid, content, opts);
}

// ─── Interactive message builder — GKTW or Baileys native flow ────────────────

/**
 * Build and send a native-flow interactive message.
 * Automatically uses GKTW if available, otherwise raw Baileys proto.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} params
 * @param {string} params.body
 * @param {string} [params.footer]
 * @param {string} [params.header]
 * @param {object[]} [params.buttons]    - [{text, id}]
 * @param {object[]} [params.sections]   - list sections [{title, rows:[{id,title,description}]}]
 * @param {object}   [params.contextInfo]
 * @param {object}   [params.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendInteractiveMessage(sock, jid, params) {
  const {
    body = "",
    footer = "",
    header = "",
    buttons = [],
    sections = [],
    contextInfo = {},
    quoted = null,
  } = params;

  const gktw = await getGktw();

  // Try GKTW interactive send
  if (gktw && _gktwAvailable) {
    try {
      if (typeof gktw.sendInteractive === "function") {
        return await gktw.sendInteractive(sock, jid, params);
      }
    } catch {}
  }

  // Build native flow via Baileys proto
  try {
    const B = await getBaileys();
    const proto = B.proto;

    // Build button components
    const flowButtons = buttons.map((btn, i) => {
      if (btn.url) {
        // URL button
        return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: btn.text || `Button ${i + 1}`,
            url: btn.url,
            merchant_url: btn.url,
          }),
        });
      }
      // Quick reply button
      return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: btn.text || `Button ${i + 1}`,
          id: btn.id || String(i),
        }),
      });
    });

    // Build list if sections provided
    if (sections.length > 0 && buttons.length === 0) {
      // Use list message
      const listMsg = {
        text: body,
        footer: footer,
        title: header,
        buttonText: params.listButtonText || "Select Option",
        sections,
      };
      if (quoted) listMsg.quoted = quoted;
      if (Object.keys(contextInfo).length) listMsg.contextInfo = contextInfo;
      return await sock.sendMessage(jid, listMsg);
    }

    // Build interactive message
    const headerContent = header
      ? proto.Message.InteractiveMessage.Header.create({
          title: header,
          hasMediaAttachment: false,
        })
      : proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false });

    const nativeFlow = proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: flowButtons,
      messageParamsJson: "{}",
      messageVersion: 1,
    });

    const interactiveMsg = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: body }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
      header: headerContent,
      nativeFlowMessage: nativeFlow,
      contextInfo: proto.ContextInfo.create({
        ...contextInfo,
        forwardingScore: contextInfo.forwardingScore ?? 0,
        isForwarded: contextInfo.isForwarded ?? false,
      }),
    });

    const fullMsg = proto.Message.create({ interactiveMessage: interactiveMsg });

    const wam = await B.generateWAMessageFromContent(jid, fullMsg, {
      userJid: sock.user?.id,
      quoted: quoted || undefined,
    });

    await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });
    return wam;
  } catch (err) {
    // Final fallback: plain text
    const optsSend = {};
    if (quoted) optsSend.quoted = quoted;
    return sock.sendMessage(jid, { text: `${header ? header + "\n\n" : ""}${body}${footer ? "\n\n" + footer : ""}` }, optsSend);
  }
}

// ─── fetchLatestBaileysVersion ────────────────────────────────────────────────

export async function fetchLatestBaileysVersion() {
  try {
    const B = await getBaileys();
    if (typeof B.fetchLatestBaileysVersion === "function") {
      return B.fetchLatestBaileysVersion();
    }
  } catch {}
  return { version: [0, 0, 0], isLatest: false };
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
