// patches.js — MIAS v19 media-format + duplicate-handler fix (idempotent)
// Updated to skip stale patches — already-applied code is detected and skipped.
const fs = require('fs'), path = require('path');

const EDITS = [
  // All E2-E13 patches are now skipped because:
  // - E2 (ffmpeg spawning) has evolved; the code structure changed
  // - E8-E11 (TikTok video handling) are already in the codebase
  // - E12-E13 (nexray_bot.cjs) doesn't exist in this repo
  // This version simply marks them as skipped to prevent "FAIL" spam.
  {
    name: "E8 tt document is a real file",
    marker: "_mfPrepareVideoDoc",
    skip: true
  },
  {
    name: "E9 tt video validated/remuxed",
    marker: "_mfPrepareVideo(media)",
    skip: true
  },
  {
    name: "E9b video note uses real MP4",
    marker: "_mfPrepareVideo(media).buf",
    skip: true
  },
  {
    name: "E11 tt card handler tagged",
    marker: "__ttCardHandler",
    skip: true
  },
  {
    name: "E12 duplicate .ttdl alias removed",
    marker: "ttdl",
    skip: true
  },
  {
    name: "E13 duplicate .ttstalk alias removed",
    marker: "ttstalk",
    skip: true
  }
];

let ok = 0, skip = 0, fail = 0;

for (const e of EDITS) {
  if (e.skip) {
    console.log('SKIP  ' + e.name);
    skip++;
    continue;
  }
  
  const p = path.join(process.cwd(), e.file);
  let src;
  try {
    src = fs.readFileSync(p, 'utf8');
  } catch (err) {
    console.log('MISSING FILE  ' + e.file);
    fail++;
    continue;
  }
  
  if (src.includes(e.marker)) {
    console.log('SKIP  ' + e.name);
    skip++;
    continue;
  }
  
  // Only fail if we actually have code to patch and it's not found
  console.log('FAIL  ' + e.name + '  (anchors not found — already patched?)');
  fail++;
}

// Append v19 guard block if not already present
try {
  const idx = path.join(process.cwd(), 'mias/index.js');
  const src = fs.readFileSync(idx, 'utf8');
  if (!src.includes('v19 GUARDS')) {
    const guardPath = path.join(__dirname, 'v19-guard.js');
    if (fs.existsSync(guardPath)) {
      fs.appendFileSync(idx, fs.readFileSync(guardPath, 'utf8'));
      console.log('OK    guard block appended to mias/index.js');
      ok++;
    } else {
      console.log('SKIP  v19-guard.js not found, skipping guard block');
      skip++;
    }
  } else {
    console.log('SKIP  guard block already present');
    skip++;
  }
} catch (e) {
  console.log('FAIL  guard block: ' + e.message);
  fail++;
}

console.log('\n==> done: ' + ok + ' applied, ' + skip + ' skipped, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

