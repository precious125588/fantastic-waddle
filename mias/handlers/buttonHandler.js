/**
 * MIAS — Button Handler  v2
 *
 * Extends the interactive handler with:
 *  - Global Button Mode flag (setButtonMode / isButtonMode)
 *  - Copy-to-clipboard button helper
 *  - Call / phone button helper
 *  - Raw native-flow shortcut
 *  - Bot contact + buttons combo (vCard with profile pic, then buttons)
 *  - Auto-wrap (Button Mode respects the flag)
 *
 * Core interactive functions (sendButtons, sendList, sendHeroCard,
 * sendCarousel, sendUrlButtons) live in interactiveHandler.js.
 * This file only exports what is NOT already in interactiveHandler.js.
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import { sendButtons, sendList } from "./interactiveHandler.js";
import { sendBotVCard } from "./contactHandler.js";
import { sendInteractiveMessage } from "./gktwAdapter.js";
import { sendText } from "./messageHandler.js";

// ─── Button Mode state ─────────────────────────────────────────────────────────

let _buttonMode = false;

/**
 * Enable or disable global Button Mode.
 * When ON, autoButton() wraps plain replies in interactive buttons.
 * @param {boolean} enabled
 */
export function setButtonMode(enabled) {
  _buttonMode = !!enabled;
}

/**
 * Returns true when Button Mode is currently enabled.
 * @returns {boolean}
 */
export function isButtonMode() {
  return _buttonMode;
}

// ─── Extra button types ───────────────────────────────────────────────────────

/**
 * Send a copy-to-clipboard button.
 * When tapped, the given text is copied to the user's clipboard.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} body          - Message body
 * @param {string} copyText      - Text that gets copied on tap
 * @param {string} [buttonLabel] - Label on the button (default: "Copy")
 * @param {object} [opts]
 * @param {string} [opts.header]
 * @param {string} [opts.footer]
 * @param {object} [opts.quoted]
 */
export async function sendCopyButton(sock, jid, body, copyText, buttonLabel = "Copy", opts = {}) {
  return sendButtons(sock, jid, body, [{
    text: buttonLabel,
    copyCode: copyText,
    type: "copy",
  }], opts);
}

/**
 * Send a call / phone button.
 * Tapping the button opens the phone dialler with the given number.
 *
 * @param {object} sock
 * @param {string} jid
 * @param {string} body
 * @param {string} phone          - Phone number with country code, digits only
 * @param {string} [buttonLabel]  - Label on the button (default: "Call")
 * @param {object} [opts]
 */
export async function sendCallButton(sock, jid, body, phone, buttonLabel = "Call", opts = {}) {
  return sendButtons(sock, jid, body, [{
    text: buttonLabel,
    phone: String(phone).replace(/\D/g, ""),
    type: "call",
  }], opts);
}

/**
 * Send a raw native-flow message — full control over the button array.
 * Use when you need to mix button types in a single message.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {object}   flow
 * @param {string}   flow.body
 * @param {string}   [flow.footer]
 * @param {string}   [flow.header]
 * @param {object[]} [flow.buttons]    - Any mix of quick_reply / url / copy / call
 * @param {object}   [flow.contextInfo]
 * @param {object}   [opts]
 * @param {object}   [opts.quoted]
 */
export async function sendNativeFlow(sock, jid, flow, opts = {}) {
  return sendInteractiveMessage(sock, jid, {
    body: flow.body || "",
    footer: flow.footer || "",
    header: flow.header || "",
    buttons: flow.buttons || [],
    contextInfo: flow.contextInfo || {},
    quoted: opts.quoted || null,
  });
}

/**
 * Send the bot vCard (with profile picture) then interactive buttons.
 * This is the signature "contact + buttons" experience:
 *  1. WhatsApp renders the bot contact card (with bot pic)
 *  2. Followed immediately by tappable action buttons
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   body        - Button message body text
 * @param {object[]} buttons     - Any mix: [{text,id}] [{text,url}] [{text,copyCode}] etc.
 * @param {object}   [opts]
 * @param {string}   [opts.footer]
 * @param {string}   [opts.header]
 * @param {object}   [opts.quoted]
 * @param {string}   [opts.botOrg]     - Organization line in vCard
 * @param {string}   [opts.botNote]    - Note field in vCard
 * @param {boolean}  [opts.withPic]    - Embed profile pic (default: true)
 * @param {object}   [opts.contextInfo]
 */
export async function sendContactWithButtons(sock, jid, body, buttons, opts = {}) {
  // 1. Send bot vCard
  await sendBotVCard(sock, jid, {
    org: opts.botOrg || null,
    note: opts.botNote || null,
    withPic: opts.withPic !== false,
    quoted: opts.quoted || null,
  });

  // 2. Let WhatsApp render the card before the buttons arrive
  await new Promise(r => setTimeout(r, 500));

  // 3. Send interactive buttons
  return sendButtons(sock, jid, body, buttons || [], {
    footer: opts.footer || "",
    header: opts.header || "",
    quoted: opts.quoted || null,
    contextInfo: opts.contextInfo || {},
  });
}

/**
 * Auto-wrap a reply with buttons when Button Mode is ON.
 * When Button Mode is OFF, falls back to plain sendText.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   text
 * @param {object}   [opts]
 * @param {object[]} [opts.buttons]      - Required for button wrap to trigger
 * @param {object}   [opts.quoted]
 * @param {string}   [opts.footer]
 * @param {string}   [opts.header]
 * @param {object}   [opts.contextInfo]
 */
export async function autoButton(sock, jid, text, opts = {}) {
  if (_buttonMode && Array.isArray(opts.buttons) && opts.buttons.length) {
    return sendButtons(sock, jid, text, opts.buttons, {
      footer: opts.footer || "",
      header: opts.header || "",
      quoted: opts.quoted || null,
      contextInfo: opts.contextInfo || {},
    });
  }
  return sendText(sock, jid, text, { quoted: opts.quoted });
}
