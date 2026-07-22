/**
 * MIAS — Interactive Handler
 *
 * Centralized interactive message building using Baileys native APIs.
 * Automatically uses GKTW if available, otherwise falls back to Baileys proto.
 *
 * Supports:
 *  - Quick-reply buttons (native flow)
 *  - Single-select lists
 *  - Hero image/video cards
 *  - Carousels
 *  - URL buttons
 *  - External ad reply (link preview cards)
 *  - Context info injection
 *  - Smart fallback to plain text when interactive fails
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import { sendInteractiveMessage, getProto, getBaileys } from "./gktwAdapter.js";
import { sendText } from "./messageHandler.js";
import { sendImage, sendVideo } from "./mediaHandler.js";

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────
/**
 * @typedef {object} Button
 * @property {string} text  - Display label
 * @property {string} id    - Value sent on tap
 * @property {string} [url] - URL button destination
 */

/**
 * @typedef {object} ListSection
 * @property {string}    title
 * @property {ListRow[]} rows
 */

/**
 * @typedef {object} ListRow
 * @property {string} title
 * @property {string} id
 * @property {string} [description]
 */

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a native-flow buttons message.
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
      buttons,
      contextInfo: opts.contextInfo || {},
      quoted: opts.quoted || null,
    });
  } catch {
    const btnList = (buttons || []).map((b, i) => `${i + 1}. ${b.text}`).join("\n");
    return sendText(sock, jid, `${opts.header ? opts.header + "\n\n" : ""}${body}\n\n${btnList}${opts.footer ? "\n\n" + opts.footer : ""}`, { quoted: opts.quoted });
  }
}

/**
 * Send a list message (single-select).
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
 * @returns {Promise<object|null>}
 */
export async function sendList(sock, jid, body, sections, opts = {}) {
  try {
    const content = {
      text: body,
      footer: opts.footer || "",
      title: opts.title || "",
      buttonText: opts.buttonText || "Select",
      sections,
    };
    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return await sock.sendMessage(jid, content, sendOpts);
  } catch {
    const lines = (sections || []).flatMap(s => [
      `*${s.title}*`,
      ...(s.rows || []).map((r, i) => `${i + 1}. ${r.title}${r.description ? " — " + r.description : ""}`),
    ]);
    return sendText(sock, jid, `${opts.title ? opts.title + "\n\n" : ""}${body}\n\n${lines.join("\n")}${opts.footer ? "\n\n" + opts.footer : ""}`, { quoted: opts.quoted });
  }
}

/**
 * Send a hero card (media header + buttons).
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object}   opts
 * @param {string}   opts.body
 * @param {Buffer|string} [opts.image]
 * @param {Buffer|string} [opts.video]
 * @param {string}   [opts.header]
 * @param {string}   [opts.footer]
 * @param {Button[]} [opts.buttons]
 * @param {object}   [opts.contextInfo]
 * @param {object}   [opts.externalAdReply]
 * @param {object}   [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendHeroCard(sock, jid, opts = {}) {
  const { body, image, video, header, footer, buttons = [], quoted, contextInfo = {}, externalAdReply } = opts;
  const ctx = { ...contextInfo };
  if (externalAdReply) ctx.externalAdReply = externalAdReply;

  try {
    if (image) {
      return await sendImage(sock, jid, image, { caption: body, quoted, contextInfo: ctx });
    }
    if (video) {
      return await sendVideo(sock, jid, video, { caption: body, quoted, contextInfo: ctx });
    }
    return await sendInteractiveMessage(sock, jid, {
      body, footer: footer || "", header: header || "", buttons, contextInfo: ctx, quoted,
    });
  } catch {
    return sendText(sock, jid, `${header ? header + "\n\n" : ""}${body}${footer ? "\n\n" + footer : ""}`, { quoted });
  }
}

/**
 * Build an ExternalAdReply object (link-preview card).
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.body]
 * @param {string} [opts.sourceUrl]
 * @param {string} [opts.mediaUrl]
 * @param {string} [opts.mediaType="IMAGE"]
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
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object[]} cards  - [{title, body, footer, buttons:[{text,id}], image?, video?}]
 * @param {object}   [opts]
 * @param {object}   [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendCarousel(sock, jid, cards, opts = {}) {
  try {
    const B = await getBaileys();
    const proto = B.proto;

    const builtCards = cards.map(card => {
      const cardButtons = (card.buttons || []).map(btn => {
        if (btn.url) {
          return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
            name: "cta_url",
            buttonParamsJson: JSON.stringify({ display_text: btn.text, url: btn.url, merchant_url: btn.url }),
          });
        }
        return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({ display_text: btn.text, id: btn.id || btn.text }),
        });
      });

      return proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: card.body || "" }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: card.footer || "" }),
        header: proto.Message.InteractiveMessage.Header.create({ title: card.title || "", hasMediaAttachment: false }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: cardButtons,
          messageParamsJson: "{}",
          messageVersion: 1,
        }),
      });
    });

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
      quoted: opts.quoted,
    });
    await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });
    return wam;
  } catch {
    // Fallback: send each card individually
    for (const card of cards) {
      await sendHeroCard(sock, jid, {
        body: card.body || card.title,
        header: card.title,
        footer: card.footer,
        buttons: card.buttons,
        quoted: opts.quoted,
      });
    }
    return null;
  }
}
