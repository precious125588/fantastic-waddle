/**
 * MIAS — Interactive Handler  v2
 *
 * Centralized interactive message building.
 * Routes through GKTW when available, falls back to Baileys proto,
 * then falls back to plain text — always degrades gracefully.
 *
 * Every function here checks GKTW availability explicitly before
 * building messages, so handlers do the right thing without relying
 * solely on gktwAdapter's internal routing.
 *
 * Supported:
 *  - Quick-reply buttons
 *  - URL buttons
 *  - Copy-to-clipboard buttons
 *  - Call buttons
 *  - Single-select list messages
 *  - Hero cards (image/video/text header + buttons)
 *  - Carousels (multi-card)
 *  - External ad reply (link-preview cards)
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import {
  sendInteractiveMessage,
  getProto,
  getBaileys,
  isGktwAvailable,
} from "./gktwAdapter.js";
import { sendText } from "./messageHandler.js";
import { sendImage, sendVideo } from "./mediaHandler.js";

// ─── JSDoc types ─────────────────────────────────────────────────────────────

/**
 * @typedef {object} Button
 * @property {string}  text           - Display label (no emojis)
 * @property {string}  [id]           - quick_reply payload
 * @property {string}  [url]          - URL button destination
 * @property {string}  [copyCode]     - Text to copy on tap
 * @property {string}  [phone]        - Phone number for call button
 * @property {string}  [type]         - "url" | "copy" | "call" (auto-detected from fields)
 */

/**
 * @typedef {object} ListSection
 * @property {string}    title
 * @property {ListRow[]} rows
 */

/**
 * @typedef {object} ListRow
 * @property {string} id
 * @property {string} title
 * @property {string} [description]
 */

// ─── Internal: proto button builder ──────────────────────────────────────────

async function _protoBtn(btn, i) {
  const proto = (await getBaileys()).proto;
  const NF = proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton;

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
  // Default: quick_reply
  return NF.create({
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({
      display_text: btn.text || `Option ${i + 1}`,
      id: btn.id || String(i),
    }),
  });
}

// ─── Internal: plain-text fallback renderer ───────────────────────────────────

function _textFallback(header, body, buttons, footer) {
  const btnLines = (buttons || []).map((b, i) => `[${i + 1}] ${b.text}`).join("\n");
  return [
    header ? `*${header}*` : null,
    body || null,
    btnLines || null,
    footer ? `_${footer}_` : null,
  ].filter(Boolean).join("\n\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send native-flow quick-reply (or mixed) buttons.
 * Explicitly checks GKTW, then falls back to Baileys proto, then text.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   body
 * @param {Button[]} buttons
 * @param {object}   [opts]
 * @param {string}   [opts.footer]
 * @param {string}   [opts.header]
 * @param {object}   [opts.quoted]
 * @param {object}   [opts.contextInfo]
 */
export async function sendButtons(sock, jid, body, buttons, opts = {}) {
  const gktwActive = await isGktwAvailable();
  const params = {
    body,
    footer: opts.footer || "",
    header: opts.header || "",
    buttons: buttons || [],
    contextInfo: opts.contextInfo || {},
    quoted: opts.quoted || null,
  };

  // ── GKTW path ────────────────────────────────────────────────────────────
  if (gktwActive) {
    try {
      return await sendInteractiveMessage(sock, jid, params);
    } catch (gktwErr) {
      // Fall through to Baileys proto
    }
  }

  // ── Baileys proto path ────────────────────────────────────────────────────
  try {
    const B = await getBaileys();
    const proto = B.proto;

    const flowButtons = await Promise.all((buttons || []).map((btn, i) => _protoBtn(btn, i)));

    const interactiveMsg = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text: body }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: opts.footer || "" }),
      header: proto.Message.InteractiveMessage.Header.create({
        title: opts.header || "",
        hasMediaAttachment: false,
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: flowButtons,
        messageParamsJson: "{}",
        messageVersion: 1,
      }),
      contextInfo: proto.ContextInfo.create({
        ...(opts.contextInfo || {}),
        forwardingScore: opts.contextInfo?.forwardingScore ?? 0,
        isForwarded: opts.contextInfo?.isForwarded ?? false,
      }),
    });

    const fullMsg = proto.Message.create({ interactiveMessage: interactiveMsg });
    const wam = await B.generateWAMessageFromContent(jid, fullMsg, {
      userJid: sock.user?.id,
      quoted: opts.quoted || undefined,
    });
    await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });
    return wam;
  } catch (protoErr) {
    // ── Plain text fallback ──────────────────────────────────────────────
    const text = _textFallback(opts.header, body, buttons, opts.footer);
    return sendText(sock, jid, text, { quoted: opts.quoted });
  }
}

