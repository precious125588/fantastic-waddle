# MIAS Bot — Architecture Overview

## Messaging Architecture

```
Commands (case.js / mias/index.js / mias/nix/ / mias/nexray_bot.cjs)
        ↓
MIAS Handlers (mias/handlers/baileysHandler.js — single import point)
        ↓
Baileys Adapter (mias/handlers/gktwAdapter.js)
        ↓
GKTW Helper (@itsreimau/gktw — auto-detected, Baileys fallback if absent)
        ↓
WhatsApp
```

## Core Principle

**Commands must NEVER import Baileys or GKTW directly.**

All messaging goes through the handler system. The Baileys Adapter (`gktwAdapter.js`) is the **only** layer that communicates with `@whiskeysockets/baileys` or `@itsreimau/gktw`.

## Directory Structure

```
mias/
├── index.js              — Bot entry point (ESM, 37k lines)
├── package.json          — "type": "module" — ESM context
├── handlers/
│   ├── baileysHandler.js — Universal API + main export hub
│   ├── gktwAdapter.js    — ONLY file touching Baileys/GKTW
│   ├── globals.js        — Installs handlers on globalThis.__MIAS__
│   ├── bridge.cjs        — CJS proxy for case.js + nexray_bot.cjs
│   ├── messageHandler.js — Text, reply, long messages
│   ├── mediaHandler.js   — Image, video, audio, sticker, gif, document, album
│   ├── interactiveHandler.js — Buttons, lists, hero cards, carousels
│   ├── buttonHandler.js  — Extended button system + Button Mode
│   ├── reactionHandler.js — Emoji reactions + withReactions() wrapper
│   ├── menuHandler.js    — Bot menu with interactive categories
│   ├── uploadHandler.js  — fetchBuffer, thumbnails, catbox upload
│   ├── downloadHandler.js — downloadMedia, downloadQuotedMedia, viewOnce
│   ├── statusHandler.js  — WhatsApp Status / Story posting
│   ├── contactHandler.js — vCard building and sending
│   ├── forwardHandler.js — Message forwarding
│   ├── codeHandler.js    — Code viewer (text + document fallback)
│   ├── utilityHandler.js — JID utils, text extraction, timing helpers
│   └── README.md         — Full API reference
├── nix/                  — NIX Assistant System
│   ├── index.js          — Command router
│   ├── menu.js           — Nix menu
│   ├── ui.js             — Typing indicators, staged send
│   └── modules/
│       ├── ai.js
│       ├── media.js      — Uses handlers (no direct Baileys)
│       ├── account.js
│       ├── whatsapp.js
│       ├── groups.js
│       ├── system.js
│       └── ...
├── lib/
│   ├── kevdraPatches.js  — Stability: session health, resource monitor
│   ├── stickerCmd.js     — Sticker-to-command binding system
│   ├── autoDownloader.js — Auto social media downloader
│   └── ...
└── api.js                — API routing (ZeroAPI → Prexzy → Nexray fallback)
```

## ESM/CJS Interoperability

The project has two contexts:

| Context | Files | Module System |
|---------|-------|---------------|
| **mias/** | `mias/index.js`, `mias/nix/`, `mias/handlers/` (except bridge.cjs) | **ESM** (`type: module`) |
| **Root** | `case.js`, `bot.js`, `server.js`, `nexray_bot.cjs` | **CommonJS** |

### Bridge Pattern

CJS files access the handler system through `bridge.cjs`:

```js
// In case.js or nexray_bot.cjs:
const MIAS = require('./mias/handlers/bridge.cjs');
await MIAS.sendText(sock, jid, "Hello!");
```

The bridge is a Proxy that forwards calls to `globalThis.__MIAS__`, which `mias/index.js` populates at startup via `globals.js`.

## GKTW Feature Detection

```
sendInteractiveMessage() called
        ↓
Is @itsreimau/gktw installed? → YES → Use GKTW
                               → NO  → Build via Baileys proto
        ↓
WhatsApp receives the message
```

No command-level code changes needed when GKTW is installed or updated.

## Adding a Command (Template)

```js
// ESM command in mias/:
import * as MIAS from "../../handlers/baileysHandler.js";

export async function myCommand(sock, msg, args) {
  await MIAS.reactProcessing(sock, msg);
  // ... business logic ...
  await MIAS.sendText(sock, msg.key.remoteJid, "Result", { quoted: msg });
  await MIAS.reactSuccess(sock, msg);
}

// CJS command in case.js:
const MIAS = require('./mias/handlers/bridge.cjs');
// same API
```

## Future Stability

When Baileys is updated:
- Only `gktwAdapter.js` and possibly `baileysHandler.js` need changes
- All commands continue working without modification

When GKTW is updated:
- Only `gktwAdapter.js` needs changes
- Automatic feature detection handles everything else
