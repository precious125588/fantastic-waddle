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
# @itsreimau/gktw is not yet on npm. When it becomes available, this will
# automatically install it on every fresh deploy. Zero code changes required —
# the gktwAdapter auto-detects and routes through it.
if [ -d mias/node_modules ]; then
  if [ ! -d mias/node_modules/@itsreimau/gktw ]; then
    echo "[MIAS] Attempting to install @itsreimau/gktw (optional)..."
    (cd mias && npm install @itsreimau/gktw --no-audit --no-fund --save-optional 2>/dev/null && \
      echo "[MIAS] GKTW installed successfully." || \
      echo "[MIAS] GKTW not available yet — Baileys fallback active. No action needed.")
  else
    echo "[MIAS] GKTW already installed."
  fi
fi

echo "[MIAS] Starting bot..."
exec node index.js
