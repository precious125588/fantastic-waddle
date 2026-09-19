'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   PATCH-v29.cjs — idempotent file patcher for mias/index.js
   Run once per boot (wired into start.sh). Marker-guarded: safe to re-run.

   Applies 5 surgical edits:
     A) settings dispatcher: an "N.N" that is NOT a settings option is handed
        to the media-picker dispatcher FIRST (fixes silent 1.1 on TT cards)
     B) sendNativeFlowButtons: direct → viewOnce strategy chain (Android 11)
     C) sendNativeFlowListMenu:  direct → viewOnce strategy chain (Android 11)
     D) auto-chatbot gate honors owner-level chatBotMode, not just per-chat
     E) auto-chatbot logs provider failures instead of dying silently
     F) boot hook: expose getSettings + commands map globally and retry the
        v29/v28 installers deferred (fixes movie/nkiri/savetube "not applied")
   ══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const TARGET = path.join(ROOT, 'mias', 'index.js');
const MARKER = '__V29_PATCHED__';

const ok = (m) => console.log('[PATCH-v29] ✅ ' + m);
const skip = (m) => console.log('[PATCH-v29] ⏭  ' + m);
const bad = (m) => console.log('[PATCH-v29] ❌ ' + m);

if (!fs.existsSync(TARGET)) { bad('mias/index.js not found at ' + TARGET); process.exit(1); }

let src = fs.readFileSync(TARGET, 'utf8');
if (src.includes(MARKER)) { skip('already patched — nothing to do'); process.exit(0); }

let applied = 0;
const failures = [];

function replaceOnce(name, anchor, replacement) {
  if (!src.includes(anchor)) {
    // The replacement drop moves the Android button strategy into the shared
    // _nativeFlowUserJid/send path. Do not report the old B/C patch anchors as
    // failed when that corrected implementation is already present.
    const nativeFlowAlreadyFixed =
      (name.startsWith('B)') || name.startsWith('C)')) &&
      src.includes('function _nativeFlowUserJid') &&
      src.includes('viewOnceMessage: { message: content }');
    if (nativeFlowAlreadyFixed) {
      skip(name + ' — native-flow replacement already present');
      return;
    }
    failures.push(name + ' (anchor not found)');
    return;
  }
  src = src.replace(anchor, replacement);
  applied++;
  ok(name);
}

/* ── A) settings unknown-choice → picker first, never "Unknown settings option" ── */
replaceOnce(
  'A) settings dispatcher hands unknown N.N to the picker',
  '    const fn = SETTINGS_MAP[choice];\n    if (!fn) { await sendReply(sock, msg, `❌ Unknown settings option *${choice}*.`); return true; }',
  '    const fn = SETTINGS_MAP[choice];\n' +
  '    if (!fn) {\n' +
  '      /* __V29_SETTINGS_TO_PICKER__ an N.N that is not a settings option may be a\n' +
  '         media-picker row (TT 1.1, movie, savetube, nkiri). Give the picker\n' +
  '         dispatcher first refusal, then stay silent — never eat it. */\n' +
  '      try {\n' +
  '        const _h = globalThis.__miasHandleBareNumberReply;\n' +
  '        if (typeof _h === "function" && await _h(sock, msg, choice)) return true;\n' +
  '      } catch {}\n' +
  '      return false;\n' +
  '    }'
);

/* ── B) sendNativeFlowButtons strategy chain ── */
replaceOnce(
  'B) sendNativeFlowButtons viewOnce→direct chain',
  '    wam = await generateWAMessageFromContent(jid, { viewOnceMessage: { message: content } }, { quoted, userJid: sock.user?.id });\n    await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });',
  '    /* __V29_BTN_STRATEGY__ regular WhatsApp needs the viewOnce envelope for\n' +
  '       taps to register. Try it first; keep direct as a real fallback. */\n' +
  '    const _bseq = String(process.env.BUTTON_MODE || "auto").toLowerCase() === "direct" ? ["direct"]\n' +
  '      : String(process.env.BUTTON_MODE || "").toLowerCase() === "viewonce" ? ["viewonce"] : ["viewonce", "direct"];\n' +
  '    let _bSent = false, _bErr = null;\n' +
  '    for (const _bm of _bseq) {\n' +
  '      try {\n' +
  '        const _bpl = _bm === "viewonce" ? { viewOnceMessage: { message: content } } : content;\n' +
  '        wam = await generateWAMessageFromContent(jid, _bpl, { quoted, userJid: sock.user?.id });\n' +
  '        await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });\n' +
  '        _bSent = true; break;\n' +
  '      } catch (_be) { _bErr = _be; }\n' +
  '    }\n' +
  '    if (!_bSent) throw (_bErr || new Error("native flow send failed"));'
);

