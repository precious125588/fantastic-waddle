/**
 * MIAS — Baileys Handler (Universal API / Main Abstraction Layer)  v3
 *
 * ════════════════════════════════════════════════════════════════
 *  Architecture:
 *
 *  Commands
 *       ↓
 *  MIAS Handlers  ← (this file is the single import point)
 *       ↓
 *  Baileys Adapter  (baileysHandler.js routes to gktwAdapter.js)
 *       ↓
 *  GKTW Helper  (auto-detected, falls back to Baileys if absent)
 *       ↓
 *  WhatsApp
 * ════════════════════════════════════════════════════════════════
 *
 * ONLY import from this file. Never import Baileys or GKTW directly in commands.
 * Every handler function lives in a sibling file; this module re-exports them all
 * under one roof so commands only need one import:
 *
 *   import * as MIAS from "../handlers/baileysHandler.js";
 *
 * ─── Universal API surface ───────────────────────────────────────────────────
 *  sendText()        sendReply()        sendPoll()         sendMention()
 *  sendLong()        sendWithTyping()   sendTyping()       sendRead()
 *  editText()        sendRaw()
 *  sendImage()       sendVideo()        sendAudio()        sendVoiceNote()
 *  sendSticker()     sendGif()          sendDocument()     sendAlbum()
 *  sendMediaFromUrl() prepareThumbnail() guessMime()
 *  sendButtons()     sendInteractive()  sendList()
 *  sendCarousel()    sendNativeFlow()   sendHeroCard()
 *  sendCode()        sendCodeMulti()    sendMenu()
 *  sendReaction()    reactCustom()      clearReaction()
 *  reactProcessing() reactWaiting()     reactSuccess()     reactFail()
 *  reactError()      reactLoading()     reactDownload()    reactFire()
 *  reactLike()       reactSet()         reactSequence()    withReactions()
 *  sendContact()     sendContacts()     sendBotVCard()     buildVCard()
 *  sendLocation()    sendPollMessage()
 *  postTextStatus()  postImageStatus()  postVideoStatus()  postAudioStatus()
 *  postStickerStatus() postDocumentStatus() getStatusAudience()
 *  forwardMessage()  forwardSilent()    broadcastForward() resendMessage()
 *  uploadMedia()     uploadToCatbox()   downloadMedia()    downloadQuotedMedia()
 *  downloadViewOnce() downloadFromUrl() fetchBuffer()      cleanupTemp()
 *  getMessageType()  hasMedia()
 *  prepareContextInfo() prepareExternalAdReply()
 *  deleteMessage()   editMessage()      getPresence()      isOnWhatsApp()
 *  getProfilePicture() getBaileysVersion() isGktwAvailable()
 *  getGroupMetadata() normalizeJid()    getEffectiveSender() resolveJid()
 *  extractText()     extractBody()      getMentions()      getQuoted()
 *  getContentType()  isGroupJid()       isBroadcastJid()   isNewsletterJid()
 *  isUserJid()       isBotMessage()     phoneFromJid()     toUserJid()
 *  sleep()           withRetry()        formatUptime()     formatBytes()
 *  setPresence()     withTyping()       markRead()
 *  REACTIONS         REACTION_SETS
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Re-export all sibling handlers ───────────────────────────────────────────
export * from "./reactionHandler.js";
export * from "./messageHandler.js";
export * from "./mediaHandler.js";
export * from "./interactiveHandler.js";
export * from "./uploadHandler.js";
export * from "./downloadHandler.js";
export * from "./contactHandler.js";
export * from "./statusHandler.js";
export * from "./forwardHandler.js";
export * from "./menuHandler.js";
export * from "./codeHandler.js";
export * from "./buttonHandler.js";
export * from "./utilityHandler.js";
export { isGktwAvailable } from "./gktwAdapter.js";

// ─── Core adapter utilities ───────────────────────────────────────────────────

import {
  getBaileys,
  fetchLatestBaileysVersion as _fetchVersion,
  isGktwAvailable as _isGktwAvailable,
  getGroupMetadata as _getGroupMetadata,
  groupFetchAllParticipating as _groupFetchAll,
  sendPoll as _sendPollDirect,
} from "./gktwAdapter.js";

/**
 * Get the current Baileys version being used.
 * @returns {Promise<string>}
 */
export async function getBaileysVersion() {
  try {
    const { version } = await _fetchVersion();
    return Array.isArray(version) ? version.join(".") : String(version);
  } catch {}
  return "unknown";
}

/**
 * Delete a bot-sent or bot-admin-deletable message.
 * @param {object} sock
 * @param {string} jid
 * @param {object} msgKey - The key of the message to delete
 */
export async function deleteMessage(sock, jid, msgKey) {
  try {
    await sock.sendMessage(jid, { delete: msgKey });
  } catch {
    // Silently ignore — message may already be gone
  }
}

/**
 * Edit a previously sent text message (own messages only).
 * @param {object} sock
 * @param {string} jid
 * @param {object} msgKey - Key of the message to edit
 * @param {string} newText
 */
export async function editMessage(sock, jid, msgKey, newText) {
  try {
    await sock.sendMessage(jid, { text: String(newText ?? ""), edit: msgKey });
  } catch {}
}

/**
 * Subscribe to a contact's presence and retrieve their current status.
 * @param {object} sock
 * @param {string} jid
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<{status: string, lastSeenMs: number|null}>}
 */
