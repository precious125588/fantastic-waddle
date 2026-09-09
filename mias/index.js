/**
 * MIAS MDX runtime.
 *
 * The previous repository version was empty, so the launcher started a
 * process that exited without opening a socket or registering a listener.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import pino from "pino";
import {
  default as makeWASocket,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import { createAnimeEditFlow } from "./features/animeEdits.js";
import { createStatusEditFlow, statusMessageText } from "./lib/statusEditFlow.js";
import {
  extractTikTokUrl,
  fetchTikTokInfo,
  formatTikTokMenu,
  parseTikTokMode,
  selectTikTokUrl,
} from "./features/tiktok.js";
import {
  sendAudio,
  sendDocument,
  sendVideo,
  sendVoiceNote,
} from "./handlers/mediaHandler.js";
import { reactDownload, reactFail, reactSuccess } from "./handlers/reactionHandler.js";
import { getConfiguredPrefix, parseCommand } from "./lib/prefix.cjs";
import { kevdraMessageHook } from "./lib/kevdraPatches.js";
import { startWatchdog, stopWatchdog } from "./lib/sessionWatchdog.js";

const require = createRequire(import.meta.url);
const { smsg } = require("../allfunc/storage");
const { getSetting, setSetting } = require("../setting/Settings.js");
const rootCase = require("../case.js");

const logger = pino({ level: process.env.LOG_LEVEL || "silent" });
const sessionPath = path.resolve(process.env.AUTH_DIR || path.join(process.cwd(), "auth"));
const lockPath = path.join(sessionPath, ".mias-runtime.lock");
const maxInFlight = Math.max(2, Number(process.env.MAX_COMMANDS || 8));
const inFlight = new Set();
const TIKTOK_COMMANDS = new Set(["tiktok", "tt", "tiktokv2", "ttv2", "tiktokv3", "ttv3", "tiktokv4", "ttv4"]);
const tiktokSessions = new Map();

function tiktokSessionKey(msg) {
  const jid = String(msg?.key?.remoteJid || "");
  const sender = String(
    msg?.key?.participant
      || msg?.key?.senderPn
      || msg?.key?.participantPn
      || (jid.endsWith("@s.whatsapp.net") ? jid : ""),
  );
  return `${jid}|${sender}`;
}

function tiktokQuotedPromptId(msg) {
  const message = msg?.message || {};
  const context = message.extendedTextMessage?.contextInfo
    || message.buttonsResponseMessage?.contextInfo
    || message.listResponseMessage?.contextInfo
    || message.interactiveResponseMessage?.contextInfo
    || null;
  return context?.stanzaId && context?.quotedMessage
    ? String(context.stanzaId)
    : "";
}

function isTikTokReply(msg, session) {
  return Boolean(session && session.promptId && tiktokQuotedPromptId(msg) === session.promptId);
}

function expireTikTokSessions() {
  const now = Date.now();
  for (const [key, session] of tiktokSessions) {
    if (now - session.updatedAt > 5 * 60 * 1000) tiktokSessions.delete(key);
  }
}

async function sendTikTokChoice(sock, msg, session, rawChoice) {
  const mode = parseTikTokMode(rawChoice);
  if (!mode) {
    const prompt = await sock.sendMessage(
      msg.key.remoteJid,
      { text: "❌ That option is not available. Reply with *1.1*–*1.7* or *2.1*–*2.3*." },
      { quoted: msg },
    );
    session.promptId = prompt?.key?.id || session.promptId;
    session.updatedAt = Date.now();
    return true;
  }

  const mediaUrl = selectTikTokUrl(session.info, mode);
  if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
    tiktokSessions.delete(session.key);
    await sock.sendMessage(
      msg.key.remoteJid,
      { text: "❌ TikTok returned no working URL for that option. Please send the link again and choose another option." },
      { quoted: msg },
    );
    return true;
  }

  tiktokSessions.delete(session.key);
  await reactDownload(sock, msg);
  let sent = null;
  const common = { quoted: msg, title: session.info.title, sourceUrl: session.sourceUrl };
  try {
    if (mode.kind === "audio") {
      sent = mode.voiceNote
        ? await sendVoiceNote(sock, msg.key.remoteJid, mediaUrl, common)
        : mode.document
          ? await sendDocument(sock, msg.key.remoteJid, mediaUrl, {
              ...common,
              filename: `${session.info.title || "tiktok-audio"}.mp3`,
              mimetype: "audio/mpeg",
            })
          : await sendAudio(sock, msg.key.remoteJid, mediaUrl, common);
    } else if (mode.document) {
      sent = await sendDocument(sock, msg.key.remoteJid, mediaUrl, {
        ...common,
        filename: `${session.info.title || "tiktok-video"}.mp4`,
        mimetype: "video/mp4",
      });
    } else {
      sent = await sendVideo(sock, msg.key.remoteJid, mediaUrl, {
        ...common,
        mimetype: "video/mp4",
        videoNote: mode.videoNote,
      });
    }
    if (!sent) throw new Error("WhatsApp rejected the media response");
    await reactSuccess(sock, msg);
  } catch (error) {
    console.error("[TikTok] media send failed:", error?.stack || error);
    await reactFail(sock, msg);
    await sock.sendMessage(
      msg.key.remoteJid,
      { text: `❌ I found the TikTok media, but sending option *${mode.id}* failed. Try *1.1* or *1.2* instead.` },
      { quoted: msg },
    );
  }
  return true;
}

async function startTikTok(sock, msg, rawUrl) {
  const url = extractTikTokUrl(rawUrl);
  if (!url) {
    await sock.sendMessage(
      msg.key.remoteJid,
      { text: `🎵 Usage: ${getConfiguredPrefix() || ""}tiktok <TikTok link>` },
      { quoted: msg },
    );
    return true;
  }

  const key = tiktokSessionKey(msg);
  tiktokSessions.delete(key);
  await reactDownload(sock, msg);
  try {
    const info = await fetchTikTokInfo(url);
    const prompt = await sock.sendMessage(
      msg.key.remoteJid,
      { text: formatTikTokMenu(info, getConfiguredPrefix() || ".") },
      { quoted: msg },
    );
    tiktokSessions.set(key, {
      key,
      sourceUrl: url,
      info,
      promptId: prompt?.key?.id || "",
      updatedAt: Date.now(),
    });
    return true;
  } catch (error) {
    console.error("[TikTok] lookup failed:", error?.stack || error);
    await reactFail(sock, msg);
    await sock.sendMessage(
      msg.key.remoteJid,
      { text: "❌ I could not read that TikTok link. Check that it is a video link and try again." },
      { quoted: msg },
    );
    return true;
  }
}

async function handleTikTokReply(sock, msg, body) {
  expireTikTokSessions();
  const session = tiktokSessions.get(tiktokSessionKey(msg));
  if (!isTikTokReply(msg, session)) return false;
  const value = String(body || "").trim();
  if (!value || (getConfiguredPrefix() && value.startsWith(getConfiguredPrefix()))) return false;
  session.updatedAt = Date.now();
  return sendTikTokChoice(sock, msg, session, value);
}

function acquireRuntimeLock() {
  fs.mkdirSync(sessionPath, { recursive: true });
  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, `${process.pid}\n`);
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let ownerPid = "";
    try { ownerPid = fs.readFileSync(lockPath, "utf8").trim(); } catch {}
    try {
      if (ownerPid && process.kill(Number(ownerPid), 0)) {
        console.error(`[MIAS] Session is already owned by PID ${ownerPid}`);
        return false;
      }
    } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
    const fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, `${process.pid}\n`);
    fs.closeSync(fd);
    return true;
  }
}

function releaseRuntimeLock() {
  try {
    if (fs.readFileSync(lockPath, "utf8").trim() === String(process.pid)) {
      fs.unlinkSync(lockPath);
    }
  } catch {}
}

function decodeJid(jid) {
  const value = String(jid || "");
  const match = value.match(/^(\d+):\d+(@.+)$/);
  return match ? `${match[1]}${match[2]}` : value;
}

function bodyFromMessage(msg) {
  return statusMessageText(msg)
    || msg?.message?.ephemeralMessage?.message?.conversation
    || msg?.message?.ephemeralMessage?.message?.extendedTextMessage?.text
    || "";
}

function commandFromMessage(msg) {
  const body = bodyFromMessage(msg);
  return { body, ...parseCommand(body) };
}

function startPresenceHeartbeat(sock) {
  let stopped = false;
  let busy = false;

  const publish = async () => {
    if (stopped || busy || !sock?.user) return;
    busy = true;
    try {
      // markOnlineOnConnect covers the initial handshake; this heartbeat
      // keeps the linked device visibly online while it is idle.
      await sock.sendPresenceUpdate("available");
    } catch (error) {
      console.warn(`[MIAS] Presence heartbeat failed: ${error?.message || error}`);
    } finally {
      busy = false;
    }
  };

  void publish();
  const timer = setInterval(() => void publish(), 25_000);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function isOwner(msg, sock) {
  const sender = decodeJid(msg?.key?.participant || msg?.key?.remoteJid);
  const owner = String(process.env.OWNER_NUMBER || "").replace(/\D/g, "");
  const bot = decodeJid(sock?.user?.id).split("@")[0].split(":")[0];
  return Boolean(
    msg?.key?.fromMe
    || (owner && sender.split("@")[0] === owner)
    || (bot && sender.split("@")[0] === bot),
  );
}

// Only these ten AI shortcuts remain in the plain-text bot.
const AI_COMMANDS = new Set([
  "ai", "gpt", "gpt4", "gpt4o", "mistral",
  "deepseek", "gemini", "imagine", "flux", "tts",
]);
const REMOVED_COMMANDS = new Set([
  "panel", "panels", "button", "buttons", "buttonmode",
]);

function commandIsDisabled(command) {
  const normalized = String(command || "").toLowerCase();
  if (REMOVED_COMMANDS.has(normalized)) return true;
  const removedAi = [
    "chatgpt", "claude", "copilot", "blackbox", "deepseek-r1",
    "sd", "tts2", "codeai", "storyai", "metaai", "grok", "qwen",
  ];
  return removedAi.includes(normalized);
}

async function dispatch(sock, msg, store, statusFlow, animeFlow) {
  const { body, isCommand, command, args } = commandFromMessage(msg);
  const owner = isOwner(msg, sock);

  // Reply sessions are scoped by chat and sender and are checked first. This
  // prevents a new chat from being swallowed by another chat's old session.
  if (await statusFlow.handleReply(sock, msg, body)) return true;
  if (await handleTikTokReply(sock, msg, body)) return true;

  if (isCommand && (command === "status" || command === "statusedit")) {
    await statusFlow.start(sock, msg);
    return true;
  }

  if (isCommand && TIKTOK_COMMANDS.has(command)) {
    return startTikTok(sock, msg, args.join(" "));
  }

  if (isCommand && command === "setprefix") {
    if (!owner) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ Owner only." }, { quoted: msg });
      return true;
    }
    const value = args[0];
    if (value === undefined) {
      const current = getConfiguredPrefix();
      await sock.sendMessage(msg.key.remoteJid, {
        text: `Current prefix: ${current === null ? "null (prefix disabled)" : current}`,
      }, { quoted: msg });
      return true;
    }
    const { saveConfiguredPrefix } = require("./lib/prefix.cjs");
    const next = saveConfiguredPrefix(value);
    await sock.sendMessage(msg.key.remoteJid, {
      text: next === null
        ? "✅ Prefix disabled. Commands may be sent without a prefix."
        : `✅ Prefix changed to: ${next}`,
    }, { quoted: msg });
    return true;
  }

  if (!isCommand) {
    const tiktokUrl = extractTikTokUrl(body);
    return tiktokUrl ? startTikTok(sock, msg, tiktokUrl) : false;
  }
  if (commandIsDisabled(command)) return true;

  const anime = animeFlow.resolve(command);
  if (anime) {
    await animeFlow.sendThree(sock, msg, anime);
    return true;
  }

  // Compatibility layer for the existing plain-text command switch. It is
  // never given interactive/button response IDs.
  await rootCase(sock, smsg(sock, msg, store), { messages: [msg] }, store);
  return true;
}

async function connect() {
  const lockAcquired = acquireRuntimeLock();
  if (!lockAcquired) {
    process.exitCode = 78;
    return;
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {}

  const sock = makeWASocket({
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    ...(version ? { version } : {}),
    browser: Browsers.macOS("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 30_000,
    defaultQueryTimeoutMs: 20_000,
    keepAliveIntervalMs: 45_000,
  });
  sock.decodeJid = decodeJid;
  sock.public = true;
  sock.ev.on("creds.update", saveCreds);

  const statusFlow = createStatusEditFlow({ prefix: getConfiguredPrefix });
  const animeFlow = createAnimeEditFlow({ prefix: getConfiguredPrefix });
  let closing = false;
  let stopPresenceHeartbeat = () => {};

  globalThis.__GET_SETTING__ = getSetting;
  globalThis.__SET_SETTING__ = setSetting;
  globalThis.__BOT_OWNER_NUMBER = process.env.OWNER_NUMBER || "";

  startWatchdog(sock, sessionPath, () => {
    if (closing) return;
    closing = true;
    try { sock.ws?.close?.(); } catch {}
  });

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      closing = false;
      stopPresenceHeartbeat();
      stopPresenceHeartbeat = startPresenceHeartbeat(sock);
      console.log(`[MIAS] Connected as ${decodeJid(sock.user?.id)}`);
    }
    if (connection === "close") {
      stopPresenceHeartbeat();
      stopPresenceHeartbeat = () => {};
      stopWatchdog();
      const statusCode = lastDisconnect?.error?.output?.statusCode
        ?? lastDisconnect?.error?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.error("[MIAS] Session logged out; waiting for a new pairing.");
        releaseRuntimeLock();
        return;
      }
      // Let the parent launcher own reconnect/backoff. This avoids two sockets
      // fighting over one auth folder when a new chat or history sync arrives.
      releaseRuntimeLock();
      process.exitCode = 75;
    }
  });

  sock.ev.on("messages.upsert", ({ messages = [], type }) => {
    if (type !== "notify" && type !== "append") return;
    for (const raw of messages) {
      if (!raw?.message || raw.key?.remoteJid === "status@broadcast") continue;
      if (inFlight.size >= maxInFlight) {
        console.warn(`[MIAS] Command queue full (${maxInFlight}); dropping one message`);
        continue;
      }
      let task;
      task = Promise.resolve()
      .then(async () => {
        const handled = await dispatch(sock, raw, undefined, statusFlow, animeFlow);
        if (handled) return;
        await kevdraMessageHook(sock, raw, bodyFromMessage(raw), isOwner(raw, sock));
      })
        .catch((error) => console.error("[MIAS] Message handler error:", error?.stack || error))
        .finally(() => inFlight.delete(task));
      inFlight.add(task);
    }
  });

  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.once(signal, () => {
      stopPresenceHeartbeat();
      stopPresenceHeartbeat = () => {};
      stopWatchdog();
      releaseRuntimeLock();
      try { sock.ws?.close?.(); } catch {}
    });
  }
}

connect().catch((error) => {
  console.error("[MIAS] Fatal startup error:", error?.stack || error);
  releaseRuntimeLock();
  process.exitCode = 1;
});