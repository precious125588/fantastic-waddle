// Anime edit command plugin.
//
// Add a folder under /animes and the command is registered automatically:
//   animes/naruto/       -> .naruto
//   animes/one-piece/    -> .onepiece
//   animes/my-hero-academia/ -> .myheroacademia
//
// The resolver deliberately lives outside index.js so new anime titles,
// aliases, local media and provider order can be changed without touching the
// main bot dispatcher.

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  searchStatusCandidates,
  resolveStatusCandidate,
} from "../lib/statusEditFlow.js";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANIME_ROOT = path.resolve(__dirname, "..", "..", "animes");
const MAX_RESULTS = 3;
const MAX_INPUT_BYTES = 90 * 1024 * 1024;
const MAX_DURATION_SECONDS = 90;
const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mov", ".webm", ".mkv"]);

const BUILTIN_ALIASES = {
  "naruto": ["naruto", "narutoshippuden", "boruto"],
  "death-note": ["deathnote", "deadnote", "death-note"],
  "jjk": ["jjk", "jujutsukaisen", "jujutsu"],
  "one-piece": ["onepiece", "one-piece", "op"],
  "attack-on-titan": ["ait", "aot", "attackontitan", "attack-on-titan"],
  "demon-slayer": ["demonslayer", "kimetsunoyaiba", "kny"],
  "bleach": ["bleach", "bleachtybw"],
  "dragon-ball": ["dragonball", "dbz", "dbs", "dragonballz"],
  "black-clover": ["blackclover"],
  "my-hero-academia": ["myheroacademia", "mha", "bnha"],
  "solo-leveling": ["sololeveling"],
  "hunter-x-hunter": ["hunterxhunter", "hxh"],
  "tokyo-ghoul": ["tokyoghoul"],
  "chainsaw-man": ["chainsawman", "csm"],
  "one-punch-man": ["onepunchman", "opm"],
  "blue-lock": ["bluelock"],
  "vinland-saga": ["vinlandsaga"],
  "fairy-tail": ["fairytail"],
  "haikyuu": ["haikyuu"],
  "fire-force": ["fireforce"],
  "fullmetal-alchemist": ["fullmetalalchemist", "fma", "fmab"],
  "seven-deadly-sins": ["sevendeadlysins", "nanatsunotaizai"],
};

function cleanSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function commandKey(value) {
  return cleanSlug(value).replace(/-/g, "");
}

