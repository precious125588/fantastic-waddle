/**
 * MIAS — Button Handler
 *
 * Unified button/interactive message system.
 * Automatically detects Button Mode and wraps plain messages into
 * interactive formats when enabled.
 *
 * Supported types:
 *  - Quick-reply buttons (native flow)
 *  - URL buttons
 *  - List messages (single-select)
 *  - Hero cards (image/video header)
 *  - Carousels
 *  - Copy buttons (via native flow)
 *  - Call buttons (via native flow)
 *  - Footer / Header / ContextInfo / ExternalAdReply
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import { sendInteractiveMessage } from "./gktwAdapter.js";
import { sendText, sendReply } from "./messageHandler.js";
import { sendImage, sendVideo } from "./mediaHandler.js";
import { prepareExternalAdReply, prepareContextInfo } from "./baileysHandler.js";
import { getProto, getBaileys } from "./gktwAdapter.js";

// ─── Button Mode state ─────────────────────────────────────────────────────────
// Other modules may call setButtonMode(true/false) to control the global flag.

let _buttonMode = false;

export function setButtonMode(enabled) {
  _buttonMode = !!enabled;
}
export function isButtonMode() {
  return _buttonMode;
}

// ─── Internal proto builder ────────────────────────────────────────────────────

async function _buildNativeFlow(sock, jid, { body, footer = "", header = "", buttons = [], contextInfo = {}, quoted = null }) {
  return sendInteractiveMessage(sock, jid, { body, footer, header, buttons, contextInfo, quoted });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send quick-reply buttons.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   body        - Message body
 * @param {object[]} buttons     - [{text, id}]
 * @param {object}   [opts]
 * @param {string}   [opts.footer]
 * @param {string}   [opts.header]
 * @param {object}   [opts.quoted]
 * @param {object}   [opts.contextInfo]
 * @returns {Promise<object|null>}
 */
export async function sendButtons(sock, jid, body, buttons, opts = {}) {
  try {
    return await _buildNativeFlow(sock, jid, {
      body,
      footer: opts.footer || "",
      header: opts.header || "",
      buttons,
      contextInfo: opts.contextInfo || {},
      quoted: opts.quoted || null,
    });
  } catch (err) {
    // Fallback: plain text with options listed
    const btnList = buttons.map((b, i) => `${i + 1}. ${b.text}`).join("\n");
    const text = `${opts.header ? opts.header + "\n\n" : ""}${body}\n\n${btnList}${opts.footer ? "\n\n" + opts.footer : ""}`;
    return sendText(sock, jid, text, { quoted: opts.quoted });
  }
}

/**
 * Send a list message (single-select menu).
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   body
 * @param {object[]} sections    - [{title, rows:[{id,title,description}]}]
 * @param {object}   [opts]
 * @param {string}   [opts.buttonText]   - Button label (default "Select")
 * @param {string}   [opts.footer]
 * @param {string}   [opts.title]
 * @param {object}   [opts.quoted]
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
  } catch (err) {
    // Fallback: plain text
    const lines = sections.flatMap(s => [
      `*${s.title}*`,
      ...(s.rows || []).map((r, i) => `${i + 1}. ${r.title}${r.description ? " — " + r.description : ""}`),
    ]);
    const text = `${opts.title ? opts.title + "\n\n" : ""}${body}\n\n${lines.join("\n")}${opts.footer ? "\n\n" + opts.footer : ""}`;
    return sendText(sock, jid, text, { quoted: opts.quoted });
  }
}

/**
 * Send a hero card (text + image/video header + buttons).
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object}   opts
 * @param {string}   opts.body
 * @param {Buffer|string} [opts.image]        - Image buffer or URL
 * @param {Buffer|string} [opts.video]        - Video buffer or URL
 * @param {string}   [opts.header]
 * @param {string}   [opts.footer]
 * @param {object[]} [opts.buttons]           - [{text, id}]
 * @param {object}   [opts.quoted]
 * @param {object}   [opts.contextInfo]
 * @param {object}   [opts.externalAdReply]
 * @returns {Promise<object|null>}
 */
export async function sendHeroCard(sock, jid, opts = {}) {
  const { body, image, video, header, footer, buttons = [], quoted, contextInfo = {}, externalAdReply } = opts;

  const ctx = { ...contextInfo };
  if (externalAdReply) ctx.externalAdReply = externalAdReply;

  try {
    if (image || video) {
      // Send media with caption + buttons
      if (image) {
        return await sendImage(sock, jid, image, {
          caption: body,
          quoted,
          contextInfo: ctx,
        });
      }
      if (video) {
        return await sendVideo(sock, jid, video, {
          caption: body,
          quoted,
          contextInfo: ctx,
        });
      }
    }

    // No media: interactive text hero
    return await _buildNativeFlow(sock, jid, {
      body, footer: footer || "", header: header || "", buttons, contextInfo: ctx, quoted,
    });
  } catch {
    return sendText(sock, jid, `${header ? header + "\n\n" : ""}${body}${footer ? "\n\n" + footer : ""}`, { quoted });
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
  const buttons = urlButtons.map(b => ({ text: b.text, url: b.url, id: b.text }));
  return sendButtons(sock, jid, body, buttons, opts);
}

/**
 * Send a carousel message (multiple hero cards).
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object[]} cards     - [{title, body, image, footer, buttons:[{text,id}]}]
 * @param {object}   [opts]
 * @param {object}   [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendCarousel(sock, jid, cards, opts = {}) {
  try {
    const B = await getBaileys();
    const proto = B.proto;

    const carouselCards = cards.map(card => {
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
    });

    // Build carousel container
    const carouselMsg = proto.Message.create({
      requestPaymentMessage: undefined, // unused; placeholder
      interactiveMessage: proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: opts.body || "" }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: opts.footer || "" }),
        header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: [],
          messageParamsJson: JSON.stringify({ carousel: carouselCards }),
          messageVersion: 1,
        }),
      }),
    });

    const wam = await B.generateWAMessageFromContent(jid, carouselMsg, {
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

/**
 * Send a native-flow message (most advanced interactive type).
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object}   flow        - Native flow params
 * @param {string}   flow.body
 * @param {string}   [flow.footer]
 * @param {string}   [flow.header]
 * @param {object[]} [flow.buttons]       - [{text, id, url?}]
 * @param {object}   [opts]
 * @param {object}   [opts.quoted]
 * @returns {Promise<object|null>}
 */
export async function sendNativeFlow(sock, jid, flow, opts = {}) {
  return _buildNativeFlow(sock, jid, {
    body: flow.body || "",
    footer: flow.footer || "",
    header: flow.header || "",
    buttons: flow.buttons || [],
    contextInfo: flow.contextInfo || {},
    quoted: opts.quoted || null,
  });
}

/**
 * Auto-wrap a plain text reply with buttons if Button Mode is ON.
 * If Button Mode is OFF, sends a plain text reply.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   text
 * @param {object}   [opts]
 * @param {object[]} [opts.buttons]
 * @param {object}   [opts.quoted]
 * @param {string}   [opts.footer]
 * @param {string}   [opts.header]
 * @returns {Promise<object|null>}
 */
export async function autoButton(sock, jid, text, opts = {}) {
  if (_buttonMode && opts.buttons?.length) {
    return sendButtons(sock, jid, text, opts.buttons, {
      footer: opts.footer,
      header: opts.header,
      quoted: opts.quoted,
    });
  }
  return sendText(sock, jid, text, { quoted: opts.quoted });
}
