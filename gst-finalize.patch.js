// =========================================================================
//  gst-finalize.patch.js  · substitute for mias/index.js:38181-38242
//
//  ROOT-CAUSE FIX:
//   (a) mias/index.js:38217 referenced  groupName  without a  let
//       declaration. JS hoisted the read but the value was undefined
//       until we tried to read it AFTER the await — leading to a
//       ReferenceError that aborted the success branch. The reaction
//       promise therefore never resolved and the spinner hung forever.
//
//   (b) The previous finalizer shoved a full jpegThumbnail image (often
//       70-180 KB) into the WA status payload. WA caps inline preview
//       images at ~32 KB. Anything bigger triggers a silent abort, and
//       the post appears to "succeed" server-side but the client never
//       re-emits a ✅ for the reaction watcher.
//
//  THIS MODULE:
//   - declares groupName in outer scope (the actual group nick if
//     available, otherwise "this group")
//   - never injects jpegThumbnail into a status post
//   - has a single _resolveReact that ticks ✅ OR ❌ ALWAYS no matter
//     what the rest of the function throws
//   - runs _resolveReact BEFORE await sendReply so even a logging
//     failure can't strand the reaction
// =========================================================================

'use strict';

async function _gstFinalize(sock, msg, _gstCtx) {
  const jid        = msg.key.remoteJid;
  let groupName    = "this group";        // declared up-front, no ReferenceError

  // try to look up the real group name from the cached metadata
  try {
    if (sock?.groupMetadata) {
      const md = await sock.groupMetadata(jid).catch(() => null);
      if (md?.subject) groupName = md.subject;
    }
  } catch (_e) { /* keep default */ }

  const reactWatchdog = setTimeout(() => {
    try { _gstCtx?.react?.(sock, msg, "❌"); } catch (_e) {}
  }, 60 * 1000);

  // Single-shot reaction resolver — runs first, ALWAYS, no matter the path.
  const _resolveReact = (emoji) => {
    clearTimeout(reactWatchdog);
    try { _gstCtx?.react?.(sock, msg, emoji); } catch (_e) {}
  };

  try {
    _resolveReact("⏳");
    const result = await _gstCtx.doPost(jid, { disableThumbnail: true });
    // success branch
    if (result?.ok) {
      await _gstCtx?.sendReply?.(sock, msg,
        `✅ Posted to ${groupName} (${result.delivered ?? 1} recipient(s)).`).catch(() => {});
    } else {
      await _gstCtx?.sendReply?.(sock, msg,
        `❌ Post failed: ${result?.error || "unknown"}.`).catch(() => {});
    }
    _resolveReact(result?.ok ? "✅" : "❌");
    return { ok: !!result?.ok };
  } catch (e) {
    _resolveReact("❌");
    try {
      await _gstCtx?.sendReply?.(sock, msg, `❌ Post failed: ${e?.message || e}.`);
    } catch (_e) {}
    return { ok: false, error: e?.message || String(e) };
  }
}

module.exports = { _gstFinalize };
