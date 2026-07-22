/**
 * MIAS — Baileys Handler (Universal API / Main Abstraction Layer)
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
 * ONLY import from this file.  Never import Baileys or GKTW directly in commands.
 * Every handler function lives in a sibling file; this module re-exports them all
 * under one roof so commands only need one import:
 *
 *   import * as MIAS from "../handlers/baileysHandler.js";
 *
 * ─── Universal API surface ───────────────────────────────────────────────────
 *  sendText()        sendReply()        sendImage()        sendVideo()
 *  sendAudio()       sendSticker()      sendGif()          sendDocument()
 *  sendAlbum()       sendButtons()      sendInteractive()  sendList()
 *  sendCarousel()    sendNativeFlow()   sendCode()         sendMenu()
 *  sendReaction()    sendContact()      sendLocation()     sendStatus()
 *  forwardMessage()  uploadMedia()      downloadMedia()    downloadQuotedMedia()
 *  prepareThumbnail() prepareContextInfo() prepareExternalAdReply()
 *  deleteMessage()   editMessage()      getPresence()      isOnWhatsApp()
 *  getProfilePicture() getBaileysVersion() isGktwAvailable()
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
  } catch (err) {
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
    const result = await Promise.race([
      new Promise(resolve => {
        sock.ev.once("presence.update", update => {
          if (update.id !== jid) return;
          const p = update.presences?.[jid];
          resolve({
            status: p?.lastKnownPresence || "unknown",
            lastSeenMs: p?.lastSeen ? p.lastSeen * 1000 : null,
          });
        });
      }),
      new Promise(resolve =>
        setTimeout(() => resolve({ status: "unknown", lastSeenMs: null }), timeoutMs)
      ),
    ]);
    return result;
  } catch {
    return { status: "unknown", lastSeenMs: null };
  }
}

/**
 * Check if a phone number is registered on WhatsApp.
 * @param {object} sock
 * @param {string} jid - full JID or phone number like "2348012345678@s.whatsapp.net"
 * @returns {Promise<boolean>}
 */
export async function isOnWhatsApp(sock, jid) {
  try {
    const results = await sock.onWhatsApp(jid.includes("@") ? jid.split("@")[0] : jid);
    return results?.[0]?.exists ?? false;
  } catch {
    return false;
  }
}

/**
 * Get a contact's profile picture URL.
 * @param {object} sock
 * @param {string} jid
 * @param {"image"|"preview"} [type="image"]
 * @returns {Promise<string|null>}
 */
export async function getProfilePicture(sock, jid, type = "image") {
  try {
    return await sock.profilePictureUrl(jid, type);
  } catch {
    return null;
  }
}

/**
 * Build a ContextInfo object for embedding in messages.
 * @param {object} opts
 * @param {object}  [opts.quoted]              - Quoted message object
 * @param {string}  [opts.mentionedJid]        - Single JID to mention
 * @param {string[]} [opts.mentionedJidList]   - Multiple JIDs to mention
 * @param {boolean} [opts.isForwarded=false]
 * @param {number}  [opts.forwardingScore=0]
 * @param {object}  [opts.externalAdReply]     - ExternalAdReply object from prepareExternalAdReply()
 * @returns {object}
 */
export function prepareContextInfo(opts = {}) {
  const ctx = {};

  if (opts.quoted) {
    const q = opts.quoted;
    const key = q.key || {};
    ctx.stanzaId = key.id;
    ctx.participant = key.participant || key.remoteJid;
    ctx.quotedMessage = q.message;
    ctx.remoteJid = key.remoteJid;
  }

  const mentions = opts.mentionedJidList || (opts.mentionedJid ? [opts.mentionedJid] : []);
  if (mentions.length) ctx.mentionedJid = mentions;

  if (opts.isForwarded) {
    ctx.isForwarded = true;
    ctx.forwardingScore = opts.forwardingScore ?? 1;
  }

  if (opts.externalAdReply) {
    ctx.externalAdReply = opts.externalAdReply;
  }

  return ctx;
}

/**
 * Build an ExternalAdReply (rich link-preview card) object.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.body]
 * @param {string} [opts.sourceUrl]
 * @param {string} [opts.mediaUrl]
 * @param {string} [opts.mediaType="IMAGE"]  - "IMAGE"|"VIDEO"
 * @param {Buffer} [opts.thumbnail]
 * @param {string} [opts.sourceId]
 * @param {string} [opts.renderLargerThumbnail=true]
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