function displayName(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function loadCatalog() {
  const configured = readJson(path.join(ANIME_ROOT, "catalog.json"), []);
  const bySlug = new Map();
  for (const item of Array.isArray(configured) ? configured : []) {
    const slug = cleanSlug(item?.slug || item?.folder || item?.title);
    if (!slug) continue;
    bySlug.set(slug, {
      slug,
      title: String(item.title || displayName(slug)).trim(),
      aliases: Array.isArray(item.aliases) ? item.aliases.map(commandKey).filter(Boolean) : [],
      query: String(item.query || item.title || displayName(slug)).trim(),
    });
  }

  // Keep the built-in commands available even when the optional /animes
  // media folder has not been created yet. Previously an empty folder meant
  // .naruto was never registered, so the only thing the user saw was the
  // generic anime-usage message.
  for (const [slug, aliases] of Object.entries(BUILTIN_ALIASES)) {
    const current = bySlug.get(slug) || {
      slug,
      title: displayName(slug),
      aliases: [],
      query: displayName(slug),
    };
    current.aliases = [...new Set([
      ...(current.aliases || []),
      ...aliases.map(commandKey),
    ])];
    bySlug.set(slug, current);
  }

  try {
    for (const entry of fs.readdirSync(ANIME_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const slug = cleanSlug(entry.name);
      if (!slug) continue;
      const current = bySlug.get(slug) || {
        slug,
        title: displayName(slug),
        aliases: [],
        query: displayName(slug),
      };
      const titleFile = path.join(ANIME_ROOT, entry.name, "title.txt");
      try {
        const title = fs.readFileSync(titleFile, "utf8").trim();
        if (title) {
          current.title = title.slice(0, 100);
          current.query = title.slice(0, 100);
        }
      } catch {}
      bySlug.set(slug, current);
    }
  } catch {}

  for (const [slug, aliases] of Object.entries(BUILTIN_ALIASES)) {
    const current = bySlug.get(slug) || {
      slug,
      title: displayName(slug),
      aliases: [],
      query: displayName(slug),
    };
    current.aliases = [...new Set([
      ...current.aliases,
      ...aliases.map(commandKey),
      commandKey(slug),
    ])];
    bySlug.set(slug, current);
  }
  return [...bySlug.values()];
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function validVideoBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 10000 || buffer.length > MAX_INPUT_BYTES) return false;
  const header = buffer.slice(0, 16);
  return header.slice(4, 8).toString("ascii") === "ftyp"
    || header.slice(0, 4).toString("ascii") === "RIFF"
    || (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3);
}

function ffmpegBinary() {
  try {
    const bundled = require("ffmpeg-static");
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch {}
  return process.env.FFMPEG_PATH || "ffmpeg";
}

async function normalizeHdVideo(input) {
  if (!validVideoBuffer(input)) return null;
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mias-anime-"));
  const source = path.join(dir, "source.bin");
  const output = path.join(dir, "anime-hd.mp4");
  try {
    await fs.promises.writeFile(source, input);
    await execFileAsync(ffmpegBinary(), [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", source,
      "-t", String(MAX_DURATION_SECONDS),
      "-map", "0:v:0", "-map", "0:a:0?",
      // Normalize every delivered edit to a stable 720p HD MP4. This also
      // prevents odd codecs/container variants from failing on WhatsApp.
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
      "-f", "mp4", output,
    ], { timeout: 120000, maxBuffer: 1024 * 1024 });
    const result = await fs.promises.readFile(output);
    return validVideoBuffer(result) ? result : null;
  } catch (error) {
    console.warn("[anime-edits] HD conversion skipped candidate:", error?.message || error);
    return null;
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function localEdits(entry) {
  const mediaDir = path.join(ANIME_ROOT, entry.slug, "media");
  const items = [];
  try {
    for (const file of fs.readdirSync(mediaDir)) {
      const extension = path.extname(file).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(extension)) continue;
      const full = path.join(mediaDir, file);
      const stat = fs.statSync(full);
      if (stat.size <= MAX_INPUT_BYTES) items.push(full);
    }
  } catch {}
  const results = [];
  for (const file of shuffle(items)) {
    const converted = await normalizeHdVideo(await fs.promises.readFile(file).catch(() => null));
    if (converted) results.push({ buffer: converted, localFile: file });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

function withTimeout(promise, timeoutMs = 130000) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

async function remoteEdits(entry) {
  const queries = [
    `${entry.query} anime edit`,
    `${entry.query} AMV edit`,
    `${entry.query} status edit`,
  ];
  const platforms = ["auto", "tiktok", "facebook", "youtube", "pinterest", "instagram", "twitter"];
  const candidates = [];
  const seen = new Set();

  for (const query of queries) {
    for (const platform of platforms) {
      try {
        const rows = await withTimeout(searchStatusCandidates(query, platform), 70000);
        for (const row of rows || []) {
          const key = row?.sourceUrl || row?.downloadUrl;
          if (!key || seen.has(key)) continue;
          seen.add(key);
          candidates.push(row);
        }
      } catch {}
      if (candidates.length >= 30) break;
    }
    if (candidates.length >= 30) break;
  }

  const resolved = [];
  for (const candidate of shuffle(candidates)) {
    if (resolved.length >= MAX_RESULTS) break;
    try {
      const item = await withTimeout(resolveStatusCandidate(candidate), 150000);
      if (!item?.buffer) continue;
      const hd = await normalizeHdVideo(item.buffer);
      if (hd) resolved.push({ ...item, buffer: hd });
    } catch {}
  }
  return resolved;
}

function dedupeResults(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.localFile || item.sourceUrl || item.downloadUrl;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_RESULTS);
}

export function createAnimeEditFlow({ prefix = "." } = {}) {
  const entries = loadCatalog();
  const byCommand = new Map();
  for (const entry of entries) {
    for (const alias of new Set([commandKey(entry.slug), ...(entry.aliases || [])])) {
      if (alias) byCommand.set(alias, entry);
    }
  }

  async function sendThree(sock, msg, entry) {
    const jid = msg.key.remoteJid;
    const react = (text) => sock.sendMessage(jid, {
      react: { text, key: msg.key },
    }).catch(() => {});
    await react("🎬");

    // Local files are tried first, making each folder a dependable manual
    // fallback. Remote results then use David Cyril before other providers.
    const local = await localEdits(entry);
    const remote = local.length >= MAX_RESULTS ? [] : await remoteEdits(entry);
    const results = dedupeResults([...local, ...remote]);
    if (results.length < MAX_RESULTS) {
      await react("❌");
      return false;
    }

    // Send media only: no progress message, caption, footer, or quoted text.
    for (const result of results) {
      await sock.sendMessage(jid, {
        video: result.buffer,
        mimetype: "video/mp4",
      });
    }
    await react("");
    return true;
  }

  async function handle(sock, msg, args, forcedEntry = null) {
    const key = forcedEntry || commandKey(args.join(" "));
    const entry = byCommand.get(key);
    const query = args.join(" ").trim();
    if (!entry && !query) {
      const examples = entries.slice(0, 12).map((item) => `• ${prefix}${commandKey(item.slug)}`).join("\n");
      await sock.sendMessage(msg.key.remoteJid, {
        text: `🎌 *Anime edits*\n\nUse ${prefix}Naruto or ${prefix}animeedit <anime title>.\n\nExamples:\n${examples}`,
      }, { quoted: msg });
      return true;
    }
    const selected = entry || {
      slug: cleanSlug(query),
      title: query.slice(0, 100),
      query: query.slice(0, 100),
      aliases: [],
    };
    await sendThree(sock, msg, selected);
    return true;
  }

  function registerCommands(cmd) {
    for (const [alias, entry] of byCommand) {
      cmd(alias, {
        desc: `Send 3 random HD ${entry.title} edits`,
        category: "ANIME",
      }, (sock, msg, args) => handle(sock, msg, args, entry));
    }
    cmd(["animeedit", "animeedits", "animeclip"], {
      desc: "Send 3 random HD edits for any anime title",
      category: "ANIME",
    }, (sock, msg, args) => handle(sock, msg, args));
  }

  return {
    registerCommands,
    list: () => entries.map((item) => ({ ...item })),
    resolve: (value) => byCommand.get(commandKey(value)) || null,
    sendThree,
  };
}

export {
  ANIME_ROOT,
  cleanSlug,
  commandKey,
  displayName,
  loadCatalog,
  normalizeHdVideo,
};