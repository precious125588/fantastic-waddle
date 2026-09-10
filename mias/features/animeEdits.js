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
const NARUTO_SEARCH_ANCHOR = "#narutoedit";
const NARUTO_SEARCH_BATCH_SIZE = 1;
const NARUTO_CANDIDATE_TARGET = 4;
const DC_TIKTOK_ENDPOINTS = [
  "/download/tiktokdl-rapid",
  "/download/tiktok",
  "/download/savetik",
];
const MAX_PORTABLE_MP4_BYTES = 12 * 1024 * 1024;
const MAX_PORTABLE_OUTPUT_BYTES = 16 * 1024 * 1024;
const AI_OR_NON_EDIT_PATTERN = /\b(?:a\.?i\.?|ai[-_\s]?(?:generated|art|video)|generated|cartoon|3d|baby|kids?|meme|what\s*if)\b/i;
// Keep anime shortcuts aligned with the status wizard's hard three-minute
// limit. The actual trim is performed by ffmpeg before anything is sent.
const MAX_DURATION_SECONDS = 180;

// Naruto is intentionally restricted to these TikTok hashtag searches. Do
// not broaden this to a generic web/search-engine query: that was the source
// of unrelated clips and unreliable downloads.
//
// Keep the seed list readable and let uniqueHashtags() remove repeated tags
// case-insensitively. TikTok treats hashtag casing as equivalent, so entries
// such as #Ninetails and #nineTails must not create duplicate searches.
const NARUTO_HASHTAG_SEED = [
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
  "#Shadowclonetsutsu",
  "#kurama",
  "#Hashirama",
  "#tobirama",
  "#Rocklee",
  "#Guysensei",
  "#Pain",
  "#Yaiko",
  "#nagato",
  "#sasukeuchiha",
  "#sasukes",
  "#sasukedit",
  "#sakura",
  "#sakuraharuno",
  "#kakashihatake",
  "#itachi",
  "#itachiuchiha",
  "#itachiedit",
  "#madarauchiha",
  "#obitouchiha",
  "#minatonamikaze",
  "#jiraiya",
  "#tsunade",
  "#gaara",
  "#mightguy",
  "#guy",
  "#neji",
  "#ino",
  "#choji",
  "#hinata",
  "#hinatahyuga",
  "#borutouzumaki",
  "#kawaki",
  "#sarada",
  "#mitsuki",
  "#konohamaru",
  "#shisui",
  "#shisuiuchiha",
  "#hashiramasenju",
  "#hiruzen",
  "#orochimaru",
  "#kabuto",
  "#deidara",
  "#kisame",
  "#konan",
  "#hidan",
  "#kakuzu",
  "#sasori",
  "#zabuza",
  "#haku",
  "#killerbee",
  "#borutonarutonextgenerations",
  "#borutoedit",
  "#borutoedits",
  "#borutotiktok",
  "#borutokawaki",
  "#saradauchiha",
  "#borutotwobluevortex",
  "#tbv",
  "#twobluevortex",
  "#narutoshippuden",
  "#animeedit",
  "#akatsuki",
  "#sharingan",
  "#rinnegan",
  "#rasengan",
  "#susanoo",
  "#chakra",
  "#narutoedits",
  "#uchiha",
  "#uchihaclan",
  "#uzumaki",
  "#uzumakiclan",
  "#senju",
  "#senjucan",
  "#hyuga",
  "#hyugaclan",
  "#akatsukiedit",
  "#akatsukimemes",
  "#team7",
  "#team10",
  "#team8",
  "#teamguy",
  "#konoha",
  "#hiddenleaf",
  "#leafvillage",
  "#shinobi",
  "#ninja",
  "#narutoverse",
  "#shinobiworld",
  "#sharing",
  "#mangekyosharingan",
  "#eternalms",
  "#byakugan",
  "#rinnesharingan",
  "#baryonmode",
  "#sixpath",
  "#sixpaths",
  "#sixpathsofpain",
  "#sageMode",
  "#sixpathsage",
  "#rasenshuriken",
  "#chidori",
  "#amaterasu",
  "#kamui",
  "#izanagi",
  "#izanami",
  "#genjutsu",
  "#taijutsu",
  "#ninjutsu",
  "#kagebunshin",
  "#shadowclone",
  "#woodstyle",
  "#firestyle",
  "#waterstyle",
  "#lightningstyle",
  "#earthstyle",
  "#windstyle",
  "#otsutsuki",
  "#otsutsukiclan",
  "#otsutsukiedit",
  "#otsutsukiedits",
  "#otsutsukimoments",
  "#otsutsukimemes",
  "#otsutsukipower",
  "#otsutsukipowers",
  "#kaguya",
  "#kaguyatsutsuki",
  "#kaguyaroot",
  "#kaguyaedit",
  "#kaguyaedits",
  "#momoshiki",
  "#momoshikiotsutsuki",
  "#momoshikiedit",
  "#momoshikiedits",
  "#kinshiki",
  "#kinshikiotsutsuki",
  "#kinshikiedit",
  "#isshiki",
  "#isshikiootsutsuki",
  "#isshikiedit",
  "#isshikiedits",
  "#jigen",
  "#jigenedit",
  "#urashiki",
  "#urashikiedit",
  "#toneri",
  "#toneriotsutsuki",
  "#toneriedit",
  "#hagoromo",
  "#hagoromootsutsuki",
  "#hagoromoedit",
  "#sageofsixpaths",
  "#hamura",
  "#hamuraotsutsuki",
  "#hamuraedit",
  "#shibai",
  "#shibaiotsutsuki",
  "#shibaiotsutsukiedit",
  "#code",
  "#daemon",
  "#daemonedit",
  "#eida",
  "#edaedit",
  "#otsutsukilore",
  "#otsutsukigod",
  "#shinjutsu",
  "#shinjutsupowers",
  "#divinepower",
  "#godofshinobi",
  "#sixpathssage",
  "#tenseigan",
  "#jougan",
  "#karma",
  "#karmaseal",
  "#rinnegans",
  "#narutoamv",
  "#narutoamvedit",
  "#narutoshippudenedit",
  "#narutoanimeedit",
  "#naruto4k",
  "#naruto4kedit",
  "#narutoedit4k",
  "#narutoeditz",
  "#narutoedits4k",
  "#itachiedits",
  "#madaraedit",
  "#madaraedits",
  "#obitoedit",
  "#obitoedits",
  "#sasukeedit",
  "#sasukeedits",
  "#shisuiedit",
  "#otsutsukiclan",
  "#kaguyautsutsuki",
  "#shibaiedit",
  "#kiba",
  "#eternalmangekyosharingan",
  "#rinnegansharingan",
  "#perfectsusanoo",
  "#narutoaura",
  "#animeaura",
  "#animepower",
  "#animepowers",
  "#painedit",
  "#nagatoedit",
  "#minatoedit",
  "#jiraiyaedit",
  "#hashiramaedit",
  "#tobiramaedit",
  "#mightguyedit",
  "#rockleeedit",
  "#gaaraedit",
  "#deidaraedit",
  "#tentails",
  "#tentailsedits",
  "#tenten",
  "#temari",
];

