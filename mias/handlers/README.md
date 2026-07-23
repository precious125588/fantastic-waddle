# MIAS Handler System — Architecture Reference  v3

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
| `baileysHandler.js` | **Main entry point.** Re-exports all sibling handlers. Exposes core utilities: `deleteMessage`, `editMessage`, `getPresence`, `isOnWhatsApp`, `getProfilePicture`, `getGroupMetadata`, `groupFetchAllParticipating`, `prepareContextInfo`, `prepareExternalAdReply`, `sendLocation`, `sendPollMessage`. |
| `gktwAdapter.js` | **Baileys Adapter + GKTW integration.** The ONLY file that imports `@whiskeysockets/baileys` or `@itsreimau/gktw`. Provides `smartSend()`, `sendInteractiveMessage()`, `sendPoll()`, `getGroupMetadata()`, `isJidNewsletter()`, proto access, and all low-level Baileys wrappers. |
| `globals.js` | Installs all handlers onto `globalThis.__MIAS__` at bot startup so CJS files (case.js, nexray_bot.cjs) can access the handler system via `bridge.cjs`. |
| `bridge.cjs` | CJS proxy bridge. `require('./mias/handlers/bridge.cjs')` returns a Proxy that forwards every call to `globalThis.__MIAS__`. Use in any CommonJS file. |
| `messageHandler.js` | `sendText`, `sendReply` (dual-signature), `sendRaw`, `sendLong`, `sendWithTyping`, `sendTyping`, `sendRead`, `editText`, `sendMention`, `sendPoll` |
| `mediaHandler.js` | `sendImage`, `sendVideo`, `sendGif`, `sendAudio`, `sendVoiceNote`, `sendSticker`, `sendDocument`, `sendMediaFromUrl`, `sendAlbum`, `prepareThumbnail`, `guessMime` |
| `interactiveHandler.js` | `sendButtons`, `sendInteractive`, `sendList`, `sendUrlButtons`, `sendHeroCard`, `sendCarousel`, `sendPollInteractive`, `buildExternalAdReply` |
| `buttonHandler.js` | Extended button system: `sendCopyButton`, `sendCallButton`, `sendNativeFlow`, `sendContactWithButtons`, `autoButton`. Controls global Button Mode via `setButtonMode()`/`isButtonMode()`. |
| `reactionHandler.js` | `sendReaction`, `reactCustom`, `clearReaction`, `reactProcessing`, `reactWaiting`, `reactSuccess`, `reactFail`, `reactError`, `reactLoading`, `reactDownload`, `reactFire`, `reactLike`, `withReactions`, `reactSequence`, `reactSet`, `REACTIONS`, `REACTION_SETS` |
| `menuHandler.js` | `sendMenu` (full bot info + interactive category buttons), `sendCategoryMenu`, `sendCommandCount` |
| `uploadHandler.js` | `fetchBuffer` (with retry), `generateImageThumbnail`, `generateVideoThumbnail`, `uploadToCatbox`, `uploadMedia`, `cleanupTemp` |
| `downloadHandler.js` | `downloadMedia`, `downloadQuotedMedia`, `downloadViewOnce`, `downloadFromUrl`, `fetchBuffer`, `getMessageType`, `hasMedia` |
| `statusHandler.js` | `getStatusAudience`, `postTextStatus`, `postImageStatus`, `postVideoStatus`, `postAudioStatus`, `postStickerStatus`, `postDocumentStatus` |
| `contactHandler.js` | `buildVCard`, `fetchProfilePic`, `sendContact`, `sendContacts`, `sendBotVCard`, `parseVCard` |
| `forwardHandler.js` | `forwardMessage`, `forwardSilent`, `broadcastForward`, `resendMessage` |
| `codeHandler.js` | `sendCode`, `sendCodeMulti` — code viewer with auto-document fallback for long code |
| `utilityHandler.js` | JID utils (`normalizeJid`, `phoneFromJid`, `toUserJid`, `isGroupJid`, `isBroadcastJid`, `isNewsletterJid`, `isUserJid`, `resolveJid`), sender helpers (`getEffectiveSender`, `isBotMessage`), text extraction (`extractText`, `extractBody`, `getQuoted`, `getMentions`, `extractCommandName`), timing (`sleep`, `withRetry`), formatting (`formatUptime`, `formatBytes`), presence (`setPresence`, `withTyping`, `markRead`) |

---

## Universal API — Quick Reference

