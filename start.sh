#!/bin/bash
set -e
cd "$(dirname "$0")"

# ── Install main (root) dependencies ────────────────────────────────────────
if [ ! -d node_modules ] || [ ! -d node_modules/chalk ]; then
  echo "[MIAS] Installing main dependencies..."
  npm install --no-audit --no-fund --loglevel=error
fi

# ── Install mias dependencies ────────────────────────────────────────────────
if [ -d mias ] && [ ! -d mias/node_modules ]; then
  echo "[MIAS] Installing bot dependencies..."
  (cd mias && npm install --no-audit --no-fund --loglevel=error || true)
fi

# ── Try to install GKTW (optional — gracefully skipped if unavailable) ───────
# Tries npm first, then GitHub source directly.
# The gktwAdapter auto-detects whichever succeeds — zero code changes needed.
if [ -d mias/node_modules ]; then
  if [ ! -d mias/node_modules/@itsreimau/gktw ]; then
    echo "[MIAS] Attempting to install @itsreimau/gktw..."
    (cd mias && npm install @itsreimau/gktw --no-audit --no-fund --save-optional 2>/dev/null && \
      echo "[MIAS] GKTW installed from npm." ) || \
    (cd mias && npm install github:itsreimau/gktw --no-audit --no-fund --save-optional 2>/dev/null && \
      echo "[MIAS] GKTW installed from GitHub." ) || \
    echo "[MIAS] GKTW not available yet — Baileys fallback active."
  else
    echo "[MIAS] GKTW already installed."
  fi
fi

echo "[MIAS] Starting bot..."
exec node index.js
