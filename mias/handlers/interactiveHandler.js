/**
 * MIAS — Interactive Handler
 * Centralized interactive message building using @itsliaaa/baileys native APIs.
 *
 * Supports:
 *  - Quick-reply buttons (native flow)
 *  - Single-select lists (native flow)
 *  - Hero image/video cards
 *  - Carousels
 *  - URL buttons
 *  - External ad reply (link preview cards)
 *  - Context info
 *  - Smart fallback to plain text when interactive fails
 *
 * All commands should call these instead of building proto objects manually.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Button
 * @property {string} text  - Display text
 * @property {string} id    - Command/value sent when tapped
 * @property {string} [url] - For URL buttons
 */

/**
 * @typedef {object} ListSection
 * @property {string}       title - Section header
 * @property {ListRow[]}    rows  - Section rows
 */

/**
 * @typedef {object} ListRow
 * @property {string} title       - Row title
 * @property {string} id          - Value sent on select
 * @property {string} [description]
 */

// ─── Internal helpers ─────────────────────────────────────────────────────────

let _proto = null;
let _genWAMsg = null;

async function _getBaileys() {
  if (!_proto || !_genWAMsg) {
    const B = await import("@whiskeysockets/baileys");
    _proto = B.proto;
    _genWAMsg = B.generateWAMessageFromContent;
  }
  return { proto: _proto, generateWAMessageFromContent: _genWAMsg };
}

function _prefixId(id) {
  if (!id) return "BTN:option";
  return id.startsWith("BTN:") ? id : `BTN:${id}`;
}

async function _relay(sock, jid, msg, wam) {
  if (wam) {
    await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });
  }
  return wam;
}

// ─── Quick-reply buttons ─────────────────────────────────────────────────────

/**
 * Send a message with quick-reply buttons (native flow).
 * Falls back to numbered text list when interactive is unavailable.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object}   quotedMsg   - Message to quote (can be null)
 * @param {string}   bodyText
 * @param {Button[]} buttons     - Up to 10 buttons
 * @param {string}   [footer]
 * @param {object}   [headerMedia] - { image?: Buffer, video?: Buffer }
 */
export async function sendButtons(sock, jid, quotedMsg, bodyText, buttons, footer = "", headerMedia = null) {
  // Clamp to 10 buttons (WhatsApp limit)
  const btns = buttons.slice(0, 10);

  try {
    const { proto, generateWAMessageFromContent } = await _getBaileys();

    const nativeButtons = btns.map(b => ({
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({
        display_text: String(b.text || "Option"),
        id: _prefixId(b.id || b.text),
      }),
    }));

    // Build header
    let header;
    if (headerMedia?.image && Buffer.isBuffer(headerMedia.image)) {
      const imageMsg = await _prepareImageHeader(sock, headerMedia.image);
      header = proto.Message.InteractiveMessage.Header.create({
        hasMediaAttachment: true,
        ...(imageMsg ? { imageMessage: imageMsg } : {}),
      });
    } else if (headerMedia?.video && Buffer.isBuffer(headerMedia.video)) {
      const videoMsg = await _prepareVideoHeader(sock, headerMedia.video);
      header = proto.Message.InteractiveMessage.Header.create({
        hasMediaAttachment: true,
        ...(videoMsg ? { videoMessage: videoMsg } : {}),
      });
    } else {
      header = proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false });
    }

    const content = {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
      interactiveMessage: proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: String(bodyText) }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: String(footer) }),
        header,
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: nativeButtons,
        }),
      }),
    };

    const wam = await generateWAMessageFromContent(jid, content, {
      quoted: quotedMsg || undefined,
      userJid: sock.user?.id,
    });
    return await _relay(sock, jid, quotedMsg, wam);
  } catch {
    // Graceful fallback: numbered text list
    return _sendTextFallback(sock, jid, quotedMsg, bodyText, btns, footer);
  }
}

// ─── Single-select list ───────────────────────────────────────────────────────

/**
 * Send a single-select list message (native flow).
 * @param {object}        sock
 * @param {string}        jid
 * @param {object}        quotedMsg
 * @param {string}        bodyText
 * @param {ListSection[]} sections
 * @param {string}        [selectLabel="Select"]
 * @param {string}        [footer]
 */
export async function sendList(sock, jid, quotedMsg, bodyText, sections, selectLabel = "Select", footer = "") {
  try {
    const { proto, generateWAMessageFromContent } = await _getBaileys();

    const nativeButtons = [{
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: selectLabel,
        sections: sections.map(s => ({
          title: s.title || "",
          rows: (s.rows || []).map(r => ({
            title: String(r.title || ""),
            id: _prefixId(r.id || r.title),
            description: r.description || "",
          })),
        })),
      }),
    }];

    const content = {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
      interactiveMessage: proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: String(bodyText) }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: String(footer) }),
        header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: nativeButtons,
        }),
      }),
    };

    const wam = await generateWAMessageFromContent(jid, content, {
      quoted: quotedMsg || undefined,
      userJid: sock.user?.id,
    });
    return await _relay(sock, jid, quotedMsg, wam);
  } catch {
    // Fallback: numbered rows from first section
    const allRows = sections.flatMap(s => s.rows || []);
    return _sendTextFallback(sock, jid, quotedMsg, bodyText, allRows.map(r => ({ text: r.title, id: r.id })), footer);
  }
}

