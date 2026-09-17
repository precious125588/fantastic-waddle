// patches.js — MIAS v19 media-format + duplicate-handler fix (idempotent)
// Run from the repo root:   node patches.js      then restart the bot.
const fs = require('fs'), path = require('path');
const EDITS = [
 {
  "file": "mias/index.js",
  "name": "E8 tt document is a real file",
  "start": "} else if (ttMode.document) {",
  "end": "} else {",
  "new": "} else if (ttMode.document) {\n        const _tvd = await _mfPrepareVideoDoc(media);\n        await sock.sendMessage(jid, {\n          document: _tvd.buf, mimetype: _tvd.mime, fileName: \"tiktok_video\" + _tvd.ext,\n          caption: ttCaption,\n        }, { quoted: msg });\n      } else {",
  "marker": "const _tvd = await _mfPrepareVideoDoc(media);",
  "after": "const ttCaption = `"
 },
 {
  "file": "mias/index.js",
  "name": "E9 tt video validated/remuxed",
  "start": "if (ttMode.kind === \"video\" && !ttMode.videoNote) {",
  "end": "__ttForgetSelection(jid);",
  "new": "if (ttMode.kind === \"video\" && !ttMode.videoNote) {\n          const _tvv = await _mfPrepareVideo(media);\n          if (_tvv.ok) {\n            try {\n              await sock.sendMessage(jid, { video: _tvv.buf, mimetype: \"video/mp4\", caption: ttCaption }, { quoted: msg });\n            } catch (videoError) {\n              console.log(\"[tiktok] video send failed, using document fallback:\", videoError?.message || videoError);\n              await sock.sendMessage(jid, {\n                document: _tvv.buf, mimetype: \"video/mp4\", fileName: \"tiktok_video.mp4\",\n                caption: `${ttCaption}\\n📎 Sent as a file because video playback was unavailable.`,\n              }, { quoted: msg });\n            }\n          } else {\n            await sock.sendMessage(jid, {\n              document: _tvv.buf, mimetype: _tvv.mime, fileName: \"tiktok_video\" + _tvv.ext,\n              caption: `${ttCaption}\\n📎 ${_tvv.note}`,\n            }, { quoted: msg });\n          }\n        }\n      }\n      __ttForgetSelection(jid);",
  "marker": "const _tvv = await _mfPrepareVideo(media);",
  "after": "const ttCaption = `"
 },
 {
  "file": "mias/index.js",
  "name": "E9b video note uses real MP4",
  "start": "video: media, ptv: true, mimetype: \"video/mp4\", caption: ttCaption, gifPlayback: false,",
  "end": "video: media, ptv: true, mimetype: \"video/mp4\", caption: ttCaption, gifPlayback: false,",
  "new": "video: (await _mfPrepareVideo(media)).buf, ptv: true, mimetype: \"video/mp4\", caption: ttCaption, gifPlayback: false,",
  "marker": "(await _mfPrepareVideo(media)).buf, ptv: true",
  "after": null
 }
];

let ok = 0, skip = 0, fail = 0;
for (const e of EDITS) {
  const p = path.join(process.cwd(), e.file);
  let src;
  try { src = fs.readFileSync(p, 'utf8'); } catch (err) { console.log('MISSING FILE  ' + e.file); fail++; continue; }
  if (src.includes(e.marker)) { console.log('SKIP  ' + e.name); skip++; continue; }
  const base = e.after ? src.indexOf(e.after) + e.after.length : 0;
  const i = src.indexOf(e.start, base);
  const j = i < 0 ? -1 : src.indexOf(e.end, i);
  if (i < 0 || j < 0) { console.log('FAIL  ' + e.name + '  (anchors not found — file already patched?)'); fail++; continue; }
  fs.writeFileSync(p, src.slice(0, i) + e.new + src.slice(j + e.end.length));
  console.log('OK    ' + e.name); ok++;
}
try {
  const idx = path.join(process.cwd(), 'mias/index.js');
  const src = fs.readFileSync(idx, 'utf8');
  if (!src.includes('v19 GUARDS')) {
    fs.appendFileSync(idx, fs.readFileSync(path.join(__dirname, 'v19-guard.js'), 'utf8'));
    console.log('OK    guard block appended to mias/index.js');
  } else { console.log('SKIP  guard block already present'); }
} catch (e) { console.log('FAIL  guard block: ' + e.message); fail++; }
console.log('\n==> done: ' + ok + ' applied, ' + skip + ' skipped, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