/**
 * Send a URL button message.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   body
 * @param {object[]} urlButtons  - [{text, url}]
 * @param {object}   [opts]
 */
export async function sendUrlButtons(sock, jid, body, urlButtons, opts = {}) {
  const buttons = (urlButtons || []).map(b => ({ text: b.text, url: b.url, type: "url" }));
  return sendButtons(sock, jid, body, buttons, opts);
}

/**
 * Send a single-select list message.
 * Falls back to Baileys sock.sendMessage list, then plain text.
 *
 * @param {object}        sock
 * @param {string}        jid
 * @param {string}        body
 * @param {ListSection[]} sections
 * @param {object}        [opts]
 * @param {string}        [opts.buttonText]
 * @param {string}        [opts.footer]
 * @param {string}        [opts.title]
 * @param {object}        [opts.quoted]
 */
export async function sendList(sock, jid, body, sections, opts = {}) {
  const gktwActive = await isGktwAvailable();

  // ── GKTW path ────────────────────────────────────────────────────────────
  if (gktwActive) {
    try {
      return await sendInteractiveMessage(sock, jid, {
        body,
        footer: opts.footer || "",
        header: opts.title || "",
        sections: sections || [],
        listButtonText: opts.buttonText || "Open Menu",
        quoted: opts.quoted || null,
      });
    } catch {
      // Fall through
    }
  }

  // ── Baileys list message ──────────────────────────────────────────────────
  try {
    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return await sock.sendMessage(jid, {
      text: body,
      footer: opts.footer || "",
      title: opts.title || "",
      buttonText: opts.buttonText || "Open Menu",
      sections: sections || [],
    }, sendOpts);
  } catch (listErr) {
    // ── Plain text fallback ──────────────────────────────────────────────
    const lines = (sections || []).flatMap(s => [
      `*${s.title}*`,
      ...(s.rows || []).map((r, i) => `[${i + 1}] ${r.title}${r.description ? " — " + r.description : ""}`),
    ]);
    const text = [
      opts.title ? `*${opts.title}*` : null,
      body,
      lines.join("\n"),
      opts.footer ? `_${opts.footer}_` : null,
    ].filter(Boolean).join("\n\n");
    return sendText(sock, jid, text, { quoted: opts.quoted });
  }
}

/**
 * Send a hero card — body text, optional media header, action buttons.
 * Tries image/video send with context (shows buttons if interactive failed),
 * then falls back to plain interactive, then plain text.
 *
 * @param {object}        sock
 * @param {string}        jid
 * @param {object}        opts
 * @param {string}        opts.body
 * @param {Buffer|string} [opts.image]
 * @param {Buffer|string} [opts.video]
 * @param {string}        [opts.header]
 * @param {string}        [opts.footer]
 * @param {Button[]}      [opts.buttons]
 * @param {object}        [opts.contextInfo]
 * @param {object}        [opts.externalAdReply]
 * @param {object}        [opts.quoted]
 */
