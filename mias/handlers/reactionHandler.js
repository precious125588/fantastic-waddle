/**
 * MIAS — Reaction Handler
 * Centralized reaction abstraction. Every command should use these instead
 * of calling sock.sendMessage({ react: ... }) directly.
 *
 * Reactions:
 *   processing:  🌀  (generic) or ⌛ (time-based)
 *   success:     ✅
 *   failure:     ❌
 */

/**
 * Send a reaction emoji to a message.
 * @param {object} sock   - Baileys socket
 * @param {object} msg    - Original message object
 * @param {string} emoji  - Emoji to react with
 */
export async function sendReaction(sock, msg, emoji) {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: { text: emoji, key: msg.key },
    });
  } catch {}
}

/** 🌀 — Processing / working */
export async function reactProcessing(sock, msg) {
  return sendReaction(sock, msg, "🌀");
}

/** ⌛ — Waiting / queued */
export async function reactWaiting(sock, msg) {
  return sendReaction(sock, msg, "⌛");
}

/** ✅ — Success */
export async function reactSuccess(sock, msg) {
  return sendReaction(sock, msg, "✅");
}

/** ❌ — Failure */
export async function reactFail(sock, msg) {
  return sendReaction(sock, msg, "❌");
}

/**
 * React with processing, run fn(), react with ✅ or ❌.
 * This is the canonical pattern for ALL commands.
 *
 * @param {object}   sock - Baileys socket
 * @param {object}   msg  - Message
 * @param {Function} fn   - Async function to execute
 * @param {string}   [processingEmoji="🌀"] - Emoji shown while working
 * @returns {*} Return value of fn()
 */
export async function withReactions(sock, msg, fn, processingEmoji = "🌀") {
  await sendReaction(sock, msg, processingEmoji);
  try {
    const result = await fn();
    await sendReaction(sock, msg, "✅");
    return result;
  } catch (e) {
    await sendReaction(sock, msg, "❌");
    throw e;
  }
}
