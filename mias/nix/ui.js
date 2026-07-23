/**
 * NIX ASSISTANT — UI Helpers v2.0
 * Typing indicators, staged responses, personality-aware send helpers
 */

import { nixDynamicFooter } from './personality.js';
import { reactCustom } from '../handlers/reactionHandler.js';

export async function typingOn(sock, jid) {
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}
}

export async function typingOff(sock, jid) {
  try { await sock.sendPresenceUpdate('paused', jid); } catch {}
}

export async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function sendNix(sock, msg, text) {
  try {
    const jid = msg.key.remoteJid;
    await sock.sendMessage(jid, { text: String(text) }, { quoted: msg });
  } catch {
    try { await sock.sendMessage(msg.key.remoteJid, { text: '⚠️ Nix hit a snag — try again in a sec' }); } catch {}
  }
}

export async function reactNix(sock, msg, emoji) {
  // Delegate to the centralized reaction handler so every nix module reaction
  // goes through the same pipeline as the rest of the bot.
  try { await reactCustom(sock, msg, emoji); } catch {}
}

/**
 * Pre-reaction message — sent BEFORE the command result (Layer 1)
 * Plain message (not quoted) so it feels like Nix is thinking out loud
 */
export async function nixPreReact(sock, msg, text) {
  if (!text) return;
  try {
    const jid = msg.key.remoteJid;
    await typingOn(sock, jid);
    await wait(300 + Math.floor(Math.random() * 400)); // 300–700ms delay (human feel)
    await sock.sendMessage(jid, { text: String(text) });
    await typingOff(sock, jid);
  } catch {}
}

/**
 * After-comment message — sent AFTER the command result (Layer 3)
 * Short, casual, unpredictable (40% of responses skip this)
 */
export async function nixAfterComment(sock, msg, text) {
  if (!text) return;
  try {
    const jid = msg.key.remoteJid;
    await wait(500 + Math.floor(Math.random() * 600)); // 500–1100ms after result
    await typingOn(sock, jid);
    await wait(200 + Math.floor(Math.random() * 300));
    await sock.sendMessage(jid, { text: String(text) });
    await typingOff(sock, jid);
  } catch {}
}

/**
 * Staged processing response — feels like a real assistant thinking
 */
export async function stagedSend(sock, msg, finalText, options = {}) {
  const jid = msg.key.remoteJid;
  const skipStages = options.skipStages || false;

  try {
    await typingOn(sock, jid);

    if (!skipStages) {
      const stages = [
        '🧠 _Understanding request..._',
        '📡 _Accessing WhatsApp data..._',
        '📂 _Scanning..._',
        '⚙️ _Processing..._',
        '📊 _Generating result..._',
      ];
      const stageCount = options.stages || 3;
      const stagesToShow = stages.slice(0, stageCount);

      const statusMsg = await sock.sendMessage(jid, { text: stagesToShow[0] }, { quoted: msg });

      for (let i = 1; i < stagesToShow.length; i++) {
        await wait(600);
        try {
          await sock.sendMessage(jid, { text: stagesToShow[i], edit: statusMsg?.key });
        } catch {
          await wait(300);
        }
      }
      await wait(500);
      try {
        await sock.sendMessage(jid, { text: finalText, edit: statusMsg?.key });
      } catch {
        await sock.sendMessage(jid, { text: finalText }, { quoted: msg });
      }
    } else {
      await wait(400);
      await sock.sendMessage(jid, { text: finalText }, { quoted: msg });
    }

    await typingOff(sock, jid);
  } catch {
    await typingOff(sock, jid);
    try { await sock.sendMessage(jid, { text: finalText }, { quoted: msg }); } catch {}
  }
}

/**
 * Dynamic rotating footer — never the same line twice in a row
 */
export function nixFooter() {
  return nixDynamicFooter();
}

export function formatNumber(n) {
  return Number(n || 0).toLocaleString();
}
