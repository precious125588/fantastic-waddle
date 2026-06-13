// davidcyril.js — DavidCyril public API helper (axios-based, ESM)
// Base: https://apis.davidcyril.name.ng — 468 public endpoints, no key required
import axios from "axios";

const DC_BASE = "https://apis.davidcyril.name.ng";
const DC_TIMEOUT = 25000;

export async function dcGet(path, params = {}, timeout = DC_TIMEOUT) {
  try {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const url = `${DC_BASE}${path}${qs.toString() ? "?" + qs.toString() : ""}`;
    const { data } = await axios.get(url, {
      timeout,
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json,*/*" },
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e?.message, data: null };
  }
}

// Download binary (image, audio, video) from a DC endpoint
export async function dcGetBinary(path, params = {}, timeout = 60000) {
  try {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const url = `${DC_BASE}${path}${qs.toString() ? "?" + qs.toString() : ""}`;
    const resp = await axios.get(url, {
      timeout,
      responseType: "arraybuffer",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return { ok: true, buf: Buffer.from(resp.data), contentType: resp.headers["content-type"] || "" };
  } catch (e) {
    return { ok: false, error: e?.message, buf: null };
  }
}

// Resolve audio download URL from DC Spotify API responses
export function extractDcSpotify(data) {
  if (!data) return {};
  const d = data?.data || data?.result || data;
  return {
    dlUrl: d?.download_url || d?.audio || d?.url || d?.mp3 || d?.link || null,
    title: d?.title || d?.name || null,
    artists: Array.isArray(d?.artists) ? d.artists.map(a => a?.name || a).join(", ") : (d?.artist || d?.artists || null),
    thumbUrl: d?.thumbnail || d?.cover || d?.image || d?.album_art || d?.cover_url || null,
    duration: d?.duration ? `${Math.floor(d.duration / 60)}:${String(d.duration % 60).padStart(2, "0")}` : null,
  };
}

// Resolve video download URL from DC TikTok API responses
export function extractDcTiktok(data, isAudio = false) {
  if (!data) return null;
  const d = data?.data || data?.result || data;
  if (isAudio) return d?.music || d?.wmplay || d?.audio || d?.play || null;
  return d?.hdplay || d?.play || d?.video || d?.url || d?.nwm_video_url_HQ || null;
}

export default { dcGet, dcGetBinary, extractDcSpotify, extractDcTiktok };