```js
// ESM (mias/ directory):
import * as MIAS from "../handlers/baileysHandler.js";

// CJS (case.js, nexray_bot.cjs):
const MIAS = require('./mias/handlers/bridge.cjs');

// ── Text ──────────────────────────────────────────────────────────────────
await MIAS.sendText(sock, jid, "Hello!");
await MIAS.sendReply(sock, jid, "Hi!", quotedMsg);     // explicit JID
await MIAS.sendReply(sock, msg, "Hi!");                // shorthand — jid auto-extracted
await MIAS.sendLong(sock, jid, veryLongText);
await MIAS.sendWithTyping(sock, jid, "Typing for 1s...");
await MIAS.sendMention(sock, jid, "Hey @you!", ["2348000000000@s.whatsapp.net"]);
await MIAS.sendPoll(sock, jid, "Favourite language?", ["JavaScript", "Python", "Go"]);
await MIAS.sendRead(sock, msg);
await MIAS.sendTyping(sock, jid, "composing");

// ── Media ─────────────────────────────────────────────────────────────────
await MIAS.sendImage(sock, jid, buffer, { caption: "Caption" });
await MIAS.sendVideo(sock, jid, buffer, { caption: "Video" });
await MIAS.sendAudio(sock, jid, buffer);
await MIAS.sendVoiceNote(sock, jid, opusBuffer);     // PTT voice note
await MIAS.sendSticker(sock, jid, webpBuffer);
await MIAS.sendGif(sock, jid, mp4Buffer);
await MIAS.sendDocument(sock, jid, pdfBuffer, { filename: "file.pdf" });
await MIAS.sendMediaFromUrl(sock, jid, "https://example.com/photo.jpg");
await MIAS.sendAlbum(sock, jid, [{type:"image",data:buf1},{type:"video",data:buf2}]);

// ── Interactive ───────────────────────────────────────────────────────────
await MIAS.sendButtons(sock, jid, "Choose:", [{text:"Yes",id:"yes"},{text:"No",id:"no"}]);
await MIAS.sendList(sock, jid, "Select:", [{title:"Options",rows:[{id:"1",title:"Item"}]}]);
await MIAS.sendUrlButtons(sock, jid, "Visit us:", [{text:"Website",url:"https://example.com"}]);
await MIAS.sendHeroCard(sock, jid, { body: "Text", image: buf, buttons: [{text:"Tap",id:"cmd"}] });
await MIAS.sendCarousel(sock, jid, [{title:"Card 1",body:"...",buttons:[]}]);
await MIAS.sendPollInteractive(sock, jid, "Vote:", ["Option A", "Option B", "Option C"]);

// ── Reactions ─────────────────────────────────────────────────────────────
await MIAS.sendReaction(sock, msg, "🔥");
await MIAS.reactCustom(sock, msg, "🎉");
await MIAS.reactSuccess(sock, msg);
await MIAS.reactFail(sock, msg);
await MIAS.reactProcessing(sock, msg);
await MIAS.reactDownload(sock, msg);
await MIAS.reactSet(sock, msg, "PROCESS_OK");         // two-step reaction sequence

// Wrap with auto reactions:
await MIAS.withReactions(sock, msg, async () => {
  await MIAS.sendText(sock, jid, "Done!");
});

// ── Download / Upload ─────────────────────────────────────────────────────
const buf  = await MIAS.downloadMedia(msg);
const { buffer, type } = await MIAS.downloadQuotedMedia(msg);
const { buffer } = await MIAS.downloadViewOnce(msg);
const buf2 = await MIAS.downloadFromUrl("https://example.com/file.mp4");
const url  = await MIAS.uploadToCatbox(buf, "photo.jpg", "image/jpeg");
const hasM = MIAS.hasMedia(msg);

// ── Status / Contact ──────────────────────────────────────────────────────
await MIAS.postTextStatus(sock, "Good morning!");
await MIAS.postImageStatus(sock, imageBuf, { caption: "Check this out!" });
await MIAS.postVideoStatus(sock, videoBuf);
await MIAS.postAudioStatus(sock, audioBuf);
await MIAS.postStickerStatus(sock, webpBuf);
await MIAS.postDocumentStatus(sock, pdfBuf, { filename: "doc.pdf" });
await MIAS.sendContact(sock, jid, { displayName: "John", phone: "23480000000" });

// ── Forward / Delete / Edit ───────────────────────────────────────────────
await MIAS.forwardMessage(sock, toJid, msg);
await MIAS.forwardSilent(sock, toJid, msg);            // no "Forwarded" label
await MIAS.broadcastForward(sock, [jid1, jid2], msg);
await MIAS.deleteMessage(sock, jid, msg.key);
await MIAS.editMessage(sock, jid, msg.key, "Updated text");

// ── Group / WhatsApp queries ──────────────────────────────────────────────
const meta = await MIAS.getGroupMetadata(sock, "120363000000@g.us");
const all  = await MIAS.groupFetchAllParticipating(sock);
const pic  = await MIAS.getProfilePicture(sock, jid);
const wa   = await MIAS.isOnWhatsApp(sock, ["23480000000@s.whatsapp.net"]);

// ── Utility ───────────────────────────────────────────────────────────────
const ctx = MIAS.prepareContextInfo({ quoted: msg, mentionedJid: "123@s.whatsapp.net" });
const ear = MIAS.prepareExternalAdReply({ title: "MIAS Bot", sourceUrl: "https://example.com" });
await MIAS.sendLocation(sock, jid, 6.5244, 3.3792, { name: "Lagos" });
await MIAS.sendCode(sock, jid, "console.log('hello')", { lang: "js", title: "Test" });
await MIAS.sendMenu(sock, jid, msg, { userName: pushName });
await MIAS.sendPollMessage(sock, jid, "Best bot?", ["MIAS", "Other"]);

// ── Message parsing ───────────────────────────────────────────────────────
const body    = MIAS.extractText(msg);         // or extractBody()
const sender  = MIAS.getEffectiveSender(msg);  // real sender in groups
const quoted  = MIAS.getQuoted(msg);
const mentions= MIAS.getMentions(msg);
const isBot   = MIAS.isBotMessage(msg);
const isGroup = MIAS.isGroupJid(jid);
const jid2    = MIAS.resolveJid("234801234567");  // "234801234567@s.whatsapp.net"

// ── Timing ────────────────────────────────────────────────────────────────
await MIAS.sleep(1000);
const result = await MIAS.withRetry(() => fetchSomething(), 3, 500);
await MIAS.markRead(sock, msg);
await MIAS.withTyping(sock, jid, async () => {
  await doSlowWork();
});
```

