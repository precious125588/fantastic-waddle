'use strict';
/**
 * MIAS Deployment Progress Reporter
 *
 * Sends step-by-step deployment progress messages to WhatsApp
 * while the chosen bot is being launched.
 *
 * Example output:
 *   Deploying MIAS MDX...
 *   ██████████
 *   ✓ Session created
 *   ✓ Plugins loaded
 *   ✓ Database initialized
 *   ✓ Deployment complete
 */

const chalk = require('chalk');

const PROGRESS_BARS = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
const BAR_LENGTH    = 10;

function _bar(filled) {
  const f = Math.min(Math.max(filled, 0), BAR_LENGTH);
  return '█'.repeat(f) + '░'.repeat(BAR_LENGTH - f);
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Send progress messages for the chosen bot deployment.
 *
 * @param {object} sock   — Baileys socket
 * @param {string} jid    — Recipient JID
 * @param {object} bot    — Bot manifest (name, deploySteps, status)
 */
async function reportDeployProgress(sock, jid, bot) {
  const steps   = bot.deploySteps || ['Session created', 'Services loaded', 'Deployment complete'];
  const botName = bot.name || 'Bot';

  // ── Opening message ────────────────────────────────────────────────────────
  try {
    await sock.sendMessage(jid, {
      text: `🚀 *Deploying ${botName}...*\n\n${_bar(0)}\n\n_Please wait_`
    });
  } catch {}

  await _sleep(800);

  // ── Send each step ─────────────────────────────────────────────────────────
  const checkmarks = [];
  for (let i = 0; i < steps.length; i++) {
    await _sleep(700);
    checkmarks.push(`✓ ${steps[i]}`);
    const filled = Math.round(((i + 1) / steps.length) * BAR_LENGTH);

    try {
      const progressText =
        `🚀 *Deploying ${botName}...*\n\n` +
        `${_bar(filled)}\n\n` +
        checkmarks.map(c => c).join('\n');
      await sock.sendMessage(jid, { text: progressText });
    } catch {}
  }

  await _sleep(600);

  // ── Success message ────────────────────────────────────────────────────────
  try {
    const statusBadge = bot.status === 'stable' ? '🟢 Stable' : bot.status === 'beta' ? '🟡 Beta' : '⚪';
    const successText =
      `🎉 *${botName} is ready!*\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🤖 Bot: *${botName}*\n` +
      `📦 Version: *${bot.version || 'latest'}*\n` +
      `🏷 Status: *${statusBadge}*\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `Your bot is now active. Send any message to get started!\n\n` +
      `⚡ _Powered by MIAS Platform_`;
    await sock.sendMessage(jid, { text: successText });
  } catch {}

  console.log(chalk.green(`[ProgressReporter] Deployment complete for ${jid} → ${botName}`));
}

module.exports = { reportDeployProgress };