export async function getPresence(sock, jid, timeoutMs = 5000) {
  try {
    if (typeof sock.presenceSubscribe === "function") {
      await sock.presenceSubscribe(jid);
    }

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Presence timeout")), timeoutMs);
      const handler = ({ id, presences }) => {
        if (!id || !id.includes(jid.split("@")[0])) return;
        clearTimeout(timer);
        try { sock.ev.off("presence.update", handler); } catch {}
        const entries = Object.values(presences || {});
        const entry = entries[0] || {};
        resolve({
          status: entry.lastKnownPresence || "unknown",
          lastSeenMs: entry.lastSeen ? entry.lastSeen * 1000 : null,
        });
      };
      if (typeof sock.ev?.on === "function") {
        sock.ev.on("presence.update", handler);
      } else {
        clearTimeout(timer);
        resolve({ status: "unknown", lastSeenMs: null });
      }
    });
  } catch {
    return { status: "unknown", lastSeenMs: null };
  }
}

/**
 * Check if a JID is registered on WhatsApp.
 * @param {object}   sock
 * @param {string[]} jids  - Array of JIDs to check
 * @returns {Promise<object[]>}
 */
export async function isOnWhatsApp(sock, jids) {
  try {
    const arr = Array.isArray(jids) ? jids : [jids];
    if (typeof sock.onWhatsApp === "function") {
      return await sock.onWhatsApp(...arr);
    }
  } catch (err) {
    console.error("[isOnWhatsApp] Error:", err?.message);
  }
  return [];
}

/**
 * Get the profile picture URL for a JID.
 * @param {object} sock
 * @param {string} jid
 * @param {"image"|"preview"} [type="image"]
 * @returns {Promise<string|null>}
 */
export async function getProfilePicture(sock, jid, type = "image") {
  try {
    if (typeof sock.profilePictureUrl === "function") {
      return await sock.profilePictureUrl(jid, type);
    }
  } catch {}
  return null;
}

/**
 * Fetch group metadata.
 * @param {object} sock
 * @param {string} jid  - Group JID
 * @returns {Promise<object|null>}
 */
export async function getGroupMetadata(sock, jid) {
  return _getGroupMetadata(sock, jid);
}

/**
 * Fetch all groups the bot is participating in.
 * @param {object} sock
 * @returns {Promise<object>}
 */
export async function groupFetchAllParticipating(sock) {
  return _groupFetchAll(sock);
}

/**
 * Build a contextInfo object for attaching metadata to messages.
 *
 * @param {object}  [opts]
 * @param {object}  [opts.quoted]       - WAMessage to reference
 * @param {string}  [opts.mentionedJid] - Single JID or array of JIDs to mention
 * @param {string}  [opts.forwardingScore]
 * @returns {object}
 */
export function prepareContextInfo(opts = {}) {
  const ctx = {};
  if (opts.quoted?.key) {
    ctx.stanzaId        = opts.quoted.key.id;
    ctx.participant     = opts.quoted.key.participant || opts.quoted.key.remoteJid;
    ctx.quotedMessage   = opts.quoted.message;
    ctx.remoteJid       = opts.quoted.key.remoteJid;
  }
  const mentions = opts.mentionedJid
    ? (Array.isArray(opts.mentionedJid) ? opts.mentionedJid : [opts.mentionedJid])
    : [];
  if (mentions.length) ctx.mentionedJid = mentions;
  if (opts.forwardingScore != null) {
    ctx.forwardingScore = opts.forwardingScore;
    ctx.isForwarded = opts.forwardingScore > 0;
  }
  return ctx;
}

/**
 * Build an ExternalAdReply object for link-preview cards.
 *
 * @param {object} [opts]
 * @param {string} [opts.title]
 * @param {string} [opts.body]
 * @param {string} [opts.sourceUrl]
 * @param {string} [opts.mediaUrl]
 * @param {string} [opts.mediaType="IMAGE"]  - "IMAGE"|"VIDEO"
 * @param {Buffer} [opts.thumbnail]
 * @param {string} [opts.sourceId]
 * @param {boolean}[opts.renderLargerThumbnail]
 * @returns {object}
 */
export function prepareExternalAdReply(opts = {}) {
  return {
    title: opts.title || "",
    body: opts.body || "",
    sourceUrl: opts.sourceUrl || "https://whatsapp.com",
    mediaUrl: opts.mediaUrl || opts.sourceUrl || "",
    mediaType: opts.mediaType === "VIDEO" ? 2 : 1,
    thumbnail: opts.thumbnail || null,
    sourceId: opts.sourceId || "",
    renderLargerThumbnail: opts.renderLargerThumbnail ?? true,
    showAdAttribution: opts.showAdAttribution ?? false,
  };
}

/**
 * Send a location message.
 * @param {object} sock
 * @param {string} jid
 * @param {number} latitude
 * @param {number} longitude
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {string} [opts.address]
 * @param {object} [opts.quoted]
 */
export async function sendLocation(sock, jid, latitude, longitude, opts = {}) {
  try {
    const content = {
      location: {
        degreesLatitude: latitude,
        degreesLongitude: longitude,
        name: opts.name || "",
        address: opts.address || "",
      },
    };
    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[sendLocation] Error:", err?.message);
    return null;
  }
}

/**
 * Send an interactive poll.
 * Falls back to a numbered text list if polls are unsupported.
 *
 * @param {object}   sock
 * @param {string}   jid
 * @param {string}   question
 * @param {string[]} options
 * @param {object}   [opts]
 * @param {number}   [opts.selectableCount=1]
 * @param {object}   [opts.quoted]
 */
export async function sendPollMessage(sock, jid, question, options, opts = {}) {
  try {
    return await _sendPollDirect(sock, jid, question, options, opts);
  } catch {
    const lines = (options || []).map((o, i) => `[${i + 1}] ${o}`).join("\n");
    const text = `📊 *${question}*\n\n${lines}`;
    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return sock.sendMessage(jid, { text }, sendOpts);
  }
}
