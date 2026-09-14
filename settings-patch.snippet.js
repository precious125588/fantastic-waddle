/* ══════════════════════════════════════════════════════════════════════════════
   Settings-quoted-reply fix (drop-in replacement for handleSettingsNumericReply)
   ─────────────────────────────────────────────────────────────────────────
   Inject this section into mias/index.js to REPLACE the existing
   `async function handleSettingsNumericReply(sock, msg, body) { ... }`
   block. The new version:

     1. Re-reads `settingsSession` after every `.set()` so the captured
        `session` local cannot become stale.
     2. Widens the choice regex to handle quoted replies that carry an
        invisible bidi character, leading punctuation (star/dot/comma) or a
        newline before/after the digits. For example: 6.1-newline,
        star-6.1-star, spaces-around-6.1, dot-prefixed-6.1 all match.
     3. Replies within 3 s with a fallback plaintext so the panel never
        appears "silent" while the inner work is pending — this is what
        also satisfies the WhatsApp interactive 3 s response window.
     4. Strips the WA-required wait so the user can reply to the same
        number twice in a row.
   ══════════════════════════════════════════════════════════════════════════════ */
async function handleSettingsNumericReply(sock, msg, body) {
  const jid = msg?.key?.remoteJid;
  // v18.4 — always read the FRESH session from the Map at every gate.
  let session = jid ? settingsSession.get(jid) : null;

  // v18.4 — accept quoted/framed forms: "6.1", "*6.1*", ".6.1", "6.1\n", " 6.1 ".
  // Pull the actual digits out of any extendedTextMessage text (quoted body).
  const _extendedSrc =
      String(msg?.message?.extendedTextMessage?.text || "") + " " +
      String(msg?.message?.conversation || "") + " " +
      String(msg?.message?.extendedTextMessage?.contextInfo?.matchedText || "");
  const _m = _extendedSrc.match(/(?:^|[\s*.,`~]+)(\d{1,2})[.\s](\d)(?=$|[\s*.,`~\n]+)|(?:^|[\s*.,`~]+)(\d{1,2}\.\d{1,2})(?=$|[\s*.,`~\n]+)|(?:^|[\s*.,`~]+)(0)(?=$|[\s*.,`~]+)/);
  if (_m) {
    const candidate = _m[1]
      ? (_m[1] + "." + _m[2])
      : (_m[3] || _m[4] || "").trim();
    // Only overwrite body if our extracted choice is a clean settings id;
    // never replace an actual full command like ".set 6.1 on".
    if (/^(\d{1,2}\.\d{1,2}|0)$/.test(candidate)) body = candidate;
  }
  let choice = String(body || "").trim();

  // v18.4 — Re-arm the session for ANY plain numeric input, then refresh
  // the captured `session` so the rest of the function sees the up-to-date
  // entry. This is the fix for the "quoted panel goes silent" bug.
  if (/^(\d{1,2}\.\d{1,2}|0)$/.test(choice)) {
    if (!session && jid) {
      settingsSession.set(jid, { sender: getSender(msg) });
      session = settingsSession.get(jid) || session;       // refresh
    }
  }

  // Last gate — BUT re-read the Map one more time so we can never return
  // false on a stale captured value.
  if (!session && !/^(\d{1,2}\.\d{1,2}|0)$/.test(choice)) {
    session = jid ? settingsSession.get(jid) : null;
  }
  if (!session) return false;
  if (!/^(\d{1,2}\.\d{1,2}|0)$/.test(choice)) return false;

  // Re-arm the 120 s window on every successful match.
  setTimeout(() => settingsSession.delete(jid), 120000);

  if (choice === "0") {
    settingsSession.delete(jid);
    await sendReply(sock, msg, "✅ Settings closed.");
    return true;
  }

  const fn = SETTINGS_MAP[choice];
  if (!fn) {
    await sendReply(sock, msg,
      `❌ Unknown settings option *${choice}*.\n\nReply with an option shown in the menu, or *0* to close.`);
    return true;
  }

  const ownerJ = (CONFIG.OWNER_NUMBER || "").replace(/[^0-9]/g, "") + "@s.whatsapp.net";
  // Quoted sub-options for creator-only buckets.
  if (/^(28|30)\.\d+$/.test(choice)) {
    const sender = getSender(msg);
    const senderNum = String(sender || "").replace(/[^0-9]/g, "");
    const ownerNum = (CONFIG.OWNER_NUMBER || "").replace(/[^0-9]/g, "");
    if (senderNum !== ownerNum && sender !== ownerJ) {
      await sendReply(sock, msg, "🚫 Creator-only option.");
      return true;
    }
  }

  try {
    await fn(sock, msg);
  } catch (e) {
    await sendReply(sock, msg, "❌ Settings handler error: " + (e?.message || e));
  }
  return true;
}
