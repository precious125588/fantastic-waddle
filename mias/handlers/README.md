# MIAS Handlers — Baileys Abstraction Layer

All commands should call these handlers instead of touching `@itsliaaa/baileys` directly.

```
Commands
    ↓
handlers/ (this directory)
    ↓
@itsliaaa/baileys
    ↓
WhatsApp
```

## Files

| File | Purpose |
|------|---------|
| `baileysHandler.js` | Main entry — re-exports all handlers + core Baileys utilities |
| `reactionHandler.js` | `reactProcessing(🌀)`, `reactSuccess(✅)`, `reactFail(❌)`, `withReactions()` |
| `messageHandler.js` | `sendText`, `sendRaw`, `sendLong`, `sendWithTyping` |
| `mediaHandler.js` | `sendImage`, `sendVideo`, `sendAudio`, `sendSticker`, `sendDocument`, `sendCodeDocument`, `sendAlbum`, `sendGif` |
| `interactiveHandler.js` | `sendButtons`, `sendList`, `sendHeroCard`, `sendCarousel`, `buildExternalAdReply` |
| `uploadHandler.js` | `fetchBuffer`, `generateImageThumbnail`, `generateVideoThumbnail`, upload cache |
| `downloadHandler.js` | `downloadMedia`, `downloadQuotedMedia`, `fetchBuffer` |
| `contactHandler.js` | `sendContact`, `sendContacts`, `buildVCard` |
| `statusHandler.js` | `postTextStatus`, `postImageStatus`, `postVideoStatus`, `postAudioStatus` |

## Usage in a new command

```javascript
import { withReactions, sendImage, sendButtons } from "../handlers/baileysHandler.js";

cmd("example", { desc: "Demo", category: "MISC" }, async (sock, msg, args) => {
  await withReactions(sock, msg, async () => {
    await sendImage(sock, msg, "https://example.com/image.jpg", "Hello!");
    await sendButtons(sock, msg.key.remoteJid, msg, "What next?", [
      { text: "Option A", id: ".cmd-a" },
      { text: "Option B", id: ".cmd-b" },
    ]);
  });
});
```

## Key improvements over direct Baileys calls

- **`jpegThumbnail` is always a Buffer** — embedded in the message, visible to ALL recipients without external fetches
- **Thumbnail generation** — images/videos/audio artwork auto-generate thumbnails via Jimp/sharp/ffmpeg
- **Interactive fallback** — if native-flow buttons fail, automatically sends a numbered text list
- **Type-safe document send** — `sendCodeDocument` correctly sends `.js` files as WhatsApp's "View code" format
- **Reaction lifecycle** — `withReactions()` guarantees ✅ on success and ❌ on failure with no extra boilerplate