// ─── Hero card (image + buttons) ─────────────────────────────────────────────

/**
 * Send a hero image card with buttons.
 * @param {object}   sock
 * @param {string}   jid
 * @param {object}   quotedMsg
 * @param {Buffer}   imageBuffer
 * @param {string}   bodyText
 * @param {Button[]} buttons
 * @param {string}   [footer]
 */
export async function sendHeroCard(sock, jid, quotedMsg, imageBuffer, bodyText, buttons, footer = "") {
  return sendButtons(sock, jid, quotedMsg, bodyText, buttons, footer, { image: imageBuffer });
}

// ─── External Ad Reply (link preview card) ────────────────────────────────────

/**
 * Build a contextInfo.externalAdReply object for embedding a rich card in any message.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.body]
 * @param {Buffer} [opts.thumbnail]  - JPEG thumbnail buffer
 * @param {string} [opts.sourceUrl]
 * @param {number} [opts.mediaType=1] - 1=photo, 2=video
 * @returns {object} contextInfo
 */
export function buildExternalAdReply(opts) {
  return {
    externalAdReply: {
      title: String(opts.title || ""),
      body: String(opts.body || " "),
      mediaType: opts.mediaType ?? 1,
      renderLargerThumbnail: true,
      showAdAttribution: false,
      ...(opts.thumbnail ? { thumbnail: opts.thumbnail } : {}),
      ...(opts.sourceUrl ? { sourceUrl: opts.sourceUrl } : {}),
    },
  };
}

// ─── Carousel ─────────────────────────────────────────────────────────────────

/**
 * Send a carousel of image cards.
 * @param {object} sock
 * @param {string} jid
 * @param {object} quotedMsg
 * @param {Array}  cards - [{ image: Buffer, title, body, buttons: Button[] }]
 * @param {string} [footer]
 */
export async function sendCarousel(sock, jid, quotedMsg, cards, footer = "") {
  try {
    const { proto, generateWAMessageFromContent } = await _getBaileys();

    const carouselCards = [];
    for (const card of cards.slice(0, 10)) {
      let imageMsg = null;
      if (card.image && Buffer.isBuffer(card.image)) {
        try { imageMsg = await _prepareImageHeader(sock, card.image); } catch {}
      }

      const cardButtons = (card.buttons || []).slice(0, 3).map(b => ({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: String(b.text || "Option"),
          id: _prefixId(b.id || b.text),
        }),
      }));

      carouselCards.push(
        proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({ text: String(card.body || card.title || "") }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: String(footer) }),
          header: proto.Message.InteractiveMessage.Header.create({
            hasMediaAttachment: !!imageMsg,
            ...(imageMsg ? { imageMessage: imageMsg } : {}),
          }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: cardButtons,
          }),
        })
      );
    }

    const content = {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
      interactiveMessage: proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: "" }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: "" }),
        header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({
          cards: carouselCards,
        }),
      }),
    };

    const wam = await generateWAMessageFromContent(jid, content, {
      quoted: quotedMsg || undefined,
      userJid: sock.user?.id,
    });
    return await _relay(sock, jid, quotedMsg, wam);
  } catch {
    // Fallback: send cards as individual messages
    for (const card of cards.slice(0, 5)) {
      try {
        const text = [card.title, card.body, ...(card.buttons || []).map(b => `• ${b.text}`)].filter(Boolean).join("\n");
        await sock.sendMessage(jid, { text });
        await new Promise(r => setTimeout(r, 300));
      } catch {}
    }
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _prepareImageHeader(sock, imageBuffer) {
  try {
    const { prepareWAMessageMedia, proto } = await _getBaileys();
    if (typeof prepareWAMessageMedia === "function") {
      const prepared = await prepareWAMessageMedia({ image: imageBuffer }, { upload: sock.waUploadToServer });
      return prepared.imageMessage;
    }
  } catch {}
  return null;
}

async function _prepareVideoHeader(sock, videoBuffer) {
  try {
    const { prepareWAMessageMedia } = await _getBaileys();
    if (typeof prepareWAMessageMedia === "function") {
      const prepared = await prepareWAMessageMedia({ video: videoBuffer }, { upload: sock.waUploadToServer });
      return prepared.videoMessage;
    }
  } catch {}
  return null;
}

function _sendTextFallback(sock, jid, quotedMsg, bodyText, buttons, footer) {
  const NUMS = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
  const lines = buttons.map((b, i) => `${NUMS[i] || (i+1)+"."}  ${b.text || b.id || "Option"}`).join("\n");
  const text = [bodyText, "", lines, footer ? `\n${footer}` : ""].filter(s => s !== undefined).join("\n").trim();
  return sock.sendMessage(jid, { text }, { quoted: quotedMsg || undefined });
}
