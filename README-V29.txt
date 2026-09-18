═══════════════════════════════════════════════════════════════════════════
 PRECIOUS v29 FIX PACK — fantastic-waddle
 Fixes: silent TT picker (1.1) · movie/nkiri/savetube not applied ·
        dead native buttons on WhatsApp Android 11 · chatbot enable does nothing
═══════════════════════════════════════════════════════════════════════════

WHAT WAS WRONG (root causes, confirmed in your repo)
───────────────────────────────────────────────────────────────────────────
1. TT CMD PICKER SILENT ON "1.1"
   mias/index.js has TWO settings dispatchers (base handleSettingsNumericReply
   + the v26 override) that run BEFORE the picker consumer on any "N.N" text.
   The v26 override did hand real picker rows off — but only when the picker
   was still in memory AND the quote regex matched; its final fallback was
   `❌ Unknown settings option` → return true, which ATE "1.1" whenever the
   in-memory picker entry was evicted or the quote regex missed. Result:
   total silence. FIX: unknown N.N shapes now go to the picker dispatcher
   first, then fall through silently — they can never be eaten again.
   (PATCH-v29 edit A + precious-fixes-v29 widened pending-check that also
   honors the persisted tt-picker.json after restarts.)

2. MOVIE / NKIRI / SAVETUBE FIXES "NOT APPLIED"
   precious-fixes-v28.cjs (real .nkiri command + .movie quote-reply) EXISTS in
   your repo but its installer ran ONCE at require-time inside
   precious-all-packs-boot.cjs — at that moment the live commands map is not
   yet exposed on globalThis, so install() failed with "commands map not
   found" and NEVER retried. The file was loaded, the fixes never went live.
   FIX: precious-fixes-v29.cjs chains v28.install + adds a savetube quote
   wrapper, and the boot hook retries the install at 15s/45s/90s after boot
   (idempotent), plus mias/index.js now exposes the commands map globally.
   A fresh deploy re-installs everything automatically.

3. NATIVE BUTTON FLOW DEAD ON WHATSAPP ANDROID 11
   Both native senders (sendNativeFlowButtons / sendNativeFlowListMenu) only
   tried the viewOnceMessage envelope. That envelope is the Business-app
   trick — on normal WhatsApp (especially older Android builds) it renders
   dead/unclickable. FIX: both senders now try DIRECT first, then viewOnce,
   then a plain numbered text list as a last resort. Force a mode with the
   env var BUTTON_MODE=direct or BUTTON_MODE=viewonce (default: auto).

4. CHATBOT ENABLE DOES NOTHING
   The settings-map 21.1 toggled the owner settings object, but the
   auto-chatbot loop only read the CURRENT chat's autoReply — enabling it
   never armed the chat you were standing in, and any provider error died
   silently. FIX: the gate now honors owner-level chatBotMode too, and the
   loop logs which message had every provider fail so you can see it work.
   Tip: `.chatbot on` (or 21.1) now takes effect in the current chat.

FILES IN THIS PACK (drop into the repo ROOT, overwriting when asked)
───────────────────────────────────────────────────────────────────────────
  PATCH-v29.cjs               — patches mias/index.js (edits A–F), idempotent
  precious-fixes-v29.cjs      — runtime fix pack (picker/savetube/buttons/chatbot)
  precious-fixes-v28.cjs      — movie quote + real .nkiri (unchanged, chained by v29)
  precious-all-packs-boot.cjs — boot loader, now also installs v28+v29 with retry
  start.sh                    — PATCH-v29.cjs added to the pre-boot patcher loop
  apply-v29.sh                — one-command apply + syntax verify

INSTALL
───────────────────────────────────────────────────────────────────────────
  1. Unzip into the repo ROOT (same folder as package.json), overwrite all.
  2. Run once locally to verify:        bash apply-v29.sh
  3. Commit + push:                     git add -A && git commit -m "v29 fix pack" && git push
  4. Redeploy (Railway/Panel rebuilds). start.sh re-runs PATCH-v29.cjs on
     every boot, so the fixes ALWAYS re-apply after every deploy — nothing
     to redo manually ever again.

TEST CHECKLIST (after deploy)
───────────────────────────────────────────────────────────────────────────
  □ .tt <tiktok link>  → card appears → reply "1.1" (plain AND as a quote
    of the card) → SD video arrives. Try "1.3" (HD) and "2.1" (audio) too.
  □ Restart the bot, then reply 1.1 to the SAME old card → still works
    (persisted picker store).
  □ Reply to any message containing a movie title with ".movie" → search runs.
    Same with ".nkiri" (this command now actually exists).
  □ .savetube as a quote-reply to a YouTube link → runs.
  □ .menu / any picker card on WhatsApp Android 11 → buttons tap and fire.
    If still dead on your build: set env BUTTON_MODE=direct, redeploy, retest;
    then try BUTTON_MODE=viewonce. One of the two will render.
  □ In a DM: ".chatbot on" → send any plain text → AI replies.
    In a group: same. Check logs for "[autochat]" lines if silent.
  □ .setting → 21.1 → chatbot arms for the current chat immediately.

LOG LINES TO LOOK FOR AFTER BOOT
───────────────────────────────────────────────────────────────────────────
  [PATCH-v29] ✅ ... (5–6 edits applied)
  [v29] ✅ install pass complete: {"commandsFound":true,...}
  [precious-v28] ✅ installed — {"movieQuote":true,"nkiri":true}

ROLLBACK
───────────────────────────────────────────────────────────────────────────
  mias/index.js backup is saved next to it as index.js.v29.bak on first patch.
  Restore it and remove the v29 lines from start.sh to roll back.
═══════════════════════════════════════════════════════════════════════════
