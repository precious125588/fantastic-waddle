/**
 * MIAS — Baileys Handler (Main Abstraction Layer)
 *
 * ════════════════════════════════════════════════════════════════
 *  Architecture:
 *
 *  Commands
 *       ↓
 *  MIAS Handlers (this file + siblings)
 *       ↓
 *  @itsliaaa/baileys
 *       ↓
 *  WhatsApp
 * ════════════════════════════════════════════════════════════════
 *
 * This is the single entry point for all Baileys communication.
 * Every feature of the bot should call functions from this file
 * or the sibling handler files, NEVER importing Baileys directly.
 *
 * This ensures future Baileys updates only require changes here.
 */

// ── Re-export all handlers for convenient single-import ──────────────────────
export * from "./reactionHandler.js";
export * from "./messageHandler.js";
export * from "./mediaHandler.js";
export * from "./interactiveHandler.js";
export * from "./uploadHandler.js";
export * from "./downloadHandler.js";
export * from "./contactHandler.js";
export * from "./statusHandler.js";

// ── Core Baileys utilities exposed through the abstraction layer ──────────────

/**
 * Get the current Baileys version being used.
 * @returns {Promise<string>}
 */
export async function getBaileysVersion() {
  try {
    const B = await import("@whiskeysockets/baileys");
    if (B.fetchLatestBaileysVersion) {
      const { version } = await B.fetchLatestBaileysVersion();
      return version.join(".");
    }
  } catch {}
  return "unknown";
}

/**
 * Forward a message to another JID.
 * @param {object} sock
 * @param {string} toJid    - Destination JID
 * @param {object} msg      - Message to forward
 * @param {number} [score=1] - Forwarding score (1 = "Forwarded" label)
 */
export async function forwardMessage(sock, toJid, msg, score = 1) {
  try {
    const content = msg.message;
    if (!content) return;
    // Inject forwardingScore so WhatsApp shows "Forwarded" label
    const patchedContent = JSON.parse(JSON.stringify(content));
    const firstKey = Object.keys(patchedContent)[0];
    if (firstKey && patchedContent[firstKey]) {
      patchedContent[firstKey].contextInfo = {
        ...(patchedContent[firstKey].contextInfo || {}),
        forwardingScore: score,
        isForwarded: score > 0,
      };
    }
    await sock.sendMessage(toJid, patchedContent);
  } catch {}
}

/**
 * Delete a bot-sent message.
 * @param {object} sock
 * @param {string} jid
 * @param {object} msgKey - The key of the message to delete
 */
export async function deleteMessage(sock, jid, msgKey) {
  try {
    await sock.sendMessage(jid, { delete: msgKey });
  } catch {}
}

/**
 * Edit a previously sent text message.
 * @param {object} sock
 * @param {string} jid
 * @param {object} msgKey - The key of the message to edit
 * @param {string} newText
 */
export async function editMessage(sock, jid, msgKey, newText) {
  try {
    await sock.sendMessage(jid, { text: String(newText ?? ""), edit: msgKey });
  } catch {}
}

/**
 * Subscribe to a contact's presence and get their online status.
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
      new Promise(resolve => setTimeout(() => resolve({ status: "unknown", lastSeenMs: null }), timeoutMs)),
    ]);
    return result;
  } catch {
    return { status: "unknown", lastSeenMs: null };
  }
}

/**
 * Check if a number is registered on WhatsApp.
 * @param {object} sock
 * @param {string} number - Phone number (digits only)
 * @returns {Promise<boolean>}
 */
export async function isOnWhatsApp(sock, number) {
  try {
    const jid = number.includes("@") ? number : `${number}@s.whatsapp.net`;
    const [result] = await sock.onWhatsApp(jid);
    return !!result?.exists;
  } catch {
    return false;
  }
}

/**
 * Fetch a contact's profile picture URL.
 * @param {object} sock
 * @param {string} jid
 * @returns {Promise<string|null>}
 */
export async function getProfilePicture(sock, jid) {
  try {
    return await sock.profilePictureUrl(jid, "image");
  } catch {
    return null;
  }
}

/**
 * Prepare context info for a message — adds forwarding score, AI badge, etc.
 * @param {object} [opts]
 * @param {boolean} [opts.isForwarded]
 * @param {boolean} [opts.aiTag]
 * @param {string[]} [opts.mentions]
 * @returns {object|null}
 */
export function prepareContextInfo(opts = {}) {
  const ctx = {};
  if (opts.isForwarded) { ctx.forwardingScore = 1; ctx.isForwarded = true; }
  if (opts.aiTag) { ctx.botMessageInvokePayload = {}; }
  if (opts.mentions?.length) { ctx.mentionedJid = opts.mentions; }
  return Object.keys(ctx).length ? ctx : null;
}
