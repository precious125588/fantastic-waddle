/**
 * cox — local helper for the gktw adapter.
 *
 * @itsreimau/gktw does not exist on npm and its GitHub repo is 404.
 * Until a real upstream appears, this module ships inside the repository and
 * exposes the same call surface so the adapter in
 *   mias/handlers/gktwAdapter.js
 * lights up automatically when cox is installed. All operations are thin
 * adapters around @whiskeysockets/baileys — no magic, no hidden state.
 *
 * Exports (es-module compatible via .default):
 *   prepareWAMessageMedia      (delegates to Baileys)
 *   downloadContentFromMessage (delegates to Baileys)
 *   jidNormalizedUser          (delegates to Baileys)
 *   getContentType             (delegates to Baileys)
 *   sendRichInteractive        (builds a buttonsMessage from a spec object)
 *   sendHeroCard               (alias of sendRichInteractive with buttonStyle=1)
 *   sendCarousel               (alias of sendRichInteractive with carousel flag)
 *   sendList                   (alias of sendRichInteractive with list flag)
 *   createInteractiveMessage   (alias of sendRichInteractive)
 *   sendPoll                   (requires Baileys pollMessage)
 */

const BAILEYS_CANDIDATES = [
  "@whiskeysockets/baileys",
  "@itsliaaa/baileys",
  "baileys",
];

let _baileys = null;
let _baileysErr = null;

/**
 * Resolve Baileys the same way gktwAdapter does — require() under the hood,
 * but we expose a tiny ES-friendly default so dynamic `import("cox")` works.
 */
async function _loadBaileys() {
  if (_baileys) return _baileys;
  for (const name of BAILEYS_CANDIDATES) {
    try {
      // dynamic import works for CJS modules too in Node 22
      const mod = await import(/* @vite-ignore */ name);
      _baileys = mod?.default || mod;
      return _baileys;
    } catch (e) {
      _baileysErr = e;
      try {
        const cjs = require(name);
        _baileys = cjs?.default || cjs;
        return _baileys;
      } catch (_) { /* try next */ }
    }
  }
  throw _baileysErr || new Error("cox: could not load any Baileys build");
}

const _passthrough = async (...candidates) => {
  const b = await _loadBaileys();
  for (const c of candidates) {
    if (typeof b?.[c] === "function") {
      return (...args) => b[c](...args);
    }
  }
  return undefined;
};

const prepareWAMessageMedia = async (...args) => {
  const fn = await _passthrough("prepareWAMessageMedia", "generateWAMessageMedia");
  if (!fn) throw new Error("cox: prepareWAMessageMedia missing in current Baileys");
  return fn(...args);
};

const downloadContentFromMessage = async (...args) => {
  const fn = await _passthrough("downloadContentFromMessage");
  if (!fn) throw new Error("cox: downloadContentFromMessage missing in current Baileys");
  return fn(...args);
};

const jidNormalizedUser = async (...args) => {
  const fn = await _passthrough("jidNormalizedUser");
  if (!fn) throw new Error("cox: jidNormalizedUser missing in current Baileys");
  return fn(...args);
};

const getContentType = async (...args) => {
  const fn = await _passthrough("getContentType");
  if (!fn) {
    // plain object fallback — keeps cox usable even without Baileys
    return (typeof args[0] === "object") ? Object.keys(args[0])[0] : null;
  }
  return fn(...args);
};

const sendPoll = async (...args) => {
  const fn = await _passthrough("sendPoll", "sendMessage", "send");
  if (!fn) throw new Error("cox: no poll API in current Baileys");
  return fn(...args);
};

/**
 * sendRichInteractive — universal CTA sender that gates every UI style
 * through a single code path. `style` selects the variant; the underlying
 * sock.sendMessage call is identical for all of them.
 *
 * spec = {
 *   sock, jid,
 *   text, footer, title, subtitle, image,          // header block
 *   buttons: [{type, text, value/url/id}],        // CTA rows
 *   listSections: [{title, rows}],                 // only for style="list"
 *   style: "buttons" | "hero" | "carousel" | "list"
 * }
 */
