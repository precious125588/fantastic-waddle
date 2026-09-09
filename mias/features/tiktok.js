/**
 * TikTok metadata/download adapter.
 * Provider responses are normalized here so the command layer only deals with
 * stable fields and safe media modes.
 */
const PROVIDERS = [
  (url) => `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
  (url) => `https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`,
];

const MODES = {
  "1.1": { kind: "video", quality: "sd", document: false, watermark: false },
  "1.2": { kind: "video", quality: "sd", document: true, watermark: false },
  "1.3": { kind: "video", quality: "hd", document: false, watermark: false },
  "1.4": { kind: "video", quality: "hd", document: true, watermark: false },
  "1.5": { kind: "video", quality: "sd", document: false, watermark: true },
  "1.6": { kind: "video", quality: "hd", document: false, watermark: true },
  "1.7": { kind: "video", quality: "hd", document: false, watermark: false, videoNote: true },
  "2.1": { kind: "audio", document: false, voiceNote: false },
  "2.2": { kind: "audio", document: true, voiceNote: false },
  "2.3": { kind: "audio", document: false, voiceNote: true },
};

const pick = (...values) => values.find((value) => typeof value === "string" && value);

export function normalizeTikTokResponse(payload = {}) {
  const data = payload?.data || payload?.result || payload;
  return {
    title: pick(data.title, data.desc, data.description, "TikTok video"),
    author: pick(data.author?.nickname, data.author?.unique_id, data.author, data.author_name, "Unknown author"),
    duration: data.duration || data.duration_sec || "",
    thumbnail: pick(data.cover, data.thumbnail, data.origin_cover, data.music_info?.cover),
    videoHd: pick(data.hdplay, data.hd, data.play_hd, data.download_url),
    videoSd: pick(data.play, data.sd, data.wmplay),
    videoWatermark: pick(data.wmplay, data.play),
    audio: pick(data.music, data.music_info?.play, data.audio),
  };
}

const MODE_ALIASES = {
  "1": "1.1", "sd": "1.1", "video": "1.1",
  "doc": "1.2", "document": "1.2",
  "hd": "1.3",
  "hddoc": "1.4",
  "wm": "1.5", "watermark": "1.5",
  "hdwm": "1.6",
  "note": "1.7", "videonote": "1.7",
  "2": "2.1", "audio": "2.1", "mp3": "2.1", "music": "2.1",
  "audiodoc": "2.2",
  "vn": "2.3", "voice": "2.3", "voicenote": "2.3", "ptt": "2.3",
};

// Accepts "1.3", " 1.3 ", "*1.3*", "1 3", "1,3", "1-3", "hd", "audio", ...
export function normalizeTikTokMode(value) {
  let v = String(value || "")
    .replace(/[*_~`>]/g, "")
    .replace(/^(?:option|choice)\s*/i, "")
    .trim()
    .toLowerCase();
  v = v.replace(/[.)]+$/, "").trim();
  if (MODE_ALIASES[v.replace(/\s+/g, "")]) return MODE_ALIASES[v.replace(/\s+/g, "")];
  const m = v.match(/^(\d+)\s*(?:[.,\-/ ]\s*(\d+))?$/);
  if (m) return m[2] ? `${m[1]}.${m[2]}` : (MODE_ALIASES[m[1]] || m[1]);
  return v;
}

export function parseTikTokMode(value) {
  const id = normalizeTikTokMode(value);
  const mode = MODES[id];
  return mode ? { ...mode, id } : null;
}

export function extractTikTokUrl(value) {
  const text = String(value || "");
  const matches = text.match(/(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/[^\s"'<>]+/gi) || [];
  for (const raw of matches) {
    const candidate = raw.replace(/[\].,;!?)'"`]+$/g, "");
    try {
      const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
      const host = url.hostname.toLowerCase();
      if (
        host === "tiktok.com"
        || host.endsWith(".tiktok.com")
      ) return url.toString();
    } catch {}
  }
  return null;
}

export function formatTikTokMenu(info, prefix = ".") {
  return [
    `*${info.title}*`,
    `Author: ${info.author}`,
    info.duration ? `Duration: ${info.duration}s` : null,
    "",
    "Reply with the number you want:",
    "➜ [1] Video",
    "1.1 SD Video (mp4)",
    "1.2 SD Document (mp4)",
    "1.3 HD Video (mp4)",
    "1.4 HD Document (mp4)",
    "1.5 SD Video with watermark",
    "1.6 HD Video with watermark",
    "1.7 HD Video Note",
    "➜ [2] Music",
    "2.1 Audio",
    "2.2 Document Audio",
    "2.3 Voice Note",
    "",
    "Reply with a choice such as *1.3* within 5 minutes.",
  ].filter(Boolean).join("\n");
}

export async function fetchTikTokInfo(url, fetchImpl = fetch) {
  let lastError;
  for (const endpoint of PROVIDERS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetchImpl(endpoint(url), {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 MIAS/5.3",
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`TikTok provider returned ${response.status}`);
      const json = await response.json();
      const info = normalizeTikTokResponse(json);
      if (info.videoHd || info.videoSd || info.audio) return info;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("No TikTok provider returned media");
}

export function selectTikTokUrl(info, mode) {
  if (mode.kind === "audio") return info.audio;
  if (mode.watermark) return info.videoWatermark;
  return mode.quality === "hd" ? (info.videoHd || info.videoSd) : (info.videoSd || info.videoHd);
}

export { MODES };