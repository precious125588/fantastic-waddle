/* ══════════════════════════════════════════════════════════════════════════
   precious-gst-picker.cjs · GST — GROUP-ONLY (DM logic removed)
   ──────────────────────────────────────────────────────────────────────────
   WHAT CHANGED (v25):
     • .gst / .gstatus / .groupstatus / .gcstatus are KEPT — the command is
       NOT deleted anymore. It posts media/text to the group status ring.
     • The DM logic is REMOVED: no more native group picker in DM, no more
       .gstpick / .gstcancel commands, no DM session state.
     • In a DM the bot now just tells you to run it inside the group.
     • The group posting engine (native groupStatusMessageV2 envelope with a
       plain status@broadcast fallback) is untouched.

   API USED: Baileys built-ins only — no external API.
   ══════════════════════════════════════════════════════════════════════════ */

'use strict';

module.exports = {
  install(ctx) {
    const report = { gstGroupOnly: false };
    try {
      const { cmd, CONFIG, sendReply, react, forceReaction } = ctx;
      const PREFIX = (CONFIG && CONFIG.PREFIX) || '.';
      const safeReact = (sock, msg, emoji) => {
        try { const fn = forceReaction || react; return fn(sock, msg, emoji); } catch { return Promise.resolve(); }
      };
      const isGroupJid = (jid) => /@g\.us$/i.test(String(jid || ''));

      async function downloadBuf(raw, kind) {
        try {
          const mod = await import('@whiskeysockets/baileys');
          const dl = mod.downloadContentFromMessage || (mod.default && mod.default.downloadContentFromMessage);
          if (typeof dl !== 'function') return null;
          const stream = await dl(raw, kind);
          const chunks = [];
          for await (const c of stream) chunks.push(c);
          return Buffer.concat(chunks);
        } catch { return null; }
      }

      function innerMedia(m) {
        if (!m || typeof m !== 'object') return null;
        const u = m.ephemeralMessage?.message
          || m.viewOnceMessage?.message
          || m.viewOnceMessageV2?.message
          || m.documentWithCaptionMessage?.message
          || m;
        if (u.imageMessage) return { kind: 'image', raw: u.imageMessage, caption: u.imageMessage.caption || '' };
        if (u.videoMessage) return { kind: 'video', raw: u.videoMessage, caption: u.videoMessage.caption || '' };
        if (u.audioMessage) return { kind: 'audio', raw: u.audioMessage, caption: '' };
        if (u.documentMessage) return { kind: 'document', raw: u.documentMessage, caption: u.documentMessage.caption || '' };
        if (u.stickerMessage) return { kind: 'sticker', raw: u.stickerMessage, caption: '' };
        const q = m.extendedTextMessage?.contextInfo?.quotedMessage;
        if (q) return innerMedia(q);
        return null;
      }

      async function groupMembers(sock, groupId) {
        try {
          const meta = await sock.groupMetadata(groupId);
          return (meta.participants || []).map((p) => String(p.id || '')).filter((j) => /@s\.whatsapp\.net$/.test(j));
        } catch {
          try { return [String(sock.user?.id || '').split(':')[0] + '@s.whatsapp.net'].filter(Boolean); } catch { return []; }
        }
      }

      async function uploadAndRelay(sock, groupId, payload) {
        const memberJids = await groupMembers(sock, groupId);
        const opts = memberJids.length ? { statusJidList: memberJids } : {};

        // Path 1 — native group status envelope (best quality, native ring)
        try {
          const mod = await import('@whiskeysockets/baileys');
          let g = mod.generateWAMessageContent;
          if (typeof g !== 'function' && ctx.generateWAMessageContent) g = ctx.generateWAMessageContent;
          if (typeof g === 'function') {
            const upload = typeof sock.waUploadToServer === 'function' ? sock.waUploadToServer.bind(sock) : undefined;
            let inner = null;
            if (payload.kind === 'text') inner = await g({ text: payload.text || '' }, upload ? { upload } : {});
            else if (payload.kind === 'image') inner = await g({ image: payload.buf, caption: payload.caption || '' }, upload ? { upload } : {});
            else if (payload.kind === 'video') inner = await g({ video: payload.buf, caption: payload.caption || '', mimetype: 'video/mp4' }, upload ? { upload } : {});
            else if (payload.kind === 'audio') inner = await g({ audio: payload.buf, mimetype: 'audio/ogg; codecs=opus', ptt: false }, upload ? { upload } : {});
            else if (payload.kind === 'sticker') inner = await g({ sticker: payload.buf }, upload ? { upload } : {});
            if (inner) {
              await sock.relayMessage('status@broadcast', { groupStatusMessageV2: { message: inner } }, {
                ...opts,
                messageId: 'MIASG' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase(),
              });
              return true;
            }
          }
        } catch {}

        // Path 2 — plain status@broadcast send (fallback)
        try {
          if (payload.kind === 'text') await sock.sendMessage('status@broadcast', { text: payload.text || '' }, opts);
          else if (payload.kind === 'image') await sock.sendMessage('status@broadcast', { image: payload.buf, caption: payload.caption || '' }, opts);
          else if (payload.kind === 'video') await sock.sendMessage('status@broadcast', { video: payload.buf, caption: payload.caption || '', mimetype: 'video/mp4' }, opts);
          else if (payload.kind === 'audio') await sock.sendMessage('status@broadcast', { audio: payload.buf, mimetype: 'audio/ogg; codecs=opus', ptt: false }, opts);
          else if (payload.kind === 'sticker') await sock.sendMessage('status@broadcast', { sticker: payload.buf }, opts);
          return true;
        } catch { return false; }
      }

      async function buildPayload(msg) {
        const inner = innerMedia(msg.message || {});
        const text = (msg.message?.extendedTextMessage?.text || msg.message?.conversation || '').trim();
        if (!inner) {
          if (!text) return { error: `📢 *Group Status*\n\nUsage: *${PREFIX}gst <text>* — or reply to an image/video/audio to post it to this group's status ring.` };
          return { kind: 'text', text };
        }
        const buf = await downloadBuf(inner.raw, inner.kind === 'document' ? 'document' : inner.kind);
        if (!buf || buf.length < 10) return { error: '❌ Could not download the media — it may have expired. Send it again and retry.' };
        return { kind: inner.kind, buf, caption: inner.caption || text || undefined };
      }

      const gstHandler = async (sock, msg, args) => {
        const chat = msg.key.remoteJid;

        // ── DM logic REMOVED — gst is for group status posts only ─────────
        if (!isGroupJid(chat)) {
          return sendReply(sock, msg, `👥 *Group Status* works inside groups only.\n\nOpen the group you want to post to and run *${PREFIX}gst* there.`);
        }

        let settled = false;
        const reactOnce = async (emoji) => { if (settled) return; settled = true; try { await safeReact(sock, msg, emoji); } catch {} };
        await reactOnce('🌀'); settled = false;
        const watchdog = setTimeout(() => reactOnce('❌'), 120000);
        try {
          const payload = await buildPayload(msg);
          if (payload.error) {
            clearTimeout(watchdog);
            await reactOnce('❌');
            return sendReply(sock, msg, payload.error);
          }
          const ok = await uploadAndRelay(sock, chat, payload);
          clearTimeout(watchdog);
          await reactOnce(ok ? '✅' : '❌');
          return sendReply(sock, msg, ok ? '✅ Posted to group status.' : '❌ Failed to post group status — check bot logs.').catch(() => {});
        } catch (e) {
          clearTimeout(watchdog);
          await reactOnce('❌');
          await sendReply(sock, msg, `❌ Group status failed: ${(e && e.message) || e}`).catch(() => {});
        }
      };

      const bind = (names, handler) => {
        try { cmd(names, { desc: 'Post to group status (group only)', category: 'GROUP' }, handler); } catch {}
        const list = Array.isArray(names) ? names : [names];
        for (const n of list) {
          try {
            const ex = (ctx.commands && ctx.commands.get(n)) || { desc: 'Group status', category: 'GROUP' };
            ex.handler = handler;
            if (ctx.commands) ctx.commands.set(n, ex);
          } catch {}
        }
      };

      bind(['gst', 'gstatus', 'groupstatus', 'gcstatus'], gstHandler);

      // Remove the old DM picker sub-commands if a stale build registered them.
      for (const n of ['gstpick', 'gstcancel']) {
        try { if (ctx.commands && ctx.commands.delete(n)) {} } catch {}
      }

      // Keep-alive: if any late patch re-registers .gst after this module runs,
      // re-assert the GROUP-ONLY handler so the DM picker can never come back.
      try {
        const _gstKeepAlive = setInterval(() => {
          try {
            if (!ctx.commands || typeof ctx.commands.get !== 'function') return;
            for (const n of ['gst', 'gstatus', 'groupstatus', 'gcstatus']) {
              const ex = ctx.commands.get(n);
              if (ex && ex.handler !== gstHandler) {
                ex.handler = gstHandler;
                ctx.commands.set(n, ex);
              }
            }
            for (const n of ['gstpick', 'gstcancel']) {
              try { ctx.commands.delete(n); } catch {}
            }
          } catch {}
        }, 2500);
        if (typeof _gstKeepAlive.unref === 'function') { try { _gstKeepAlive.unref(); } catch {} }
      } catch {}
      report.gstGroupOnly = true;
    } catch (e) {
      console.log('[precious-gst-picker] install error:', (e && e.message) || e);
    }
    return report;
  },
};