export async function sendHeroCard(sock, jid, opts = {}) {
  const {
    body = "", image, video, header, footer,
    buttons = [], quoted, contextInfo = {}, externalAdReply,
  } = opts;

  const ctx = { ...contextInfo };
  if (externalAdReply) ctx.externalAdReply = externalAdReply;

  // ── With media ────────────────────────────────────────────────────────────
  if (image || video) {
    try {
      // Try interactive with image header
      return await sendInteractiveMessage(sock, jid, {
        body, footer: footer || "", header: header || "",
        buttons, contextInfo: ctx, quoted,
        headerImage: image || null,
        headerVideo: video || null,
      });
    } catch {
      // Send media + caption as fallback, then buttons separately
      try {
        if (image) await sendImage(sock, jid, image, { caption: body, quoted, contextInfo: ctx });
        else await sendVideo(sock, jid, video, { caption: body, quoted, contextInfo: ctx });
        if (buttons.length) {
          await new Promise(r => setTimeout(r, 300));
          return await sendButtons(sock, jid, header || "Actions", buttons, {
            footer, quoted,
          });
        }
        return null;
      } catch {
        return sendText(sock, jid, _textFallback(header, body, buttons, footer), { quoted });
      }
    }
  }

  // ── Text-only hero ────────────────────────────────────────────────────────
  try {
    return await sendButtons(sock, jid, body, buttons, {
      header: header || "",
      footer: footer || "",
      contextInfo: ctx,
      quoted,
    });
  } catch (err) {
    return sendText(sock, jid, _textFallback(header, body, buttons, footer), { quoted });
  }
}

/**
 * Build an ExternalAdReply object for link-preview cards.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.body]
 * @param {string} [opts.sourceUrl]
 * @param {string} [opts.mediaUrl]
 * @param {string} [opts.mediaType]  - "IMAGE" | "VIDEO"
 * @param {Buffer} [opts.thumbnail]
 * @returns {object}
 */
export function buildExternalAdReply(opts = {}) {
  return {
    title: opts.title || "",
    body: opts.body || "",
    sourceUrl: opts.sourceUrl || "https://whatsapp.com",
    mediaUrl: opts.mediaUrl || opts.sourceUrl || "",
    mediaType: opts.mediaType === "VIDEO" ? 2 : 1,
    thumbnail: opts.thumbnail || null,
    renderLargerThumbnail: opts.renderLargerThumbnail ?? true,
    showAdAttribution: opts.showAdAttribution ?? false,
  };
}

/**
 * Send a carousel of hero cards.
 * Each card: {title, body, footer, buttons:[{text,id}]}
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object[]} cards
 * @param {object}   [opts]
 * @param {string}   [opts.body]
 * @param {string}   [opts.footer]
 * @param {object}   [opts.quoted]
 */
export async function sendCarousel(sock, jid, cards, opts = {}) {
  const gktwActive = await isGktwAvailable();

  // ── GKTW carousel path ───────────────────────────────────────────────────
  if (gktwActive) {
    try {
      return await sendInteractiveMessage(sock, jid, {
        body: opts.body || "",
        footer: opts.footer || "",
        cards,
        quoted: opts.quoted || null,
      });
    } catch {
      // Fall through to Baileys proto
    }
  }

  // ── Baileys proto carousel ────────────────────────────────────────────────
  try {
    const B = await getBaileys();
    const proto = B.proto;

    const builtCards = await Promise.all((cards || []).map(async card => {
      const cardButtons = await Promise.all((card.buttons || []).map((btn, i) => _protoBtn(btn, i)));
      return proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: card.body || "" }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: card.footer || "" }),
        header: proto.Message.InteractiveMessage.Header.create({
          title: card.title || "",
          hasMediaAttachment: false,
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: cardButtons,
          messageParamsJson: "{}",
          messageVersion: 1,
        }),
      });
    }));

    const fullMsg = proto.Message.create({
      interactiveMessage: proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: opts.body || "" }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: opts.footer || "" }),
        header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: [],
          messageParamsJson: JSON.stringify({ carousel: builtCards }),
          messageVersion: 1,
        }),
      }),
    });

    const wam = await B.generateWAMessageFromContent(jid, fullMsg, {
      userJid: sock.user?.id,
      quoted: opts.quoted || undefined,
    });
    await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });
    return wam;
  } catch (carouselErr) {
    // Fallback: individual hero cards
    for (const card of (cards || [])) {
      await sendHeroCard(sock, jid, {
        body: card.body || card.title || "",
        header: card.title || "",
        footer: card.footer || "",
        buttons: card.buttons || [],
        quoted: opts.quoted,
      });
    }
    return null;
  }
}
