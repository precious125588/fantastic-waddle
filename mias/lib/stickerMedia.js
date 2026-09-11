/**
 * MIAS sticker media pipeline.
 *
 * The WhatsApp sticker field must contain an actual WebP file. In particular,
 * animated stickers need a WebP ANIM/ANMF stream; sending the source MP4 with a
 * sticker-shaped success message is not sufficient.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const MAX_VIDEO_SECONDS = 6;
const MAX_VIDEO_FPS = 10;
const MAX_DIMENSION = 512;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const MAX_STATIC_STICKER_BYTES = 1024 * 1024;
const MAX_ANIMATED_STICKER_BYTES = 512 * 1024;

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function isWebp(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length > 16
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

function isAnimatedWebp(buffer) {
  if (!isWebp(buffer)) return false;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    if (type === "ANIM" || type === "ANMF") return true;
    offset += 8 + size + (size % 2);
  }
  return false;
}

function safeExt(mediaType) {
  if (String(mediaType || "").startsWith("image/")) return "image";
  if (String(mediaType || "").startsWith("video/")) return "video";
  return "media";
}

async function ffmpegPath() {
  try {
    const mod = await import("ffmpeg-static");
    return mod.default || mod;
  } catch {
    return "ffmpeg";
  }
}

async function runFfmpeg(input, output, { animated }) {
  const binary = await ffmpegPath();
  const vf = animated
    ? [
        `fps=${MAX_VIDEO_FPS}`,
        `scale=${MAX_DIMENSION}:${MAX_DIMENSION}:force_original_aspect_ratio=decrease`,
        `pad=${MAX_DIMENSION}:${MAX_DIMENSION}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
        "format=yuva420p",
      ].join(",")
    : [
        `scale=${MAX_DIMENSION}:${MAX_DIMENSION}:force_original_aspect_ratio=decrease`,
        `pad=${MAX_DIMENSION}:${MAX_DIMENSION}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
        "format=yuva420p",
      ].join(",");

  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", input,
    "-vf", vf,
    "-c:v", "libwebp",
    "-lossless", "0",
    "-compression_level", "6",
    "-q:v", animated ? "58" : "75",
    "-an",
  ];
  if (animated) {
    args.push("-t", String(MAX_VIDEO_SECONDS), "-loop", "0", "-vsync", "0");
  }
  args.push("-f", "webp", output);

  await new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("close", code => {
      if (code === 0) return resolve();
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

async function addMetadata(buffer, pack, author) {
  try {
    const mod = await import("node-webpmux");
    const WebPMux = mod.default || mod;
    const image = await WebPMux.Image.load(buffer);
    const payload = Buffer.from(JSON.stringify({
      "sticker-pack-name": String(pack || "MIAS").slice(0, 128),
      "sticker-pack-publisher": String(author || "MIAS Bot").slice(0, 128),
      emojis: ["🎭"],
    }), "utf8");
    // WhatsApp's sticker metadata is stored in the WebP EXIF chunk.
    const exifHeader = Buffer.from([
      0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x41, 0x57,
    ]);
    image.exif = Buffer.concat([exifHeader, payload]);
    return await image.getBuffer();
  } catch {
    return buffer;
  }
}

async function staticSticker(buffer, pack, author) {
  try {
    const mod = await import("wa-sticker-formatter");
    const Sticker = mod.Sticker || mod.default?.Sticker;
    const StickerTypes = mod.StickerTypes || mod.default?.StickerTypes;
    if (!Sticker || !StickerTypes) throw new Error("wa-sticker-formatter is unavailable");
    const sticker = new Sticker(buffer, {
      pack,
      author,
      type: StickerTypes.FULL,
      quality: 75,
    });
    return await sticker.toBuffer();
  } catch {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mias-sticker-"));
    try {
      const input = path.join(dir, "input.image");
      const output = path.join(dir, "output.webp");
      fs.writeFileSync(input, buffer);
      await runFfmpeg(input, output, { animated: false });
      return fs.readFileSync(output);
    } finally {
      cleanup(dir);
    }
  }
}

/**
 * Convert a downloaded WhatsApp/TikTok media buffer into a valid sticker.
 *
 * @param {Buffer} buffer
 * @param {{mediaType?: string, pack?: string, author?: string}} options
 */
export async function createStickerFromBuffer(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) {
    throw new Error("media is empty or too small");
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new Error("media is larger than the 40 MiB sticker input limit");
  }
  const mediaType = String(options.mediaType || "").toLowerCase();
  const pack = options.pack || "MIAS";
  const author = options.author || "MIAS Bot";
  const animated = mediaType.startsWith("video/");

  let sticker;
  if (!animated) {
    sticker = await staticSticker(buffer, pack, author);
  } else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mias-sticker-"));
    try {
      const input = path.join(dir, `input.${safeExt(mediaType)}`);
      const output = path.join(dir, "output.webp");
      fs.writeFileSync(input, buffer);
      await runFfmpeg(input, output, { animated: true });
      sticker = fs.readFileSync(output);
    } finally {
      cleanup(dir);
    }
    if (!isAnimatedWebp(sticker)) {
      throw new Error("ffmpeg produced a non-animated WebP");
    }
  }

  if (!isWebp(sticker)) throw new Error("sticker encoder did not produce WebP");
  const tagged = await addMetadata(sticker, pack, author);
  const maxBytes = animated ? MAX_ANIMATED_STICKER_BYTES : MAX_STATIC_STICKER_BYTES;
  if (tagged.length > maxBytes) {
    throw new Error(`sticker is larger than the ${Math.round(maxBytes / 1024)} KiB WhatsApp limit`);
  }
  return tagged;
}

export { isWebp, isAnimatedWebp };