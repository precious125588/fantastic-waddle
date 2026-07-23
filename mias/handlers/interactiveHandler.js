/**
 * MIAS — Interactive Handler  v3
 *
 * Centralized interactive message building.
 * Routes through GKTW when available, falls back to Baileys proto,
 * then falls back to plain text — always degrades gracefully.
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
 *  - Poll messages
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import {
  sendInteractiveMessage,
  getProto,
  getBaileys,
  isGktwAvailable,
  sendPoll as _adapterSendPoll,
} from "./gktwAdapter.js";
import { sendText } from "./messageHandler.js";
import { sendImage, sendVideo } from "./mediaHandler.js";

// ─── JSDoc types ─────────────────────────────────────────────────────────────

/**
 * @typedef {object} Button
 * @property {string}  text      - Display label
 * @property {string}  [id]      - quick_reply payload
 * @property {string}  [url]     - URL button destination
 * @property {string}  [copyCode]- Text to copy on tap
 * @property {string}  [phone]   - Phone number for call button
 * @property {string}  [type]    - "url" | "copy" | "call" (auto-detected)
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
  const proto = await getProto();
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
 * Falls back gracefully: GKTW → Baileys proto → plain text.
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
 * @returns {Promise<object|null>}
 */
export async function sendButtons(sock, jid, body, buttons, opts = {}) {
  try {
    return await sendInteractiveMessage(sock, jid, {
      body,
      footer: opts.footer || "",
      header: opts.header || "",
      buttons: buttons || [],
      contextInfo: opts.contextInfo || {},
      quoted: opts.quoted || null,
    });
  } catch (err) {
    // Final fallback: plain text
    const text = _textFallback(opts.header, body, buttons, opts.footer);
    return sendText(sock, jid, text, { quoted: opts.quoted });
  }
}

/**
 * Re-export for direct interactive sending (same as sendButtons but generic name).
 */
export async function sendInteractive(sock, jid, params) {
  return sendInteractiveMessage(sock, jid, params);
}

/**
 * Send a single-select list message.
 *
 * @param {object}        sock
 * @param {string}        jid
 * @param {string}        body
 * @param {ListSection[]} sections
 * @param {object}        [opts]
 * @param {string}        [opts.title]
 * @param {string}        [opts.footer]
 * @param {string}        [opts.buttonText]  - List open button label
 * @param {object}        [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendList(sock, jid, body, sections, opts = {}) {
  // Build list message via Baileys proto
  try {
    const B = await getBaileys();
    const proto = B.proto;

    const protoSections = (sections || []).map(s =>
      proto.Message.ListMessage.Section.create({
        title: s.title || "",
        rows: (s.rows || []).map(r =>
          proto.Message.ListMessage.Row.create({
            rowId: r.id || "",
            title: r.title || "",
            description: r.description || "",
          })
        ),
      })
    );

    const listMsg = proto.Message.create({
      listMessage: proto.Message.ListMessage.create({
        title: opts.title || "",
        description: body || "",
        buttonText: opts.buttonText || "Options",
        listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
        footer: opts.footer || "",
        sections: protoSections,
      }),
    });

    const wam = await B.generateWAMessageFromContent(jid, listMsg, {
      userJid: sock.user?.id,
      quoted: opts.quoted || undefined,
    });
    await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });
    return wam;
  } catch {
    // Fallback: plain text with numbered options
    const allRows = (sections || []).flatMap(s => s.rows || []);
    const lines = allRows.map((r, i) => `[${i + 1}] ${r.title}${r.description ? ` — ${r.description}` : ""}`).join("\n");
    const text = [opts.title ? `*${opts.title}*` : null, body, lines, opts.footer ? `_${opts.footer}_` : null]
      .filter(Boolean).join("\n\n");
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
 * @returns {Promise<object|null>}
 */
export async function sendUrlButtons(sock, jid, body, urlButtons, opts = {}) {
  const buttons = (urlButtons || []).map(b => ({
    text: b.text || b.label || "Open",
    url: b.url || "",
    type: "url",
  }));
  return sendButtons(sock, jid, body, buttons, opts);
}

