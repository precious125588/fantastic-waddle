# v31 — why v29 "isn't applied" and why fix pack 30 never ran

Date: 2026-09-18 · Investigated against `main` @ `2179d30`

## TL;DR

Nothing is wrong with the fix pack **files**. All 16 pack files pass a syntax
check, `PATCH-v29.cjs` applies **6 of 6** edits with **0 missed anchors**, and a
simulated bot child shows `[packs-verify] RESULT: v29 fully applied ✅`.

The packs were simply **never started on the deployed container**, and nothing
ever proved whether they took effect.

## The four real causes

### 1. `PATCH-v30.cjs` was never executed in production

`PATCH-v30.cjs` only ran from the npm `start` script. Railway does not use it:

| entry point | start command | ran v30? |
|---|---|---|
| `railway.toml` (`startCommand`) | `node server.js` | ❌ |
| `Procfile` | `node server.js` | ❌ |
| `railway.json` | `npm start` | ✅ (but toml/json disagreed) |
| `server.js` internal patcher chain | `fix_all, fix_session_401, PATCH-v25, PATCH-v27, precious-fix-pack, PATCH-v29` | ❌ no v30 |

So there were no `[PATCH-v30]` and no `[packs-preflight]` lines. v30 was not
broken — it was not launched.

### 2. `start.sh` was missing patchers too

Its loop ran `fix_all, fix_session_401, PATCH-v25, precious-fix-pack, PATCH-v29`
— no `PATCH-v27`, no `PATCH-v30`.

### 3. The "[v29] / [packs] / [precious-v28]" lines can only come from the bot child

They are printed by `precious-all-packs-boot.cjs`, required at the bottom of
`mias/index.js`, which runs **inside the child process** that `mais_launcher.js`
spawns per paired number (prefixed `[MAIS:<number>]`). The web container never
prints them. On top of that, the old preflight counted paired sessions from a
hardcoded `nexstore/pairing` path and ignored the `SESSION_DIR` /
`SESSION_ROOT` / `SESSIONS_DIR` overrides — with `SESSION_DIR` set it always
reported "0 paired sessions" even with a live paired number.

### 4. Two latent bugs in the pack loader

* The deferred v29 retries tested `isInstalled('v29-final')` — a key nothing
  ever sets — so v29 re-installed 3 extra times per boot.
* `precious-all-packs-boot.cjs` auto-runs on require when `globalThis.__PRECIOUS__`
  exists **and** `mias/index.js` calls `installAll()` explicitly → the whole
  chain ran twice per boot.

## What v31 changes

| file | change |
|---|---|
| `PATCH-v31.cjs` *(new)* | idempotent patcher: adds `PATCH-v30` + `PATCH-v31` to the chains in `server.js`, `index.js`, `start.sh`; appends the verify hook to `mias/index.js`; runs the preflight |
| `precious-packs-verify.cjs` *(new)* | runs **inside the bot child** at +20s and +120s and prints `[packs-verify] RESULT: v29 fully applied ✅` or the exact list of what is missing |
| `precious-packs-preflight.cjs` | honours `SESSION_DIR`, prints the resolved session root and the paired numbers, and reports whether `__V29_PATCHED__` is actually in `mias/index.js` |
| `precious-all-packs-boot.cjs` | fixed the `v29-final` retry key and the double boot pass |
| `railway.toml` / `railway.json` / `Procfile` / `package.json` | every start command now runs `PATCH-v30` and `PATCH-v31` before `server.js` |
| `server.js` / `index.js` / `start.sh` | patcher chains include v27 / v30 / v31 (also self-healed at boot by `PATCH-v31`) |

## How to confirm it worked after deploying

1. Web container log, within the first seconds:
   `[PATCH-v30] ✅ …`, `[PATCH-v31] ✅ …`, `[packs-preflight] 16/16 pack files healthy`,
   `[packs-preflight] session root in use: /app/nexstore/pairing`,
   `[packs-preflight] N paired session(s): …`
2. Pair a number (or wait for autoload). Then, prefixed `[MAIS:<number>]`:
   `[packs] ✅ precious-fixes-v29 installed …`
3. About 20 seconds later, the proof line:
   `[packs-verify] RESULT: v29 fully applied ✅`
   If anything is still missing it prints `• …` bullets naming the exact gap.

If step 1 appears but step 2 never does, no bot child is running — the
preflight line right above will say why (0 paired sessions, or the session root
it is actually looking at).
