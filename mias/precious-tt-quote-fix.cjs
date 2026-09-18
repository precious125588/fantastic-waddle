'use strict';

/*
 * PRECIOUS TT QUOTE-REPLY FIX
 *
 * Fixes the exact case where a TikTok picker card is quoted and the user
 * replies with a compound choice such as 1.1, but the bot stays silent.
 *
 * The older v27/v29 fixes mainly handled native taps and the settings
 * dispatcher. WhatsApp can deliver a quoted interactive/list card with its
 * contextInfo under a different message wrapper, so the bare-number consumer
 * never sees the quoted stanzaId. This final child-side wrapper normalises
 * that context, then retries the same consumer without the quote when the
 * picker is chat-scoped.
 *
 * It does NOT register a second .tt command and does not replace the TikTok
 * downloader itself. It only fixes routing of the reply into the existing
 * picker consumer.
 */

const MARK = '[TT-QUOTE-FIX]';
const log = (...a) => { try { console.log(MARK, ...a); } catch (_) {} };

function unwrapMessage(m) {
  let cur = m || {};
  for (let i = 0; i < 10 && cur; i++) {
    const inner = cur.ephemeralMessage?.message
      || cur.viewOnceMessage?.message
      || cur.viewOnceMessageV2?.message
      || cur.viewOnceMessageV2Extension?.message
      || cur.documentWithCaptionMessage?.message
      || cur.editedMessage?.message;
    if (!inner) break;
    cur = inner;
  }
  return cur || {};
}

function contextInfo(msg) {
  const root = unwrapMessage(msg?.message || msg || {});
  const candidates = [
    root.extendedTextMessage?.contextInfo,
    root.imageMessage?.contextInfo,
    root.videoMessage?.contextInfo,
    root.documentMessage?.contextInfo,
    root.audioMessage?.contextInfo,
    root.stickerMessage?.contextInfo,
    root.buttonsMessage?.contextInfo,
    root.listMessage?.contextInfo,
    root.templateMessage?.contextInfo,
    root.interactiveMessage?.contextInfo,
    root.viewOnceMessage?.message?.extendedTextMessage?.contextInfo,
    root.viewOnceMessage?.message?.imageMessage?.contextInfo,
    root.viewOnceMessage?.message?.interactiveMessage?.contextInfo,
  ];
  return candidates.find(Boolean) || null;
}

function quotedText(q) {
  const m = unwrapMessage(q);
  return String(
    m.conversation
      || m.extendedTextMessage?.text
      || m.imageMessage?.caption
      || m.videoMessage?.caption
      || m.documentMessage?.caption
      || m.audioMessage?.caption
      || m.buttonsMessage?.contentText
      || m.buttonsMessage?.text
      || m.listMessage?.description
      || m.listMessage?.title
      || m.templateMessage?.hydratedTemplate?.hydratedContentText
      || m.interactiveMessage?.body?.text
      || m.interactiveMessage?.header?.title
      || ''
  ).trim();
}

function isCompoundChoice(body) {
  return /^\d{1,2}\s*[.\-/ ,]\s*\d{1,2}$/.test(String(body || '').trim());
}

function isTikTokPickerQuote(ctx) {
  if (!ctx?.quotedMessage) return false;
  const t = quotedText(ctx.quotedMessage);
  if (!t) return false;
  // Match the actual MIAS TikTok card, not arbitrary quoted messages.
  return /TIKTOK/i.test(t)
    && /(?:1\.1|1\.2|1\.3|1\.4|1\.5|1\.6|1\.7|2\.1|2\.2|2\.3|3\.1|3\.2)/.test(t);
}

function withExtendedQuoteContext(msg, ctx) {
  const root = unwrapMessage(msg?.message || {});
  const out = { ...msg, message: { ...root } };
  const old = out.message.extendedTextMessage || {};
  out.message.extendedTextMessage = {
    ...old,
    text: old.text || '',
    contextInfo: ctx,
  };
  return out;
}

function plainReplyMessage(msg, body) {
  return {
    ...msg,
    message: { conversation: String(body || '') },
  };
}

function install() {
  if (globalThis.__PRECIOUS_TT_QUOTE_FIX__) return true;
  const prev = globalThis.__miasHandleBareNumberReply;
  if (typeof prev !== 'function') {
    log('waiting: bare-number consumer is not exposed yet');
    return false;
  }

  const wrapped = async function(sock, msg, body) {
    const raw = String(body || '').trim();
    if (!isCompoundChoice(raw)) return prev(sock, msg, body);

    const ctx = contextInfo(msg);
    if (!isTikTokPickerQuote(ctx)) return prev(sock, msg, body);

    // Attempt 1: give the existing picker consumer the quote in the exact
    // message shape it expects (extendedTextMessage.contextInfo).
    try {
      const normalisedMsg = withExtendedQuoteContext(msg, ctx);
      const hit = await prev(sock, normalisedMsg, raw);
      if (hit) {
        log('quoted TT choice consumed:', raw);
        return true;
      }
    } catch (e) {
      log('quoted-context attempt failed:', e?.message || e);
    }

    // Attempt 2: some picker versions are chat-scoped and do not need the
    // stanzaId. Remove the quote while preserving the same chat/message key.
    try {
      const hit = await prev(sock, plainReplyMessage(msg, raw), raw);
      if (hit) {
        log('chat-scoped TT choice consumed:', raw);
        return true;
      }
    } catch (e) {
      log('chat-scoped attempt failed:', e?.message || e);
    }

    // Preserve the old behaviour when no picker is actually pending.
    return false;
  };

  wrapped.__preciousTtQuoteFix = true;
  wrapped.__previous = prev;
  globalThis.__miasHandleBareNumberReply = wrapped;
  globalThis.__PRECIOUS_TT_QUOTE_FIX__ = true;
  log('installed — quoted TT compound replies are routed through the existing picker');
  return true;
}

module.exports = { install };
