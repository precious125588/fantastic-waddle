════════════════════════════════════════════════════════════════════
 V29 HOTFIX PACK — "why fixes don't always apply" — ROOT CAUSE FIXED
════════════════════════════════════════════════════════════════════
WHY V29 WASN'T APPLYING (found in your repo, all confirmed):
1. STALE TMP MARKER — server.js / index.js / start.sh all SKIPPED the
   whole patch chain whenever /tmp/mais-patched.marker existed. On
   long-running containers (or panels that reuse /tmp across restarts)
   that marker survives → patches silently skipped forever.
2. ROOT index.js patcher list was MISSING PATCH-v27.cjs and PATCH-v29.cjs
   entirely — even when it ran, v29 never got patched from that path.
3. WRONG BRANCH — v29 files exist ONLY on branch `main`. master,
   fix/whatsapp-session-and-tiktok and whiskey-socket-update have NO
   v29 files (checked: 404). If your host deploys any branch other
   than main, you get zero v29 fixes.

WHAT THIS PACK DOES:
- server.js, index.js, start.sh: marker gate removed (patch chain is
  idempotent, safe to run every boot) + PATCH-v29 added everywhere.
- v28/v29 runtime packs + boot loader included (unchanged, verified OK:
  PATCH-v29 applies 6/6 edits, 0 missed; all files pass node --check).

INSTALL:
1. Unzip into repo ROOT (overwrite all).
2. git add -A && git commit -m "v29 hotfix: always-run patch chain" && git push
3. In Railway/Panel: make sure the DEPLOYED BRANCH = main, then
   REDEPLOY (full rebuild, not just restart).
4. Watch boot logs for:
     [PATCH-v29] done — applied 6, missed 0
     [v29] ✅ install pass complete
     [precious-v28] ✅ installed
   If "missed" > 0, your mias/index.js drifted — restore from repo first.

NOTE: I cannot push to your GitHub — no credentials. Push these files
yourself (step 2) or upload them via GitHub web → Add file → Upload.
