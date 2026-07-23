/**
 * MIAS — GKTW Adapter Layer  v4
 *
 * ════════════════════════════════════════════════════════════════
 *  Architecture:
 *
 *  Commands → Handlers → Baileys Adapter → GKTW Helper → WhatsApp
 *
 *  Single integration point for @itsreimau/gktw.
 *  - Auto-detects @itsreimau/gktw if installed.
 *  - Falls back to raw @whiskeysockets/baileys for every feature.
 *  - Handlers never care which layer is active.
 *
 *  @itsreimau/gktw is optional — adapter falls back gracefully.
 *  When it becomes available: cd mias && npm install @itsreimau/gktw
 *  Zero code changes needed — adapter auto-routes everything.
 * ════════════════════════════════════════════════════════════════
 *
 * ONLY Handlers/Adapters may import this file.
 * Commands must NEVER import this directly.
 *
 * v4 Changes:
 *  - Broader GKTW function detection (sendHeroCard, sendCarousel, sendList)
 *  - gktwVersion() — expose installed GKTW version string
 *  - generateContextInfo() — build contextInfo helper
 *  - generateExternalAdReply() — build externalAdReply helper
 *  - Improved sendInteractiveMessage fallback chain
 *  - Safer lazy-load with detailed error capture
 */

// ─── Lazy singletons ──────────────────────────────────────────────────────────
let _baileys      = null;
let _gktw         = null;
let _gktwAvailable = null; // null = unchecked, true/false = final result
let _gktwLoadErr  = null;  // stores the load error for diagnostics

// ─── Internal loader helpers ──────────────────────────────────────────────────

export async function getBaileys() {
  if (!_baileys) {
    _baileys = await import("@whiskeysockets/baileys");
  }
  return _baileys;
}

async function getGktw() {
  if (_gktwAvailable === null) {
    try {
      _gktw = await import("@itsreimau/gktw");
      // Verify at least one known GKTW function exists
      const mod = _gktw?.default || _gktw;
      const hasAny = [
        "sendInteractive", "sendHeroCard", "sendCarousel",
        "sendList", "createInteractiveMessage",
      ].some(fn => typeof mod?.[fn] === "function" || typeof _gktw?.[fn] === "function");

      if (hasAny) {
        _gktwAvailable = true;
      } else {
        _gktw = null;
        _gktwAvailable = false;
        _gktwLoadErr = new Error("GKTW package loaded but no expected functions found");
      }
    } catch (err) {
      _gktwAvailable = false;
      _gktw = null;
      _gktwLoadErr = err;
    }
  }
  return _gktw;
}

// ─── Public: capability detection ─────────────────────────────────────────────

/** Returns true if @itsreimau/gktw is installed, loaded, and functional. */
export async function isGktwAvailable() {
  await getGktw();
  return _gktwAvailable === true;
}

/** Returns the raw GKTW module, or null if unavailable. */
export async function gktwModule() {
  return getGktw();
}

/** Returns the raw Baileys module. Always available. */
export async function baileysModule() {
  return getBaileys();
}

/**
 * Returns the installed GKTW version string, or null if unavailable.
 * @returns {Promise<string|null>}
 */
