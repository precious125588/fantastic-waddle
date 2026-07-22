/**
 * MIAS — Handler Globals Installer
 *
 * Called once at bot startup (from mias/index.js).
 * Installs every handler function onto globalThis.__MIAS__ so CJS files
 * (case.js, nexray_bot.cjs) can access them via the bridge.cjs proxy.
 *
 * Also sets convenience shorthands on globalThis for legacy code that
 * calls functions like globalThis.sendReply() directly.
 */

import * as Handlers from "./baileysHandler.js";

let _installed = false;

/**
 * Install all handler functions globally.
 * Safe to call multiple times — only runs once.
 *
 * @param {object} sock    - Active Baileys socket
 * @param {object} [config] - Bot configuration
 */
export function installHandlerGlobals(sock, config = {}) {
  // Store the active socket
  globalThis.__MIAS_SOCK__ = sock;
  globalThis.__MIAS_CONFIG__ = config;

  if (_installed) {
    // Even on re-calls, update the sock reference
    return;
  }

  // Install full handler map
  globalThis.__MIAS__ = Handlers;

  // ── Convenience shorthands on globalThis ──────────────────────────────────
  // Legacy code throughout mias/index.js uses globalThis.sendReply() etc.
  // We wire those up here so they pick up the current sock automatically.

  const _bound = (fn) => (...args) => fn(...args);

  globalThis.__MIAS_SEND_TEXT__    = (sock, jid, text, opts) => Handlers.sendText(sock, jid, text, opts);
  globalThis.__MIAS_SEND_REPLY__   = (sock, jid, text, quoted, opts) => Handlers.sendReply(sock, jid, text, quoted, opts);
  globalThis.__MIAS_SEND_IMAGE__   = (sock, jid, img, opts) => Handlers.sendImage(sock, jid, img, opts);
  globalThis.__MIAS_SEND_VIDEO__   = (sock, jid, vid, opts) => Handlers.sendVideo(sock, jid, vid, opts);
  globalThis.__MIAS_SEND_AUDIO__   = (sock, jid, aud, opts) => Handlers.sendAudio(sock, jid, aud, opts);
  globalThis.__MIAS_SEND_STICKER__ = (sock, jid, s, opts) => Handlers.sendSticker(sock, jid, s, opts);
  globalThis.__MIAS_SEND_DOC__     = (sock, jid, doc, opts) => Handlers.sendDocument(sock, jid, doc, opts);
  globalThis.__MIAS_SEND_REACT__   = (sock, msg, emoji) => Handlers.sendReaction(sock, msg, emoji);
  globalThis.__MIAS_REACT_OK__     = (sock, msg) => Handlers.reactSuccess(sock, msg);
  globalThis.__MIAS_REACT_FAIL__   = (sock, msg) => Handlers.reactFail(sock, msg);
  globalThis.__MIAS_REACT_PROC__   = (sock, msg) => Handlers.reactProcessing(sock, msg);
  globalThis.__MIAS_FORWARD__      = (sock, jid, msg, opts) => Handlers.forwardMessage(sock, jid, msg, opts);
  globalThis.__MIAS_DOWNLOAD__     = (msg, type) => Handlers.downloadMedia(msg, type);
  globalThis.__MIAS_DL_QUOTED__    = (msg) => Handlers.downloadQuotedMedia(msg);
  globalThis.__MIAS_DL_VIEWONCE__  = (msg) => Handlers.downloadViewOnce(msg);

  _installed = true;
}

/**
 * Update the active socket reference (called on reconnect).
 * @param {object} sock
 */
export function updateHandlerSock(sock) {
  globalThis.__MIAS_SOCK__ = sock;
}
