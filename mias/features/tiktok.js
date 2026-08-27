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

export function parseTikTokMode(value) {
  const mode = MODES[String(value || "").trim()];
  return mode ? { ...mode, id: String(value).trim() } : null;
}

export function formatTikTokMenu(info, prefix = ".") {
  return [
    `*${info.title}*`,
    `Author: ${info.author}`,
    info.duration ? `Duration: ${info.duration}s` : null,
    "",
    "Please reply with the number you want to select:",
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
    `Reply with *${prefix}pick <number>* within 5 minutes.`,
  ].filter(Boolean).join("\n");
}

export async function fetchTikTokInfo(url, fetchImpl = fetch) {
  let lastError;
  for (const endpoint of PROVIDERS) {
    try {
      const response = await fetchImpl(endpoint(url), { headers: { "User-Agent": "MIAS/1.0" } });
      if (!response.ok) throw new Error(`TikTok provider returned ${response.status}`);
      const json = await response.json();
      const info = normalizeTikTokResponse(json);
      if (info.videoHd || info.videoSd || info.audio) return info;
    } catch (error) {
      lastError = error;
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