---

## sendReply — Dual Signature

`sendReply` now supports two call styles:

```js
// Explicit: jid + quoted message
await MIAS.sendReply(sock, jid, "Hello!", quotedMsg);

// Shorthand: pass the full WAMessage — jid is auto-extracted
await MIAS.sendReply(sock, msg, "Hello!");
```

Both signatures are backward-compatible.

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

## New in v3

| Feature | Location |
|---------|---------|
| `sendPoll()` | `messageHandler.js` + `gktwAdapter.js` |
| `sendVoiceNote()` | `mediaHandler.js` |
| `sendMediaFromUrl()` | `mediaHandler.js` |
| `sendInteractive()` | `interactiveHandler.js` |
| `sendPollInteractive()` | `interactiveHandler.js` |
| `sendUrlButtons()` | `interactiveHandler.js` |
| `buildExternalAdReply()` | `interactiveHandler.js` |
| `postStickerStatus()` | `statusHandler.js` |
| `postDocumentStatus()` | `statusHandler.js` |
| `reactCustom()` | `reactionHandler.js` |
| `reactDownload()`, `reactFire()`, `reactLike()` | `reactionHandler.js` |
| `reactSet()` | `reactionHandler.js` |
| `REACTION_SETS` | `reactionHandler.js` |
| `downloadFromUrl()` | `downloadHandler.js` |
| `hasMedia()` | `downloadHandler.js` |
| `fetchBuffer()` with retry | `uploadHandler.js` |
| `cleanupTemp()` | `uploadHandler.js` |
| `getGroupMetadata()` | `gktwAdapter.js` + `baileysHandler.js` |
| `groupFetchAllParticipating()` | `gktwAdapter.js` + `baileysHandler.js` |
| `isJidNewsletter()`, `isJidGroup()`, `isJidUser()` | `gktwAdapter.js` |
| `extractBody()` | `utilityHandler.js` |
| `getEffectiveSender()` | `utilityHandler.js` |
| `isBotMessage()` | `utilityHandler.js` |
| `isNewsletterJid()`, `isUserJid()` | `utilityHandler.js` |
| `resolveJid()` | `utilityHandler.js` |
| `formatBytes()` | `utilityHandler.js` |
| `sendRead()`, `sendTyping()` | `messageHandler.js` |
| `sendPollMessage()` | `baileysHandler.js` |
| Fixed: `statusHandler.js` no longer imports Baileys directly | `statusHandler.js` |

---

## Adding New Commands

A new command only needs business logic:

```js
// ESM command:
import * as MIAS from "../../handlers/baileysHandler.js";

export async function weatherCmd(sock, msg, args) {
  const city = args.join(" ") || "Lagos";
  const jid  = msg.key.remoteJid;

  await MIAS.reactProcessing(sock, msg);
  try {
    const data = await fetchWeatherApi(city);
    await MIAS.sendText(sock, jid, `🌤 *${city}*\n${data.description}\n${data.temp}°C`, { quoted: msg });
    await MIAS.reactSuccess(sock, msg);
  } catch (err) {
    await MIAS.reactFail(sock, msg);
    await MIAS.sendReply(sock, msg, `❌ Could not fetch weather for *${city}*.`);
  }
}
```

The command never knows about:
- How Baileys works
- How GKTW works
- How interactive messages are built
- How media is uploaded / downloaded
- How thumbnails are generated
- How ContextInfo or ExternalAdReply is structured

**Handlers take care of everything.**
