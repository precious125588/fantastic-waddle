# MIAS Handler System — Architecture Reference

```
Commands
    ↓
MIAS Handlers  ← single import point for all commands
    ↓
Baileys Adapter  (baileysHandler.js routes through gktwAdapter.js)
    ↓
GKTW Helper  (auto-detected; Baileys fallback when absent)
    ↓
WhatsApp
```

## Rule: Commands NEVER import Baileys or GKTW directly

All messaging must go through the handler system. The Baileys adapter is the **only** layer that communicates with `@whiskeysockets/baileys` or `@itsreimau/gktw`.

---

## Files

| File | Purpose |
|------|---------|
| `baileysHandler.js` | **Main entry point.** Re-exports all sibling handlers. Exposes core utilities: `deleteMessage`, `editMessage`, `getPresence`, `isOnWhatsApp`, `getProfilePicture`, `prepareContextInfo`, `prepareExternalAdReply`, `sendLocation`. |
| `gktwAdapter.js` | **Baileys Adapter + GKTW integration.** The ONLY file that imports `@whiskeysockets/baileys` or `@itsreimau/gktw`. Provides `smartSend()`, `sendInteractiveMessage()`, proto access, and all low-level Baileys wrappers. |
| `globals.js` | Installs all handlers onto `globalThis.__MIAS__` at bot startup so CJS files (case.js, nexray_bot.cjs) can access the handler system via `bridge.cjs`. |
| `bridge.cjs` | CJS proxy bridge. `require('./mias/handlers/bridge.cjs')` returns a Proxy that forwards every call to `globalThis.__MIAS__`. Use in any CommonJS file. |
| `messageHandler.js` | `sendText`, `sendReply`, `sendRaw`, `sendLong`, `sendWithTyping`, `editText`, `sendMention` |
| `mediaHandler.js` | `sendImage`, `sendVideo`, `sendGif`, `sendAudio`, `sendSticker`, `sendDocument`, `sendCodeDocument`, `sendAlbum`, `prepareThumbnail` |
| `interactiveHandler.js` | `sendButtons`, `sendList`, `sendHeroCard`, `sendCarousel`, `buildExternalAdReply` |
| `buttonHandler.js` | Extended button system: `sendButtons`, `sendList`, `sendHeroCard`, `sendUrlButtons`, `sendCarousel`, `sendNativeFlow`, `autoButton`. Controls global Button Mode via `setButtonMode()`/`isButtonMode()`. |
| `reactionHandler.js` | `sendReaction`, `clearReaction`, `reactProcessing`, `reactWaiting`, `reactSuccess`, `reactFail`, `reactError`, `reactLoading`, `withReactions`, `reactSequence` |
| `menuHandler.js` | `sendMenu` (full bot info + interactive category buttons), `sendCategoryMenu`, `sendCommandCount` |
| `uploadHandler.js` | `fetchBuffer`, `generateImageThumbnail`, `generateVideoThumbnail`, `uploadToCatbox`, `uploadMedia` |
| `downloadHandler.js` | `downloadMedia`, `downloadQuotedMedia`, `downloadViewOnce`, `fetchBuffer`, `getMessageType` |
| `statusHandler.js` | `getStatusAudience`, `postTextStatus`, `postImageStatus`, `postVideoStatus`, `postAudioStatus` |
| `contactHandler.js` | `buildVCard`, `sendContact`, `sendContacts`, `parseVCard` |
| `forwardHandler.js` | `forwardMessage`, `forwardSilent`, `broadcastForward`, `resendMessage` |
| `codeHandler.js` | `sendCode`, `sendCodeMulti` — code viewer with auto-document fallback for long code |
| `utilityHandler.js` | JID utils, text extraction, mention parsing, uptime formatting, `sleep`, `withRetry`, `setPresence`, `withTyping`, `markRead` |

---

## Universal API — Quick Reference

