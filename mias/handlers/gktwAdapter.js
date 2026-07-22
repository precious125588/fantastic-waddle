/**
 * MIAS — GKTW Adapter Layer  v2
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
 *  @itsreimau/gktw is not on npm yet — adapter falls back gracefully.
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
      _gktwAvailable = typeof _gktw?.sendInteractive === "function" || typeof _gktw?.default?.sendInteractive === "function";
      if (!_gktwAvailable) {
        // Package loaded but doesn't expose expected API — treat as absent
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
 * Smart send: automatically picks GKTW or Baileys based on message type.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} content
 * @param {object} [opts]
 * @returns {Promise<object|null>}
 */
export async function smartSend(sock, jid, content, opts = {}) {
  const gktw = await getGktw();
  const msgType = Object.keys(content)[0];

  // GKTW handles interactive types
  if (gktw && _gktwAvailable) {
    const interactiveTypes = ["interactiveMessage", "buttonsMessage", "listMessage", "templateMessage"];
    if (interactiveTypes.includes(msgType)) {
      try {
        const g = gktw.default || gktw;
        if (typeof g.send === "function") {
          return await g.send(sock, jid, content, opts);
        }
      } catch (err) {
        // Fall through to Baileys
      }
    }
  }

  // Baileys default path
  try {
    return await sock.sendMessage(jid, content, opts);
  } catch (err) {
    console.error("[smartSend] Baileys error:", err?.message);
    return null;
  }
}

// ─── sendInteractiveMessage ───────────────────────────────────────────────────

/**
 * Unified interactive message sender.
 * Tries GKTW first, falls back to Baileys native proto, falls back to plain text.
 *
 * Supported button types per button object:
 *   { text, id }             → quick_reply
 *   { text, url }            → cta_url (URL button)
 *   { text, copyCode }       → cta_copy (copy-to-clipboard)
 *   { text, phone }          → cta_call (call button)
 *   { text, id, type:"copy"} → cta_copy
 *   { text, id, type:"call"} → cta_call
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object}   params
 * @param {string}   params.body
 * @param {string}   [params.footer]
 * @param {string}   [params.header]
 * @param {object[]} [params.buttons]
 * @param {object[]} [params.sections]      - For list messages
 * @param {string}   [params.listButtonText]
 * @param {object}   [params.contextInfo]
 * @param {object}   [params.quoted]
 * @param {Buffer}   [params.headerImage]   - Image for image-header interactive
 * @param {Buffer}   [params.headerVideo]   - Video for video-header interactive
 * @param {string}   [params.headerDoc]     - Document title for doc-header interactive
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
    listButtonText = "Open Menu",
    headerImage = null,
    headerVideo = null,
  } = params;

  // ── 1. Try GKTW ──────────────────────────────────────────────────────────
  const gktw = await getGktw();
  if (gktw && _gktwAvailable) {
    try {
      const g = gktw.default || gktw;
      if (typeof g.sendInteractive === "function") {
        return await g.sendInteractive(sock, jid, params);
      }
    } catch {
      // Fall through to Baileys
    }
  }

  // ── 2. Baileys proto: list message ────────────────────────────────────────
  if (sections.length > 0 && buttons.length === 0) {
    try {
      const sendOpts = {};
      if (quoted) sendOpts.quoted = quoted;
      return await sock.sendMessage(jid, {
        text: body,
        footer,
        title: header,
        buttonText: listButtonText,
        sections,
        ...(Object.keys(contextInfo).length ? { contextInfo } : {}),
      }, sendOpts);
    } catch (listErr) {
      // Fall through to text
    }
  }

  // ── 3. Baileys proto: native-flow interactive ─────────────────────────────
  try {
    const B = await getBaileys();
    const proto = B.proto;

    // Build buttons
    const flowButtons = (buttons || []).map((btn, i) => {
      // URL button
      if (btn.url || btn.type === "url") {
        return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: btn.text || `Link ${i + 1}`,
            url: btn.url || "",
            merchant_url: btn.url || "",
          }),
        });
      }
      // Copy-to-clipboard button
      if (btn.copyCode || btn.type === "copy") {
        return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: btn.text || "Copy",
            copy_code: btn.copyCode || btn.id || "",
          }),
        });
      }
      // Call button
      if (btn.phone || btn.type === "call") {
        return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
          name: "cta_call",
          buttonParamsJson: JSON.stringify({
            display_text: btn.text || "Call",
            phone_number: btn.phone || "",
          }),
        });
      }
      // Default: quick_reply
      return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: btn.text || `Option ${i + 1}`,
          id: btn.id || String(i),
        }),
      });
    });

    // Build header
    let headerProto;
    if (headerImage) {
      const mediaMsg = await B.prepareWAMessageMedia({ image: headerImage }, { upload: sock.waUploadToServer });
      headerProto = proto.Message.InteractiveMessage.Header.create({
        ...mediaMsg,
        hasMediaAttachment: true,
      });
    } else if (headerVideo) {
      const mediaMsg = await B.prepareWAMessageMedia({ video: headerVideo }, { upload: sock.waUploadToServer });
      headerProto = proto.Message.InteractiveMessage.Header.create({
        ...mediaMsg,
        hasMediaAttachment: true,
      });
    } else {
      headerProto = proto.Message.InteractiveMessage.Header.create({
        title: header || "",
        hasMediaAttachment: false,
      });
    }

    const nativeFlow = proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: flowButtons,
      messageParamsJson: "{}",
      messageVersion: 1,
    });

    const ctxProto = proto.ContextInfo.create({
      ...contextInfo,
      forwardingScore: contextInfo.forwardingScore ?? 0,
      isForwarded: contextInfo.isForwarded ?? false,
    });

    const interactiveMsg = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: body }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
      header: headerProto,
      nativeFlowMessage: nativeFlow,
      contextInfo: ctxProto,
    });

    const fullMsg = proto.Message.create({ interactiveMessage: interactiveMsg });

    const wam = await B.generateWAMessageFromContent(jid, fullMsg, {
      userJid: sock.user?.id,
      quoted: quoted || undefined,
    });
    await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });
    return wam;
  } catch (protoErr) {
    // ── 4. Final fallback: plain text ─────────────────────────────────────
    const btnLines = (buttons || []).map((b, i) => `[${i + 1}] ${b.text}`).join("\n");
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
