// Anime edit command plugin.
//
// The resolver deliberately lives outside index.js so anime aliases and
// provider behavior can be changed without touching the main dispatcher.

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
const axios = require("axios");
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANIME_ROOT = path.resolve(__dirname, "..", "..", "animes");
const MAX_RESULTS = 3;
const NARUTO_RESULTS = 2;
const MAX_INPUT_BYTES = 90 * 1024 * 1024;
// Keep anime shortcuts aligned with the status wizard's hard three-minute
// limit. The actual trim is performed by ffmpeg before anything is sent.
const MAX_DURATION_SECONDS = 180;

// Naruto is intentionally restricted to these TikTok hashtag searches. Do
// not broaden this to a generic web/search-engine query: that was the source
// of unrelated clips and unreliable downloads.
export const NARUTO_HASHTAGS = Object.freeze([
  "#Naruto",
  "#Narutoshipuden",
  "#Narutouzumaki",
  "#Ninetails",
  "#narutoedit",
  "#rasengannaruto",
  "#boruto",
  "#sasuke",
  "#Obito",
  "#Obitoedits",
  "#shikamaru",
  "#narutovspain",
  "#ObitoUchiha",
  "#Uchiha",
  "#Shinuchiha",
  "#Minato",
  "#kakashi",
  "#kakashiedit",
  "#Jiraya",
  "#Jirayaedits",
  "#Minatoedit",
  "#Akatsuki",
  "#Akatsukiedits",
  "#Madara",
  "#kurenal",
  "#Shadowclontsutsu",
  "#kurama",
  "#Hashirama",
  "#tobirama",
  "#Rocklee",
  "#Guysensei",
  "#Pain",
  "#Yaiko",
  "#nagato",
]);

// TikWM treats `/api/feed/search` (without the trailing slash) as a protected
// web route and returns HTTP 403. The actual JSON endpoint is the slash form.
// Keep both hostnames because either one can be rate-limited independently.
const TIKWM_SEARCH_ENDPOINTS = [
  "https://www.tikwm.com/api/feed/search/",
  "https://tikwm.com/api/feed/search/",
];
const TIKWM_DETAIL_ENDPOINTS = [
  "https://www.tikwm.com/api/",
  "https://tikwm.com/api/",
];
let tikwmQueue = Promise.resolve();

// These are safe built-in shortcuts. Catalog entries can add more registered
// titles without changing the dispatcher.
const BUILTIN_ALIASES = {
  naruto: ["naruto"],
  jjk: ["jjk", "jujutsu kaisen"],
  "one-piece": ["one piece"],
  bleach: ["bleach"],
  "demon-slayer": ["demon slayer", "kimetsu no yaiba"],
  "dragon-ball": ["dragon ball", "dragonball"],
  "attack-on-titan": ["attack on titan", "aot"],
  "solo-leveling": ["solo leveling"],
  "my-hero-academia": ["my hero academia", "bnha"],
  "one-punch-man": ["one punch man"],
  "black-clover": ["black clover"],
  "chainsaw-man": ["chainsaw man"],
  "tokyo-revengers": ["tokyo revengers"],
  "blue-lock": ["blue lock"],
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
      aliases: [],
      query: String(item.query || item.title || displayName(slug)).trim(),
    });
  }

  // Keep the built-in commands available even when the optional /animes
  // media folder has not been created yet. Previously an empty folder meant
  // .naruto was never registered, so the only thing the user saw was the
  // Keep the title command available even when the optional /animes media
  // folder has not been created yet.
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

function tikwmRequest(url, params) {
  const request = tikwmQueue.then(async () => {
    const response = await axios.get(url, {
      params,
      timeout: 25000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });
    return response.data;
  });
  tikwmQueue = request.catch(() => {});
  return request;
}

