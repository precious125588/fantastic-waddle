# MAIS MDX — all fix packs wired into the entry (replacement drop, v2)

## Why some packs "were not loading"
The previous `precious-all-packs-boot.cjs` did a plain `require()` from repo
root. Node then resolved every transitive dep (like `axios`) from the ROOT
`node_modules`. Two of the packs (`mias/precious-fixes-v21.cjs`,
`mias/precious-fixes-v24.cjs`) call `require('axios')` at the top level, and
axios is installed under `mias/node_modules` — so the require blew up with

```
Cannot find module 'axios'
Require stack:
- /app/mias/precious-fixes-v24.cjs
- /app/precious-all-packs-boot.cjs
```

…and the pack was silently marked as "module missing" while every other pack
loaded. That is why "some files aren't deploying or loading".

On top of that, `mias/index.js` was ALREADY calling `precious-fixes-v21`,
`precious-gst-picker`, and `precious-fixes-v24` directly BEFORE reaching the
all-packs boot — so even when they did load, every command they register was
registered TWICE, and the last one wins.

## What this drop does
1. **`precious-all-packs-boot.cjs`** — resilient multi-path loader (tries the
   pack's own folder → `mias/` → root when resolving deps), plus a shared
   `globalThis.__PRECIOUS_INSTALLED__` marker so a pack that mias/index.js
   already installed earlier is SKIPPED here instead of double-registering.
   Prints a clear `[packs] …` line per pack (installed / skipped / failed).
2. **`mias/index.js`** — the earlier standalone install blocks for `v21`,
   `precious-gst-picker` and `v24` are commented out; every pack now goes
   through the all-packs boot at the end. Nothing double-registers.
3. **`start.sh`** — dedup guard (`/tmp/mais-patched.marker`) so the four
   idempotent patchers do not run twice per boot.
4. **`index.js`** — same dedup guard so the root launcher doesn't re-run the
   patchers that `start.sh` already ran.
5. **`railway.toml`** — `startCommand` fixed to `bash start.sh` (was
   `npm start`, which skipped the workspace install step that gives
   `mias/node_modules`, i.e. axios itself).

## Deploy
Drop these files over your repo keeping the same paths, commit, push, redeploy.
In the log you should now see, once per boot:

```
[packs] ════════ ALL FIX PACKS BOOT ════════
[packs] ✅ session-boot … — loaded (side-effect) [self:.]
[packs] ✅ precious-fixes-v20 — installed (.install) [self:mias]
[packs] ✅ precious-fixes-v21 (mias) — installed (.install) [self:mias]
[packs] ✅ precious-gst-picker — installed (.install) [self:mias]
[packs] ✅ precious-fixes-v23-rc — applied (.apply) [self:patches]
[packs] ✅ precious-play-v2 — loaded (side-effect) [self:.]
[packs] ✅ playv2-deliver — loaded (side-effect) [self:.]
[packs] ✅ download-worker — loaded (side-effect) [self:.]
[packs] ✅ _addVideoWatermark — loaded (side-effect) [self:.]
[packs] ✅ precious-fixes-v24 (final override) — installed (.install) [self:mias]
[packs] ════════ DONE — loaded 10/10 pack slots in XXms ════════
```

If a pack shows `❌ … install error`, that line names the pack AND the reason.
