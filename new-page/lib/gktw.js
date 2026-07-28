/**
 * NEW PAGE — GKTW Helper  v1
 *
 * ════════════════════════════════════════════════════════════════
 *  Architecture:
 *
 *   Commands → new-page handlers → gktw.js → GKTW / Baileys
 *
 *  Wraps @itsreimau/gktw with graceful fallback to raw Baileys.
 *  Commands import helpers from here; never import gktw directly.
 * ════════════════════════════════════════════════════════════════
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ── Lazy singletons ───────────────────────────────────────────────────────────
let _gktw = null;
let _gktwAvailable = null;
let _gktwErr = null;
let _baileys = null;

// ── Loaders ───────────────────────────────────────────────────────────────────

async function loadBaileys() {
  if (_baileys) return _baileys;
  for (const pkg of ['@whiskeysockets/baileys', '@itsliaaa/baileys']) {
    try {
      _baileys = await import(pkg);
      return _baileys;
    } catch {}
  }
  throw new Error('No Baileys package found');
}

async function loadGktw() {
  if (_gktwAvailable !== null) return _gktw;
  try {
    _gktw = await import('@itsreimau/gktw');
    const mod = _gktw?.default || _gktw;
    const hasFns = ['sendInteractive', 'sendHeroCard', 'sendCarousel', 'sendList', 'createInteractiveMessage']
      .some(fn => typeof mod?.[fn] === 'function' || typeof _gktw?.[fn] === 'function');
    if (hasFns) {
      _gktwAvailable = true;
    } else {
      _gktwAvailable = false;
      _gktw = null;
      _gktwErr = new Error('GKTW loaded but no expected functions found');
    }
  } catch (err) {
    _gktwAvailable = false;
    _gktw = null;
    _gktwErr = err;
  }
  return _gktw;
}

// ── Public: availability ──────────────────────────────────────────────────────

export async function isGktwAvailable() {
  await loadGktw();
  return _gktwAvailable === true;
}

export function gktwDiagnostics() {
  return {
    available: _gktwAvailable,
    error: _gktwErr?.message || null,
    baileysLoaded: !!_baileys,
  };
}

// ── Helper: download content from a message ───────────────────────────────────

export async function downloadFromMessage(message, type) {
  const B = await loadBaileys();
  const fn = B.downloadContentFromMessage || B.default?.downloadContentFromMessage;
  if (!fn) throw new Error('downloadContentFromMessage not found');
  const stream = await fn(message, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Helper: generate view-once message ───────────────────────────────────────

export async function makeViewOnce(mediaType, buf, mimetype, caption = '') {
  const base = {
    viewOnce: true,
    ...(mediaType === 'image'
      ? { image: buf, mimetype: mimetype || 'image/jpeg', caption }
      : mediaType === 'video'
      ? { video: buf, mimetype: mimetype || 'video/mp4', caption }
      : { audio: buf, mimetype: mimetype || 'audio/ogg', ptt: true }),
  };
  return base;
}

// ── Helper: re-forward a view-once message as normal ─────────────────────────

export async function forwardViewOnce(sock, jid, msg, quotedMsg, quotedType) {
  // Try gktw first
  const G = await loadGktw();
  if (G) {
    const mod = G.default || G;
    if (typeof mod?.forwardViewOnce === 'function') {
      try {
        return await mod.forwardViewOnce(sock, jid, msg);
      } catch {}
    }
  }
  // Baileys fallback: download + re-send
  try {
    const viewOnceMsg =
      quotedMsg?.viewOnceMessage?.message ||
      quotedMsg?.viewOnceMessageV2?.message ||
      quotedMsg?.viewOnceMessageV2Extension?.message ||
      quotedMsg;
    if (!viewOnceMsg) return false;
    const inner =
      viewOnceMsg.imageMessage ||
      viewOnceMsg.videoMessage ||
      viewOnceMsg.audioMessage;
    if (!inner) return false;
    const mtype = viewOnceMsg.imageMessage
      ? 'image'
      : viewOnceMsg.videoMessage
      ? 'video'
      : 'audio';
    const buf = await downloadFromMessage(inner, mtype);
    if (!buf) return false;
    await sock.sendMessage(
      jid,
      mtype === 'image'
        ? { image: buf, caption: inner.caption || '🔓 View Once (unlocked)', mimetype: inner.mimetype || 'image/jpeg' }
        : mtype === 'video'
        ? { video: buf, caption: inner.caption || '🔓 View Once (unlocked)', mimetype: inner.mimetype || 'video/mp4' }
        : { audio: buf, mimetype: inner.mimetype || 'audio/ogg', ptt: true }
    );
    return true;
  } catch {
    return false;
  }
}

// ── Helper: send interactive buttons (GKTW or text fallback) ─────────────────

export async function sendButtons(sock, jid, { header = '', body, footer = '', buttons = [] }, quoted = null) {
  const G = await loadGktw();
  if (G && _gktwAvailable) {
    const mod = G.default || G;
    const fn = mod?.sendInteractive || mod?.sendHeroCard;
    if (typeof fn === 'function') {
      try {
        const opts = quoted ? { quoted } : {};
        return await fn(sock, jid, { header, body, footer, buttons }, opts);
      } catch {}
    }
  }
  // Fallback: plain text
  const btnLines = buttons.map((b, i) => `  ${i + 1}. ${b.body || b.buttonText?.displayText || b.title || ''}`).join('\n');
  const text = `${header ? `*${header}*\n` : ''}${body}${footer ? `\n_${footer}_` : ''}${btnLines ? `\n\n${btnLines}` : ''}`;
  const sendOpts = quoted ? { quoted } : {};
  return sock.sendMessage(jid, { text }, sendOpts);
}

// ── Helper: send list message (GKTW or text fallback) ────────────────────────

export async function sendList(sock, jid, { title, description, buttonText, sections }, quoted = null) {
  const G = await loadGktw();
  if (G && _gktwAvailable) {
    const mod = G.default || G;
    if (typeof mod?.sendList === 'function') {
      try {
        const opts = quoted ? { quoted } : {};
        return await mod.sendList(sock, jid, { title, description, buttonText, sections }, opts);
      } catch {}
    }
  }
  // Fallback: plain text
  let text = `*${title}*\n${description || ''}\n`;
  for (const sec of sections) {
    text += `\n*${sec.title}*\n`;
    for (const row of sec.rows || []) {
      text += `  • ${row.title}${row.description ? ` — ${row.description}` : ''}\n`;
    }
  }
  const sendOpts = quoted ? { quoted } : {};
  return sock.sendMessage(jid, { text }, sendOpts);
}

// ── Helper: read quoted message media ─────────────────────────────────────────

export async function readQuotedMedia(msg) {
  const quotedMsg =
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
    msg.message?.imageMessage?.contextInfo?.quotedMessage ||
    msg.message?.videoMessage?.contextInfo?.quotedMessage;
  if (!quotedMsg) return null;

  const inner =
    quotedMsg.viewOnceMessage?.message?.imageMessage ||
    quotedMsg.viewOnceMessage?.message?.videoMessage ||
    quotedMsg.imageMessage ||
    quotedMsg.videoMessage ||
    quotedMsg.stickerMessage ||
    quotedMsg.audioMessage;
  if (!inner) return null;

  const mtype = quotedMsg.imageMessage || quotedMsg.viewOnceMessage?.message?.imageMessage
    ? 'image'
    : quotedMsg.videoMessage || quotedMsg.viewOnceMessage?.message?.videoMessage
    ? 'video'
    : quotedMsg.stickerMessage
    ? 'sticker'
    : 'audio';

  const buf = await downloadFromMessage(inner, mtype).catch(() => null);
  return buf ? { buf, mtype, inner } : null;
}

// ── Helper: re-export Baileys utilities ──────────────────────────────────────

export async function getBaileysUtil(name) {
  const B = await loadBaileys();
  return B[name] || B.default?.[name] || null;
}
