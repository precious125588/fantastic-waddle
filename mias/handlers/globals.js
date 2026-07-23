/**
 * MIAS — Handler Globals Installer  v2
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
 * Safe to call multiple times — only runs once per process.
 *
 * @param {object} sock    - Active Baileys socket
 * @param {object} [config] - Bot configuration
 */
export function installHandlerGlobals(sock, config = {}) {
  // Always update the active socket reference
  globalThis.__MIAS_SOCK__ = sock;
  globalThis.__MIAS_CONFIG__ = config;

  if (_installed) return;

  // Install full handler map under __MIAS__
  globalThis.__MIAS__ = Handlers;

  // ── Convenience shorthands on globalThis ──────────────────────────────────
  // Legacy code throughout mias/index.js uses globalThis.sendReply() etc.
  // These shorthands pick up the current sock automatically via closure.

  globalThis.__MIAS_SEND_TEXT__       = (sock, jid, text, opts)          => Handlers.sendText(sock, jid, text, opts);
  globalThis.__MIAS_SEND_REPLY__      = (sock, jidOrMsg, text, q, opts)  => Handlers.sendReply(sock, jidOrMsg, text, q, opts);
  globalThis.__MIAS_SEND_LONG__       = (sock, jid, text, opts)          => Handlers.sendLong(sock, jid, text, opts);
  globalThis.__MIAS_SEND_TYPING__     = (sock, jid, text, opts)          => Handlers.sendWithTyping(sock, jid, text, opts);
  globalThis.__MIAS_SEND_MENTION__    = (sock, jid, text, jids, opts)    => Handlers.sendMention(sock, jid, text, jids, opts);
  globalThis.__MIAS_SEND_POLL__       = (sock, jid, q, opts, sendOpts)   => Handlers.sendPoll(sock, jid, q, opts, sendOpts);
  globalThis.__MIAS_SEND_IMAGE__      = (sock, jid, img, opts)           => Handlers.sendImage(sock, jid, img, opts);
  globalThis.__MIAS_SEND_VIDEO__      = (sock, jid, vid, opts)           => Handlers.sendVideo(sock, jid, vid, opts);
  globalThis.__MIAS_SEND_AUDIO__      = (sock, jid, aud, opts)           => Handlers.sendAudio(sock, jid, aud, opts);
  globalThis.__MIAS_SEND_VOICE__      = (sock, jid, aud, opts)           => Handlers.sendVoiceNote(sock, jid, aud, opts);
  globalThis.__MIAS_SEND_STICKER__    = (sock, jid, s, opts)             => Handlers.sendSticker(sock, jid, s, opts);
  globalThis.__MIAS_SEND_GIF__        = (sock, jid, gif, opts)           => Handlers.sendGif(sock, jid, gif, opts);
  globalThis.__MIAS_SEND_DOC__        = (sock, jid, doc, opts)           => Handlers.sendDocument(sock, jid, doc, opts);
  globalThis.__MIAS_SEND_ALBUM__      = (sock, jid, items, opts)         => Handlers.sendAlbum(sock, jid, items, opts);
  globalThis.__MIAS_SEND_MEDIA_URL__  = (sock, jid, url, opts)           => Handlers.sendMediaFromUrl(sock, jid, url, opts);
  globalThis.__MIAS_SEND_LOCATION__   = (sock, jid, lat, lon, opts)      => Handlers.sendLocation(sock, jid, lat, lon, opts);
  globalThis.__MIAS_SEND_CONTACT__    = (sock, jid, c, opts)             => Handlers.sendContact(sock, jid, c, opts);
  globalThis.__MIAS_SEND_REACT__      = (sock, msg, emoji)               => Handlers.sendReaction(sock, msg, emoji);
  globalThis.__MIAS_REACT_OK__        = (sock, msg)                      => Handlers.reactSuccess(sock, msg);
  globalThis.__MIAS_REACT_FAIL__      = (sock, msg)                      => Handlers.reactFail(sock, msg);
  globalThis.__MIAS_REACT_PROC__      = (sock, msg)                      => Handlers.reactProcessing(sock, msg);
  globalThis.__MIAS_REACT_LOAD__      = (sock, msg)                      => Handlers.reactLoading(sock, msg);
  globalThis.__MIAS_REACT_DL__        = (sock, msg)                      => Handlers.reactDownload(sock, msg);
  globalThis.__MIAS_REACT_SET__       = (sock, msg, name, ms)            => Handlers.reactSet(sock, msg, name, ms);
  globalThis.__MIAS_WITH_REACTIONS__  = (sock, msg, fn, opts)            => Handlers.withReactions(sock, msg, fn, opts);
  globalThis.__MIAS_FORWARD__         = (sock, jid, msg, opts)           => Handlers.forwardMessage(sock, jid, msg, opts);
  globalThis.__MIAS_DELETE__          = (sock, jid, key)                 => Handlers.deleteMessage(sock, jid, key);
  globalThis.__MIAS_EDIT__            = (sock, jid, key, text)           => Handlers.editMessage(sock, jid, key, text);
  globalThis.__MIAS_DOWNLOAD__        = (msg, type)                      => Handlers.downloadMedia(msg, type);
  globalThis.__MIAS_DL_QUOTED__       = (msg)                            => Handlers.downloadQuotedMedia(msg);
  globalThis.__MIAS_DL_VIEWONCE__     = (msg)                            => Handlers.downloadViewOnce(msg);
  globalThis.__MIAS_DL_URL__          = (url, opts)                      => Handlers.downloadFromUrl(url, opts);
  globalThis.__MIAS_UPLOAD_CATBOX__   = (buf, name, mime)                => Handlers.uploadToCatbox(buf, name, mime);
  globalThis.__MIAS_GROUP_META__      = (sock, jid)                      => Handlers.getGroupMetadata(sock, jid);
  globalThis.__MIAS_SEND_BUTTONS__    = (sock, jid, body, btns, opts)    => Handlers.sendButtons(sock, jid, body, btns, opts);
  globalThis.__MIAS_SEND_LIST__       = (sock, jid, body, sects, opts)   => Handlers.sendList(sock, jid, body, sects, opts);
  globalThis.__MIAS_SEND_POLL_MSG__   = (sock, jid, q, opts, sendOpts)   => Handlers.sendPollMessage(sock, jid, q, opts, sendOpts);
  globalThis.__MIAS_POST_STATUS_TXT__ = (sock, text, opts)               => Handlers.postTextStatus(sock, text, opts);
  globalThis.__MIAS_POST_STATUS_IMG__ = (sock, img, opts)                => Handlers.postImageStatus(sock, img, opts);
  globalThis.__MIAS_POST_STATUS_VID__ = (sock, vid, opts)                => Handlers.postVideoStatus(sock, vid, opts);
  globalThis.__MIAS_POST_STATUS_AUD__ = (sock, aud, opts)                => Handlers.postAudioStatus(sock, aud, opts);
  globalThis.__MIAS_POST_STATUS_STK__ = (sock, stk, opts)                => Handlers.postStickerStatus(sock, stk, opts);
  globalThis.__MIAS_POST_STATUS_DOC__ = (sock, doc, opts)                => Handlers.postDocumentStatus(sock, doc, opts);
  globalThis.__MIAS_EXTRACT_TEXT__    = (msg)                            => Handlers.extractText(msg);
  globalThis.__MIAS_EXTRACT_BODY__    = (msg)                            => Handlers.extractBody(msg);
  globalThis.__MIAS_GET_QUOTED__      = (msg)                            => Handlers.getQuoted(msg);
  globalThis.__MIAS_GET_MENTIONS__    = (msg)                            => Handlers.getMentions(msg);
  globalThis.__MIAS_EFFECTIVE_SENDER__= (msg)                            => Handlers.getEffectiveSender(msg);
  globalThis.__MIAS_IS_BOT_MSG__      = (msg)                            => Handlers.isBotMessage(msg);
  globalThis.__MIAS_HAS_MEDIA__       = (msg)                            => Handlers.hasMedia(msg);
  globalThis.__MIAS_MARK_READ__       = (sock, msg)                      => Handlers.markRead(sock, msg);
  globalThis.__MIAS_SEND_CODE__       = (sock, jid, code, opts)          => Handlers.sendCode(sock, jid, code, opts);
  globalThis.__MIAS_SEND_MENU__       = (sock, jid, msg, opts)           => Handlers.sendMenu(sock, jid, msg, opts);

  _installed = true;
}

/**
 * Update the active socket reference (called on reconnect / session refresh).
 * @param {object} sock
 */
export function updateHandlerSock(sock) {
  globalThis.__MIAS_SOCK__ = sock;
  // Also update any cached sock in the handler namespace
  if (globalThis.__MIAS__) {
    // No-op: handlers always receive sock as a parameter; this just
    // ensures globalThis.__MIAS_SOCK__ is current for legacy shorthands.
  }
}
