/**
 * MIAS — Upload Handler
 * Centralized media upload abstraction using @itsliaaa/baileys.
 *
 * All media going through Baileys should pass through these helpers to ensure:
 *  - Consistent thumbnail generation
 *  - Proper MIME types
 *  - Correct buffer handling
 *  - Upload caching to avoid re-uploading the same media
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple LRU upload cache: url → { mediaKey, url, directPath, fileEncSha256, fileSha256, fileLength }
const _uploadCache = new Map();
const _CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function _cacheKey(buf) {
  try {
    // Use first+last 32 bytes + length as a fast cache key
    const head = buf.slice(0, 32).toString("hex");
    const tail = buf.slice(-32).toString("hex");
    return `${buf.length}:${head}:${tail}`;
  } catch { return null; }
}

/**
 * Fetch a URL as a Buffer.
 */
export async function fetchBuffer(url, timeout = 30000) {
  const axios = (await import("axios")).default;
  const resp = await axios.get(url, {
    responseType: "arraybuffer",
    timeout,
    maxRedirects: 5,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  return Buffer.from(resp.data);
}

/**
 * Generate a JPEG thumbnail from an image Buffer.
 * Falls back to original buffer if jimp/sharp is unavailable.
 * @param {Buffer} imageBuffer
 * @param {number} [width=300]
 * @param {number} [height=300]
 * @returns {Promise<Buffer>} JPEG thumbnail buffer
 */
export async function generateImageThumbnail(imageBuffer, width = 300, height = 300) {
  // Try jimp (already a dependency)
  try {
    const Jimp = _require("jimp");
    const img = await Jimp.read(imageBuffer);
    img.cover(width, height);
    return await img.getBufferAsync(Jimp.MIME_JPEG);
  } catch {}
  // Try sharp if available
  try {
    const sharp = _require("sharp");
    return await sharp(imageBuffer)
      .resize(width, height, { fit: "cover", position: "center" })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch {}
  // Return original (no thumbnail generation possible)
  return imageBuffer;
}

/**
 * Generate a JPEG thumbnail from a video Buffer using ffmpeg.
 * Falls back to a 1x1 pixel JPEG if ffmpeg is unavailable.
 * @param {Buffer} videoBuffer
 * @returns {Promise<Buffer>} JPEG thumbnail buffer
 */
export async function generateVideoThumbnail(videoBuffer) {
  try {
    const os = await import("os");
    const tmpDir = os.tmpdir();
    const tmpIn = path.join(tmpDir, `mias_vid_${Date.now()}.mp4`);
    const tmpOut = path.join(tmpDir, `mias_thumb_${Date.now()}.jpg`);
    fs.writeFileSync(tmpIn, videoBuffer);

    await new Promise((resolve, reject) => {
      const ffmpegPath = (() => {
        try { return _require("ffmpeg-static"); } catch { return "ffmpeg"; }
      })();
      const { spawn } = _require("child_process");
      const proc = spawn(ffmpegPath, [
        "-y", "-i", tmpIn,
        "-ss", "00:00:01",
        "-vframes", "1",
        "-vf", "scale=320:-1",
        "-f", "image2",
        tmpOut,
      ]);
      const timer = setTimeout(() => { try { proc.kill(); } catch {} reject(new Error("ffmpeg timeout")); }, 15000);
      proc.on("close", code => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}`));
      });
      proc.on("error", e => { clearTimeout(timer); reject(e); });
    });

    if (fs.existsSync(tmpOut)) {
      const buf = fs.readFileSync(tmpOut);
      try { fs.unlinkSync(tmpIn); } catch {}
      try { fs.unlinkSync(tmpOut); } catch {}
      return buf;
    }
  } catch {}
  // Fallback: 1×1 white JPEG
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k=",
    "base64"
  );
}

/**
 * Get cached upload info for a buffer (avoids re-uploading).
 */
export function getCachedUpload(buf) {
  const key = _cacheKey(buf);
  if (!key) return null;
  const entry = _uploadCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > _CACHE_TTL) {
    _uploadCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Cache an upload result for a buffer.
 */
export function setCachedUpload(buf, data) {
  const key = _cacheKey(buf);
  if (!key) return;
  _uploadCache.set(key, { data, ts: Date.now() });
  // Prune cache if too large
  if (_uploadCache.size > 50) {
    const oldest = _uploadCache.keys().next().value;
    _uploadCache.delete(oldest);
  }
}
