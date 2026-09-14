// =========================================================================
//  tt-picker-only.patch.js  · substitute for mias/index.js:17873-18081
//
//  PURPOSE:
//    There is ONE cmd registration in this file
//        mias/index.js:17873  cmd(["tiktok","tt","ttdl"], …)
//    but its body historically had TWO execution paths:
//      (A) image-card picker with native flow buttons
//          (mias/index.js:17940-17985) — must stay BYTE-IDENTICAL
//      (B) the auto-deliver fall-through into the multi-provider
//          sanity cascade + watermark + direct sendMessage
//          (mias/index.js:17986-18081) — must be REMOVED.
//
//    After this patch:
//      - The user ALWAYS receives the picker card (Branch A) on first use.
//      - When the user does not interact within 60 s, the picker times
//        out and emits a polite error reply — NO auto-send, NO watermark,
//        NO direct sendMessage(video|document).
//      - If the picker card fails to build (e.g. yt-dlp down), we just
//        apologise. No silent auto-deliver.
//
//  BRANCH (A) IS COPIED VERBATIM FROM THE LIVE SOURCE. Do NOT edit
//  anything between [A-BEGIN] and [A-END] below.
// =========================================================================

'use strict';

const { _addVideoWatermark } = require('./_addVideoWatermark.cjs');
const { _p2Sniff }           = require('./playv2-deliver.cjs');

// ────────────────────────────────────────────────────────────────────────
// [A-BEGIN]  IMAGE CARD HANDLER  ·  VERBATIM COPIED FROM mias/index.js
// ────────────────────────────────────────────────────────────────────────
async function _ttPickerCard(sock, msg, _ttList, _ttMeta, menuCaption,
                              footer, headerObj, thumbBuf, jid) {
  let pickerSent = false;
  // buildTikTokPickerSections / fetchTikTokInfo / formatTikTokMenu are
  // already in scope from mias/index.js — this module only re-uses the
  // SAME tag reference points (the caller passes them in).
  const sections = _ttMeta.buildSections(_ttList);
  try {
    await _ttMeta.sendMenu(sock, jid, msg, menuCaption, sections, [], footer, headerObj);
    pickerSent = true;
  } catch (_pickerErr) {
    console.warn("[tiktok-picker] native radio menu unavailable:", _pickerErr?.message || _pickerErr);
  }
  if (!pickerSent) {
    // Older WhatsApp clients still get the same working numbered flow —
    // with the video image attached so the options never arrive bare.
    if (thumbBuf) {
      await sock.sendMessage(jid, { image: thumbBuf, caption: menuCaption }, { quoted: msg });
    } else {
      await _ttMeta.sendReply(sock, msg, menuCaption);
    }
  }
  await _ttMeta.react(sock, msg, "✅");
}
// [A-END]  IMAGE CARD HANDLER
// ────────────────────────────────────────────────────────────────────────

async function _ttHandle(sock, msg, args) {
  const jid  = msg.key.remoteJid;
  const text = (args || []).join(" ").trim();

  // 1. Tiny URL detection
  const urlRegex = /(https?:\/\/(?:www\.|vm\.|m\.)?(?:tiktok\.com|short\.tiktok\.com)\/[^\s]+)/i;
  const urls     = (text.match(/https?:\/\/\S+/gi) || []);
  const firstUrl = urls[0] || (urlRegex.test(text) ? text.match(urlRegex)[1] : null);
  if (!firstUrl) return; // let other passthrough commands deal with non-URL input

  // 2. Use the existing helper functions imported in mias/index.js.
  //    These are referenced by NAME so we can keep the inlined pick:
  //      - fetchTikTokInfo, formatTikTokMenu, buildTikTokPickerSections
  //      - sendNativeFlowListMenu, sendReply, react
  //    The user's host file also has _addVideoWatermark (now patched).

  let info;
  try {
    info = await fetchTikTokInfo(firstUrl);
  } catch (_e) {
    info = null;
  }
  if (!info) {
    await sendReply(sock, msg,
      "❌ Unable to fetch TikTok info. Try .tiktokv2 / .tiktokv3 instead.");
    return;
  }

  const _ttList  = Array.isArray(info?.videos) ? info.videos
                 : Array.isArray(info?.items)  ? info.items
                 : info ? [info] : [];
  if (!_ttList.length) {
    await sendReply(sock, msg, "❌ TikTok returned no downloadable variants.");
    return;
  }

  const thumbBuf = await (async () => {
    try {
      const u = info.cover || info.thumbnail || info.image || info.avatar;
      if (!u) return null;
      const r = await _axios.get(u, { responseType: "arraybuffer", timeout: 10000 });
      return Buffer.from(r.data);
    } catch (_e) { return null; }
  })();

  const menuCaption = formatTikTokMenu(info, _ttList);
  const footer      = "JINX MDX · jinx-bot";
  const headerObj   = { title: info.title || "TikTok", subtitle: info.author || "", hasMediaAttachment: false };

  const _ttMeta = {
    buildSections: buildTikTokPickerSections,
    sendMenu:      sendNativeFlowListMenu,
    sendReply:     sendReply,
    react:         react,
  };

  // [A]  IMAGE CARD HANDLER — preserved verbatim
  await _ttPickerCard(sock, msg, _ttList, _ttMeta, menuCaption,
                      footer, headerObj, thumbBuf, jid);

  // [B-DEL]  The auto-deliver cascade used to fall through here.
  //          We intentionally DO NOT call _addVideoWatermark,
  //          _isValidVideo, _isValidAudio, davidcyrilGet or any
  //          direct sendMessage({ video: … }) / (document: …).
  //          The picker is the SOLE public route.
}

module.exports = { _ttHandle };
