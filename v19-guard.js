
/* ══════════════════════════════════════════════════════════════════════════
   v19 GUARDS — appended last, so they always win no matter which patch pack
   registered a handler before them.

   1) .tt / .tiktok / .ttdl  -> EXACTLY ONE handler: the image-card one.
      The duplicate "instantly deliver the media" registration used to grab
      the .ttdl alias from the NexRay module, so one command produced two
      different behaviours. It is now forced back to the card handler.
   2) .gst / .gstatus / .groupstatus -> wrapped in a watchdog, so the loading
      reaction is guaranteed to resolve to ✅ or ❌ even when the upload hangs.
   ══════════════════════════════════════════════════════════════════════════ */
try {
  const _ttCardRef = (commands.get("tt") && commands.get("tt").__ttCardHandler)
    || (commands.get("tiktok") && commands.get("tiktok").__ttCardHandler);
  if (typeof _ttCardRef === "function") {
    for (const _n of ["tiktok", "tt", "ttdl"]) {
      const _e = commands.get(_n) || { category: "DOWNLOAD" };
      if (_e.handler !== _ttCardRef) {
        _e.handler = _ttCardRef;
        _e._origHandler = _ttCardRef;
        _e.__ttCard = true;
        _e.__ttCardHandler = _ttCardRef;
        commands.set(_n, _e);
        console.log("[v19] duplicate removed — ." + _n + " restored to the image-card handler");
      }
    }
    console.log("[v19] tt commands: exactly one handler (image card kept untouched)");
  } else {
    console.log("[v19] tt card handler not found — duplicate guard inactive");
  }
} catch (_e19a) { console.log("[v19] tt guard error:", _e19a && _e19a.message); }

try {
  const _ge = commands.get("gst");
  const _gh = _ge && _ge.handler;
  if (typeof _gh === "function" && !_gh.__gstWatchdog) {
    const _gstReact = async (sock, msg, emoji) => {
      try { await forceReaction(sock, msg, emoji); return; } catch (e) {}
      try { await sock.sendMessage(msg.key.remoteJid, { react: { text: emoji, key: msg.key } }); } catch (e2) {}
    };
    const _wrapped = async (sock, msg, args) => {
      let done = false;
      const settle = (ok, note) => {
        if (done) return;
        done = true;
        try { clearTimeout(timer); } catch (e) {}
        _gstReact(sock, msg, ok ? "✅" : "❌");
        if (note) { try { sendReply(sock, msg, note); } catch (e) {} }
      };
      const timer = setTimeout(function () {
        settle(false, "❌ GST timed out — the upload never finished. Try again, or post a smaller file.");
      }, 75000);
      try {
        const r = await _gh(sock, msg, args);
        done = true;
        try { clearTimeout(timer); } catch (e) {}
        return r;
      } catch (e) {
        settle(false, "❌ GST failed: " + ((e && e.message) || e));
      }
    };
    _wrapped.__gstWatchdog = true;
    for (const _n of ["gst", "gstatus", "groupstatus"]) {
      const _e = commands.get(_n) || { category: "GROUP" };
      _e.handler = _wrapped;
      commands.set(_n, _e);
    }
    console.log("[v19] gst watchdog armed — the loading reaction can no longer get stuck");
  }
} catch (_e19b) { console.log("[v19] gst guard error:", _e19b && _e19b.message); }

try {
  console.log("[v19] media format fix active — ffmpeg:", _mfBinaryOk() ? "ok" : "MISSING (run: npm i ffmpeg-static)");
} catch (_e19c) {}
