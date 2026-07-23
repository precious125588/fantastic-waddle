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

# Copy dependency manifests first so Docker can cache the install layer
COPY package.json package-lock.json .npmrc ./

# Install root deps.
# NODE_ENV=development so npm ci doesn't skip devDependencies and corrupt the tree.
# --ignore-scripts stops fix_all.cjs postinstall from spawning a nested npm install.
RUN NODE_ENV=development \
    NODE_OPTIONS="--max-old-space-size=512" \
    npm ci --ignore-scripts --no-audit --no-fund

# Copy all source files (including mias/)
COPY . .

# Install mias bot dependencies
RUN cd mias && \
    NODE_OPTIONS="--max-old-space-size=512" \
    npm install --ignore-scripts --no-audit --no-fund --loglevel=error || true

# Install @itsreimau/gktw into mias/ — try npm registry, fall back to GitHub
RUN cd mias && \
    npm install @itsreimau/gktw --no-audit --no-fund --save-optional 2>/dev/null || \
    npm install github:itsreimau/gktw --no-audit --no-fund --save-optional 2>/dev/null || \
    echo "[docker] gktw unavailable — Baileys fallback will be active"

EXPOSE 3000

# npm start runs: node fix_all.cjs && node server.js
# fix_all.cjs applies all runtime patches before the server boots
CMD ["npm", "start"]
