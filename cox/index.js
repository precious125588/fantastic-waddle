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

  const buttons = Array.isArray(spec.buttons) ? spec.buttons : [];
  const buttonStyle = ("hero" === spec.style || "buttons" === spec.style) ? 1 : 1;

  const header = spec.image
    ? { imageMessage: spec.image, hasMediaAttachment: true }
    : (spec.title || spec.subtitle)
      ? {
          title: spec.title || "",
          subtitle: spec.subtitle || "",
          hasMediaAttachment: false,
        }
      : undefined;

  const payload = {
    text: spec.text || "",
    footer: spec.footer || "",
    header,
    buttons,
    buttonText: spec.buttonText || "Open",
    headerType: spec.image ? 4 : 1,
  };

  if (spec.style === "list") {
    payload.text = spec.text || "";
    payload.sections = spec.listSections || [];
    payload.buttonText = spec.buttonText || "Menu";
    payload.footer = spec.footer || "";
    payload.headerType = spec.image ? 4 : 1;
  }

  return sock.sendMessage(jid, {
    interactiveMessage: {
      body: { text: spec.text || "" },
      footer: { text: spec.footer || "" },
      header,
      nativeFlowMessage: {
        buttons,
        messageParamsJson: JSON.stringify({}),
      },
      contextInfo: spec.contextInfo || undefined,
    },
    messageParamsJson: "",
  }, { quoted: spec.quoted });
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
