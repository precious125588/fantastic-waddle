#!/bin/bash
set -e
cd "$(dirname "$0")"

# ── Install main (root) dependencies ────────────────────────────────────────
if [ ! -d node_modules ] || [ ! -d node_modules/chalk ]; then
  echo "[MAIS] Installing main dependencies..."
  npm install --no-audit --no-fund --loglevel=error
fi

# ── Install mias dependencies ────────────────────────────────────────────────
# Each workspace has its own .npmrc (legacy-peer-deps=true). npm does NOT read
# the parent folder's .npmrc, and without it this install fails with ERESOLVE
# on the jimp peer dependency of @itsliaaa/baileys.
if [ -d mias ] && [ ! -d mias/node_modules ]; then
  echo "[MAIS] Installing MIAS bot dependencies..."
  (cd mias && npm install --no-audit --no-fund --loglevel=error)
fi

# ── Install New Page dependencies ────────────────────────────────────────────
if [ -d new-page ] && [ ! -d new-page/node_modules ]; then
  echo "[MAIS] Installing New Page bot dependencies..."
  (cd new-page && npm install --no-audit --no-fund --loglevel=error)
fi

# ── Sticker engine self-check (non-fatal, just tells you the truth) ──────────
for d in mias new-page; do
  [ -d "$d/node_modules/wa-sticker-formatter" ] || continue
  (cd "$d" && node -e "const s=require('sharp');require('wa-sticker-formatter');console.log('[MAIS] $d sticker engine OK (sharp '+s.versions.sharp+')')") \
    || echo "[MAIS] WARN: $d sticker engine unavailable"
done

# ── GKTW helper ──────────────────────────────────────────────────────────────
# @itsreimau/gktw does not exist on npm and its GitHub repo is 404, so there is
# nothing to install. Both bots run on raw Baileys through their adapters.
# If you ever get a real helper package, set GKTW_PACKAGE=<name> and install it
# into mias/ and/or new-page/ — the adapters pick it up with zero code changes.
if [ -n "$GKTW_PACKAGE" ]; then
  for d in mias new-page; do
    [ -d "$d" ] || continue
    echo "[MAIS] Installing helper $GKTW_PACKAGE into $d..."
    (cd "$d" && npm install "$GKTW_PACKAGE" --no-audit --no-fund --save-optional) \
      || echo "[MAIS] helper $GKTW_PACKAGE unavailable in $d — Baileys fallback active."
  done
fi

echo "[MAIS] Starting..."
exec node index.js
