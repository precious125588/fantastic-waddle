/* ══════════════════════════════════════════════════════════════════════════
   precious-gst-picker.cjs · GST NATIVE DM GROUP PICKER (installs LAST)
   ──────────────────────────────────────────────────────────────────────────
   WHY THIS FILE EXISTS:
     .gst is re-registered by many blocks (v15/v16/v18/v23/JINX) and some of
     those rebuilt it as GROUP-ONLY: in a DM you got "❌ Use in a group."
     instead of a picker. This module installs AFTER precious-fixes-v21 (the
     current tail) and re-pins .gst ONE FINAL TIME with:
       • In a group   → posts the status immediately (same as before).
       • In a DM      → drops a NATIVE WhatsApp picker listing every group
                        the bot has joined, so you tap your group and the
                        status posts through it.

   API USED: groupFetchAllParticipating() (Baileys built-in) — no external API.
   ══════════════════════════════════════════════════════════════════════════ */

'use strict';

module.exports = {
  install(ctx) {
    const report = { gstPicker: false };
    try {
      const { cmd, CONFIG, sendReply, react, forceReaction } = ctx;
      const PREFIX = (CONFIG && CONFIG.PREFIX) || '.';
      const safeReact = (sock, msg, emoji) => {
        try { const fn = forceReaction || react; return fn(sock, msg, emoji); } catch { return Promise.resolve(); }
      };
      const isGroupJid = (jid) => /@g\.us$/i.test(String(jid || ''));

      const STORE = new Map();
      const TTL = 10 * 60 * 1000;
      const getState = (jid) => {
        const s = STORE.get(jid);
        if (!s) return null;
        if (Date.now() - (s.ts || 0) > TTL) { STORE.delete(jid); return null; }
        return s;
      };
      const setState = (jid, s) => { s.ts = Date.now(); STORE.set(jid, s); };
      const clearState = (jid) => STORE.delete(jid);

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

      async function listJoinedGroups(sock) {
        const all = await sock.groupFetchAllParticipating().catch(() => ({}));
        return Object.values(all || {})
          .filter((g) => g && isGroupJid(g.id))
          .map((g) => ({ id: g.id, subject: g.subject || g.name || g.id }))
          .sort((a, b) => String(a.subject).localeCompare(String(b.subject)));
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
          if (!text) return { error: `📢 *Group Status*\n\nUsage: *${PREFIX}gst <text>* — or reply to an image/video/audio to post it to a group's status ring.` };
          return { kind: 'text', text };
        }
        const buf = await downloadBuf(inner.raw, inner.kind === 'document' ? 'document' : inner.kind);
        if (!buf || buf.length < 10) return { error: '❌ Could not download the media — it may have expired. Send it again and retry.' };
        return { kind: inner.kind, buf, caption: inner.caption || text || undefined };
      }

      const gstPick = async (sock, msg, args) => {
        const chat = msg.key.remoteJid;
        const st = getState(chat);
        const idx = Number(String((args || []).join(' ').trim() || ''));
        if (!st || st.stage !== 'pick') return sendReply(sock, msg, `❌ That GST picker expired. Run *${PREFIX}gst* again.`);
        const g = st.groups[Number.isInteger(idx) ? idx - 1 : -1];
        if (!g) return sendReply(sock, msg, '❌ Invalid group number.');
        clearState(chat);
        await sendReply(sock, msg, `⏳ Posting to *${String(g.subject).slice(0, 60)}* status ...`).catch(() => {});
        try {
          const ok = await uploadAndRelay(sock, g.id, st.payload);
          await safeReact(sock, msg, ok ? '✅' : '❌');
          if (!ok) await sendReply(sock, msg, '❌ Failed to post group status — check bot logs.').catch(() => {});
        } catch (e) {
          await safeReact(sock, msg, '❌');
          await sendReply(sock, msg, `❌ Group status failed: ${(e && e.message) || e}`).catch(() => {});
        }
      };

      const gstCancel = async (sock, msg) => {
        clearState(msg.key.remoteJid);
        return safeReact(sock, msg, '👍');
      };

      const gstHandler = async (sock, msg, args) => {
        const chat = msg.key.remoteJid;
        const inGroup = isGroupJid(chat);
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
          if (inGroup) {
            // Groups post immediately — no picker in a group.
            const ok = await uploadAndRelay(sock, chat, payload);
            clearTimeout(watchdog);
            await reactOnce(ok ? '✅' : '❌');
            return sendReply(sock, msg, ok ? '✅ Posted to group status.' : '❌ Failed to post group status — check bot logs.').catch(() => {});
          }
          // DM → NATIVE group picker (the "use this in a group" blocker is gone).
          const groups = await listJoinedGroups(sock);
          if (!groups.length) {
            clearTimeout(watchdog);
            await reactOnce('❌');
            return sendReply(sock, msg, '❌ No joined groups found — the bot needs to be in at least one group to post a group status.');
          }
          setState(chat, { stage: 'pick', groups, payload });
          const rows = groups.slice(0, 50).map((g, i) => ({
            id: `${PREFIX}gstpick ${i + 1}`,
            rowId: `${PREFIX}gstpick ${i + 1}`,
            title: `${i + 1}. ${String(g.subject).slice(0, 60)}`,
            description: g.id,
          }));
          const body = '📢 *Group Status*\n\nPick the group you want to post this status to.';
          const plainFallback = body + '\n\n' + groups.map((g, i) => `${i + 1}. ${g.subject}`).join('\n') + `\n\nReply *${PREFIX}gstpick <number>* to pick.`;
          if (typeof ctx.sendNativeFlowListMenu === 'function') {
            try {
              await ctx.sendNativeFlowListMenu(sock, chat, msg, body, [{ title: 'Your Groups', rows }], [{ text: '❌ Cancel', id: `${PREFIX}gstcancel` }]);
            } catch (_nf) {
              // If the native menu fails to render, never leave the user with
              // silence — send a plain numbered list they can reply to.
              await sendReply(sock, msg, plainFallback).catch(() => {});
            }
          } else {
            await sendReply(sock, msg, plainFallback);
          }
          clearTimeout(watchdog);
          await reactOnce('✅');
          return;
        } catch (e) {
          clearTimeout(watchdog);
          await reactOnce('❌');
          await sendReply(sock, msg, `❌ Group status failed: ${(e && e.message) || e}`).catch(() => {});
        }
      };

      const bind = (names, handler) => {
        try { cmd(names, { desc: 'Post to group status — native group picker in DM', category: 'GROUP' }, handler); } catch {}
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
      bind(['gstpick'], gstPick);
      bind(['gstcancel'], gstCancel);

      // Keep-alive: some late patches re-register .gst AFTER this module runs
      // (async installs / setInterval re-binds, e.g. precious-v21's own poller).
      // Re-assert our handler every 2.5s so a DM picker can never be silently
      // replaced by a group-only handler again.
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
          } catch {}
        }, 2500);
        if (typeof _gstKeepAlive.unref === 'function') { try { _gstKeepAlive.unref(); } catch {} }
      } catch {}
      report.gstPicker = true;
    } catch (e) {
      console.log('[precious-gst-picker] install error:', (e && e.message) || e);
    }
    return report;
  },
};
