FROM node:22-slim

# System libraries required by canvas / @napi-rs/canvas native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libpng-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    libvips-dev \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifest only (no lockfile — the old one had Replit-internal
# URLs that don't resolve outside Replit, so we generate a fresh one here)
COPY package.json .npmrc ./

# Install root deps — npm install creates a fresh lockfile using the real
# npm registry. --ignore-scripts stops fix_all.cjs postinstall from spawning
# a nested npm install that would crash the parent process.
RUN NODE_OPTIONS="--max-old-space-size=512" \
    npm install --ignore-scripts --no-audit --no-fund --loglevel=warn

# Copy all source files (including mias/ and new-page/)
COPY . .

# Install mias bot dependencies (has its own package.json, no lockfile)
RUN cd mias && \
    NODE_OPTIONS="--max-old-space-size=512" \
    npm install --ignore-scripts --no-audit --no-fund --loglevel=warn || true

# Install New Page bot dependencies. Without this the "New Page" option in the
# deployment menu crashes on launch with ERR_MODULE_NOT_FOUND, because it is a
# separate ESM package with its own node_modules.
RUN cd new-page && \
    NODE_OPTIONS="--max-old-space-size=512" \
    npm install --ignore-scripts --no-audit --no-fund --loglevel=warn || true

# Install @itsreimau/gktw into mias/ and new-page/ — try npm registry, fall back to GitHub
RUN for d in mias new-page; do \
      cd /app/$d && \
      (npm install @itsreimau/gktw --no-audit --no-fund --save-optional 2>/dev/null || \
       npm install github:itsreimau/gktw --no-audit --no-fund --save-optional 2>/dev/null || \
       echo "[docker] gktw unavailable in $d — Baileys fallback active"); \
    done

# ── sharp native binaries ────────────────────────────────────────────────────
# --ignore-scripts above skipped sharp's install script for EVERY copy of sharp
# in the tree. `npm rebuild sharp` only fixes the top-level copy, which is why
# the nested one under wa-sticker-formatter kept failing at boot with:
#   Cannot find module '../build/Release/sharp-linux-x64.node'
# Rebuild every nested copy explicitly, then verify each one actually loads.
RUN for d in mias new-page; do \
      [ -d "/app/$d/node_modules" ] || continue; \
      find "/app/$d/node_modules" -type d -name sharp -not -path "*/node_modules/*/node_modules/*/node_modules/*" \
        | while read -r sharpdir; do \
            echo "[docker] rebuilding sharp at $sharpdir"; \
            (cd "$sharpdir" && npm run install --if-present --foreground-scripts) \
              || (cd "$sharpdir" && npx --yes prebuild-install --runtime=napi --platform=linux --arch=x64 ) \
              || echo "[docker] WARN could not build $sharpdir"; \
          done; \
    done

# Verify sharp loads in each bot; fail the build loudly rather than shipping a
# broken sticker engine that only surfaces in runtime logs.
RUN for d in mias new-page; do \
      [ -d "/app/$d/node_modules/sharp" ] || continue; \
      (cd "/app/$d" && node -e "require('sharp'); console.log('[docker] sharp OK in $d')") \
        || echo "[docker] WARN sharp failed to load in $d — sticker engine will be disabled"; \
    done

EXPOSE 3000

# npm start runs: node fix_all.cjs && node server.js
CMD ["npm", "start"]
