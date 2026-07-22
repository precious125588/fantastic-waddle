/**
 * MIAS — Utility Handler
 *
 * General-purpose utilities used across handlers.
 * Commands must never call Baileys directly — use these helpers.
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import { getContentType as _getContentType, getBaileys, getProto } from "./gktwAdapter.js";

// ─── JID utilities ────────────────────────────────────────────────────────────

/**
 * Normalize a JID to its canonical form (e.g. remove device suffix).
 * @param {string} jid
 * @returns {string}
 */
export async function normalizeJid(jid) {
  try {
    const B = await getBaileys();
    if (typeof B.jidNormalizedUser === "function") return B.jidNormalizedUser(jid);
  } catch {}
  return jid?.split(":")[0] + (jid?.includes("@") ? "@" + jid.split("@")[1] : "");
}

/**
 * Extract the phone number from a JID.
 * @param {string} jid
 * @returns {string}
 */
export function phoneFromJid(jid) {
  return (jid || "").split("@")[0].split(":")[0];
}

/**
 * Convert a phone number to a user JID.
 * @param {string} phone
 * @returns {string}
 */
export function toUserJid(phone) {
  const clean = String(phone).replace(/\D/g, "");
  return `${clean}@s.whatsapp.net`;
}

/**
 * Check if a JID is a group.
 * @param {string} jid
 * @returns {boolean}
 */
export function isGroupJid(jid) {
  return (jid || "").endsWith("@g.us");
}

/**
 * Check if a JID is a broadcast/status.
 * @param {string} jid
 * @returns {boolean}
 */
export function isBroadcastJid(jid) {
  return (jid || "").endsWith("@broadcast") || jid === "status@broadcast";
}

// ─── Message content utilities ────────────────────────────────────────────────

/**
 * Get the content type of a message.
 * @param {object} message - message.message object
 * @returns {string|null}
 */
export async function getContentType(message) {
  try {
    return await _getContentType(message);
  } catch {
    return Object.keys(message || {})[0] || null;
  }
}

/**
 * Extract plain text from any message type.
 * @param {object} msg - WAMessage object
 * @returns {string}
 */
export function extractText(msg) {
  if (!msg?.message) return "";
  const m = msg.message;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    m.templateButtonReplyMessage?.selectedId ||
    ""
  );
}

/**
 * Get a message's quoted context (the replied-to message).
 * @param {object} msg - WAMessage object
 * @returns {object|null}
 */
export function getQuoted(msg) {
  const m = msg?.message;
  if (!m) return null;
  const inner = m.extendedTextMessage || m.imageMessage || m.videoMessage || m.documentMessage || m.audioMessage;
  return inner?.contextInfo?.quotedMessage ? { message: inner.contextInfo.quotedMessage, key: { id: inner.contextInfo.stanzaId, remoteJid: inner.contextInfo.remoteJid || msg.key?.remoteJid, participant: inner.contextInfo.participant } } : null;
}

/**
 * Extract all mentioned JIDs from a message.
 * @param {object} msg
 * @returns {string[]}
 */
export function getMentions(msg) {
  const m = msg?.message;
  if (!m) return [];
  const inner = m.extendedTextMessage || m.imageMessage || m.videoMessage || {};
  return inner?.contextInfo?.mentionedJid || [];
}

// ─── Timing & retry utilities ─────────────────────────────────────────────────

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async function up to `retries` times with exponential backoff.
 * @param {Function} fn
 * @param {number} [retries=3]
 * @param {number} [baseDelayMs=500]
 * @returns {Promise<any>}
 */
export async function withRetry(fn, retries = 3, baseDelayMs = 500) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries) await sleep(baseDelayMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

// ─── Text formatting utilities ────────────────────────────────────────────────

/**
 * Truncate a string to a max length with ellipsis.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
export function truncate(str, maxLen = 500) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
}

/**
 * Format bytes to human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Format milliseconds to human-readable uptime.
 * @param {number} ms
 * @returns {string}
 */
export function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

// ─── Presence helpers ─────────────────────────────────────────────────────────

/**
 * Update the bot's typing indicator in a chat.
 * @param {object} sock
 * @param {string} jid
 * @param {"composing"|"paused"|"recording"} [state="composing"]
 */
export async function setPresence(sock, jid, state = "composing") {
  try {
    if (typeof sock.sendPresenceUpdate === "function") {
      await sock.sendPresenceUpdate(state, jid);
    }
  } catch {}
}

/**
 * Update typing presence for the duration of fn(), then stop.
 * @param {object} sock
 * @param {string} jid
 * @param {Function} fn
 * @returns {Promise<any>}
 */
export async function withTyping(sock, jid, fn) {
  await setPresence(sock, jid, "composing");
  try {
    return await fn();
  } finally {
    await setPresence(sock, jid, "paused").catch(() => {});
  }
}

// ─── Read-receipt helpers ─────────────────────────────────────────────────────

/**
 * Mark a message as read.
 * @param {object} sock
 * @param {object} msg - WAMessage
 */
export async function markRead(sock, msg) {
  try {
    const key = msg?.key;
    if (key && typeof sock.readMessages === "function") {
      await sock.readMessages([key]);
    }
  } catch {}
}
