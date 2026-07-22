/**
 * MIAS — Wizard Handler  v1
 *
 * Manages per-user command wizard sessions for Button Mode.
 * When a user selects a command that needs input, a wizard session
 * is started. The very next message from that user is treated as
 * input for the chosen command and auto-executed.
 *
 * Only active when Button Mode is ON.  Text Mode is untouched.
 *
 * Architecture:  Button Mode → Wizard → Command Dispatch
 */

// ─── Session store ─────────────────────────────────────────────────────────
// Keyed by effective JID (sender JID in groups, chat JID in DMs)
// { command, prompt, startedAt, expiresAt, timeoutRef }
const _sessions = new Map();

const DEFAULT_TIMEOUT_MS = 90_000; // 90 seconds

// ─── Command input registry ─────────────────────────────────────────────────
// Maps command names → input spec.
// null  = execute immediately, no input needed.
// object = { prompt, type }

export const COMMAND_INPUTS = {
  // ── Downloads ──────────────────────────────────────────────────────────────
  play:         { prompt: "Enter the song name or YouTube URL:", type: "text" },
  song:         { prompt: "Enter the song name to search:", type: "text" },
  video:        { prompt: "Enter the YouTube URL or search term:", type: "text" },
  ytmp3:        { prompt: "Send the YouTube URL to download as audio:", type: "text" },
  ytmp4:        { prompt: "Send the YouTube URL to download as video:", type: "text" },
  spotify:      { prompt: "Enter the Spotify URL or song name:", type: "text" },
  facebook:     { prompt: "Send the Facebook video URL:", type: "text" },
  instagram:    { prompt: "Send the Instagram post or reel URL:", type: "text" },
  tiktok:       { prompt: "Send the TikTok URL:", type: "text" },
  pinterest:    { prompt: "Enter a Pinterest search query:", type: "text" },
  mediafire:    { prompt: "Send the MediaFire file URL:", type: "text" },
  apk:          { prompt: "Enter the app name to search:", type: "text" },
  twitter:      { prompt: "Send the Twitter/X post URL:", type: "text" },
  xdownload:    { prompt: "Send the X (Twitter) post URL:", type: "text" },
  soundcloud:   { prompt: "Enter the SoundCloud URL or song name:", type: "text" },
  // ── AI ─────────────────────────────────────────────────────────────────────
  ai:           { prompt: "Enter your message for the AI assistant:", type: "text" },
  gpt:          { prompt: "Enter your question for GPT:", type: "text" },
  chatgpt:      { prompt: "Enter your question for ChatGPT:", type: "text" },
  gemi:         { prompt: "Enter your message for Gemini AI:", type: "text" },
  gemini:       { prompt: "Enter your message for Gemini:", type: "text" },
  claude:       { prompt: "Enter your message for Claude AI:", type: "text" },
  bing:         { prompt: "Enter your message for Bing AI:", type: "text" },
  imagine:      { prompt: "Describe the image you want to generate:", type: "text" },
  dalle:        { prompt: "Describe the image you want DALL-E to create:", type: "text" },
  gpt4:         { prompt: "Enter your question for GPT-4:", type: "text" },
  // ── Search ─────────────────────────────────────────────────────────────────
  google:       { prompt: "Enter your Google search query:", type: "text" },
  youtube:      { prompt: "Enter the YouTube search query:", type: "text" },
  wiki:         { prompt: "Enter the Wikipedia topic to look up:", type: "text" },
  wikipedia:    { prompt: "Enter the Wikipedia topic to search:", type: "text" },
  weather:      { prompt: "Enter the city name for weather info:", type: "text" },
  news:         { prompt: "Enter a news topic or keyword:", type: "text" },
  // ── Media ──────────────────────────────────────────────────────────────────
  sticker:      { prompt: "Send or reply to an image/video to convert to sticker.", type: "media" },
  toimg:        { prompt: "Reply to a sticker to convert it to an image.", type: "media" },
  toanim:       { prompt: "Reply to an animated sticker to convert to GIF.", type: "media" },
  togif:        { prompt: "Reply to a video to convert to GIF.", type: "media" },
  ttp:          { prompt: "Enter the text to convert to a sticker:", type: "text" },
  attp:         { prompt: "Enter the text to convert to an animated sticker:", type: "text" },
  remini:       { prompt: "Send or reply to a photo to enhance with Remini AI.", type: "media" },
  enhance:      { prompt: "Send or reply to an image to enhance.", type: "media" },
  watermark:    { prompt: "Send or reply to an image to remove the watermark.", type: "media" },
  ocr:          { prompt: "Send or reply to an image to extract its text.", type: "media" },
  // ── Tools ──────────────────────────────────────────────────────────────────
  translate:    { prompt: "Enter: <language> <text>\nExample: french Hello world", type: "text" },
  shorten:      { prompt: "Enter the URL to shorten:", type: "text" },
  qr:           { prompt: "Enter the text or URL for the QR code:", type: "text" },
  base64:       { prompt: "Enter the text to encode in Base64:", type: "text" },
  decode:       { prompt: "Enter the Base64 string to decode:", type: "text" },
  carbon:       { prompt: "Enter the code to generate a Carbon code image:", type: "text" },
  // ── Group ──────────────────────────────────────────────────────────────────
  kick:         { prompt: "Reply to or mention the member to kick.", type: "mention" },
  promote:      { prompt: "Reply to or mention the member to promote to admin.", type: "mention" },
  demote:       { prompt: "Reply to or mention the member to demote from admin.", type: "mention" },
  mute:         { prompt: "Reply to or mention the member to mute.", type: "mention" },
  unmute:       { prompt: "Reply to or mention the member to unmute.", type: "mention" },
  warn:         { prompt: "Reply to or mention the member to warn.", type: "mention" },
  tagall:       { prompt: "Enter a message to tag all members with (or send blank):", type: "text" },
  // ── Fun ────────────────────────────────────────────────────────────────────
  "8ball":      { prompt: "Ask the magic 8-ball a yes/no question:", type: "text" },
  roast:        { prompt: "Enter a name or topic to roast:", type: "text" },
  ship:         { prompt: "Enter two names to ship (e.g. Alice Bob):", type: "text" },
  // ── Converter ──────────────────────────────────────────────────────────────
  convert:      { prompt: "Enter: <value> <from-unit> <to-unit>\nExample: 100 kg lbs", type: "text" },
  currency:     { prompt: "Enter: <amount> <from> <to>\nExample: 100 USD NGN", type: "text" },
  // ── Anime ──────────────────────────────────────────────────────────────────
  anime:        { prompt: "Enter the anime name or topic to search:", type: "text" },
  manga:        { prompt: "Enter the manga title to search:", type: "text" },
  // ── No input needed ────────────────────────────────────────────────────────
  ping:         null,
  alive:        null,
  runtime:      null,
  uptime:       null,
  botinfo:      null,
  menu:         null,
  owner:        null,
  joke:         null,
  fact:         null,
  quote:        null,
  riddle:       null,
  dare:         null,
  truth:        null,
  waifu:        null,
  neko:         null,
  husbando:     null,
  meme:         null,
  open:         null,
  close:        null,
  link:         null,
  revoke:       null,
  hidetag:      null,
  tictactoe:    null,
  wordle:       null,
  quiz:         null,
  trivia:       null,
  setting:      null,
  buttonsmode:  null,
  richmode:     null,
  autochat:     null,
  autoview:     null,
  autolike:     null,
  ban:          { prompt: "Enter the phone number to ban (e.g. 234xxxxxxx):", type: "text" },
  unban:        { prompt: "Enter the phone number to unban:", type: "text" },
  broadcast:    { prompt: "Enter the message to broadcast to all chats:", type: "text" },
  setprefix:    { prompt: "Enter the new command prefix (e.g. ! or /):", type: "text" },
  setbotname:   { prompt: "Enter the new bot name:", type: "text" },
  restart:      null,
  shutdown:     null,
};