function uniqueHashtags(items) {
  const seen = new Set();
  return items.filter((hashtag) => {
    const key = normalizeHashtag(hashtag);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const NARUTO_HASHTAGS = Object.freeze(uniqueHashtags(NARUTO_HASHTAG_SEED));

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
let davidCyrilClientPromise;

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

function isMp4Buffer(buffer) {
  return validVideoBuffer(buffer) && buffer.slice(4, 8).toString("ascii") === "ftyp";
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
      // Cap the longest edge at 1280 without padding. TikTok edits are
      // normally portrait; forcing 1280x720 made them arrive with large
      // black bars and a poor WhatsApp preview.
      "-vf", "scale=720:720:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1",
      "-r", "30",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart",
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

function normalizeHashtag(value) {
  return String(value || "").trim().toLowerCase().replace(/^#+/, "").replace(/[^a-z0-9]+/g, "");
}

function canonicalUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return raw.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

export function isNarutoEditTitle(value) {
  const title = String(value || "").trim();
  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return /\bnarutoedit\b/.test(normalized) && !AI_OR_NON_EDIT_PATTERN.test(title);
}

export function buildNarutoSearchQueries() {
  const secondaryHashtags = NARUTO_HASHTAGS
    .filter((hashtag) => normalizeHashtag(hashtag) !== normalizeHashtag(NARUTO_SEARCH_ANCHOR));
  return shuffle(secondaryHashtags)
    .map((hashtag) => `${NARUTO_SEARCH_ANCHOR} ${hashtag}`);
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
  const title = String(row?.title || row?.desc || "").trim().slice(0, 140);
  if (!sourceUrl || !isNarutoEditTitle(title)) return null;
  return {
    sourceUrl,
    videoId: String(videoId || "").trim(),
    hashtag,
    title,
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
        keywords: `${NARUTO_SEARCH_ANCHOR} ${hashtag}`,
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
  // Every query contains #narutoedit plus one randomly rotated hashtag from
  // the full handwritten pool. Search a small batch in parallel so a quiet
  // tag does not make the command wait through the entire pool.
  const queries = buildNarutoSearchQueries();
  for (let offset = 0; offset < queries.length; offset += NARUTO_SEARCH_BATCH_SIZE) {
    const batch = queries.slice(offset, offset + NARUTO_SEARCH_BATCH_SIZE);
    const rowsByQuery = await Promise.all(batch.map((query) =>
      withTimeout(searchNarutoHashtag(query), 15000),
    ));
    for (const rows of rowsByQuery) {
      for (const row of rows || []) {
        const key = row.videoId
          ? `id:${row.videoId}`
          : `url:${canonicalUrl(row.sourceUrl)}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        candidates.push(row);
      }
    }
    if (candidates.length >= NARUTO_CANDIDATE_TARGET) break;
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

async function downloadDavidCyrilVideo(candidate) {
  const client = await (davidCyrilClientPromise ||= import("../davidcyril.js")).catch(() => null);
  if (!client?.dcGet) return null;
  const extractPortableUrl = (payload) => {
    const data = payload?.data?.data || payload?.data || payload?.result || payload || {};
    return firstUrl(data?.play, data?.video, data?.url, data?.wmplay, data?.hdplay);
  };
  const urls = [];
  const primary = await client.dcGet(DC_TIKTOK_ENDPOINTS[0], { url: candidate.sourceUrl }, 15000).catch(() => null);
  const primaryUrl = primary?.ok ? extractPortableUrl(primary.data) : "";
  if (primaryUrl) urls.push(primaryUrl);

  if (!urls.length) {
    const fallbackResults = await Promise.all(DC_TIKTOK_ENDPOINTS.slice(1).map(async (endpoint) => {
      const response = await client.dcGet(endpoint, { url: candidate.sourceUrl }, 15000).catch(() => null);
      return response?.ok ? extractPortableUrl(response.data) : "";
    }));
    urls.push(...fallbackResults.filter(Boolean));
  }

  for (const url of [...new Set(urls)]) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 60000,
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
  return null;
}

async function downloadNarutoVideo(candidate) {
  // David Cyril is the fast primary path. TikWM remains a provider fallback
  // because public downloader availability changes over time.
  return await downloadDavidCyrilVideo(candidate)
    || await downloadTikwmVideo(candidate);
}

async function narutoEdits() {
  const candidates = await collectNarutoCandidates();
  const resolved = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length && resolved.length < NARUTO_RESULTS) {
      const candidate = candidates[cursor++];
      try {
        const source = await withTimeout(downloadNarutoVideo(candidate), 75000);
        if (!source) continue;
        // Normalize downloads concurrently and preserve portrait/landscape
        // orientation. If transcoding fails, only pass through a real MP4;
        // never label WebM/HTML as video/mp4.
        const normalized = isMp4Buffer(source) && source.length <= MAX_PORTABLE_MP4_BYTES
          ? null
          : await withTimeout(normalizeHdVideo(source), 25000);
        const buffer = normalized && normalized.length <= MAX_PORTABLE_OUTPUT_BYTES
          ? normalized
          : (isMp4Buffer(source) && source.length <= MAX_PORTABLE_OUTPUT_BYTES ? source : null);
        if (buffer && validVideoBuffer(buffer)) resolved.push({ ...candidate, buffer });
      } catch {}
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(NARUTO_RESULTS, candidates.length) },
    () => worker(),
  ));
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
    const key = item.videoId
      ? `id:${item.videoId}`
      : `url:${canonicalUrl(item.sourceUrl || item.downloadUrl)}`;
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
  NARUTO_SEARCH_ANCHOR,
  TIKWM_SEARCH_ENDPOINTS,
  canonicalUrl,
  cleanSlug,
  commandKey,
  displayName,
  loadCatalog,
  normalizeHdVideo,
};
