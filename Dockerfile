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

# Copy all source files (including mias/)
COPY . .

# Install mias bot dependencies (has its own package.json, no lockfile)
RUN cd mias && \
    NODE_OPTIONS="--max-old-space-size=512" \
    npm install --ignore-scripts --no-audit --no-fund --loglevel=warn || true

# Install @itsreimau/gktw into mias/ — try npm registry, fall back to GitHub
RUN cd mias && \
    npm install @itsreimau/gktw --no-audit --no-fund --save-optional 2>/dev/null || \
    npm install github:itsreimau/gktw --no-audit --no-fund --save-optional 2>/dev/null || \
    echo "[docker] gktw unavailable — Baileys fallback active"

# Sharp's postinstall was skipped by --ignore-scripts above. Run it explicitly
# so the prebuilt native binary (sharp-linux-x64.node) is downloaded for every
# copy of sharp under mias/node_modules — including the nested one inside
# wa-sticker-formatter. Without this the sticker engine gets disabled at boot.
RUN cd mias && npm rebuild sharp --no-audit --no-fund

EXPOSE 3000

# npm start runs: node fix_all.cjs && node server.js
CMD ["npm", "start"]
