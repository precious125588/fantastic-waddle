/**
 * MIAS — Status Handler
 * Post WhatsApp statuses (stories) using @itsliaaa/baileys.
 * Status messages go to "status@broadcast" with statusJidList.
 */

import { jidNormalizedUser } from "@whiskeysockets/baileys";

/**
 * Get member JIDs for status broadcast.
 * @param {object} sock
 * @param {string} groupJid - Optional group JID to get members from
 * @returns {Promise<string[]>}
 */
export async function getStatusAudience(sock, groupJid = null) {
  let jids = [];

  if (groupJid) {
    try {
      const meta = await sock.groupMetadata(groupJid);
      jids = (meta.participants || [])
        .map(p => String(p.id || ""))
        .filter(j => j.endsWith("@s.whatsapp.net"));
    } catch {}
  }

  if (!jids.length && sock._knownContacts) {
    try {
      jids = [...sock._knownContacts].filter(j => String(j).endsWith("@s.whatsapp.net"));
    } catch {}
  }

  if (!jids.length && sock.user?.id) {
    try { jids = [jidNormalizedUser(sock.user.id)].filter(Boolean); } catch {}
  }

  return jids;
}

/**
 * Post a text status.
 * @param {object} sock
 * @param {string} text
 * @param {string[]} [audienceJids]
 */
export async function postTextStatus(sock, text, audienceJids = []) {
  const jids = audienceJids.length ? audienceJids : await getStatusAudience(sock);
  await sock.sendMessage("status@broadcast", {
    text,
    contextInfo: { isGroupStatus: true, mentionedJid: [] },
  }, {
    statusJidList: jids,
    messageId: _genId(),
  });
}

/**
 * Post an image status.
 * @param {object} sock
 * @param {Buffer} imageBuffer
 * @param {string} [caption]
 * @param {string[]} [audienceJids]
 */
export async function postImageStatus(sock, imageBuffer, caption = "", audienceJids = []) {
  const jids = audienceJids.length ? audienceJids : await getStatusAudience(sock);
  await sock.sendMessage("status@broadcast", {
    image: imageBuffer,
    caption,
  }, {
    statusJidList: jids,
    messageId: _genId(),
  });
}

/**
 * Post a video status.
 * @param {object} sock
 * @param {Buffer} videoBuffer
 * @param {string} [caption]
 * @param {string} [mimetype="video/mp4"]
 * @param {string[]} [audienceJids]
 */
export async function postVideoStatus(sock, videoBuffer, caption = "", mimetype = "video/mp4", audienceJids = []) {
  const jids = audienceJids.length ? audienceJids : await getStatusAudience(sock);
  await sock.sendMessage("status@broadcast", {
    video: videoBuffer,
    caption,
    mimetype,
    gifPlayback: false,
  }, {
    statusJidList: jids,
    messageId: _genId(),
  });
}

/**
 * Post an audio status.
 * @param {object} sock
 * @param {Buffer} audioBuffer
 * @param {string} [mimetype]
 * @param {boolean} [ptt=false]
 * @param {string[]} [audienceJids]
 */
export async function postAudioStatus(sock, audioBuffer, mimetype = "audio/mpeg", ptt = false, audienceJids = []) {
  const jids = audienceJids.length ? audienceJids : await getStatusAudience(sock);
  await sock.sendMessage("status@broadcast", {
    audio: audioBuffer,
    mimetype,
    ptt,
  }, {
    statusJidList: jids,
    messageId: _genId(),
  });
}

function _genId() {
  return "MIAS" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}
