import axios from "axios";
import { createRequire } from "module";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const MAX_DURATION_SECONDS = 90;
const MAX_RESULTS = 5;
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_VIDEO_BYTES = 90 * 1024 * 1024;

const PLATFORMS = [
  { id: "tiktok", label: "TikTok", domains: ["tiktok.com"] },
  { id: "pinterest", label: "Pinterest", domains: ["pinterest.com", "pin.it"] },
  { id: "youtube", label: "YouTube", domains: ["youtube.com", "youtu.be"] },
  { id: "facebook", label: "Facebook", domains: ["facebook.com", "fb.watch"] },
];

const PLATFORM_ALIASES = new Map([
  ["1", "tiktok"], ["tiktok", "tiktok"], ["tt", "tiktok"],
  ["2", "pinterest"], ["pinterest", "pinterest"], ["pin", "pinterest"],
  ["3", "youtube"], ["youtube", "youtube"], ["yt", "youtube"],
  ["4", "facebook"], ["facebook", "facebook"], ["fb", "facebook"],
]);

const sessions = new Map();
const APPROVED_PLATFORMS = new Set(PLATFORMS.map((platform) => platform.id));
const QUALITY_QUERY_TERMS = [
  "viral trending popular high quality HD 4k anime edit",
  "best rated popular anime edit",
];
const LOW_QUALITY_PATTERN = /\b(?:low[\s-]?quality|low[\s-]?effort|no[\s-]?likes?|1[\s-]?like|flop(?:ped)?|bad[\s-]?edit|ugly[\s-]?edit)\b/i;

