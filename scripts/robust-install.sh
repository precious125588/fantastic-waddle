#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# robust-install.sh <dir>
#
# WHY: `cd mias && npm install` died on Railway with
#      "npm error Exit handler never called!" — that is npm's generic crash
#      message when the npm process itself is killed (OOM) or its cache is
#      corrupted mid-resolution. The old command capped npm at
#      --max-old-space-size=768 while resolving a ~1200-package tree with
#      native builds; the builder killed it and the whole deploy failed.
#
# WHAT: retry with escalating heap, clean the cache between attempts, and
#       throttle sockets so the resolver keeps a smaller in-memory graph.
# ─────────────────────────────────────────────────────────────────────────────
set -u
DIR="${1:-.}"
cd "$DIR" || exit 1

HEAPS="${NPM_HEAPS:-2048 3072 4096}"
ATTEMPT=0

for HEAP in $HEAPS; do
  ATTEMPT=$((ATTEMPT + 1))
  echo "[install] $DIR — attempt $ATTEMPT (heap ${HEAP}MB)"
  NODE_OPTIONS="--max-old-space-size=${HEAP}" \
  npm install \
      --no-audit --no-fund --no-progress \
      --maxsockets 4 \
      --fetch-retries 5 \
      --fetch-retry-maxtimeout 120000 \
      --loglevel=warn
  CODE=$?
  if [ $CODE -eq 0 ]; then
    echo "[install] $DIR — OK on attempt $ATTEMPT"
    exit 0
  fi
  echo "[install] $DIR — attempt $ATTEMPT failed (exit $CODE); cleaning cache and retrying"
  npm cache clean --force >/dev/null 2>&1 || true
  rm -rf node_modules/.package-lock.json >/dev/null 2>&1 || true
done

echo "[install] $DIR — all attempts failed"
exit 1
