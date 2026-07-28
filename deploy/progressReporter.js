'use strict';
/**
 * MIAS Deployment Progress Reporter
 *
 * For New Page: sends ONE message and edits it live, counting 1 → 100
 * with what's happening in the background as the bot gets ready.
 *
 * For MIAS MDX and other bots: step-by-step progress messages.
 */

const chalk = require('chalk');

const BAR_LENGTH = 20;

function _bar(pct) {
  const filled = Math.round((pct / 100) * BAR_LENGTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_LENGTH - filled);
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * New Page: live-edit a single message counting 1 → 100.
 * Shows a progress bar, count, and what's happening at each milestone.
 */
async function _reportNewPage(sock, jid, bot) {
  const botName = bot.name || 'New Page';
  const steps = bot.deploySteps || [];
  const totalSteps = steps.length || 20;

  // Milestones: which step shows at which count
  const milestoneInterval = Math.max(1, Math.floor(100 / totalSteps));
  const getMilestone = (count) => {
    const idx = Math.min(Math.floor((count - 1) / milestoneInterval), steps.length - 1);
    return steps[idx] || 'Processing...';
  };

  // ── Send initial message ──────────────────────────────────────────────────
  let msgKey = null;
  try {
    const sent = await sock.sendMessage(jid, {
      text:
        `⚡ *Deploying ${botName}...*\n\n` +
        `${_bar(0)}\n` +
        `0 / 100\n\n` +
        `_Starting up..._`,
    });
    msgKey = sent?.key;
  } catch {}

  if (!msgKey) {
    // Fallback — no edit support, just send start msg
    console.log(chalk.yellow('[ProgressReporter] Could not send initial message'));
    return;
  }

  // ── Count 1 → 100, editing the message live ───────────────────────────────
  let lastMilestone = '';
  for (let count = 1; count <= 100; count++) {
    const milestone = getMilestone(count);
    const bar = _bar(count);

    // Build multi-line progress text
    const lines = [];
    lines.push(`⚡ *Deploying ${botName}...*`);
    lines.push('');
    lines.push(bar);
    lines.push(`*${count} / 100*`);
    lines.push('');
    lines.push(`⚙️ _${milestone}_`);

    if (lastMilestone && lastMilestone !== milestone) {
      lines.push(`✅ ${lastMilestone}`);
    }

    try {
      await sock.sendMessage(jid, {
        text: lines.join('\n'),
        edit: msgKey,
      });
    } catch {}

    if (milestone !== lastMilestone) lastMilestone = milestone;

    // Pacing: fast at start, slight pause at milestones
    const isMilestone = count % milestoneInterval === 0;
    await _sleep(isMilestone ? 120 : 40);
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  await _sleep(300);
  try {
    await sock.sendMessage(jid, {
      text:
        `🎉 *${botName} is Ready!*\n\n` +
        `${'█'.repeat(BAR_LENGTH)}\n` +
        `*100 / 100*\n\n` +
        `✅ All systems go!\n` +
        `⚡ 100 commands loaded\n` +
        `🟢 Always-online: ON\n` +
        `👁 Auto-view status: ON\n` +
        `❤️ Auto-like status: ON\n\n` +
        `_Send any message to get started!_\n\n` +
        `⚡ _Powered by MIAS Platform_`,
      edit: msgKey,
    });
  } catch {}

  console.log(chalk.green(`[ProgressReporter] New Page 1→100 complete for ${jid}`));
}

/**
 * MIAS MDX / generic: step-by-step progress with bar.
 */
async function _reportGeneric(sock, jid, bot) {
  const steps = bot.deploySteps || ['Session created', 'Services loaded', 'Deployment complete'];
  const botName = bot.name || 'Bot';

  let msgKey = null;
  try {
    const sent = await sock.sendMessage(jid, {
      text: `🚀 *Deploying ${botName}...*\n\n${_bar(0)}\n\n_Please wait_`,
    });
    msgKey = sent?.key;
  } catch {}

  const checkmarks = [];
  for (let i = 0; i < steps.length; i++) {
    await _sleep(700);
    checkmarks.push(`✓ ${steps[i]}`);
    const pct = Math.round(((i + 1) / steps.length) * 100);

    const text =
      `🚀 *Deploying ${botName}...*\n\n` +
      `${_bar(pct)}\n\n` +
      checkmarks.join('\n');

    if (msgKey) {
      try { await sock.sendMessage(jid, { text, edit: msgKey }); } catch {}
    } else {
      try { await sock.sendMessage(jid, { text }); } catch {}
    }
  }

  await _sleep(600);

  const statusBadge = bot.status === 'stable' ? '🟢 Stable' : bot.status === 'beta' ? '🟡 Beta' : '⚪';
  const doneText =
    `🎉 *${botName} is ready!*\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🤖 Bot: *${botName}*\n` +
    `📦 Version: *${bot.version || 'latest'}*\n` +
    `🏷 Status: *${statusBadge}*\n` +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `Your bot is now active. Send any message to get started!\n\n` +
    `⚡ _Powered by MIAS Platform_`;

  if (msgKey) {
    try { await sock.sendMessage(jid, { text: doneText, edit: msgKey }); } catch {}
  } else {
    try { await sock.sendMessage(jid, { text: doneText }); } catch {}
  }

  console.log(chalk.green(`[ProgressReporter] Deployment complete for ${jid} → ${botName}`));
}

/**
 * Main export — routes to New Page live counter or generic step reporter.
 *
 * @param {object} sock  — Baileys socket
 * @param {string} jid   — Recipient JID
 * @param {object} bot   — Bot manifest (name, deploySteps, status)
 */
async function reportDeployProgress(sock, jid, bot) {
  const isNewPage = (bot.id === 'new-page') || (bot.name || '').toLowerCase().includes('new page');
  if (isNewPage) {
    return _reportNewPage(sock, jid, bot);
  }
  return _reportGeneric(sock, jid, bot);
}

module.exports = { reportDeployProgress };