function cleanText(value) {
  return String(value || "")
    .replace(/[*_~`]/g, "")
    .replace(/[\u200b-\u200d\uFEFF]/g, "")
    .trim();
}

function unwrapQuotedMessage(message) {
  let current = message;
  for (let i = 0; i < 6; i += 1) {
    const inner = current?.viewOnceMessage?.message
      || current?.viewOnceMessageV2?.message
      || current?.ephemeralMessage?.message
      || current?.documentWithCaptionMessage?.message;
    if (!inner || inner === current) break;
    current = inner;
  }
  return current || {};
}

export function statusMessageText(msg) {
  const message = msg?.message || {};
  return cleanText(
    message.conversation
      || message.extendedTextMessage?.text
      || message.imageMessage?.caption
      || message.videoMessage?.caption
      || message.documentMessage?.caption
      || message.buttonsResponseMessage?.selectedButtonId
      || message.listResponseMessage?.singleSelectReply?.selectedRowId
      || message.interactiveResponseMessage?.buttonReply?.id
      || message.interactiveResponseMessage?.buttonReply?.displayText
      || "",
  );
}

function contextInfo(msg) {
  const message = msg?.message || {};
  return message.extendedTextMessage?.contextInfo
    || message.imageMessage?.contextInfo
    || message.videoMessage?.contextInfo
    || message.documentMessage?.contextInfo
    || message.buttonsResponseMessage?.contextInfo
    || message.listResponseMessage?.contextInfo
    || message.interactiveResponseMessage?.contextInfo
    || null;
}

function sessionKey(msg) {
  const jid = String(msg?.key?.remoteJid || "");
  const sender = String(
    msg?.key?.participant
      || msg?.key?.senderPn
      || msg?.key?.participantPn
      || (jid.endsWith("@s.whatsapp.net") ? jid : ""),
  );
  return `${jid}|${sender}`;
}

function quoteId(msg) {
  return contextInfo(msg)?.stanzaId || "";
}

function isQuotedPrompt(msg, session) {
  const id = quoteId(msg);
  return !!contextInfo(msg)?.quotedMessage && !!id && session.promptIds.has(id);
}

function parsePlatform(value) {
  const normalized = cleanText(value).toLowerCase()
    .replace(/^(option|choice|platform|number|no\.?)\s*[:.)-]?\s*/i, "")
    .trim();
  const platform = PLATFORM_ALIASES.get(normalized) || null;
  return platform && APPROVED_PLATFORMS.has(platform) ? platform : null;
}

export function parseStatusPlatform(value) {
  return parsePlatform(value);
}

export function parseStatusQuantity(value) {
  const normalized = cleanText(value).toLowerCase();
  const match = normalized.match(/(?:^|\b)(10|[1-9])(?:\s*(?:edit|edits|video|videos))?\b/);
  if (!match) return 0;
  return Math.min(MAX_RESULTS, Number(match[1]));
}

function platformInfo(id) {
  return PLATFORMS.find((platform) => platform.id === id) || PLATFORMS.at(-1);
}

function trimHtmlUrl(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x2F;/gi, "/")
    .replace(/\\u0026/g, "&")
    .trim();
}

function validHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function hostMatches(url, domains = []) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function deepUrl(value, preferred = false, depth = 0) {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") {
    const url = validHttpUrl(value);
    if (!url) return "";
    if (preferred || /\.(mp4|m3u8|webm)(?:[?#]|$)/i.test(url)) return url;
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepUrl(item, preferred, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const preferredKeys = [
    "download_url", "downloadUrl", "download", "hdplay", "hd", "no_watermark",
    "nowm", "video", "video_url", "videoUrl", "play", "play_url", "url", "link",
    "mp4", "file", "media",
  ];
  for (const key of preferredKeys) {
    const found = deepUrl(value[key], true, depth + 1);
    if (found) return found;
  }
  for (const child of Object.values(value)) {
    const found = deepUrl(child, false, depth + 1);
    if (found) return found;
  }
  return "";
}

function candidate(sourceUrl, extra = {}) {
  const source = validHttpUrl(sourceUrl);
  if (!source) return null;
  const platform = String(extra.platform || "").toLowerCase();
  if (!APPROVED_PLATFORMS.has(platform) || !hostMatches(source, platformInfo(platform).domains)) {
    return null;
  }
  const title = cleanText(extra.title || "Status edit").slice(0, 120);
  if (LOW_QUALITY_PATTERN.test(title) || hasLowEngagement(extra)) return null;
  return {
    sourceUrl: source,
    downloadUrl: validHttpUrl(extra.downloadUrl || ""),
    title,
    platform,
    qualityScore: qualityScore({ ...extra, title }),
  };
}

function uniqueCandidates(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item?.sourceUrl || item?.downloadUrl;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numericMetric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value || "").replace(/,/g, "").trim().toLowerCase();
  const match = text.match(/^([\d.]+)\s*([km])?/);
  if (!match) return 0;
  const multiplier = match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
  return Number(match[1]) * multiplier;
}

function qualityScore(item = {}) {
  const title = String(item.title || "").toLowerCase();
  const views = numericMetric(item.views ?? item.viewCount ?? item.playCount);
  const likes = numericMetric(item.likes ?? item.likeCount);
  const rating = numericMetric(item.rating ?? item.score);
  let score = 50;
  if (/\b(?:viral|trending|popular|best|4k|hd|amv)\b/.test(title)) score += 15;
  if (views >= 100_000) score += 20;
  if (likes >= 10_000) score += 15;
  if (rating >= 4) score += 10;
  if (LOW_QUALITY_PATTERN.test(title)) score -= 60;
  return score;
}

function hasLowEngagement(item = {}) {
  const views = numericMetric(item.views ?? item.viewCount ?? item.playCount);
  const likes = numericMetric(item.likes ?? item.likeCount);
  const rating = numericMetric(item.rating ?? item.score);
  return (views > 0 && views < 1_000)
    || (likes > 0 && likes < 10)
    || (rating > 0 && rating < 3);
}

async function bingSearch(query, platform) {
  const info = platformInfo(platform);
  const domainQuery = ` site:${info.domains[0]}`;
  const queries = [
    ...QUALITY_QUERY_TERMS.map((quality) =>
      `https://www.bing.com/videos/search?q=${encodeURIComponent(`${query} ${quality}${domainQuery}`)}`),
    ...QUALITY_QUERY_TERMS.map((quality) =>
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${query} ${quality}${domainQuery}`)}`),
  ];
  const found = [];
  for (const url of queries) try {
    const { data } = await axios.get(url, {
      timeout: 18000,
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,application/xhtml+xml" },
    });
    const html = String(data || "");
    const pageFound = [];
    const pattern = /href=["'](https?:\/\/[^"'<> ]+)/gi;
    let match;
    while ((match = pattern.exec(html)) && pageFound.length < 15) {
      const link = trimHtmlUrl(match[1]);
      if (hostMatches(link, info.domains)) {
        pageFound.push(candidate(link, {
          platform,
          title: `${query} viral high quality edit`,
          qualityScore: 65,
        }));
      }
    }
    for (const encoded of html.matchAll(/uddg=([^&"]+)/gi)) {
      try {
        const link = trimHtmlUrl(decodeURIComponent(encoded[1]));
        if (hostMatches(link, info.domains)) {
          pageFound.push(candidate(link, {
            platform,
            title: `${query} viral high quality edit`,
            qualityScore: 65,
          }));
        }
      } catch {}
    }
    const results = uniqueCandidates(pageFound);
    if (results.length) return results.sort((a, b) => b.qualityScore - a.qualityScore);
  } catch {}
  return [];
}

async function searchCandidates(query, platform) {
  const platforms = [platform];
  const providers = platforms
    .filter((item) => APPROVED_PLATFORMS.has(item))
    .map((item) => () => bingSearch(query, item));
  const all = [];
  for (const provider of providers) {
    try {
      const results = await provider();
      all.push(...results);
      if (uniqueCandidates(all).length >= 10) break;
    } catch {}
  }
  return uniqueCandidates(all)
    .filter((item) => item.qualityScore >= 50)
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, 15);
}

async function prexzyDownload(sourceUrl, platform) {
  const endpointByPlatform = {
    tiktok: "/download/tiktok",
    pinterest: "/download/pinterest",
  };
  const endpoint = endpointByPlatform[platform];
  if (!endpoint) return "";
  try {
    const response = await axios.get(`https://apis.prexzyvilla.site${endpoint}`, {
      params: { url: sourceUrl },
      timeout: 35000,
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    return deepUrl(response.data);
  } catch {
    return "";
  }
}

async function cobaltDownload(sourceUrl) {
  const endpoints = [
    "https://api.cobalt.tools/api/json",
    "https://co.wuk.sh/api/json",
    "https://cobalt-api.kwiatekmiki.com/",
  ];
  for (const endpoint of endpoints) {
    try {
      const { data } = await axios.post(endpoint, {
        url: sourceUrl,
        downloadMode: "video",
        videoQuality: "720",
        filenameStyle: "basic",
      }, {
        timeout: 35000,
        headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      });
      const url = deepUrl(data);
      if (url) return url;
    } catch {}
  }
  return "";
}

async function downloadBuffer(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 120000,
    maxContentLength: MAX_VIDEO_BYTES,
    maxBodyLength: MAX_VIDEO_BYTES,
    headers: { "User-Agent": "Mozilla/5.0", Accept: "video/*,application/octet-stream,*/*" },
  });
  const buffer = Buffer.from(response.data || []);
  if (buffer.length < 10000 || buffer.length > MAX_VIDEO_BYTES) return null;
  const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
  const looksLikeVideo = /^video\//.test(contentType)
    || buffer.slice(4, 8).toString("ascii") === "ftyp"
    || buffer.slice(0, 4).toString("ascii") === "RIFF"
    || (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3);
  if (/text\/html|application\/json/.test(contentType) || !looksLikeVideo) return null;
  return buffer;
}

export function getMp4DurationSeconds(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) return 0;
  const findMvhd = (start, end) => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = buffer.readUInt32BE(offset);
      const type = buffer.toString("ascii", offset + 4, offset + 8);
      let header = 8;
      if (size === 1 && offset + 16 <= end) {
        size = Number(buffer.readBigUInt64BE(offset + 8));
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) break;
      if (type === "mvhd" && offset + header + 20 <= end) {
        const version = buffer.readUInt8(offset + header);
        const base = offset + header + (version === 1 ? 20 : 12);
        if (base + (version === 1 ? 16 : 8) <= end) {
          const timescale = buffer.readUInt32BE(base);
          const duration = version === 1
            ? Number(buffer.readBigUInt64BE(base + 4))
            : buffer.readUInt32BE(base + 4);
          return timescale ? duration / timescale : 0;
        }
      }
      if (["moov", "trak", "mdia"].includes(type)) {
        const nested = findMvhd(offset + header, offset + size);
        if (nested) return nested;
      }
      offset += size;
    }
    return 0;
  };
  return findMvhd(0, buffer.length);
}

async function trimVideo(buffer) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mias-status-"));
  const input = path.join(dir, "input.bin");
  const output = path.join(dir, "output.mp4");
  try {
    let ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
    try {
      const bundled = require("ffmpeg-static");
      if (bundled && fs.existsSync(bundled)) ffmpeg = bundled;
    } catch {}
    await fs.promises.writeFile(input, buffer);
    await execFileAsync(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", input,
      "-t", String(MAX_DURATION_SECONDS), "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output,
    ], { timeout: 120000, maxBuffer: 1024 * 1024 });
    const trimmed = await fs.promises.readFile(output);
    return trimmed.length > 10000 ? trimmed : null;
  } catch {
    return null;
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function enforceDuration(buffer) {
  const seconds = getMp4DurationSeconds(buffer);
  // Always transcode to a normal MP4 before sending. Some approved feeds
  // return WebM/Matroska/odd MP4 variants; sending those as video/mp4 makes
  // playback work for the bot owner but fail for other WhatsApp clients.
  const normalized = await trimVideo(buffer);
  if (normalized) return normalized;
  if (seconds > MAX_DURATION_SECONDS + 0.5) return null;
  return buffer.slice(4, 8).toString("ascii") === "ftyp" ? buffer : null;
}

async function resolveCandidate(item) {
  if (!item || !APPROVED_PLATFORMS.has(item.platform)
      || !hostMatches(item.sourceUrl, platformInfo(item.platform).domains)) {
    return null;
  }
  const directUrls = [];
  if (item.downloadUrl) directUrls.push(item.downloadUrl);
  const cobalt = await cobaltDownload(item.sourceUrl);
  if (cobalt) directUrls.push(cobalt);
  const fallback = await prexzyDownload(item.sourceUrl, item.platform);
  if (fallback) directUrls.push(fallback);
  for (const url of [...new Set(directUrls)]) {
    try {
      const buffer = await downloadBuffer(url);
      if (!buffer) continue;
      const limited = await enforceDuration(buffer);
      if (limited) return { ...item, buffer: limited, duration: getMp4DurationSeconds(limited) };
    } catch {}
  }
  return null;
}

function formatPlatformMenu(prefix) {
  return [
    "🎬 *Choose the platform for the edits*",
    "",
    "1. TikTok",
    "2. Pinterest",
    "3. YouTube",
    "4. Facebook",
    "",
    `Reply to this message with *1*, *2*, *3*, or *4*.`,
    `_Videos longer than 1:30 are trimmed or skipped._`,
    "_Only popular, high-quality edits from the selected platform are accepted._",
  ].join("\n");
}

function formatQuantityPrompt() {
  return [
    "🔢 *How many edits should I send?*",
    "",
    "Reply to this message with a number from *1 to 5*.",
    "_Each video is limited to 1:30 maximum._",
  ].join("\n");
}

export function buildStatusVideoMessage(buffer) {
  return {
    video: buffer,
    mimetype: "video/mp4",
  };
}

export function createStatusEditFlow({ prefix = "." } = {}) {
  const getPrefix = () => typeof prefix === "function" ? String(prefix() || "") : String(prefix || "");
  const expire = () => {
    const now = Date.now();
    for (const [key, value] of sessions) {
      if (now - value.updatedAt > SESSION_TTL_MS) sessions.delete(key);
    }
  };

  async function prompt(sock, jid, text, quoted, session) {
    const sent = await sock.sendMessage(jid, { text }, { quoted });
    session.promptIds = new Set([sent?.key?.id].filter(Boolean));
    session.updatedAt = Date.now();
    return sent;
  }

  async function start(sock, msg) {
    expire();
    const key = sessionKey(msg);
    const session = {
      key,
      stage: "topic",
      promptIds: new Set(),
      updatedAt: Date.now(),
      topic: "",
      platform: "",
      quantity: 0,
    };
    sessions.set(key, session);
    await prompt(sock, msg.key.remoteJid, [
      "🎬 *Status Edit Maker*",
      "",
      "What status edit do you want?",
      "Quote this message and reply with the topic, for example: *Naruto*.",
    ].join("\n"), msg, session);
    return true;
  }

  async function handleReply(sock, msg, body) {
    expire();
    const key = sessionKey(msg);
    const session = sessions.get(key);
    if (!session || !isQuotedPrompt(msg, session)) return false;
    const value = cleanText(body);
    if (!value || (getPrefix() && value.startsWith(getPrefix()))) return false;
    session.updatedAt = Date.now();

    if (session.stage === "topic") {
      session.topic = value.slice(0, 120);
      session.stage = "platform";
      await prompt(sock, msg.key.remoteJid, formatPlatformMenu(getPrefix()), msg, session);
      return true;
    }
    if (session.stage === "platform") {
      const platform = parsePlatform(value);
      if (!platform) {
        await prompt(
          sock,
          msg.key.remoteJid,
          "❌ Choose *1 TikTok*, *2 Pinterest*, *3 YouTube*, or *4 Facebook*.",
          msg,
          session,
        );
        return true;
      }
      session.platform = platform;
      session.stage = "quantity";
      await prompt(sock, msg.key.remoteJid, formatQuantityPrompt(), msg, session);
      return true;
    }
    if (session.stage === "quantity") {
      const quantity = parseStatusQuantity(value);
      if (!quantity) {
        await prompt(sock, msg.key.remoteJid, "❌ Reply with a number from *1 to 5*.", msg, session);
        return true;
      }
      session.quantity = quantity;
      session.stage = "working";
      await sock.sendMessage(msg.key.remoteJid, {
        text: `🔎 Searching *${session.topic}* edits on *${platformInfo(session.platform).label}*...\nPreparing ${quantity} video${quantity === 1 ? "" : "s"}.`,
      }, { quoted: msg });

      try {
        const candidates = await searchCandidates(session.topic, session.platform);
        const results = [];
        for (const item of candidates) {
          if (results.length >= quantity) break;
          const resolved = await resolveCandidate(item);
          if (resolved) results.push(resolved);
        }
        if (!results.length) {
          await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ I could not find a popular downloadable edit right now. Try another topic or choose TikTok/Pinterest.",
          }, { quoted: msg });
          sessions.delete(key);
          return true;
        }
        for (let index = 0; index < results.length; index += 1) {
          const result = results[index];
          await sock.sendMessage(
            msg.key.remoteJid,
            buildStatusVideoMessage(result.buffer),
            { quoted: msg },
          );
        }
        sessions.delete(key);
      } catch (error) {
        sessions.delete(key);
        await sock.sendMessage(msg.key.remoteJid, {
          text: `❌ The edit search failed safely: ${String(error?.message || "provider unavailable").slice(0, 180)}`,
        }, { quoted: msg });
      }
      return true;
    }
    return true;
  }

  return {
    start,
    handleReply,
    hasPending: (msg) => sessions.has(sessionKey(msg)),
    statusMessageText,
    formatPlatformMenu,
    formatQuantityPrompt,
  };
}

export {
  MAX_DURATION_SECONDS,
  MAX_RESULTS,
  PLATFORMS,
  searchCandidates as searchStatusCandidates,
  resolveCandidate as resolveStatusCandidate,
  sessions as __statusEditSessions,
};