// ─── Session management ─────────────────────────────────────────────────────

/**
 * Start a wizard session for a user.
 */
export function startWizardSession(jid, command, prompt, timeoutMs = DEFAULT_TIMEOUT_MS) {
  clearWizardSession(jid);
  const timeoutRef = setTimeout(() => _sessions.delete(jid), timeoutMs);
  if (timeoutRef?.unref) timeoutRef.unref();
  _sessions.set(jid, {
    command,
    prompt,
    startedAt: Date.now(),
    expiresAt: Date.now() + timeoutMs,
    timeoutRef,
  });
}

/** Check whether a user has an active wizard session. */
export function hasWizardSession(jid) {
  return _sessions.has(jid);
}

/** Get the current wizard session object for a user. */
export function getWizardSession(jid) {
  return _sessions.get(jid) || null;
}

/** Clear a wizard session. */
export function clearWizardSession(jid) {
  const existing = _sessions.get(jid);
  if (existing?.timeoutRef) clearTimeout(existing.timeoutRef);
  _sessions.delete(jid);
}

// ─── Input handler ──────────────────────────────────────────────────────────

/**
 * Handle an incoming message for a user in a wizard session.
 * Returns true if the message was consumed by the wizard.
 *
 * Called in index.js BEFORE the prefix check so non-prefixed replies
 * from the user are captured.
 */