```js
// ESM (mias/ directory):
import * as MIAS from "../handlers/baileysHandler.js";

// CJS (case.js, nexray_bot.cjs):
const MIAS = require('./mias/handlers/bridge.cjs');

// ── Text ──────────────────────────────────────────────────────────────────
await MIAS.sendText(sock, jid, "Hello!");
await MIAS.sendReply(sock, jid, "Hello!", quotedMsg);
await MIAS.sendLong(sock, jid, veryLongText);
await MIAS.sendWithTyping(sock, jid, "Typing for 1 second...");

// ── Media ─────────────────────────────────────────────────────────────────
await MIAS.sendImage(sock, jid, buffer, { caption: "Caption" });
await MIAS.sendVideo(sock, jid, buffer, { caption: "Video" });
await MIAS.sendAudio(sock, jid, buffer, { ptt: true });   // voice note
await MIAS.sendSticker(sock, jid, webpBuffer);
await MIAS.sendGif(sock, jid, mp4Buffer);
await MIAS.sendDocument(sock, jid, pdfBuffer, { filename: "file.pdf" });
await MIAS.sendAlbum(sock, jid, [{type:"image",data:buf1},{type:"video",data:buf2}]);

// ── Interactive ───────────────────────────────────────────────────────────
await MIAS.sendButtons(sock, jid, "Choose:", [{text:"Yes",id:"yes"},{text:"No",id:"no"}]);
await MIAS.sendList(sock, jid, "Select:", [{title:"Options",rows:[{id:"1",title:"Item 1"}]}]);
await MIAS.sendHeroCard(sock, jid, { body: "Text", image: buf, buttons: [{text:"Tap",id:"cmd"}] });
await MIAS.sendCarousel(sock, jid, [{title:"Card 1",body:"...",buttons:[]}]);
await MIAS.sendNativeFlow(sock, jid, { body: "Text", buttons: [{text:"Btn",id:"id"}] });

// ── Reactions ─────────────────────────────────────────────────────────────
await MIAS.sendReaction(sock, msg, "🔥");
await MIAS.reactSuccess(sock, msg);
await MIAS.reactFail(sock, msg);
await MIAS.reactProcessing(sock, msg);

// Wrap with auto reactions:
await MIAS.withReactions(sock, msg, async () => {
  await MIAS.sendText(sock, jid, "Done!");
});

// ── Download / Upload ─────────────────────────────────────────────────────
const buf = await MIAS.downloadMedia(msg);
const { buffer, type } = await MIAS.downloadQuotedMedia(msg);
const { buffer } = await MIAS.downloadViewOnce(msg);
const url = await MIAS.uploadToCatbox(buf, "photo.jpg", "image/jpeg");

// ── Status / Contact ──────────────────────────────────────────────────────
await MIAS.postTextStatus(sock, "Good morning! 🌅");
await MIAS.postImageStatus(sock, imageBuf, { caption: "Check this out!" });
await MIAS.sendContact(sock, jid, { displayName: "John", phone: "23480000000" });

// ── Forward / Delete / Edit ───────────────────────────────────────────────
await MIAS.forwardMessage(sock, toJid, msg);
await MIAS.deleteMessage(sock, jid, msg.key);
await MIAS.editMessage(sock, jid, msg.key, "Updated text");

// ── Utility ───────────────────────────────────────────────────────────────
const ctx = MIAS.prepareContextInfo({ quoted: msg, mentionedJid: "123@s.whatsapp.net" });
const ear = MIAS.prepareExternalAdReply({ title: "MIAS Bot", sourceUrl: "https://example.com" });
await MIAS.sendLocation(sock, jid, 6.5244, 3.3792, { name: "Lagos" });
await MIAS.sendCode(sock, jid, "console.log('hello')", { lang: "js", title: "Test" });
await MIAS.sendMenu(sock, jid, msg, { userName: pushName });
```

---

## GKTW Integration

`gktwAdapter.js` auto-detects `@itsreimau/gktw` at runtime:
- If installed → used for interactive/native-flow messages (better compatibility)
- If absent → falls back to raw Baileys proto (identical output)

To install gktw:
```bash
cd mias && npm install @itsreimau/gktw
```

No code changes required — the adapter handles everything automatically.

---

## Adding New Commands

A new command only needs business logic:

```js
// ESM command:
import * as MIAS from "../../handlers/baileysHandler.js";

export async function weatherCmd(sock, msg, args) {
  const city = args.join(" ") || "Lagos";
  await MIAS.reactProcessing(sock, msg);
  try {
    const data = await fetchWeatherApi(city);
    await MIAS.sendText(sock, msg.key.remoteJid, `🌤 *${city}*\n${data.description}\n${data.temp}°C`, { quoted: msg });
    await MIAS.reactSuccess(sock, msg);
  } catch {
    await MIAS.reactFail(sock, msg);
  }
}
```

The command never knows about:
- How Baileys works
- How GKTW works
- How interactive messages are built
- How media is uploaded
- How thumbnails are generated
- How ContextInfo or ExternalAdReply is structured

**Handlers take care of everything.**
