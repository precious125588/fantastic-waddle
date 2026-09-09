// Anime edit command plugin.
//
// The resolver deliberately lives outside index.js so the two approved
// shortcuts can be changed without touching the main bot dispatcher.

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

// Keep this feature intentionally small and predictable.  The command is a
// shortcut for the two edit feeds requested by the owner, not a general anime
// search command. In particular, do not silently fall back to local files or
// unapproved social platforms when one of these feeds is unavailable.
const BUILTIN_ALIASES = {
  naruto: ["naruto"],
  jjk: ["jjk"],
};
const ENABLED_ANIME_SLUGS = new Set(Object.keys(BUILTIN_ALIASES));

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
    if (!slug || !ENABLED_ANIME_SLUGS.has(slug)) continue;
    bySlug.set(slug, {
      slug,
      title: String(item.title || displayName(slug)).trim(),
      aliases: [],
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
      if (!slug || !ENABLED_ANIME_SLUGS.has(slug)) continue;
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

function withTimeout(promise, timeoutMs = 130000) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function remoteEdits(entry) {
  const queries = [`${entry.query} anime edit`];
  // Source restriction is deliberate: anime edits must come from TikTok or
  // Pinterest only.  The status flow validates the host again before
  // downloading, so a search-engine redirect cannot widen this allow-list.
  const platforms = ["tiktok", "pinterest"];
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
    const key = item.sourceUrl || item.downloadUrl;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_RESULTS);
}

export function createAnimeEditFlow({ prefix = "." } = {}) {
  const getPrefix = () => typeof prefix === "function" ? String(prefix() || "") : String(prefix || "");
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

    // Never mix in local media: the owner asked for public TikTok/Pinterest
    // edits only, and exactly three results per request.
    const results = dedupeResults(await remoteEdits(entry));
    if (results.length < MAX_RESULTS) {
      await react("❌");
      return false;
    }

    // Send media only: no progress message, footer, or quoted text.
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
      await sock.sendMessage(msg.key.remoteJid, {
        text: `🎌 *Anime edits*\n\nUse ${getPrefix()}Naruto or ${getPrefix()}jjk.`,
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
    // Do not register a generic anime search command.  This prevents
    // `.animeedit`, `.animeclip`, etc. from fetching from an unapproved
    // platform or query.
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