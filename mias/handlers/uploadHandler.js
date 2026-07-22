/**
 * MIAS — Upload Handler
 *
 * Centralized media upload and thumbnail generation.
 * Supports HTTP fetch, image thumbnail (Jimp), and video thumbnail (ffmpeg).
 *
 * Architecture:  Commands → Handlers → Baileys Adapter → WhatsApp
 */

import { createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// ─── Simple LRU cache for upload results ─────────────────────────────────────

const CACHE_MAX = 200;
const _uploadCache = new Map();

function _cacheGet(key) {
  return _uploadCache.get(key) ?? null;
}

function _cacheSet(key, value) {
  if (_uploadCache.size >= CACHE_MAX) {
    const oldest = _uploadCache.keys().next().value;
    _uploadCache.delete(oldest);
  }
  _uploadCache.set(key, value);
}

// ─── HTTP fetch ───────────────────────────────────────────────────────────────

/**
 * Fetch a remote URL into a Buffer.
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30000]
 * @param {object} [opts.headers]
 * @returns {Promise<Buffer>}
 */
export async function fetchBuffer(url, opts = {}) {
  const cachedKey = `fetch:${url}`;
  const cached = _cacheGet(cachedKey);
  if (cached) return cached;

  const timeout = opts.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const { default: nodeFetch } = await import("node-fetch").catch(() => ({ default: fetch }));
    const fetchFn = nodeFetch || fetch;

    const res = await fetchFn(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "MIAS-Bot/5.3 (+https://github.com/precious125588/fantastic-waddle)",
        ...(opts.headers || {}),
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    _cacheSet(cachedKey, buf);
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Image thumbnail ──────────────────────────────────────────────────────────

/**
 * Generate a JPEG thumbnail from an image buffer using Jimp.
 * Falls back to the original buffer if Jimp fails.
 *
 * @param {Buffer} imageBuf
 * @param {object} [opts]
 * @param {number} [opts.width=300]
 * @param {number} [opts.height=150]
 * @returns {Promise<Buffer>}
 */
export async function generateImageThumbnail(imageBuf, opts = {}) {
  const w = opts.width  ?? 300;
  const h = opts.height ?? 150;

  // Try Jimp
  try {
    const Jimp = await import("jimp");
    const JimpCls = Jimp.Jimp || Jimp.default?.Jimp || Jimp.default;
    if (JimpCls) {
      const img = await JimpCls.fromBuffer(imageBuf);
      img.resize({ w, h });
      return await img.getBuffer("image/jpeg");
    }
  } catch {}

  // Try sharp
  try {
    const sharp = await import("sharp");
    const sharpFn = sharp.default || sharp;
    return await sharpFn(imageBuf)
      .resize(w, h, { fit: "cover" })
      .jpeg({ quality: 75 })
      .toBuffer();
  } catch {}

  // Fallback: return original
  return imageBuf;
}

// ─── Video thumbnail ──────────────────────────────────────────────────────────

/**
 * Generate a JPEG thumbnail from a video buffer using ffmpeg.
 * Returns null if ffmpeg is unavailable.
 *
 * @param {Buffer} videoBuf
 * @param {object} [opts]
 * @param {number} [opts.width=300]
 * @param {number} [opts.height=150]
 * @param {number} [opts.timeOffset=1]  - Second offset to capture frame
 * @returns {Promise<Buffer|null>}
 */
export async function generateVideoThumbnail(videoBuf, opts = {}) {
  const w = opts.width      ?? 300;
  const h = opts.height     ?? 150;
  const t = opts.timeOffset ?? 1;

  const tmpIn  = join(tmpdir(), `mias_vthumb_in_${Date.now()}.mp4`);
  const tmpOut = join(tmpdir(), `mias_vthumb_out_${Date.now()}.jpg`);

  try {
    const { writeFile } = await import("fs/promises");
    await writeFile(tmpIn, videoBuf);

    const ffmpegStatic = await import("ffmpeg-static").then(m => m.default || m).catch(() => "ffmpeg");
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const exec = promisify(execFile);

    await exec(ffmpegStatic, [
      "-y", "-i", tmpIn,
      "-ss", String(t),
      "-vframes", "1",
      "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
      tmpOut,
    ]);

    const { readFile } = await import("fs/promises");
    const buf = await readFile(tmpOut);
    return buf;
  } catch {
    return null;
  } finally {
    try { await unlink(tmpIn); }  catch {}
    try { await unlink(tmpOut); } catch {}
  }
}

// ─── Catbox upload ────────────────────────────────────────────────────────────

/**
 * Upload a Buffer to catbox.moe and return the public URL.
 *
 * @param {Buffer} buf
 * @param {string} [filename="file.bin"]
 * @param {string} [mimetype="application/octet-stream"]
 * @returns {Promise<string>}
 */
export async function uploadToCatbox(buf, filename = "file.bin", mimetype = "application/octet-stream") {
  const cacheKey = `catbox:${buf.length}:${filename}`;
  const cached = _cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const FormData = await import("form-data").then(m => m.default || m);
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", buf, { filename, contentType: mimetype });

    const fetchFn = (await import("node-fetch").catch(() => ({ default: fetch }))).default || fetch;
    const res = await fetchFn("https://catbox.moe/user/api.php", {
      method: "POST",
      body: form,
      headers: form.getHeaders ? form.getHeaders() : {},
    });

    if (!res.ok) throw new Error(`Catbox ${res.status}`);
    const url = (await res.text()).trim();
    if (!url.startsWith("https://")) throw new Error("Invalid catbox response");
    _cacheSet(cacheKey, url);
    return url;
  } catch (err) {
    throw new Error(`[uploadToCatbox] Failed: ${err?.message}`);
  }
}

/**
 * Upload media using the Baileys built-in upload mechanism.
 * Wraps prepareWAMessageMedia for cases where a URL is needed.
 *
 * @param {object}   sock
 * @param {Buffer}   buf
 * @param {"image"|"video"|"audio"|"document"|"sticker"} type
 * @param {object}   [opts]
 * @returns {Promise<object>}   - Prepared media object with mediaUrl
 */
export async function uploadMedia(sock, buf, type = "image", opts = {}) {
  try {
    const { prepareWAMessageMedia: prep } = await import("./gktwAdapter.js");
    const content = { [type]: buf, ...opts };
    return await prep(content, { upload: sock.waUploadToServer });
  } catch (err) {
    throw new Error(`[uploadMedia] Failed: ${err?.message}`);
  }
}