async function sendRichInteractive(spec) {
  const { sock, jid } = spec || {};
  if (!sock || !jid) throw new Error("cox.sendRichInteractive: sock & jid required");

  // Normalise the buttons into native-flow wire shape ({name, buttonParamsJson}).
  // Callers may already hand us wire-shaped buttons or simple {text,id,url,...}
  // objects — both are converted here so the proto build below is always valid.
  const rawButtons = Array.isArray(spec.buttons) ? spec.buttons : [];
  const buttons = rawButtons.map((b, i) => {
    if (!b || typeof b !== "object") return null;
    // Already in wire shape (has a `name`) — keep as-is.
    if (b.name && typeof b.buttonParamsJson === "string") return b;
    if (b.url || b.type === "url") {
      return { name: "cta_url", buttonParamsJson: JSON.stringify({
        display_text: b.text || `Link ${i + 1}`,
        url: b.url || "", merchant_url: b.url || "",
      })};
    }
    if (b.copyCode || b.type === "copy") {
      return { name: "cta_copy", buttonParamsJson: JSON.stringify({
        display_text: b.text || "Copy", copy_code: b.copyCode || b.id || "",
      })};
    }
    if (b.phone || b.type === "call") {
      return { name: "cta_call", buttonParamsJson: JSON.stringify({
        display_text: b.text || "Call", phone_number: b.phone || "",
      })};
    }
    if (b.type === "single_select" && b.sections) {
      return { name: "single_select", buttonParamsJson: JSON.stringify({
        title: b.text || "Open", sections: b.sections,
      })};
    }
    // default: quick reply
    return { name: "quick_reply", buttonParamsJson: JSON.stringify({
      display_text: b.text || `Option ${i + 1}`, id: b.id || String(i),
    })};
  }).filter(Boolean);

  // List style: prepend a single_select button that opens the sections.
  if (spec.style === "list" && Array.isArray(spec.listSections) && spec.listSections.length) {
    buttons.unshift({ name: "single_select", buttonParamsJson: JSON.stringify({
      title: spec.buttonText || "Menu", sections: spec.listSections,
    })});
  }

  const header = spec.image
    ? { imageMessage: spec.image, hasMediaAttachment: true }
    : (spec.title || spec.subtitle)
      ? {
          title: spec.title || "",
          subtitle: spec.subtitle || "",
          hasMediaAttachment: false,
        }
      : { title: spec.title || "", hasMediaAttachment: false };

  // ── NORMAL-WHATSAPP FIX (dead buttons) ─────────────────────────────────────
  // A bare `interactiveMessage` sent through sock.sendMessage() renders on
  // WhatsApp Business but every tap is a NO-OP on REGULAR WhatsApp. The
  // reliable path is a proto-encoded interactiveMessage that carries
  // messageContextInfo.deviceListMetadata, wrapped in a viewOnceMessage
  // envelope, and relayed via generateWAMessageFromContent + relayMessage.
  // We try that first, then fall back to the bare form, then plain text.
  const B = await _loadBaileys();
  const proto = B && B.proto;
  const NF = proto?.Message?.InteractiveMessage?.NativeFlowMessage?.NativeFlowButton;
  const _mci = { deviceListMetadata: {}, deviceListMetadataVersion: 2 };
  const userJid = (sock?.user?.id || "").split(":")[0] + "@s.whatsapp.net";

  if (proto && typeof B.generateWAMessageFromContent === "function" && typeof sock.relayMessage === "function") {
    let interactiveMsg = null;
    try {
      const built = NF
        ? buttons.map((b) => { try { return NF.create(b); } catch { return b; } })
        : buttons;
      interactiveMsg = proto.Message.InteractiveMessage.create({
        body:   proto.Message.InteractiveMessage.Body.create({ text: spec.text || "" }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: spec.footer || "" }),
        header: proto.Message.InteractiveMessage.Header.create(header),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: built,
          messageParamsJson: JSON.stringify({}),
          messageVersion: 1,
        }),
        ...(spec.contextInfo ? { contextInfo: spec.contextInfo } : {}),
      });
    } catch (e) {
      interactiveMsg = null;
    }
    if (interactiveMsg) {
      const genOpts = { userJid };
      if (spec.quoted) genOpts.quoted = spec.quoted;
      const variants = [
        // 1) viewOnce-wrapped — REQUIRED for taps to register on regular WA
        { viewOnceMessage: { message: { messageContextInfo: _mci, interactiveMessage: interactiveMsg } } },
        // 2) bare interactiveMessage + messageContextInfo (legacy fallback)
        { messageContextInfo: _mci, interactiveMessage: interactiveMsg },
      ];
      for (const content of variants) {
        try {
          const full = proto.Message.create(content);
          const gen  = await B.generateWAMessageFromContent(jid, full, genOpts);
          return await sock.relayMessage(jid, gen.message, { messageId: gen.key.id });
        } catch (e) { /* try next variant */ }
      }
    }
  }

  // ── Fallback: plain text with numbered options (always works) ─────────────
  const btnLines = rawButtons.length
    ? rawButtons.map((b, i) => `${i + 1}. ${b.text || b.title || "Option"}`).join("\n")
    : "";
  const listLines = (spec.style === "list" && Array.isArray(spec.listSections))
    ? spec.listSections.flatMap((sec) => (sec.rows || []).map((r, i) => `${i + 1}. ${r.title || "Option"}`)).join("\n")
    : "";
  const text = [spec.text || "", btnLines || listLines, spec.footer ? `_${spec.footer}_` : ""]
    .filter(Boolean).join("\n\n");
  return sock.sendMessage(jid, { text }, spec.quoted ? { quoted: spec.quoted } : {});
}

const sendHeroCard    = (spec) => sendRichInteractive({ ...spec, style: "hero"    });
const sendCarousel    = (spec) => sendRichInteractive({ ...spec, style: "carousel" });
const sendList        = (spec) => sendRichInteractive({ ...spec, style: "list"     });
const createInteractiveMessage = sendRichInteractive;

module.exports = {
  prepareWAMessageMedia,
  downloadContentFromMessage,
  jidNormalizedUser,
  getContentType,
  sendPoll,
  sendRichInteractive,
  sendHeroCard,
  sendCarousel,
  sendList,
  createInteractiveMessage,
};
module.exports.default = module.exports;
