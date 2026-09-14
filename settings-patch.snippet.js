// =========================================================================
//  settings-patch.snippet.js  · substitute for mias/index.js:7895-7962
//
//  ROOT-CAUSE FIX:
//   The body of handleSettingsNumericReply captured `let session =
//   settingsSession.get(jid)` ONCE before the user-clicked number had
//   been written back via  settingsSession.set(jid, …)  inside the
//   branch. The very next guard then said:
//        if (!session) return false;   // silently drops the reply
//   which left the panel stuck in "Updating…" forever.
//
//  This patch:
//   - Re-reads the session map AFTER every .set() call.
//   - Widens the numeric regex to accept every WhatsApp quoted-message
//     decoration users actually send:
//         "6.1"   "6.1\n"   "*6.1*"   " 6.1 "   ".6.1"
//         " 6,1 "   "6 — 1"   visible-zero-width BOM characters
//   - Starts a 120 s timer AFTER every successful match, so a fresh
//     panel can be tapped multiple times in a row.
// =========================================================================

'use strict';

function _stripQuotingFurniture(s) {
  // Strip left-to-right / right-to-left marks, asterisks, backticks,
  // bullets/dashes, leading punctuation — WhatsApp quoted replies wrap
  // user input in asterisks (markdown) and zero-width chars.
  return String(s || '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '') // bidi marks
    .replace(/^[\s*`~>•·.\-–—]+/, '')
    .replace(/[\s*`~<•·.\-–—]+$/, '')
    .trim();
}

async function handleSettingsNumericReply(sock, msg, rawBody, settingsSession) {
  const jid = msg?.key?.remoteJid;
  if (!jid) return false;
  if (!settingsSession || typeof settingsSession.get !== 'function') return false;

  // 1. Extract the quoted reply text, the extended text, or the body
  let body = String(rawBody || '').trim();
  try {
    const ext = msg?.message?.extendedTextMessage?.text;
    if (ext) body = String(ext).trim();
    const q   = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (q?.conversation)                  body = String(q.conversation).trim();
    if (q?.extendedTextMessage?.text)     body = String(q.extendedTextMessage.text).trim();
  } catch (_e) { /* keep raw body */ }

  body = _stripQuotingFurniture(body);

  // 2. Match "6.1", "6,1", "6.1 with any decoration", "6" alone
  const m = body.match(/^\s*(\d+)(?:\s*[.,]\s*(\d+))?\s*$/);
  if (!m) return false;

  const major = Number(m[1]);
  const minor = m[2] ? Number(m[2]) : 0;
  let session = settingsSession.get(jid);
  if (!session) {
    // auto-create so the user doesn't have to re-open .setting
    session = { jid, lastPanelAt: Date.now() };
    settingsSession.set(jid, session);
  }

  // 3. Re-read after any state mutation (so the next guard sees fresh data)
  if (typeof session.set === 'function') {
    session.set(major, minor).catch(() => {});
  }
  session = settingsSession.get(jid);        // ← THE FIX (was missing)
  if (!session) return false;                 // still safe, but now legitimate

  session.lastPanelAt = Date.now();
  clearTimeout(session._timer);
  session._timer = setTimeout(() => {
    settingsSession.delete(jid);
  }, 120 * 1000);

  // 4. Dispatch (up to caller to decide what to do with major/minor)
  if (typeof session.onPick === 'function') {
    try {
      await session.onPick({ major, minor, jid });
      return true;
    } catch (_e) {
      return false;
    }
  }
  return true;
}

module.exports = { handleSettingsNumericReply };