/**
 * Send a hero card — a message with an image/video header and action buttons.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} card
 * @param {string}       [card.body]
 * @param {string}       [card.header]      - Text header (if no image/video)
 * @param {string}       [card.footer]
 * @param {Buffer|string}[card.image]       - Image buffer or URL
 * @param {Buffer|string}[card.video]       - Video buffer or URL
 * @param {Button[]}     [card.buttons]
 * @param {object}       [card.contextInfo]
 * @param {object}       [opts]
 * @param {object}       [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendHeroCard(sock, jid, card, opts = {}) {
  const { body = "", header = "", footer = "", buttons = [], contextInfo = {} } = card;
  const cardQuoted = opts.quoted || card.quoted || null;

  // If image provided, send image with contextInfo buttons
  if (card.image) {
    try {
      const { fetchBuffer } = await import("./uploadHandler.js");
      const imgBuf = Buffer.isBuffer(card.image)
        ? card.image
        : await fetchBuffer(card.image);

      // Build contextInfo with forwarding score 0 to avoid "forwarded" tag
      const ctx = {
        ...contextInfo,
        externalAdReply: {
          title: header || body,
          body: footer || "",
          mediaType: 1,
          renderLargerThumbnail: true,
          showAdAttribution: false,
          thumbnail: imgBuf.slice(0, Math.min(imgBuf.length, 65536)),
        },
      };

      const imgOpts = {
        caption: body,
        contextInfo: ctx,
        quoted: cardQuoted,
      };
      const result = await sendImage(sock, jid, imgBuf, imgOpts);
      if (result) {
        // Follow up with buttons if provided
        if (buttons.length) {
          await new Promise(r => setTimeout(r, 300));
          await sendButtons(sock, jid, body, buttons, { footer, header, quoted: cardQuoted });
        }
        return result;
      }
    } catch {}
  }

  // No image / image failed: send interactive buttons
  return sendButtons(sock, jid, body, buttons, { footer, header, contextInfo, quoted: cardQuoted });
}

/**
 * Send a carousel of cards (multi-card interactive message).
 * Falls back to individual hero cards if carousel proto is unsupported.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object[]} cards  - [{title, body, footer, buttons}]
 * @param {object}   [opts]
 * @param {string}   [opts.body]
 * @param {string}   [opts.footer]
 * @param {object}   [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendCarousel(sock, jid, cards, opts = {}) {
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
  } catch {
    // Fallback: individual hero cards
    for (const card of (cards || [])) {
      await sendHeroCard(sock, jid, {
        body: card.body || card.title || "",
        header: card.title || "",
        footer: card.footer || "",
        buttons: card.buttons || [],
      }, { quoted: opts.quoted });
    }
    return null;
  }
}

/**
 * Build an external ad reply (link preview card) context info object.
 *
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.body]
 * @param {string} [opts.sourceUrl]
 * @param {Buffer} [opts.thumbnail]
 * @returns {object} - contextInfo.externalAdReply object
 */
export function buildExternalAdReply(opts = {}) {
  return {
    externalAdReply: {
      title: opts.title || "",
      body: opts.body || "",
      sourceUrl: opts.sourceUrl || "https://whatsapp.com",
      mediaType: opts.mediaType === "VIDEO" ? 2 : 1,
      thumbnail: opts.thumbnail || null,
      renderLargerThumbnail: opts.renderLargerThumbnail ?? true,
      showAdAttribution: false,
    },
  };
}

/**
 * Send an interactive poll message.
 * Falls back to numbered text list if unsupported.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   question
 * @param {string[]} options
 * @param {object}   [opts]
 * @param {number}   [opts.selectableCount=1]
 * @param {object}   [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendPollInteractive(sock, jid, question, options, opts = {}) {
  try {
    return await _adapterSendPoll(sock, jid, question, options, opts);
  } catch {
    const lines = (options || []).map((o, i) => `[${i + 1}] ${o}`).join("\n");
    const text = `📊 *${question}*\n\n${lines}`;
    return sendText(sock, jid, text, { quoted: opts.quoted });
  }
}
