#!/bin/bash
# ── PRECIOUS v29 — one-command apply ────────────────────────────────────────
# Run from the repo ROOT (the folder that contains mias/ and start.sh).
set -e
cd "$(dirname "$0")"

echo "[v29] 1/2  Patching mias/index.js ..."
node PATCH-v29.cjs

echo "[v29] 2/2  Verifying syntax of patched files ..."
node --check precious-fixes-v29.cjs
node --check precious-fixes-v28.cjs
node --check precious-all-packs-boot.cjs
node --check mias/index.js && echo "[v29] mias/index.js parses OK"

echo ""
echo "[v29] ✅ Applied. Now deploy so the fixes go live:"
echo "      git add -A && git commit -m \"v29 fix pack\" && git push"
echo "      (Railway/Panel will rebuild; start.sh re-runs PATCH-v29.cjs every boot)"
