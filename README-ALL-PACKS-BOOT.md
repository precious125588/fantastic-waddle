# MAIS MDX — all fix packs wired into the entry (replacement drop)

## Why your fixes "came back"
`commands` is a Map keyed by command name, so the **last** registration wins.
Several packs (`v20`, `v21`, `gst-picker`, `v24`, the in-file v19 guards) each
re-register `.play` / `.tt` / `.gst` / `.shazam` / `.tgsticker`, and the
file-patchers (`fix_all.cjs`, `fix_session_401.cjs`, `PATCH-v25.cjs`,
`precious-fix-pack.cjs`) only ran under `npm start` — **Railway boots through
`start.sh` / `Procfile`, so on the deployed image they never ran at all.**
That is why the old handlers kept returning.

## What changed
1. **NEW `precious-all-packs-boot.cjs`** — one module that loads and installs
   every pack in the correct order, each isolated in its own try/catch so one
   broken pack can never stop the boot. It prints a `[packs] ...` line per pack.
   Order: session-boot → v20 → v21 → gst-picker → v23-rc → playv2/deliver/
   download-worker/watermark → **v24 last** (so it wins).
2. **`mias/index.js`** — appended a final block that calls
   `require('../precious-all-packs-boot.cjs').installAll(globalThis.__PRECIOUS__)`.
   This is the bot entry the launcher spawns per paired number.
3. **`index.js`** (launcher) — runs the four idempotent file-patchers on every
   boot and then `precious-session-fix.cjs`, before spawning any child.
4. **`start.sh`** — runs `fix_all.cjs`, `fix_session_401.cjs`, `PATCH-v25.cjs`,
   `precious-fix-pack.cjs` before `exec node index.js` (they were skipped on
   Railway).

## Deploy
Drop these files over your repo keeping the same paths, rebuild, redeploy.
In the log you should now see, once per boot:
`[packs] ════════ ALL FIX PACKS BOOT ════════` and a `✅` line per pack,
ending with `[packs] ════════ DONE — loaded N/N pack slots ════════`.
If a pack shows `❌ ... install error`, that line names the pack and the reason.
