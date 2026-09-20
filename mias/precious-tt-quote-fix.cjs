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
  let current = msg?.message || msg || {};
  for (let i = 0; i < 10 && current; i += 1) {
    const found = [
      current.extendedTextMessage?.contextInfo,
      current.imageMessage?.contextInfo,
      current.videoMessage?.contextInfo,
      current.documentMessage?.contextInfo,
      current.audioMessage?.contextInfo,
      current.stickerMessage?.contextInfo,
      current.buttonsMessage?.contextInfo,
      current.listMessage?.contextInfo,
      current.templateMessage?.contextInfo,
      current.interactiveMessage?.contextInfo,
      current.interactiveResponseMessage?.contextInfo,
    ].find(Boolean);
    if (found) return found;
    const next = current.ephemeralMessage?.message
      || current.viewOnceMessage?.message
      || current.viewOnceMessageV2?.message
      || current.viewOnceMessageV2Extension?.message
      || current.documentWithCaptionMessage?.message
      || current.editedMessage?.message;
    if (!next || next === current) break;
    current = next;
  }
  return null;
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
  return /^[.!]?\s*\d{1,2}\s*[.\-/ ,]\s*\d{1,2}$/.test(String(body || '').trim());
}

function isTikTokPickerQuote(ctx) {
  if (!ctx?.quotedMessage) return false;
  const t = quotedText(ctx.quotedMessage);
  if (!t) return false;
  // Native-flow cards put their title in interactiveMessage.body/header,
  // while image/text fallbacks put it in a caption. Accept both shapes.
  // The compound-choice requirement prevents this wrapper from touching
  // ordinary quoted messages.
  return /TIKTOK|TIKTOK\s*DOWNLOADER|reply\s+(?:to this message\s+)?with (?:the )?number|(?:1\.[1-7]|2\.[1-3]|3\.[1-2])/i.test(t);
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
