FROM node:22-slim

# System libraries required by canvas / @napi-rs/canvas / sharp native modules
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

# ─────────────────────────────────────────────────────────────────────────────
# WHY THIS FILE LOOKS THE WAY IT DOES
#
# 1. Every workspace (root, mias/, new-page/) ships its OWN .npmrc with
#    legacy-peer-deps=true. npm only reads .npmrc from the CWD (and $HOME) —
#    NOT from a parent folder. `cd mias && npm install` therefore ignored the
#    root .npmrc, hit the jimp@1.6.1 peer conflict from @itsliaaa/baileys and
#    died with ERESOLVE. The old `|| true` hid that, so mias/ and new-page/
#    shipped with NO node_modules at all — which is what "wa-sticker and gktw
#    aren't installing" actually was.
#
# 2. Installs are NOT run with --ignore-scripts any more. sharp needs its
#    install script to fetch the prebuilt linux-x64 binary; skipping it and
#    rebuilding afterwards was the source of
#    "Cannot find module '../build/Release/sharp-linux-x64.node'".
#
# 3. `overrides` in each package.json pins wa-sticker-formatter's sharp to
#    ^0.35.3, so there is exactly ONE sharp in the tree (no nested 0.30 copy
#    that has no Node 22 prebuild and must compile from source).
#
# 4. No gktw install steps. @itsreimau/gktw does not exist on npm and
#    github.com/itsreimau/gktw is 404. new-page/package.json listing it as a
#    hard dependency made the whole install fail with E404. Both bots already
#    fall back to raw Baileys, and the adapters now auto-detect a real helper
#    package if one is ever provided via GKTW_PACKAGE.
#
# 5. No `|| true` on installs. A broken install must fail the build here
#    instead of at runtime in front of your users.
# ─────────────────────────────────────────────────────────────────────────────

# Root deps first so the layer caches
COPY package.json .npmrc ./
RUN NODE_OPTIONS="--max-old-space-size=768" \
    npm install --no-audit --no-fund --loglevel=warn

# Copy all source files (including mias/ and new-page/)
COPY . .

# MIAS bot deps
RUN cd mias && NODE_OPTIONS="--max-old-space-size=768" \
    npm install --no-audit --no-fund --loglevel=warn

# New Page bot deps — separate ESM package with its own node_modules.
# Without this the "New Page" option in the deploy menu dies with
# ERR_MODULE_NOT_FOUND on launch.
RUN cd new-page && NODE_OPTIONS="--max-old-space-size=768" \
    npm install --no-audit --no-fund --loglevel=warn

# Verify the sticker engine really works in every workspace. A build that
# can't make a sticker should fail here, not silently disable the feature.
RUN for d in . mias new-page; do \
      [ -d "/app/$d/node_modules/wa-sticker-formatter" ] || continue; \
      (cd "/app/$d" && node -e "\
        const {Sticker,StickerTypes}=require('wa-sticker-formatter');\
        const sharp=require('sharp');\
        (async()=>{\
          const png=await sharp({create:{width:64,height:64,channels:4,background:{r:0,g:0,b:0,alpha:1}}}).png().toBuffer();\
          const b=await new Sticker(png,{pack:'build',author:'check',type:StickerTypes.FULL}).toBuffer();\
          if(b.slice(8,12).toString()!=='WEBP') throw new Error('not a webp');\
          console.log('[docker] sticker engine OK in $d (sharp '+sharp.versions.sharp+')');\
        })().catch(e=>{console.error('[docker] sticker engine FAILED in $d:',e.message);process.exit(1);});"); \
    done

EXPOSE 3000

# npm start runs: node fix_all.cjs && node fix_session_401.cjs && node server.js
CMD ["npm", "start"]