/* ── C) sendNativeFlowListMenu strategy chain ── */
replaceOnce(
  'C) sendNativeFlowListMenu viewOnce→direct chain',
  '    const wam = await generateWAMessageFromContent(jid, { viewOnceMessage: { message: content } }, { quoted, userJid: sock.user?.id });\n    await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });\n    return wam;',
  '    /* __V29_LIST_STRATEGY__ */\n' +
  '    let wam = null;\n' +
  '    const _lseq = String(process.env.BUTTON_MODE || "auto").toLowerCase() === "direct" ? ["direct"]\n' +
  '      : String(process.env.BUTTON_MODE || "").toLowerCase() === "viewonce" ? ["viewonce"] : ["viewonce", "direct"];\n' +
  '    let _lErr = null;\n' +
  '    for (const _lm of _lseq) {\n' +
  '      try {\n' +
  '        const _lpl = _lm === "viewonce" ? { viewOnceMessage: { message: content } } : content;\n' +
  '        wam = await generateWAMessageFromContent(jid, _lpl, { quoted, userJid: sock.user?.id });\n' +
  '        await sock.relayMessage(jid, wam.message, { messageId: wam.key.id });\n' +
  '        break;\n' +
  '      } catch (_le) { _lErr = _le; wam = null; }\n' +
  '    }\n' +
  '    if (!wam) throw (_lErr || new Error("native list send failed"));\n' +
  '    return wam;'
);

/* ── D) chatbot gate honors owner-level toggles too ── */
replaceOnce(
  'D) auto-chatbot gate honors owner chatBotMode',
  '              const _cbOn = !!_cbChatS?.autoReply;',
  '              const _cbOn = !!(_cbChatS?.autoReply || _cbChatS?.chatBotMode || _cbOwnerS?.chatBotMode || _cbOwnerS?.autoReply); /* __V29_CB_GATE__ */'
);

/* ── E) auto-chatbot logs provider failures ── */
replaceOnce(
  'E) auto-chatbot failure logging',
  '                    if (_cbReply) await sendReply(sock, msg, String(_cbReply).slice(0, 2000));',
  '                    if (_cbReply) await sendReply(sock, msg, String(_cbReply).slice(0, 2000));\n' +
  '                    else console.error("[autochat] enabled but all AI providers failed for: " + String(body).slice(0, 80)); /* __V29_CB_LOG__ */'
);

/* ── F) boot hook: expose globals + deferred v29/v28 retry ── */
(function bootHook() {
  if (src.includes('__V29_BOOT_HOOK__')) { skip('F) boot hook already present'); return; }
  // Discover the live commands-map identifier in this file's top scope.
  let cmdIdent = 'commands';
  const m = src.match(/(?:const|let|var)\s+(\w*[Cc]ommand\w*)\s*=\s*new Map/);
  if (m && m[1]) cmdIdent = m[1];
  const hook =
    '\n/* __V29_BOOT_HOOK__ — expose globals + retry v29/v28 deferred so the\n' +
    '   movie/nkiri/savetube quote fixes install even when the commands map was\n' +
    '   not visible at require-time. */\n' +
    'try {\n' +
    '  if (typeof getSettings === "function") globalThis.getSettings = getSettings;\n' +
    '  if (typeof ' + cmdIdent + ' !== "undefined" && ' + cmdIdent + ' && typeof ' + cmdIdent + '.get === "function") globalThis.__MIAS_COMMANDS = ' + cmdIdent + ';\n' +
    '  const _v29boot = () => { try { require("../precious-fixes-v29.cjs").install(globalThis.__PRECIOUS__ || {}); } catch (_e) { console.log("[v29] install error:", _e && _e.message); } };\n' +
    '  for (const _ms of [15000, 45000, 90000]) { const _t = setTimeout(_v29boot, _ms); if (_t && _t.unref) _t.unref(); }\n' +
    '} catch (_e29h) {}\n';
  src = src.replace(/\s*$/, '\n' + hook);
  applied++;
  ok('F) boot hook appended (commands ident: ' + cmdIdent + ')');
})();

/* ── write back ── */
if (applied > 0) {
  src = '/* ' + MARKER + ' ' + new Date().toISOString() + ' */\n' + src;
  const bak = TARGET + '.v29.bak';
  try { if (!fs.existsSync(bak)) fs.writeFileSync(bak, fs.readFileSync(TARGET)); } catch {}
  fs.writeFileSync(TARGET, src);
  ok('mias/index.js patched (' + applied + ' edits). Backup: ' + bak);
} else {
  skip('no edits applied');
}
if (failures.length) { for (const f of failures) bad('missed: ' + f); }
console.log('[PATCH-v29] done — applied ' + applied + ', missed ' + failures.length);
