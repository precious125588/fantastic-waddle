/**
 * NIX — Auto-feature toggles
 * Bridges natural language ("enable autoview", "turn off autotyping") to the
 * main bot's settings via globalThis.__BOT_TOGGLE_AUTO__ exposed by index.js.
 */
import { getOwnerName } from '../owner.js';
import { sendNix, reactNix, nixFooter } from '../ui.js';

const LABELS = {
  viewStatus:  { name: 'Auto View Status', emoji: '👁️' },
  reactStatus: { name: 'Auto Like Status', emoji: '❤️' },
  typing:      { name: 'Auto Typing',      emoji: '⌨️' },
  recording:   { name: 'Auto Recording',   emoji: '🎤' },
  autoread:    { name: 'Auto Read',        emoji: '📖' },
  autobio:     { name: 'Auto Bio',         emoji: '📝' },
  autoreact:   { name: 'Auto React',       emoji: '😀' },
};

export async function setAuto(sock, msg, kind, on) {
  const owner = getOwnerName();
  const meta = LABELS[kind];
  if (!meta) {
    await sendNix(sock, msg, `⚠️ *${owner}*, unknown auto-feature.${nixFooter()}`);
    return;
  }
  const fn = globalThis.__BOT_TOGGLE_AUTO__;
  if (typeof fn !== 'function') {
    await sendNix(sock, msg, `${meta.emoji} *${meta.name}*\n\n*${owner}*, the bot is still booting — try again in a moment.${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, meta.emoji);
  const result = fn(kind, on);
  if (result === null || result === undefined) {
    await sendNix(sock, msg, `❌ *Couldn't change ${meta.name}, ${owner}.*${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '✅');
  await sendNix(sock, msg,
    `${meta.emoji} *${meta.name}: ${result ? '✅ ON' : '❌ OFF'}*\n\n${result
      ? `Done, ${owner}! ${meta.name} is now active across your chats.`
      : `Done, ${owner}! ${meta.name} has been turned off.`}${nixFooter()}`
  );
}
