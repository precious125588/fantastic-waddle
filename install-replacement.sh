#!/usr/bin/env bash
# install-replacement.sh — wrapper around patches.js (Unix-like systems).
# Copy this file + patches.js into the repo root and run:
#     sudo bash install-replacement.sh
# or just:
#     bash install-replacement.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
echo "==> Running patches.js from $SCRIPT_DIR"
node patches.js
echo "==> Done. Restart your bot process now."
