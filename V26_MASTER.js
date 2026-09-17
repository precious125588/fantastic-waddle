
// ════════════════════════════════════════════════════════════════════════════
// LATE-PATCH v26 — MASTER FIX PACK (PRECIOUS)
// Fixes: TT picker silence, settings numeric replies, AI commands (David Cyril
// API), pin/unpin (24h/7d/30d message pins), channel commands, .clear, video
// 403, chatbot everywhere, autoread, admin detection, movie/nkiri quote logic.
// ════════════════════════════════════════════════════════════════════════════
(() => {
  const DC = "https://apis.davidcyril.name.ng";
  const log = (...a) => { try { console.log("[v26]", ...a); } catch {} };

  // ── shared: extract text from a quoted (replied-to) message ───────────
  function __v26QuotedText(msg) {
    try {
      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
             || msg.message?.imageMessage?.contextInfo?.quotedMessage
             || msg.message?.videoMessage?.contextInfo?.quotedMessage;
      if (!q) return "";
      return String(q.conversation || q.extendedTextMessage?.text
        || q.imageMessage?.caption || q.videoMessage?.caption
        || q.documentMessage?.caption || "").trim();
    } catch { return ""; }
  }

  // ══ 1. DAVID CYRIL AI CORE ════════════════════════════════════════════
  async function dcAI(prompt, model = "gpt-4o") {
    const chain = [model, "gpt-4o", "gpt-5.1-instant", "gemini-3.1-flash-lite", "deepseek-v4-flash", "llama-4-maverick"];
    const seen = new Set();
    for (const m of chain) {
      if (!m || seen.has(m)) continue; seen.add(m);
      try {
        const { data } = await axios.get(`${DC}/ai/${m}`, {
          params: { prompt: String(prompt).slice(0, 4000) },
          timeout: 30000, headers: { Accept: "application/json" },
        });
        const out = data?.data || data?.result || data?.response || data?.answer;
        if (data?.success && typeof out === "string" && out.trim()) return out;
      } catch {}
    }
    return null;
  }
  globalThis.__dcAI = dcAI;
  // Re-point the legacy freeAI chain at DC so EVERY old AI path (incl. the
  // auto-chatbot's final fallback) is powered by the new API.
  try {
    freeAI = async (prompt) => (await dcAI(prompt, "gpt-4o")) || null;
  } catch {}

  // ══ 2. DELETE OLD AI CATEGORY + REGISTER NEW AI COMMANDS ══════════════
  try {
    for (const [name, entry] of [...commands.entries()]) {
      if (String(entry?.category || "").toUpperCase() === "AI") commands.delete(name);
    }
  } catch {}
  const AI_MODELS = [
    [["ai", "gpt", "gpt4", "ask", "chat"], "gpt-4o", "GPT-4o"],
    [["gpt5"], "gpt-5", "GPT-5"],
    [["claude", "sonnet"], "claude-sonnet-4.6", "Claude Sonnet 4.6"],
    [["gemini"], "gemini-3.1-flash-lite", "Gemini 3.1 Flash"],
    [["geminipro"], "gemini-3.1-pro", "Gemini 3.1 Pro"],
    [["deepseek", "ds"], "deepseek-v3.2-thinking", "DeepSeek v3.2"],
    [["llama"], "llama-4-maverick", "Llama 4 Maverick"],
    [["kimi"], "kimi-k2.6", "Kimi K2.6"],
    [["grok"], "grok-4.1-fast", "Grok 4.1 Fast"],
    [["qwen"], "qwen3-max", "Qwen3 Max"],
    [["nova"], "nova", "Nova"],
  ];
  for (const [names, model, label] of AI_MODELS) {
    cmd(names, { desc: `Chat with ${label} — ${CONFIG.PREFIX}${names[0]} <prompt>`, category: "AI" }, async (sock, msg, args) => {
      const q = args.join(" ").trim() || __v26QuotedText(msg);
      if (!q) { await sendReply(sock, msg, `🤖 *${label}*\n\nUsage: ${CONFIG.PREFIX}${names[0]} <your question>`); return; }
      await react(sock, msg, "🤖");
      const out = await dcAI(q, model);
      if (out) await sendReply(sock, msg, `🤖 *${label}*\n\n${out}`.slice(0, 4000));
      else await sendReply(sock, msg, `❌ ${label} is busy right now. Try again in a moment.`);
    });
  }
  // Refresh the AI section of the public menu
  try {
    const aiCat = (typeof MENU_CATEGORIES !== "undefined") ? MENU_CATEGORIES.find(c => /^\s*ai\b/i.test(c.name || "")) : null;
    if (aiCat) aiCat.cmds = ["ai", "gpt", "gpt5", "claude", "gemini", "geminipro", "deepseek", "llama", "kimi", "grok", "qwen", "nova", "chatbot"];
  } catch {}

  // ══ 3. PIN / UNPIN — message pins with 24h / 7d / 30d, chat-pin fallback ═
  const PIN_DURATIONS = {
    "24h": 86400, "24hr": 86400, "24hrs": 86400, "24hours": 86400, "1d": 86400, "day": 86400,
    "7d": 604800, "7days": 604800, "week": 604800,
    "30d": 2592000, "30days": 2592000, "month": 2592000,
  };
  function __v26PinKey(msg) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo
             || msg.message?.imageMessage?.contextInfo
             || msg.message?.videoMessage?.contextInfo
             || msg.message?.documentMessage?.contextInfo;
    if (!ctx?.stanzaId) return null;
    return { remoteJid: msg.key.remoteJid, fromMe: !!ctx.fromMe, id: ctx.stanzaId, participant: ctx.participant || undefined };
  }
  const __v26Pin = async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const key = __v26PinKey(msg);
    const dur = PIN_DURATIONS[String(args?.[0] || "").toLowerCase()] || 604800;
    const durLabel = dur === 86400 ? "24 hours" : dur === 604800 ? "7 days" : "30 days";
    if (key) {
      let done = false, lastErr = "";
      for (const payload of [
        { pin: key, type: 1, time: dur },
        { pinInChat: { key, type: 1, senderTimestampMs: Date.now(), messageContextInfo: { messageAddOnDurationInSecs: dur } } },
        { pinInChat: { key, type: 1, senderTimestampMs: Date.now() } },
      ]) {
        try { await sock.sendMessage(jid, payload); done = true; break; }
        catch (e) { lastErr = e?.message || String(e); }
      }
      if (done) { await react(sock, msg, "📌"); await sendReply(sock, msg, `📌 *Message pinned for ${durLabel}!*`); }
      else await sendReply(sock, msg, `❌ Pin failed: ${lastErr}`);
      return;
    }
    // No quoted message → pin the chat itself
    try {
      await sock.chatModify({ pin: Math.floor(Date.now() / 1000) }, jid);
      await react(sock, msg, "📌");
      await sendReply(sock, msg, "📌 *Chat pinned!*");
    } catch (e) { await sendReply(sock, msg, `❌ Pin failed: ${e?.message || e}`); }
  };
  const __v26Unpin = async (sock, msg) => {
    const jid = msg.key.remoteJid;
    const key = __v26PinKey(msg);
    if (key) {
      let done = false, lastErr = "";
      for (const payload of [
        { pin: key, type: 2, time: 0 },
        { pinInChat: { key, type: 2, senderTimestampMs: Date.now() } },
      ]) {
        try { await sock.sendMessage(jid, payload); done = true; break; }
        catch (e) { lastErr = e?.message || String(e); }
      }
      if (done) { await react(sock, msg, "📌"); await sendReply(sock, msg, "📌 *Message unpinned!*"); }
      else await sendReply(sock, msg, `❌ Unpin failed: ${lastErr}`);
      return;
    }
    try {
      await sock.chatModify({ pin: false }, jid);
      await react(sock, msg, "📌");
      await sendReply(sock, msg, "📌 *Chat unpinned!*");
    } catch (e) { await sendReply(sock, msg, `❌ Unpin failed: ${e?.message || e}`); }
  };
  for (const n of ["pin"]) {
    const ex = commands.get(n) || { category: "WHATSAPP" };
    ex.handler = __v26Pin;
    ex.desc = `Pin replied message (24h/7d/30d) — ${CONFIG.PREFIX}pin [24h|7d|30d] (reply to a message)`;
    commands.set(n, ex);
  }
  for (const n of ["unpin"]) {
    const ex = commands.get(n) || { category: "WHATSAPP" };
    ex.handler = __v26Unpin;
    ex.desc = "Unpin replied message (or chat if no reply)";
    commands.set(n, ex);
  }

  // ══ 4. CHANNEL COMMANDS (real implementations, no stubs) ══════════════
  function __v26ChannelParse(text) {
    const m = String(text || "").match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)(?:\/(\d+))?/i)
           || String(text || "").trim().match(/^([A-Za-z0-9_-]{15,})(?:\s+(\d+))?$/);
    if (!m) return { jid: null, code: null, postId: null };
    return { jid: m[1] + "@newsletter", code: m[1], postId: m[2] || null };
  }
  async function __v26ChannelMeta(sock, parsed) {
    try { return await sock.newsletterMetadata("invite", parsed.code); } catch {}
    try { return await sock.newsletterMetadata("jid", parsed.jid); } catch {}
    return null;
  }
  cmd(["channelinfo", "chinfo", "chninfo", "channel"], { desc: `Channel info — ${CONFIG.PREFIX}channelinfo <channel-link>`, category: "WHATSAPP" }, async (sock, msg, args) => {
    const p = __v26ChannelParse(args.join(" ") || __v26QuotedText(msg));
    if (!p.code) { await sendReply(sock, msg, `📢 *Channel Info*\n\nUsage: ${CONFIG.PREFIX}channelinfo <channel-link>\nExample: ${CONFIG.PREFIX}channelinfo https://whatsapp.com/channel/0029VaXxxx`); return; }
    await react(sock, msg, "📢");
    try {
      const meta = await __v26ChannelMeta(sock, p);
      if (!meta) { await sendReply(sock, msg, "❌ Could not fetch channel info. Make sure the link is valid and the channel is public."); return; }
      const name = meta.name || meta.threadMetadata?.name?.text || "Unknown";
      const desc = meta.description || meta.threadMetadata?.description?.text || "No description";
      const subs = meta.subscribers ?? meta.subscriber_count ?? "N/A";
      await sendReply(sock, msg, `📢 *${name}*\n\n📝 ${String(desc).slice(0, 500)}\n👥 *Subscribers:* ${subs}\n🆔 \`${p.jid}\``);
    } catch (e) { await sendReply(sock, msg, `❌ Channel info error: ${e?.message || e}`); }
  });
  cmd(["channelreact", "chnreact", "creact", "reactchannel", "creactchannel", "channelreactlink"], { desc: `React to a channel post — ${CONFIG.PREFIX}channelreact <post-link> <emoji>`, category: "WHATSAPP" }, async (sock, msg, args) => {
    const raw = args.join(" ").trim() || __v26QuotedText(msg);
    const emojiM = raw.match(/(\p{Extended_Pictographic}|\p{Emoji})\s*$/u);
    const emoji = emojiM ? emojiM[0] : "❤️";
    const p = __v26ChannelParse(raw);
    if (!p.code || !p.postId) { await sendReply(sock, msg, `📢 *Channel React*\n\nUsage: ${CONFIG.PREFIX}channelreact <channel-post-link> [emoji]\nExample: ${CONFIG.PREFIX}channelreact https://whatsapp.com/channel/0029VaXxxx/123 🔥`); return; }
    await react(sock, msg, "📢");
    try {
      let ok = false, lastErr = "";
      try { await sock.newsletterReactMessage(p.jid, p.postId, emoji); ok = true; } catch (e) { lastErr = e?.message || String(e); }
      if (!ok) {
        try {
          await sock.sendMessage(p.jid, { react: { text: emoji, key: { remoteJid: p.jid, id: p.postId, fromMe: false } } });
          ok = true;
        } catch (e) { lastErr = e?.message || String(e); }
      }
      if (ok) await sendReply(sock, msg, `✅ Reacted ${emoji} to the channel post.`);
      else await sendReply(sock, msg, `❌ Reaction failed: ${lastErr}\n_Make sure you follow the channel._`);
    } catch (e) { await sendReply(sock, msg, `❌ Channel react error: ${e?.message || e}`); }
  });
  cmd(["channelstats"], { desc: `Channel stats — ${CONFIG.PREFIX}channelstats <channel-link>`, category: "WHATSAPP" }, async (sock, msg, args) => {
    const p = __v26ChannelParse(args.join(" ") || __v26QuotedText(msg));
    if (!p.code) { await sendReply(sock, msg, `📊 Usage: ${CONFIG.PREFIX}channelstats <channel-link>`); return; }
    await react(sock, msg, "📊");
    try {
      const meta = await __v26ChannelMeta(sock, p);
      if (!meta) { await sendReply(sock, msg, "❌ Could not fetch channel stats."); return; }
      const subs = meta.subscribers ?? meta.subscriber_count ?? "N/A";
      const created = meta.creation_time ? new Date(Number(meta.creation_time) * 1000).toDateString() : "N/A";
      const verified = meta.verification || meta.verified || "N/A";
      await sendReply(sock, msg, `📊 *Channel Stats*\n\n📢 *Name:* ${meta.name || "Unknown"}\n👥 *Subscribers:* ${subs}\n📅 *Created:* ${created}\n✔️ *Verification:* ${verified}\n🆔 \`${p.jid}\``);
    } catch (e) { await sendReply(sock, msg, `❌ Channel stats error: ${e?.message || e}`); }
  });
  cmd(["channelupdate", "cupdate"], { desc: `Post to your channel — ${CONFIG.PREFIX}cupdate <channel-link> <text>`, category: "WHATSAPP" }, async (sock, msg, args) => {
    const raw = args.join(" ").trim();
    const p = __v26ChannelParse(raw);
    const text = raw.replace(/https?:\/\/whatsapp\.com\/channel\/\S+/i, "").trim() || __v26QuotedText(msg);
    if (!p.code || !text) { await sendReply(sock, msg, `📢 *Channel Update*\n\nUsage: ${CONFIG.PREFIX}cupdate <your-channel-link> <text>`); return; }
    await react(sock, msg, "📢");
    try {
      await sock.sendMessage(p.jid, { text });
      await sendReply(sock, msg, "✅ Posted to the channel.");
    } catch (e) { await sendReply(sock, msg, `❌ Channel update failed: ${e?.message || e}\n_The bot must be an admin/owner of the channel._`); }
  });

  // ══ 5. .clear — clear the current chat ════════════════════════════════
  cmd(["clear", "clearchat"], { desc: "Clear this chat's messages", category: "WHATSAPP" }, async (sock, msg) => {
    const jid = msg.key.remoteJid;
    await react(sock, msg, "🧹");
    const ts = Math.floor(Date.now() / 1000);
    let done = false, lastErr = "";
    for (const payload of [
      { delete: true, lastMessages: [{ key: msg.key, messageTimestamp: ts }] },
      { delete: true, lastMessages: [] },
    ]) {
      try { await sock.chatModify(payload, jid); done = true; break; }
      catch (e) { lastErr = e?.message || String(e); }
    }
    if (done) await sendReply(sock, msg, "🧹 *Chat cleared!*");
    else await sendReply(sock, msg, `❌ Clear failed: ${lastErr}\n_This needs an active app-state sync; try again after a few messages._`);
  });

  // ══ 6. VIDEO — fixed provider chain with proper headers (kills 403) ═══
  cmd(["video", "yt", "ytdl", "videodl", "viddl"], { desc: `Download video — ${CONFIG.PREFIX}video <name/URL>`, category: "DOWNLOAD" }, async (sock, msg, args) => {
    if (!args.length) { const qt = __v26QuotedText(msg); if (qt) args = qt.split(/\s+/); }
    if (!args.length) { await sendReply(sock, msg, `📹 *Video Download*\n\nUsage: ${CONFIG.PREFIX}video <song/video name or YouTube link>\n_You can also reply to a message containing the name/link._`); return; }
    const jid = msg.key.remoteJid;
    const q = args.join(" ").trim();
    await react(sock, msg, "📹");
    try {
      let url = /^https?:\/\//i.test(q) ? q : null;
      let title = q;
      if (!url) {
        const { data } = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" }, timeout: 15000,
        });
        const vid = String(data).match(/"videoId":"([a-zA-Z0-9_-]{11})"/)?.[1];
        if (!vid) { await sendReply(sock, msg, `❌ No results for *${q}*.`); return; }
        url = `https://www.youtube.com/watch?v=${vid}`;
      }
      let dl = null;
      const providers = [
        async () => { const { data } = await axios.get(`${DC}/download/ytmp4`, { params: { url }, timeout: 45000 }); const d = data?.result || data?.data || data; return d?.download_url || d?.url || d?.dl || d?.video; },
        async () => { const { data } = await axios.get(`https://api.davidcyril.name.ng/download/ytmp4`, { params: { url }, timeout: 45000 }); const d = data?.result || data?.data || data; return d?.download_url || d?.url; },
        async () => { const { data } = await axios.get(`https://api.nexoracle.com/downloader/ytmp4`, { params: { apikey: "free_key@maher_apis", url }, timeout: 45000 }); return data?.result?.download_url || data?.result?.url || data?.download_url; },
        async () => { const r = await prexzyGet("/download/ytmp4", { url }, 45000); return r.data?.data?.url || r.data?.url || r.data?.download; },
      ];
      for (const p of providers) { try { dl = await p(); if (dl) break; } catch {} }
      if (!dl) { await sendReply(sock, msg, `❌ All video providers are busy for *${title}*. Try again shortly.`); return; }
      const buf = Buffer.from((await axios.get(dl, {
        responseType: "arraybuffer", timeout: 120000, maxRedirects: 5,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Referer: "https://www.youtube.com/" },
      })).data);
      if (!buf || buf.length < 20000) { await sendReply(sock, msg, "❌ Provider returned an invalid file. Try again."); return; }
      const cap = `📹 *${String(title).slice(0, 120)}*`;
      if (buf.length > 60 * 1024 * 1024) await sock.sendMessage(jid, { document: buf, fileName: "video.mp4", mimetype: "video/mp4", caption: cap }, { quoted: msg });
      else await sock.sendMessage(jid, { video: buf, mimetype: "video/mp4", caption: cap }, { quoted: msg });
      await react(sock, msg, "✅");
    } catch (e) { await sendReply(sock, msg, `❌ Video error: ${e?.message || e}`); }
  });

  // ══ 7. MOVIE / NKIRI — accept quoted text as the query ════════════════
  for (const n of ["movie", "nkiri"]) {
    const ex = commands.get(n);
    if (ex?.handler && !ex.__v26Quote) {
      const orig = ex.handler;
      ex.handler = async (sock, msg, args) => {
        if (!args || !args.length) {
          const qt = __v26QuotedText(msg);
          if (qt) args = qt.split(/\s+/);
        }
        return orig(sock, msg, args || []);
      };
      ex.__v26Quote = true;
      commands.set(n, ex);
    }
  }

  // ══ 8. ADMIN DETECTION — hardened (LID/PN/device-suffix aware) ════════
  const __v26IdsOf = (p) => [p?.id, p?.lid, p?.pn, p?.phoneNumber].filter(Boolean).map(v => String(v).toLowerCase());
  const __v26Num = (v) => String(v || "").replace(/:\d+(?=@)/, "").replace(/@.*$/, "").replace(/\D/g, "");
  const __v26IsAdminIn = (meta, jid) => {
    if (!meta?.participants) return false;
    const raw = String(jid || "").toLowerCase();
    let resolved = raw;
    try { resolved = String(resolveLid(jid) || raw).toLowerCase(); } catch {}
    const num = __v26Num(resolved || raw);
    return meta.participants.some(p => {
      if (!(p.admin === "admin" || p.admin === "superadmin")) return false;
      return __v26IdsOf(p).some(id => {
        const low = id.toLowerCase();
        if (low === raw || low === resolved) return true;
        try { if (String(resolveLid(id) || "").toLowerCase() === resolved) return true; } catch {}
        return num && __v26Num(low) === num;
      });
    });
  };
  isGroupAdmin = async function (sock, gid, jid) {
    try {
      const cached = _groupMetaCache.get(gid);
      if (cached && __v26IsAdminIn(cached, jid)) return true;
      // Never trust a NEGATIVE cache result — fetch live before answering.
      const live = await sock.groupMetadata(gid).catch(() => null);
      if (live) {
        try { updateLidMappingsFromMeta(live); } catch {}
        _groupMetaCache.set(gid, live);
        return __v26IsAdminIn(live, jid);
      }
      return cached ? __v26IsAdminIn(cached, jid) : false;
    } catch { return false; }
  };
  isBotGroupAdmin = async function (sock, gid) {
    try {
      const me = __v26Num(sock.user?.id || _botJid || "");
      const check = (meta) => (meta?.participants || []).some(p =>
        (p.admin === "admin" || p.admin === "superadmin") &&
        __v26IdsOf(p).some(id => __v26Num(id) === me));
      const cached = _groupMetaCache.get(gid);
      if (cached && check(cached)) return true;
      const live = await sock.groupMetadata(gid).catch(() => null);
      if (live) { _groupMetaCache.set(gid, live); return check(live); }
      return cached ? check(cached) : false;
    } catch { return false; }
  };

  // ══ 9. SETTINGS NUMERIC REPLIES — hardened dispatch ═══════════════════
  handleSettingsNumericReply = async function (sock, msg, body) {
    const jid = msg.key.remoteJid;
    const raw = String(body || "").trim().replace(/^[^\d]*/, "");
    const mm = raw.match(/^(\d{1,2})\.(\d{1,2})$/);
    if (!mm) return false; // bare digits belong to download pickers
    const choice = `${mm[1]}.${mm[2]}`;
    // TT/media picker rows use ids like 1.1–2.3 as well. If a picker is
    // pending for this chat and there's no live settings session and the
    // quoted card isn't the settings panel, leave the digit to the picker.
    let sessLive = false;
    try {
      const se = settingsSession.get(jid);
      const ts = typeof se === "number" ? se : (se?.ts || se?.time || 0);
      sessLive = !!se && (Date.now() - ts < 30 * 60 * 1000);
    } catch {}
    let quotedIsSettings = false;
    try {
      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const t = String(q?.conversation || q?.extendedTextMessage?.text || "");
      quotedIsSettings = /SETTINGS/i.test(t);
    } catch {}
    let pickerPending = false;
    try {
      const num = __v26Num(jid);
      for (const k of __ttSelections.keys()) { if (__v26Num(k) === num) { pickerPending = true; break; } }
    } catch {}
    if (pickerPending && !sessLive && !quotedIsSettings) return false;
    const fn = SETTINGS_MAP[choice];
    if (!fn) { await sendReply(sock, msg, `❌ Unknown settings option *${choice}*.`); return true; }
    try {
      const out = fn(getSettings(jid));
      try {
        const ownerJ = (CONFIG.OWNER_NUMBER || "").replace(/[^0-9]/g, "") + "@s.whatsapp.net";
        if (ownerJ && ownerJ !== jid) fn(getSettings(ownerJ));
      } catch {}
      try { settingsSession.set(jid, { ts: Date.now() }); } catch {}
      try { saveNow && saveNow(); } catch {}
      await sendReply(sock, msg, typeof out === "string" ? out : "✅ Setting updated.");
    } catch (e) { await sendReply(sock, msg, `❌ Settings error: ${e?.message || e}`); }
    return true;
  };

  // ══ 10. CHATBOT COMMAND — explicit on/off, works in DM + groups ═══════
  cmd(["chatbot", "autochat"], { desc: `Toggle the AI chatbot — ${CONFIG.PREFIX}chatbot on/off`, category: "AI" }, async (sock, msg, args) => {
    const jid = msg.key.remoteJid;
    const on = ["on", "enable", "1", "true"].includes(String(args[0] || "").toLowerCase());
    const off = ["off", "disable", "0", "false"].includes(String(args[0] || "").toLowerCase());
    if (!on && !off) {
      const s = getSettings(jid);
      const cur = !!(s?.autoReply || s?.chatBotMode);
      await sendReply(sock, msg, `🤖 *Chatbot* is currently *${cur ? "ON" : "OFF"}*.\n\nUsage: ${CONFIG.PREFIX}chatbot on / off\n_When ON it replies in this chat and everywhere it's enabled (DMs + groups)._`);
      return;
    }
    try {
      const s = getSettings(jid);
      s.autoReply = on; s.chatBotMode = on;
      try {
        const ownerJ = (CONFIG.OWNER_NUMBER || "").replace(/[^0-9]/g, "") + "@s.whatsapp.net";
        const os = getSettings(ownerJ);
        os.chatbotScope = "all";
      } catch {}
      try { saveNow && saveNow(); } catch {}
      await sendReply(sock, msg, on
        ? "✅ *Chatbot ON* — I'll reply to messages here (works in DMs and groups where enabled). Powered by 𝑷𝑹𝑬𝑪𝑰𝑶𝑼𝑺 x AI with fallbacks."
        : "❌ *Chatbot OFF* — auto-replies disabled for this chat.");
    } catch (e) { await sendReply(sock, msg, `❌ Chatbot toggle error: ${e?.message || e}`); }
  });

  log("master fix pack loaded — AI/pin/channel/clear/video/settings/admin/chatbot patched.");
})();
