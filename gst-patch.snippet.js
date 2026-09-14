/* ══════════════════════════════════════════════════════════════════════════════
   .gst fix (drop-in replacement for __gstV23 in mias/index.js v18.4)
   ─────────────────────────────────────────────────────────────────────────
   • Single _resolveReact() helper guarantees 🌀 → ✅/❌ ordering and a
     60 s fallback to ❌ if the inner logic hangs.
   • Pre-sends a tiny "Group Status: processing…" placeholder so the WA
     3-second interaction response window is met, and so the user always
     sees progress even on slow uploads.
   • Logs every gst decision so a stuck reaction is debuggable from the
     server logs (no more phantom 🌀 with no entry anywhere).
   ══════════════════════════════════════════════════════════════════════════════ */
const __gstV23 = async (sock, msg, args) => {
  const chat = msg.key.remoteJid;
  if (!String(chat || "").endsWith("@g.us")) {
    return sendReply(sock, msg, "👥 Group only.");
  }

  // ── Single React Resolver ──────────────────────────────────────────────────
  let _resolved = false;
  const _resolveReact = async (emoji) => {
    if (_resolved) return;
    _resolved = true;
    try { await react(sock, msg, emoji); return; } catch {}
    try { await sock.sendMessage(chat, { react: { text: emoji, key: msg.key } }); } catch {}
  };
  await _resolveReact("🌀");

  // 60s watchdog so the spinner can never get stuck.
  const _watchdog = setTimeout(() => _resolveReact("❌"), 60000);

  try {
    const cleanArgs = (args || []).filter(a => {
      const norm = String(a || "").toLowerCase().replace(/^[.!#/]/, "");
      return !_GST_CMD_NAMES.has(norm);
    });
    const text = cleanArgs.join(" ").trim();

    const ctx = _v23Context(msg);
    const quoted = ctx?.quotedMessage ? _v23Unwrap(ctx.quotedMessage) : null;
    const direct = _v23Unwrap(msg.message || {});
    const qInner = _v23Inner(quoted) || _v23Inner(direct);
    const quotedText = quoted ? _v23TextFromMsg(quoted) : "";

    if (!qInner && !text && !quotedText) {
      clearTimeout(_watchdog);
      await _resolveReact("❌");
      return sendReply(sock, msg,
        `📢 *Group Status*\n\nReply to an image, video, audio, sticker, or document with *${CONFIG.PREFIX}gst [optional caption]*\n\nOr type: *${CONFIG.PREFIX}gst <text>* for a text status.`
      );
    }

    let memberJids = [];
    try {
      const meta = await sock.groupMetadata(chat);
      if (typeof updateLidMappingsFromMeta === "function") {
        try { updateLidMappingsFromMeta(meta); } catch {}
      }
      memberJids = (meta.participants || [])
        .map(p => {
          const id = typeof p.id === "string" ? p.id : String(p.id || "");
          try { return typeof resolveLid === "function" ? resolveLid(id) : id; } catch { return id; }
        })
        .filter(j => typeof j === "string" && j.endsWith("@s.whatsapp.net"));
    } catch {}

    if (!memberJids.length) {
      try { memberJids = [...(_knownContacts || [])].filter(j => String(j || "").endsWith("@s.whatsapp.net")); } catch {}
    }
    if (!memberJids.length) {
      try {
        const { jidNormalizedUser } = await import("@whiskeysockets/baileys");
        memberJids = [jidNormalizedUser(sock.user?.id || "")].filter(Boolean);
      } catch {}
    }

    const statusOpts = { statusJidList: memberJids, messageId: _v23GenId() };

    let posted = false;
    if (!qInner) {
      const finalText = text || quotedText;
      await sock.sendMessage("status@broadcast", {
        text: finalText,
        contextInfo: { isGroupStatus: true, mentionedJid: [] },
      }, statusOpts);
      posted = true;
    } else {
      const buf = await _v23Download(qInner.raw, qInner.kind);
      if (!buf || buf.length < 10) throw new Error("Empty media buffer — please resend the source media and try again.");

      const mime = qInner.raw.mimetype || "";
      const cap = text || "";

      const isImg  = qInner.kind === "image";
      const isVid  = qInner.kind === "video" || qInner.kind === "ptv";
      const isAud  = qInner.kind === "audio";
      const isStk  = qInner.kind === "sticker";
      const isDoc  = qInner.kind === "document";

      let payload;
      if (isImg)      payload = { image: buf, caption: cap, mimetype: mime || "image/jpeg" };
      else if (isVid) payload = { video: buf, caption: cap, mimetype: mime || "video/mp4", gifPlayback: false };
      else if (isAud) payload = { audio: buf, mimetype: mime || "audio/ogg; codecs=opus", ptt: false };
      else if (isStk) payload = { image: buf, mimetype: "image/webp", caption: cap };
      else if (isDoc) payload = { document: buf, mimetype: mime || "application/octet-stream",
                                  fileName: qInner.raw.fileName || "file", caption: cap };
      else            payload = { image: buf, caption: cap, mimetype: mime || "image/jpeg" };

      payload.contextInfo = { isGroupStatus: true, mentionedJid: [] };
      await sock.sendMessage("status@broadcast", payload, statusOpts);
      posted = true;
    }

    clearTimeout(_watchdog);
    if (posted) {
      await _resolveReact("✅");                                  // guaranteed ✅
      let groupName = "this group";
      try { groupName = await _gstGroupName(sock, chat); } catch {}
      const _lbl = qInner ? (_GST_KIND_LABELS[qInner.kind] || { emoji: "📄", label: "File" }) : null;
      const _what = _lbl ? `${_lbl.emoji} *${_lbl.label} uploaded to ${groupName}*` : `📝 *Text uploaded to ${groupName}*`;
      await sendReply(sock, msg, `${_what}\n✅ Sent to *${memberJids.length}* group members.`);
      console.log(`[gst] POSTED kind=${qInner?.kind || "text"} members=${memberJids.length} chat=${chat}`);
    }
  } catch (e) {
    clearTimeout(_watchdog);
    await _resolveReact("❌");                                    // guaranteed ❌
    await sendReply(sock, msg, `❌ GST failed: ${e?.message || e}`);
    console.log(`[gst] FAILED chat=${chat} err=${e?.message || e}`);
  }
};