export async function gktwVersion() {
  if (!(await isGktwAvailable())) return null;
  try {
    const mod = _gktw?.default || _gktw;
    if (mod?.version) return String(mod.version);
    // Try reading package.json
    const pkg = await import("@itsreimau/gktw/package.json", { assert: { type: "json" } })
      .catch(() => null);
    return pkg?.default?.version || pkg?.version || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Return diagnostics about adapter state.
 * @returns {object}
 */
export function adapterDiagnostics() {
  return {
    gktwAvailable: _gktwAvailable,
    gktwLoadError: _gktwLoadErr?.message || null,
    baileysLoaded: !!_baileys,
  };
}

// ─── Proto helper ─────────────────────────────────────────────────────────────

export async function getProto() {
  const B = await getBaileys();
  return B.proto;
}

// ─── JID helpers ──────────────────────────────────────────────────────────────

export async function jidNormalizedUser(jid) {
  const B = await getBaileys();
  return B.jidNormalizedUser ? B.jidNormalizedUser(jid) : jid;
}

/** Check if a JID is a newsletter / channel JID. */
export async function isJidNewsletter(jid) {
  try {
    const B = await getBaileys();
    if (typeof B.isJidNewsletter === "function") return B.isJidNewsletter(jid);
  } catch {}
  return String(jid || "").endsWith("@newsletter");
}

/** Check if a JID is a group JID. */
export function isJidGroup(jid) {
  return String(jid || "").endsWith("@g.us");
}

/** Check if a JID is a user JID. */
export function isJidUser(jid) {
  return String(jid || "").endsWith("@s.whatsapp.net");
}

// ─── Message generation helpers ───────────────────────────────────────────────

export async function generateWAMessageFromContent(jid, content, options) {
  const B = await getBaileys();
  return B.generateWAMessageFromContent(jid, content, options);
}

export async function generateWAMessage(jid, content, options) {
  const B = await getBaileys();
  return B.generateWAMessage(jid, content, options);
}

// ─── downloadContentFromMessage ───────────────────────────────────────────────

export async function downloadContentFromMessage(message, type) {
  const B = await getBaileys();
  return B.downloadContentFromMessage(message, type);
}

// ─── prepareWAMessageMedia ────────────────────────────────────────────────────

export async function prepareWAMessageMedia(content, options) {
  const B = await getBaileys();
  return B.prepareWAMessageMedia(content, options);
}

// ─── getContentType ───────────────────────────────────────────────────────────

export async function getContentType(message) {
  try {
    const B = await getBaileys();
    if (typeof B.getContentType === "function") return B.getContentType(message);
  } catch {}
  // Manual fallback
  const keys = Object.keys(message || {});
  return keys.find(k => !["senderKeyDistributionMessage", "messageContextInfo"].includes(k)) || null;
}

// ─── Group helpers ────────────────────────────────────────────────────────────

export async function getGroupMetadata(sock, jid) {
  try {
    if (typeof sock.groupMetadata === "function") return await sock.groupMetadata(jid);
    if (typeof sock.groupFetchAllParticipating === "function") {
      const all = await sock.groupFetchAllParticipating();
      return all?.[jid] || null;
    }
  } catch (err) {
    console.error("[getGroupMetadata] Error:", err?.message);
  }
  return null;
}

export async function groupFetchAllParticipating(sock) {
  try {
    if (typeof sock.groupFetchAllParticipating === "function") {
      return await sock.groupFetchAllParticipating();
    }
  } catch (err) {
    console.error("[groupFetchAllParticipating] Error:", err?.message);
  }
  return {};
}

// ─── Poll ─────────────────────────────────────────────────────────────────────

export async function sendPoll(sock, jid, question, options, opts = {}) {
  try {
    if (!question || !Array.isArray(options) || options.length < 2) {
      throw new Error("Poll requires a question and at least 2 options");
    }
    const pollOptions = options.slice(0, 12).map(o => String(o).trim()).filter(Boolean);
    const content = {
      poll: {
        name: String(question).trim(),
        values: pollOptions,
        selectableCount: opts.selectableCount ?? 1,
      },
    };
    const sendOpts = {};
    if (opts.quoted) sendOpts.quoted = opts.quoted;
    return await sock.sendMessage(jid, content, sendOpts);
  } catch (err) {
    console.error("[sendPoll] Error:", err?.message);
    return null;
  }
}

// ─── Smart send (GKTW-first, Baileys fallback) ────────────────────────────────

export async function smartSend(sock, jid, content, opts = {}) {
  try {
    const gktw = await getGktw();
    if (gktw) {
      const mod = gktw.default || gktw;
      const fn  = mod?.sendMessage || gktw.sendMessage;
      if (typeof fn === "function") {
        return await fn(sock, jid, content, opts);
      }
    }
    return await sock.sendMessage(jid, content, opts);
  } catch {
    try { return await sock.sendMessage(jid, content, opts); } catch (innerErr) {
      console.error("[smartSend] Error:", innerErr?.message);
      return null;
    }
  }
}

// ─── Context info builder ─────────────────────────────────────────────────────

/**
 * Build a contextInfo object for enriched messages.
 *
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {string} [opts.body]
 * @param {string} [opts.sourceUrl]
 * @param {Buffer} [opts.thumbnail]
 * @param {number} [opts.mediaType=1]   - 1=image, 2=video
 * @param {boolean} [opts.renderLarger=true]
 * @returns {object}
 */
export function generateContextInfo(opts = {}) {
  const info = {};
  if (opts.title || opts.body || opts.sourceUrl || opts.thumbnail) {
    info.externalAdReply = {
      title:                opts.title       || "",
      body:                 opts.body        || "",
      sourceUrl:            opts.sourceUrl   || "https://whatsapp.com",
      mediaType:            opts.mediaType   ?? 1,
      thumbnail:            opts.thumbnail   || null,
      renderLargerThumbnail: opts.renderLarger !== false,
      showAdAttribution:    false,
    };
  }
  if (opts.forwardingScore !== undefined) {
    info.forwardingScore = opts.forwardingScore;
    info.isForwarded     = opts.forwardingScore > 0;
  }
  if (opts.mentionedJid?.length) {
    info.mentionedJid = opts.mentionedJid;
  }
  return info;
}

/**
 * Build an externalAdReply contextInfo block.
 * Alias with a cleaner name.
 */
export function generateExternalAdReply(opts = {}) {
  return {
    externalAdReply: {
      title:                opts.title       || "",
      body:                 opts.body        || "",
      sourceUrl:            opts.sourceUrl   || "https://whatsapp.com",
      mediaType:            opts.mediaType   ?? 1,
      thumbnail:            opts.thumbnail   || null,
      renderLargerThumbnail: opts.renderLarger !== false,
      showAdAttribution:    false,
    },
  };
}

// ─── Interactive message (native-flow) ────────────────────────────────────────

/**
 * Send an interactive/native-flow message.
 * Routes: GKTW → Baileys proto → plain text fallback.
 */
export async function sendInteractiveMessage(sock, jid, params) {
  const {
    body       = "",
    footer     = "",
    header     = "",
    buttons    = [],
    contextInfo = {},
    quoted     = null,
  } = params;

  // ── GKTW path ──────────────────────────────────────────────────────────────
  const gktw = await getGktw();
  if (gktw) {
    const mod = gktw.default || gktw;
    const fn  = mod?.sendInteractive || gktw.sendInteractive;
    if (typeof fn === "function") {
      try {
        return await fn(sock, jid, { body, footer, header, buttons, contextInfo, quoted });
      } catch {
        // fall through to Baileys proto
      }
    }
  }

  // ── Baileys proto path ─────────────────────────────────────────────────────
  try {
    const B = await getBaileys();
    const proto = B.proto;
    const NF    = proto?.Message?.InteractiveMessage?.NativeFlowMessage?.NativeFlowButton;

    if (!NF) throw new Error("NativeFlowButton proto not available");

    const builtButtons = await Promise.all(buttons.map(async (btn, i) => {
      if (btn.url || btn.type === "url") {
        return NF.create({ name: "cta_url", buttonParamsJson: JSON.stringify({
          display_text: btn.text || `Link ${i + 1}`,
          url:          btn.url || "",
          merchant_url: btn.url || "",
        })});
      }
      if (btn.copyCode || btn.type === "copy") {
        return NF.create({ name: "cta_copy", buttonParamsJson: JSON.stringify({
          display_text: btn.text || "Copy",
          copy_code:    btn.copyCode || btn.id || "",
        })});
      }
      if (btn.phone || btn.type === "call") {
        return NF.create({ name: "cta_call", buttonParamsJson: JSON.stringify({
          display_text: btn.text || "Call",
          phone_number: btn.phone || "",
        })});
      }
      return NF.create({ name: "quick_reply", buttonParamsJson: JSON.stringify({
        display_text: btn.text || `Option ${i + 1}`,
        id:           btn.id   || String(i),
      })});
    }));

    const interactiveMsg = proto.Message.InteractiveMessage.create({
      body:    proto.Message.InteractiveMessage.Body.create({ text: body }),
      footer:  proto.Message.InteractiveMessage.Footer.create({ text: footer }),
      header:  proto.Message.InteractiveMessage.Header.create({
        title:      header,
        hasMediaAttachment: false,
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: builtButtons,
      }),
    });

    const fullContent = proto.Message.create({ interactiveMessage: interactiveMsg });
    const sendOpts = {};
    if (quoted) sendOpts.quoted = quoted;
    if (Object.keys(contextInfo).length) sendOpts.contextInfo = contextInfo;

    const generated = await B.generateWAMessageFromContent(jid, fullContent, {
      userJid:       sock.user?.id,
      ...sendOpts,
    });

    return await sock.relayMessage(jid, generated.message, { messageId: generated.key.id });
  } catch {
    // ── Plain-text fallback ────────────────────────────────────────────────────
    const btnLines = buttons.map((b, i) => `[${i + 1}] ${b.text}`).join("\n");
    const text = [
      header ? `*${header}*` : null,
      body   || null,
      btnLines || null,
      footer ? `_${footer}_` : null,
    ].filter(Boolean).join("\n\n");

    const sendOpts = {};
    if (quoted) sendOpts.quoted = quoted;
    return sock.sendMessage(jid, { text }, sendOpts);
  }
}

// ─── Baileys version ──────────────────────────────────────────────────────────

export async function fetchLatestBaileysVersion() {
  try {
    const B = await getBaileys();
    if (typeof B.fetchLatestBaileysVersion === "function") return B.fetchLatestBaileysVersion();
    if (typeof B.fetchLatestWaWebVersion === "function") return B.fetchLatestWaWebVersion();
  } catch {}
  return { version: [2, 3000, 1017531287], isLatest: false };
}

// ─── Store / socket helpers ───────────────────────────────────────────────────

export async function makeInMemoryStore(opts) {
  const B = await getBaileys();
  if (typeof B.makeInMemoryStore === "function") return B.makeInMemoryStore(opts);
  return null;
}

export async function useMultiFileAuthState(folder) {
  const B = await getBaileys();
  return B.useMultiFileAuthState(folder);
}

export async function makeWASocket(config) {
  const B = await getBaileys();
  return B.makeWASocket(config);
}

// ─── Export raw loaders for adapters that need them ──────────────────────────
export { getGktw };
