/**
 * MIAS — Message Handler
 * Centralized text/reply sending abstraction.
 * Commands should call these instead of sock.sendMessage({ text }) directly.
 */

/**
 * Send a plain text reply to a message (quoted).
 */
export async function sendText(sock, msg, text) {
  const jid = msg.key.remoteJid;
  try {
    return await sock.sendMessage(jid, { text: String(text ?? "") }, { quoted: msg });
  } catch {
    try { return await sock.sendMessage(jid, { text: String(text ?? "") }); } catch {}
  }
}

/**
 * Send a plain text message (not quoted).
 */
export async function sendRaw(sock, jid, text) {
  try {
    return await sock.sendMessage(jid, { text: String(text ?? "") });
  } catch {}
}

/**
 * Send a long text, splitting into chunks at natural break points.
 */
export async function sendLong(sock, msg, text, chunkSize = 3500) {
  const jid = msg.key.remoteJid;
  let remaining = String(text ?? "").trim();
  let first = true;
  while (remaining.length) {
    let chunk = remaining.slice(0, chunkSize);
    if (remaining.length > chunkSize) {
      const best = Math.max(
        chunk.lastIndexOf("\n\n"),
        chunk.lastIndexOf("\n"),
        chunk.lastIndexOf(". ")
      );
      if (best > chunkSize * 0.5) chunk = remaining.slice(0, best + 1);
    }
    remaining = remaining.slice(chunk.length).trimStart();
    try {
      if (first) {
        await sock.sendMessage(jid, { text: chunk.trim() }, { quoted: msg });
        first = false;
      } else {
        await sock.sendMessage(jid, { text: chunk.trim() });
      }
    } catch {}
    if (remaining.length) await new Promise(r => setTimeout(r, 300));
  }
}

/**
 * Send a typing indicator, wait, then send text.
 */
export async function sendWithTyping(sock, msg, text, delayMs = 500) {
  const jid = msg.key.remoteJid;
  try { await sock.sendPresenceUpdate("composing", jid); } catch {}
  await new Promise(r => setTimeout(r, delayMs));
  try { await sock.sendPresenceUpdate("paused", jid); } catch {}
  return sendText(sock, msg, text);
}
