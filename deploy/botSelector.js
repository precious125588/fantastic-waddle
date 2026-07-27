'use strict';
/**
 * MIAS Bot Selector
 *
 * Sends the WhatsApp bot-selection menu (single-select list / interactive)
 * using the pairing socket immediately after authentication.
 *
 * Strategy (most → least interactive):
 *   1. Native-Flow single-select via Baileys proto (best UX, radio buttons)
 *   2. WhatsApp list message (dropdown-style select)
 *   3. Plain text with numbered options (universal fallback)
 */

const chalk = require('chalk');

// ── Baileys proto loader ──────────────────────────────────────────────────────
let _proto = null;
async function _getProto() {
  if (_proto) return _proto;
  try {
    const B = await import('@whiskeysockets/baileys');
    _proto = B.proto;
  } catch {}
  return _proto;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function _statusBadge(status) {
  switch (status) {
    case 'stable':       return '🟢';
    case 'beta':         return '🟡';
    case 'experimental': return '🔴';
    default:             return '⚪';
  }
}

/**
 * Send the bot selection menu to the user's WhatsApp.
 *
 * @param {object}   sock  — Baileys socket
 * @param {string}   jid   — Recipient JID
 * @param {Array}    bots  — Array of bot manifests from deploymentManager
 */
async function sendBotSelectionMenu(sock, jid, bots) {
  // Strategy 1: Native Flow single-select (radio buttons — best UX)
  const sent = await _tryNativeFlow(sock, jid, bots);
  if (sent) return;

  // Strategy 2: WhatsApp list message
  const sentList = await _tryListMessage(sock, jid, bots);
  if (sentList) return;

  // Strategy 3: Plain text fallback
  await _sendTextFallback(sock, jid, bots);
}

// ── Strategy 1: Native Flow ───────────────────────────────────────────────────
async function _tryNativeFlow(sock, jid, bots) {
  try {
    const proto = await _getProto();
    if (!proto) return false;

    const NF = proto?.Message?.InteractiveMessage?.NativeFlowMessage?.NativeFlowButton;
    if (!NF) return false;

    // Build single-select radio buttons
    const buttons = bots.map(bot =>
      NF.create({
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          id: bot.id,
          title: bot.name,
          description: `${_statusBadge(bot.status)} ${bot.tagline || ''}`.trim(),
        }),
      })
    );

    // Add Deploy confirmation button
    const deployBtn = NF.create({
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: 'Deploy',
        url: 'https://whatsapp.com',
        merchant_url: 'https://whatsapp.com',
      }),
    });

    const bodyText = bots.map((b, i) =>
      `${i === 0 ? '◉' : '○'} *${b.name}*\n   ${_statusBadge(b.status)} ${b.tagline || ''}`
    ).join('\n\n');

    const interactiveMsg = proto.Message.InteractiveMessage.create({
      header: proto.Message.InteractiveMessage.Header.create({
        hasMediaAttachment: false,
        title: '🤖 MIAS Platform',
        subtitle: 'Bot Deployment',
      }),
      body: proto.Message.InteractiveMessage.Body.create({
        text: `🎉 *Pairing Successful!*\n\nWelcome to MIAS Platform.\n\nPlease choose the bot you want to deploy.\n\n${bodyText}`,
      }),
      footer: proto.Message.InteractiveMessage.Footer.create({
        text: '⚡ Powered by MIAS Platform',
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons,
        messageParamsJson: '',
      }),
    });

    const fullContent = proto.Message.create({ interactiveMessage: interactiveMsg });

    await sock.relayMessage(jid, fullContent, {});
    console.log(chalk.green('[BotSelector] Native Flow menu sent'));
    return true;
  } catch (e) {
    console.log(chalk.yellow(`[BotSelector] Native Flow failed: ${e.message}`));
    return false;
  }
}

// ── Strategy 2: WhatsApp list message ────────────────────────────────────────
async function _tryListMessage(sock, jid, bots) {
  try {
    const proto = await _getProto();
    if (!proto?.Message?.ListMessage) return false;

    const rows = bots.map(bot => ({
      rowId: bot.id,
      title: bot.name,
      description: `${_statusBadge(bot.status)} ${bot.tagline || ''}`.trim(),
    }));

    const listMsg = proto.Message.ListMessage.create({
      title: '🤖 MIAS Platform — Bot Selection',
      description: '🎉 Pairing Successful! Choose the bot to deploy.',
      buttonText: '🚀 Deploy',
      footerText: '⚡ Powered by MIAS Platform',
      listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
      sections: [
        proto.Message.ListMessage.Section.create({
          title: '🤖 Available Bots',
          rows: rows.map(r =>
            proto.Message.ListMessage.Row.create({
              rowId: r.rowId,
              title: r.title,
              description: r.description,
            })
          ),
        }),
      ],
    });

    await sock.sendMessage(jid, { listMessage: listMsg });
    console.log(chalk.green('[BotSelector] List message sent'));
    return true;
  } catch (e) {
    console.log(chalk.yellow(`[BotSelector] List message failed: ${e.message}`));
    return false;
  }
}

// ── Strategy 3: Plain text fallback ──────────────────────────────────────────
async function _sendTextFallback(sock, jid, bots) {
  try {
    const lines = bots.map((b, i) =>
      `${i === 0 ? '◉' : '○'} *${b.name}*\n   ${_statusBadge(b.status)} ${b.tagline || ''}`
    ).join('\n\n');

    const nums = bots.map((b, i) => `*${i + 1}* — ${b.name}`).join('\n');

    const text =
      `🎉 *Pairing Successful!*\n\n` +
      `Welcome to MIAS Platform.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🤖 *Choose Your Bot*\n\n` +
      `${lines}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Reply with the number:\n${nums}`;

    await sock.sendMessage(jid, { text });
    console.log(chalk.green('[BotSelector] Text fallback sent'));
  } catch (e) {
    console.error(chalk.red(`[BotSelector] Text fallback also failed: ${e.message}`));
  }
}

module.exports = { sendBotSelectionMenu };
