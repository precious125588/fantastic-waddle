============================================================
PRECIOUS V25 REPLACEMENT PACK (v24 base + gst kept group-only + new edit links) — what was fixed & how to install
============================================================

WHAT'S IN THIS ZIP
  mias/index.js                (1 line block added at the bottom: loads v24 LAST)
  mias/precious-fixes-v24.cjs  (NEW — the big fix pack)
  mias/precious-anime-edits.cjs(NEW — anime edits engine)
  edits/                       (NEW folder — classified link files + _usernames.txt)
  V24-INSTALL-README.txt       (this file)

INSTALL (beginner-friendly)
  1. Open your bot folder (Railway/local — same place as mias/index.js).
  2. Replace mias/index.js with the one in this zip.
  3. Copy mias/precious-fixes-v24.cjs and mias/precious-anime-edits.cjs into mias/.
  4. Copy the whole edits/ folder into the bot ROOT (next to mias/, NOT inside it).
  5. Restart the bot. In logs you should see:
       [precious-v24] ✅ installed — {...}

WHAT GOT FIXED
  • .play choice bug — no more "❌ Unknown settings option *4*". Numbered
    replies now go to the card you quoted, never to settings.
  • .savetube / .movie / .nkiri / .boost6 / .ytmate now send an image card
    with numbered options. Quote-reply a number (works on EVERY WhatsApp)
    OR tap the native list button (works where native flows render).
  • .tt / .tiktok — duplicate removed. Every input (typed link OR quoted
    link) now shows ONLY the image card picker. Nothing auto-downloads.
  • .play video / .ytmate video — gray/blank/corrupted fixed. Every video is
    checked to be a real MP4 before sending; audio bytes are never sent as
    video, and HTML error pages are never sent as "corrupted" files.
    If a video can't be previewed it arrives as a playable .mp4 document.
  • .gst / .gstatus / .groupstatus / .gcstatus — KEPT for group status posts.
    The DM group-picker logic was removed (v25): in a DM the bot tells you
    to run it inside the group; in a group it posts to the status ring.
  • .sudo — rebuilt. Shows the target's profile picture card (bot picture if
    they have no DP) with: 1 Add (DM only) / 2 Remove (everything incl. VIP)
    / 3 Sudo VIP (full access DM+GC). Native buttons embedded + quote-reply
    numbers. Usage:
      .sudo 234xxx        → manage that number
      .sudo (in a user DM) → manage the DM owner
      .sudo (in bot DM, no number) → asks you for the target number
    .listsudo shows the full list. Sudo data: allfunc/sudo.json
  • .forward 234xxx — quote ANY message/media and it forwards it (native
    forward → relay → download+resend fallback chain).
  • Bot now connects PRIVATE by default (owner can still use .public).
  • ANIME EDITS: .naruto .boruto .jjk .demonslayer .aot .onepiece
    .dragonball .bleach .blackclover .mha .mushokutensei .sololeveling
    .cote .tomodachigame .horimiya .oshinoko .rezero .vinlandsaga
    .spiderman .invincible .bluelock .onepunchman .sonic .fireforce
    Each reacts ☄️ and drops 2 edits. No repeats per user until the pool
    is drained. Routes rotate: zip links → your pages (_usernames.txt) →
    random TikTok search, all hashtag-validated so Naruto/Boruto never
    serves JJK and vice-versa (mixed-hashtag edits serve both — on purpose).

ADDING MORE EDITS LATER (super easy)
  • More links: paste TikTok URLs into edits/<category>.txt (e.g.
    edits/naruto_boruto.txt). One per line. Save, restart.
  • More pages: add usernames to edits/_usernames.txt, one per line.
  Naruto & Boruto share ONE file (naruto_boruto.txt) — they are the same
  franchise here, exactly as you asked.

TESTED: node --check passed on all files; runtime smoke test passed —
72 commands registered, gst aliases removed, sudo/picker/hooks all live.