export async function handleWizardInput(sock, msg, body, opts = {}) {
  const jid   = msg.key.remoteJid;
  const isGrp = jid.endsWith("@g.us");

  // In groups, the wizard is keyed to the sender JID, not the group JID
  const effectiveJid = isGrp
    ? (msg.key.participant || msg.participant || jid)
    : jid;

  const session = _sessions.get(effectiveJid) || _sessions.get(jid);
  if (!session) return false;

  // Skip if the message is stale / older than session start
  try {
    const ts = Number(msg.messageTimestamp || 0) * 1000;
    if (ts > 0 && ts < session.startedAt - 2000) return false;
  } catch {}

  const trimmed = (body || "").trim();

  // Cancel keywords — end the session
  if (/^(cancel|stop|exit|quit|close|back|0)$/i.test(trimmed)) {
    clearWizardSession(effectiveJid);
    clearWizardSession(jid);
    try {
      const prefix = opts.prefix || ".";
      await sock.sendMessage(jid,
        { text: `Session cancelled. Type *${prefix}menu* to return to the menu.` },
        { quoted: msg }
      );
    } catch {}
    return true;
  }

  // Got real input — consume session and dispatch the command
  const command = session.command;
  clearWizardSession(effectiveJid);
  clearWizardSession(jid);

  try {
    if (typeof globalThis.__MIAS_DISPATCH_CMD__ === "function") {
      await globalThis.__MIAS_DISPATCH_CMD__(sock, msg, command, trimmed.split(/\s+/).filter(Boolean));
      return true;
    }
    // Fallback: use the exposed commands map directly
    const cmds = globalThis.__MIAS_COMMANDS__;
    if (cmds) {
      const entry = cmds.get(command);
      if (entry?.handler) {
        await entry.handler(sock, msg, trimmed.split(/\s+/).filter(Boolean));
        return true;
      }
    }
    // Final fallback: nothing we can do but tell the user
    await sock.sendMessage(jid,
      { text: `Could not execute *${command}*. Please try typing it manually.` },
      { quoted: msg }
    );
  } catch (e) {
    try {
      await sock.sendMessage(jid,
        { text: `Error running *${command}*: ${e?.message || e}` },
        { quoted: msg }
      );
    } catch {}
  }

  return true;
}
