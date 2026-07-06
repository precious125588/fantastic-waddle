#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -d node_modules ] || [ ! -d node_modules/chalk ]; then
  echo "📦 Installing main dependencies..."
  npm install --no-audit --no-fund --loglevel=error
fi
if [ -d mias ] && [ ! -d mias/node_modules ]; then
  echo "📦 Installing mias dependencies..."
  (cd mias && npm install --no-audit --no-fund --loglevel=error || true)
fi
echo "🚀 Starting MAIS MDX × TELEXWA..."
exec node index.js
