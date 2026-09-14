// =========================================================================
//  _addVideoWatermark.cjs  · mias/lib/_addVideoWatermark.cjs
//
//  ROOT-CAUSE FIX for mias/index.js:17834-17868:
//   The previous inline implementation wrote to /tmp/wm_in.mp4 and
//   /tmp/wm_out.mp4 then handed the buffer back, BUT it never asked
//   ffmpeg to move the moov atom to the front of the file. WhatsApp
//   streams MP4 progressively: if moov is at the END (the default when
//   ffmpeg muxes from rtmp / pipe), the streaming demuxer aborts as
//   soon as it hits mdat without a moov header — that's the
//   "this video is not available because something is wrong with the
//   video file" toast.
//
//  THIS MODULE:
//   - Adds "-movflags +faststart" so moov lands at file head.
//   - Caps source at 80 MB so we don't grind the CPU on 4 GB videos.
//   - Cleans up temp files on success AND on failure (no leaks).
//   - Falls back to the original buffer if ffmpeg is missing or errors.
// =========================================================================

'use strict';
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { spawn } = require('child_process');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

function _which(bin) {
  const cp = require('child_process');
  try {
    const r = cp.spawnSync(bin, ['-version'], { stdio: 'ignore' });
    return r.status === 0;
  } catch (_e) { return false; }
}

const HAS_FFMPEG = _which(FFMPEG);

async function _addVideoWatermark(inputBufOrPath, { label = '×TT', sizeMB = 80 } = {}) {
  // Hard rules: don't water-mark tiny or huge files.
  let bytes;
  if (Buffer.isBuffer(inputBufOrPath)) bytes = inputBufOrPath.length;
  else if (typeof inputBufOrPath === 'string' && fs.existsSync(inputBufOrPath))
    bytes = fs.statSync(inputBufOrPath).size;
  else return inputBufOrPath;
  if (bytes < 10 * 1024)           return inputBufOrPath;
  if (bytes > sizeMB * 1024 * 1024) return inputBufOrPath;

  if (!HAS_FFMPEG) return inputBufOrPath;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-'));
  const inP  = path.join(dir, 'in.mp4');
  const outP = path.join(dir, 'out.mp4');
  const fs_log = path.join(dir, 'ffmpeg.log');

  try {
    if (Buffer.isBuffer(inputBufOrPath)) fs.writeFileSync(inP, inputBufOrPath);
    else fs.copyFileSync(inputBufOrPath, inP);

    await new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-i', inP,
        '-vf', `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:`
             + `text='${label.replace(/'/g, "\\'")}':`
             + `fontcolor=white@0.9:fontsize=24:x=w-tw-16:y=16:`
             + `box=1:boxcolor=black@0.4:boxborderw=8`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
        '-c:a', 'copy',
        // ← THE FIX: move moov to file head, so WhatsApp's progressive
        //   demuxer can decode the file as bytes arrive.
        '-movflags', '+faststart',
        outP,
      ];
      const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', fs.openSync(fs_log, 'w')] });
      p.on('error', reject);
      p.on('close', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg-' + code)));
    });

    const out = fs.readFileSync(outP);
    return out;
  } catch (_e) {
    return inputBufOrPath;     // graceful fallback to the un-watermarked file
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) {}
  }
}

module.exports = { _addVideoWatermark, HAS_FFMPEG };