function shuffle(items) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function firstUrl(...values) {
  return values.find((value) => typeof value === "string" && /^https?:\/\//i.test(value)) || "";
}

function narutoCandidate(row, hashtag) {
  const author = row?.author?.unique_id
    || row?.author?.uniqueId
    || row?.author?.nickname
    || row?.author?.uniqueId;
  const videoId = row?.video_id || row?.aweme_id || row?.awemeId || row?.id;
  const sourceUrl = firstUrl(
    row?.share_url,
    row?.shareUrl,
    row?.url,
    author && videoId ? `https://www.tiktok.com/@${author}/video/${videoId}` : "",
  );
  if (!sourceUrl) return null;
  return {
    sourceUrl,
    hashtag,
    title: String(row?.title || row?.desc || `${hashtag} Naruto edit`).trim().slice(0, 140),
    author: String(author || "TikTok creator").trim(),
    views: row?.play_count || row?.playCount || row?.views || 0,
    likes: row?.digg_count || row?.diggCount || row?.likes || 0,
    row,
  };
}

async function searchNarutoHashtag(hashtag) {
  for (const endpoint of TIKWM_SEARCH_ENDPOINTS) {
    try {
      const payload = await tikwmRequest(endpoint, {
        keywords: hashtag,
        count: 20,
        cursor: 0,
        web: 1,
        HD: 1,
      });
      if (Number(payload?.code) !== 0 && payload?.data == null) continue;
      const rows = payload?.data?.videos || payload?.data?.data || payload?.data || [];
      const candidates = (Array.isArray(rows) ? rows : [])
        .map((row) => narutoCandidate(row, hashtag))
        .filter(Boolean);
      if (candidates.length) return candidates;
    } catch {}
  }
  return [];
}

async function collectNarutoCandidates() {
  const candidates = [];
  const seen = new Set();
  // Start with random tags and only expand when the first batch is too small.
  // Every accepted URL came from a TikWM search whose keyword is one of the
  // allow-listed hashtags above.
  for (const hashtag of shuffle(NARUTO_HASHTAGS)) {
    const rows = await withTimeout(searchNarutoHashtag(hashtag), 35000);
    for (const row of rows || []) {
      if (seen.has(row.sourceUrl)) continue;
      seen.add(row.sourceUrl);
      candidates.push(row);
    }
    if (candidates.length >= 12) break;
  }
  return shuffle(candidates);
}

function tikwmVideoUrls(payload) {
  const data = payload?.data || payload?.result || payload || {};
  return [
    data.hdplay,
    data.play_hd,
    data.hd,
    data.download_url,
    data.downloadUrl,
    data.play,
    data.play_url,
    data.wmplay,
  ].filter((url, index, values) =>
    typeof url === "string" && /^https?:\/\//i.test(url) && values.indexOf(url) === index);
}

async function downloadTikwmVideo(candidate) {
  for (const endpoint of TIKWM_DETAIL_ENDPOINTS) {
    try {
      const payload = await tikwmRequest(endpoint, {
        url: candidate.sourceUrl,
        hd: 1,
      });
      const urls = tikwmVideoUrls(payload);
      for (const url of urls) {
        try {
          const response = await axios.get(url, {
            responseType: "arraybuffer",
            timeout: 90000,
            maxContentLength: MAX_INPUT_BYTES,
            maxBodyLength: MAX_INPUT_BYTES,
            headers: {
              "User-Agent": "Mozilla/5.0",
              Referer: "https://www.tiktok.com/",
              Accept: "video/*,application/octet-stream,*/*",
            },
          });
          const buffer = Buffer.from(response.data || []);
          if (validVideoBuffer(buffer)) return buffer;
        } catch {}
      }
    } catch {}
  }
  return null;
}

async function narutoEdits() {
  const candidates = await collectNarutoCandidates();
  const resolved = [];
  for (const candidate of candidates) {
    if (resolved.length >= NARUTO_RESULTS) break;
    try {
      const source = await withTimeout(downloadTikwmVideo(candidate), 120000);
      if (!source) continue;
      // TikWM's hd=1 URL is preferred. Normalize it to a stable 720p MP4 so
      // WhatsApp does not receive the tiny preview/low-resolution variant.
      const hd = await withTimeout(normalizeHdVideo(source), 120000);
      const buffer = hd || source;
      if (validVideoBuffer(buffer)) resolved.push({ ...candidate, buffer });
    } catch {}
  }
  return resolved.slice(0, NARUTO_RESULTS);
}

async function remoteEdits(entry) {
  if (entry.slug === "naruto") return narutoEdits();

  // Search the exact title first so a request for Naruto cannot come back
  // with an unrelated clip.
  const queries = [`${entry.query} anime edit`, `${entry.query} edit`, entry.query];
  // Source restriction is deliberate: anime edits come from TikTok only.
  // The status flow validates the host again before downloading, so a
  // search-engine redirect cannot widen this allow-list.
  const platforms = ["tiktok"];
  const candidates = [];
  const seen = new Set();

  for (const query of queries) {
    const platformResults = await Promise.all(platforms.map(async (platform) => {
      try {
        return await withTimeout(searchStatusCandidates(query, platform), 80000);
      } catch {
        return [];
      }
    }));
    for (const rows of platformResults) {
      for (const row of rows || []) {
        const key = row?.sourceUrl || row?.downloadUrl;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        candidates.push(row);
      }
    }
    if (candidates.length >= 12) break;
  }

  const resolved = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length && resolved.length < MAX_RESULTS) {
      const candidate = candidates[cursor++];
      try {
        // The status resolver already validates and downloads the media. Ask
        // it to skip its generic transcode here; this flow applies the anime
        // 720p MP4 normalization exactly once below.
        const item = await withTimeout(resolveStatusCandidate(candidate, { normalize: false }), 120000);
        if (!item?.buffer) continue;
        const hd = await withTimeout(normalizeHdVideo(item.buffer), 120000);
        // HD transcoding is an enhancement, not a requirement for delivery.
        // If ffmpeg is unavailable or times out, keep the validated source
        // video instead of reporting that no downloadable edit exists.
        const output = hd || item.buffer;
        if (validVideoBuffer(output)) resolved.push({ ...item, buffer: output });
      } catch {}
    }
  };
  const workers = Math.min(3, candidates.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return resolved.slice(0, MAX_RESULTS);
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
    const resultLimit = entry.slug === "naruto" ? NARUTO_RESULTS : MAX_RESULTS;
    const react = (text) => sock.sendMessage(jid, {
      react: { text, key: msg.key },
    }).catch(() => {});
    await react("🎬");

    // Never mix in local media: the owner asked for public TikTok edits
    // only. Naruto is restricted to exactly two random hashtag results.
    const results = dedupeResults(await remoteEdits(entry)).slice(0, resultLimit);
    if (!results.length) {
      await react("❌");
      await sock.sendMessage(jid, {
        text: `❌ I couldn't find a downloadable TikTok edit for ${entry.title} right now. Try ${getPrefix()}Naruto, ${getPrefix()}JJK, or another supported anime title again in a moment.`,
      }, { quoted: msg });
      return false;
    }

    // Send the available media only: no progress message, footer, or quoted
    // text. A provider may return one or two good candidates, so do not throw
    // away usable edits merely because three were not available.
    for (const result of results) {
      await sock.sendMessage(jid, {
        video: result.buffer,
        mimetype: "video/mp4",
      });
    }
    await react("");
    return true;
  }

  function registerCommands(cmd) {
    for (const [alias, entry] of byCommand) {
      cmd(alias, {
        desc: `Send ${entry.slug === "naruto" ? NARUTO_RESULTS : MAX_RESULTS} random HD ${entry.title} edits`,
        category: "ANIME",
      }, (sock, msg) => sendThree(sock, msg, entry));
    }
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
  NARUTO_RESULTS,
  TIKWM_SEARCH_ENDPOINTS,
  cleanSlug,
  commandKey,
  displayName,
  loadCatalog,
  normalizeHdVideo,
};