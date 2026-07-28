/**
 * NEW PAGE — Engine Access Layer  v1
 *
 * ════════════════════════════════════════════════════════════════
 *  Provides lazy, cached access to all engines from mias/lib/engines.
 *  Falls back gracefully when an engine is unavailable.
 *  ESM-compatible via createRequire.
 * ════════════════════════════════════════════════════════════════
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const _require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINES_DIR = path.resolve(__dirname, '../../mias/lib/engines');

// ── Lazy loader ───────────────────────────────────────────────────────────────

const _cache = new Map();

function loadEngine(name) {
  if (_cache.has(name)) return _cache.get(name);
  try {
    const mod = _require(path.join(ENGINES_DIR, `${name}.cjs`));
    _cache.set(name, mod);
    return mod;
  } catch {
    _cache.set(name, null);
    return null;
  }
}

// ── Engine exports ────────────────────────────────────────────────────────────

/** HTTP client engine — wraps axios with retry + UA headers */
export function getHttpEngine() { return loadEngine('httpClient'); }

/** Image processing engine — wraps Jimp */
export function getImageEngine() { return loadEngine('imageProcessing'); }

/** Sticker engine — wa-sticker-formatter helpers */
export function getStickerEngine() { return loadEngine('stickerEngine'); }

/** SVG engine — @resvg/resvg-js helpers */
export function getSvgEngine() { return loadEngine('svgEngine'); }

/** Canvas engine — @napi-rs/canvas helpers */
export function getCanvasEngine() { return loadEngine('canvasEngine'); }

/** File detection engine — file-type detection */
export function getFileEngine() { return loadEngine('fileDetection'); }

/** Media engine — ffmpeg helpers */
export function getMediaEngine() { return loadEngine('mediaEngine'); }

/** Speed test engine */
export function getSpeedEngine() { return loadEngine('speedTest'); }

/** Link preview engine */
export function getLinkPreviewEngine() { return loadEngine('linkPreview'); }

/** Cache engine — node-cache backed */
export function getCacheEngine() { return loadEngine('cacheEngine'); }

/** Queue engine — serial/parallel task queue */
export function getQueueEngine() { return loadEngine('queueEngine'); }

/** Logger engine — pino-based structured logger */
export function getLoggerEngine() { return loadEngine('loggerEngine'); }

/** Utility engine — misc helpers */
export function getUtilityEngine() { return loadEngine('utilityEngine'); }

/** Card engine — WhatsApp card builders */
export function getCardEngine() { return loadEngine('cardEngine'); }

// ── Convenience: all engines object ──────────────────────────────────────────

export function getAllEngines() {
  return {
    http:        getHttpEngine(),
    image:       getImageEngine(),
    sticker:     getStickerEngine(),
    svg:         getSvgEngine(),
    canvas:      getCanvasEngine(),
    file:        getFileEngine(),
    media:       getMediaEngine(),
    speed:       getSpeedEngine(),
    linkPreview: getLinkPreviewEngine(),
    cache:       getCacheEngine(),
    queue:       getQueueEngine(),
    logger:      getLoggerEngine(),
    utility:     getUtilityEngine(),
    card:        getCardEngine(),
  };
}

// ── Convenience: detect file type from buffer ─────────────────────────────────

export async function detectFileType(buf) {
  const eng = getFileEngine();
  if (eng?.detect) {
    try { return await eng.detect(buf); } catch {}
  }
  // Fallback via file-type
  try {
    const ft = await import('file-type');
    const fn = ft.fileTypeFromBuffer || ft.fromBuffer;
    return fn ? await fn(buf) : null;
  } catch { return null; }
}

// ── Convenience: image → Jimp ─────────────────────────────────────────────────

export async function readImageJimp(buf) {
  try {
    const Jimp = (await import('jimp')).default;
    return Jimp.read(buf);
  } catch { return null; }
}

// ── Convenience: canvas text image ───────────────────────────────────────────

export async function canvasTextImage(text, opts = {}) {
  const eng = getCanvasEngine();
  if (eng?.textImage) {
    try { return await eng.textImage(text, opts); } catch {}
  }
  // Fallback: use @napi-rs/canvas directly
  try {
    const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas');
    const width  = opts.width  || 600;
    const height = opts.height || 200;
    const canvas = createCanvas(width, height);
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle = opts.bg || '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = opts.color || '#e2e2e2';
    ctx.font = opts.font || 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Wrap text
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > width - 40) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    const lineH = parseInt(opts.font || '36') * 1.4;
    const startY = height / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((l, i) => ctx.fillText(l, width / 2, startY + i * lineH));
    return canvas.toBuffer('image/png');
  } catch { return null; }
}
