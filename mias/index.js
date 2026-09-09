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
import { getConfiguredPrefix, parseCommand } from "./lib/prefix.cjs";
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
  if (await statusFlow.handleReply(sock, msg, body)) return;

  if (isCommand && (command === "status" || command === "statusedit")) {
    await statusFlow.start(sock, msg);
    return;
  }

  if (isCommand && command === "setprefix") {
    if (!owner) {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ Owner only." }, { quoted: msg });
      return;
    }
    const value = args[0];
    if (value === undefined) {
      const current = getConfiguredPrefix();
      await sock.sendMessage(msg.key.remoteJid, {
        text: `Current prefix: ${current === null ? "null (prefix disabled)" : current}`,
      }, { quoted: msg });
      return;
    }
    const { saveConfiguredPrefix } = require("./lib/prefix.cjs");
    const next = saveConfiguredPrefix(value);
    await sock.sendMessage(msg.key.remoteJid, {
      text: next === null
        ? "✅ Prefix disabled. Commands may be sent without a prefix."
        : `✅ Prefix changed to: ${next}`,
    }, { quoted: msg });
    return;
  }

  if (!isCommand || commandIsDisabled(command)) return;

  const anime = animeFlow.resolve(command);
  if (anime) {
    await animeFlow.sendThree(sock, msg, anime);
    return;
  }

  // Compatibility layer for the existing plain-text command switch. It is
  // never given interactive/button response IDs.
  await rootCase(sock, smsg(sock, msg, store), { messages: [msg] }, store);
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
        .then(() => dispatch(sock, raw, undefined, statusFlow, animeFlow))
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