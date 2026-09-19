# ⚠️ MUST READ — FIX PACK POLICY (v33, 2026-09-19)

> **To every developer and every AI agent working on this repo:**
> **NEVER create a new fix pack file. EVER.**
> No new `PATCH-vXX.cjs`, no new `precious-fixes-vXX.cjs`, no new
> `*-boot.cjs`, no new `fix_*.cjs`, no new "hotfix" script, no new
> install README. The era of scattered fix packs is **over**.

---

## The one and only entry point

**`precious-master-fix-boot.cjs`** is the SINGLE merged fix-pack loader.
It is wired into the main entries already:

| Process | File | Call |
|---|---|---|
| Parent (web + pairing) | `index.js` (top) | `require('./precious-master-fix-boot.cjs').bootParent()` |
| Parent (web + pairing) | `server.js` (top) | same `bootParent()` call |
| Child (WhatsApp bot) | `mias/index.js` (very end) | `require('../precious-master-fix-boot.cjs').bootChild(globalThis.__PRECIOUS__)` |

`bootParent()` runs, in order:
1. The full on-disk patch chain — `fix_all.cjs`, `fix_session_401.cjs`,
   `PATCH-v25.cjs`, `PATCH-v27.cjs`, `precious-fix-pack.cjs`, `PATCH-v29.cjs`,
   `PATCH-v30.cjs`, `PATCH-v31.cjs` (idempotent, marker-guarded).
2. `precious-session-boot.cjs` — session volume detection + legacy migration.
3. `precious-session-fix.cjs` — rewrites hard session deletes → quarantine.
4. `precious-packs-preflight.cjs` — boot-time pack health report.

`bootChild()` runs, in order:
1. Child crash shield (`fix_pack_runtime.cjs → installChild()`).
2. `precious-all-packs-boot.cjs → installAll()` — **every** runtime
   command-fix pack in winning order:
   session-boot → v20 → v21 → gst-picker → v23-rc → playv2 shims →
   watermark → v24 → v27 → v28 → v29 (dead last, so it always wins).
3. `precious-packs-verify.cjs → schedule()` — the v31 verify hook, now
   version-controlled (a fresh git clone can no longer wipe it).

## If you need to fix something

1. **Find which existing pack owns that command/subsystem** (grep the
   command name in `precious-fixes-*.cjs`, `mias/precious-fixes-*.cjs`,
   `patches/`, `PATCH-v*.cjs`).
2. **Edit that existing pack in place.** Bump nothing, rename nothing.
3. If the fix truly belongs to no existing pack, add it as a new step
   **inside `precious-all-packs-boot.cjs → installAll()`** (runtime fix) or
   inside **`precious-master-fix-boot.cjs → PATCH_CHAIN`** (on-disk patch).
   That is the ONLY two places new fix logic may live.
4. Keep it idempotent and marker-guarded, and never let it throw — every
   step is isolated so one failure can't take down the bot.

## Hard rules

- ❌ Do NOT create new patch/fix/boot files.
- ❌ Do NOT add fix logic to `index.js`, `server.js`, `mias/index.js`,
  `start.sh`, `Procfile`, or `railway.toml` beyond the one master-boot call.
- ❌ Do NOT rely on runtime-injected edits (a fresh deploy = fresh clone =
  they vanish). All fixes must live in version control.
- ✅ DO keep every fix idempotent (safe to run on every boot).
- ✅ DO check the boot log for `[MASTER-FIX]` and `[packs]` lines — they
  prove every pack loaded, in order.

## How to verify a fix actually loaded

Watch the boot logs for, in order:
```
[MASTER-FIX] ════════ PARENT BOOT — merging ALL fix packs into main entry ════════
[FIX-PACK] chain done — applied=… failed=0 …
[MASTER-FIX] ════════ PARENT BOOT DONE … ════════
[MASTER-FIX] ════════ CHILD BOOT — installing ALL runtime fix packs ════════
[packs] ════════ DONE — loaded N/N pack slots … ════════
[MASTER-FIX] ════════ CHILD BOOT DONE … verify=true ════════
```
If any line is missing, the fix did NOT load — fix the master boot, do not
add another pack.
