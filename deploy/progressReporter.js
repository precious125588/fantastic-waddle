'use strict';
/**
 * MIAS Deployment Progress Reporter
 *
 * Sends ONE message and edits it live as the chosen bot boots.
 *
 * FIXED: the New Page reporter previously issued 100 message edits spaced
 * 40–120 ms apart. That is ~100 outbound WhatsApp writes in under 8 seconds,
 * which reliably trips rate limiting and can get the linked number flagged.
 * The counter still runs 1 → 100 visually, but it is now delivered in a small
 * number of throttled edits.
 */

const chalk = require('chalk');

const BAR_LENGTH  = 20;
const MAX_EDITS   = 18;    // hard ceiling on outbound edits per deployment
const EDIT_GAP_MS = 850;   // minimum spacing between edits

function _bar(pct) {
  const filled = Math.max(0, Math.min(BAR_LENGTH, Math.round((pct / 100) * BAR_LENGTH)));
  return '█'.repeat(filled) + '░'.repeat(BAR_LENGTH - filled);
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Edit `msgKey` if we have one, otherwise send a fresh message.
 * Never throws — progress reporting must not break a deployment.
 */
async function _emit(sock, jid, text, msgKey) {
  try {
    if (msgKey) await sock.sendMessage(jid, { text, edit: msgKey });
    else        await sock.sendMessage(jid, { text });
  } catch (e) {
    console.warn(chalk.yellow(`[ProgressReporter] emit failed: ${e.message}`));
  }
}

/**
 * Live 1 → 100 counter, delivered in MAX_EDITS throttled updates.
 */
async function _reportCounter(sock, jid, bot) {
  const botName = bot.name || 'Bot';
  const steps   = (bot.deploySteps && bot.deploySteps.length)
    ? bot.deploySteps
    : ['Starting up', 'Loading modules', 'Connecting', 'Deployment complete'];

  let msgKey = null;
  try {
    const sent = await sock.sendMessage(jid, {
      text: `⚡ *Deploying ${botName}…*\n\n${_bar(0)}\n*0 / 100*\n\n_Starting up…_`,
    });
    msgKey = sent?.key || null;
  } catch (e) {
    console.warn(chalk.yellow(`[ProgressReporter] initial send failed: ${e.message}`));
  }

  const edits = Math.min(MAX_EDITS, 100);
  const done  = [];

  for (let i = 1; i <= edits; i++) {
    const count    = Math.round((i / edits) * 100);
    const stepIdx  = Math.min(steps.length - 1, Math.floor(((i - 1) / edits) * steps.length));
    const current  = steps[stepIdx];

    if (done[done.length - 1] !== current) {
      if (done.length) { /* previous step is finished */ }
      done.push(current);
    }

    const finished = done.slice(0, -1).map(s => `✅ ${s}`).join('\n');

    const text = [
      `⚡ *Deploying ${botName}…*`,
      '',
      _bar(count),
      `*${count} / 100*`,
      '',
      `⚙️ _${current}_`,
      finished ? `\n${finished}` : '',
    ].join('\n');

    await _emit(sock, jid, text, msgKey);
    await _sleep(EDIT_GAP_MS);
  }

  const statusBadge =
    bot.status === 'stable' ? '🟢 Stable' :
    bot.status === 'beta'   ? '🟡 Beta'   : '⚪';

  await _emit(
    sock,
    jid,
    `🎉 *${botName} is ready!*\n\n` +
    `${'█'.repeat(BAR_LENGTH)}\n*100 / 100*\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🤖 Bot: *${botName}*\n` +
    `📦 Version: *${bot.version || 'latest'}*\n` +
    `🏷 Status: *${statusBadge}*\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `Send any message to get started!\n\n` +
    `⚡ _Powered by MIAS Platform_`,
    msgKey
  );

  console.log(chalk.green(`[ProgressReporter] ${botName} deployment reported for ${jid}`));
}

/**
 * @param {object} sock Baileys socket
 * @param {string} jid  Full recipient JID
 * @param {object} bot  Chosen bot manifest
 */
async function reportDeployProgress(sock, jid, bot) {
  return _reportCounter(sock, jid, bot || {});
}

module.exports = { reportDeployProgress };
