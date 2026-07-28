import { senderNum, isOwnerOrSudo, sleep } from '../lib/utils.js';
import { getAutoFeat, setAutoFeat, getSetting, setSetting } from '../lib/db.js';

export async function handleWhatsApp(sock, msg, { command, args, jid, sender, text, reply, mentionedJids, quotedSender }) {
  switch (command) {

    case 'block': {
      const target = mentionedJids[0] || quotedSender ||
        (text ? `${text.replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
      if (!target) return reply('❌ Tag someone, reply, or provide a number.\nUsage: .block <number>');
      try {
        await sock.updateBlockStatus(target, 'block');
        await reply(`🚫 Blocked *${target.split('@')[0]}*`);
      } catch (e) {
        await reply(`❌ ${e.message}`);
      }
      break;
    }

    case 'unblock': {
      const target = mentionedJids[0] || quotedSender ||
        (text ? `${text.replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
      if (!target) return reply('❌ Usage: .unblock <number>');
      try {
        await sock.updateBlockStatus(target, 'unblock');
        await reply(`✅ Unblocked *${target.split('@')[0]}*`);
      } catch (e) {
        await reply(`❌ ${e.message}`);
      }
      break;
    }

    case 'setstatus':
    case 'status': {
      if (!text) return reply('❌ Usage: .setstatus <text>');
      try {
        await sock.updateProfileStatus(text);
        await reply(`✅ Status updated:\n_${text}_`);
      } catch (e) {
        await reply(`❌ ${e.message}`);
      }
      break;
    }

    case 'sendstatus':
    case 'poststatus': {
      if (!text) return reply('❌ Usage: .sendstatus <message>');
      try {
        await sock.sendMessage('status@broadcast', { text });
        await reply('✅ Status posted!');
      } catch (e) {
        await reply(`❌ ${e.message}`);
      }
      break;
    }

    case 'autostatus':
    case 'autoviewstatus':
    case 'viewstatus': {
      const val = text?.toLowerCase() === 'on' || !text ? true :
        text?.toLowerCase() === 'off' ? false : true;
      setAutoFeat(senderNum(sender), 'autostatus', val);
      await reply(`👁 Auto-view status *${val ? 'ON' : 'OFF'}*.`);
      break;
    }

    case 'autolikestatus':
    case 'likestatus': {
      const val = text?.toLowerCase() !== 'off';
      setAutoFeat(senderNum(sender), 'autolikestatus', val);
      await reply(`❤️ Auto-like status *${val ? 'ON' : 'OFF'}*.`);
      break;
    }

    case 'online': {
      try {
        await sock.sendPresenceUpdate('available');
        setSetting('alwaysOnline', true);
        await reply('🟢 Bot is now *online*.');
      } catch (e) {
        await reply(`❌ ${e.message}`);
      }
      break;
    }

    case 'offline': {
      try {
        await sock.sendPresenceUpdate('unavailable');
        setSetting('alwaysOnline', false);
        await reply('🔴 Bot is now *offline*.');
      } catch (e) {
        await reply(`❌ ${e.message}`);
      }
      break;
    }

    case 'typing': {
      const target = text ? `${text.replace(/[^0-9]/g, '')}@s.whatsapp.net` : jid;
      try {
        await sock.sendPresenceUpdate('composing', target);
        await sleep(3000);
        await sock.sendPresenceUpdate('paused', target);
        await reply('⌨️ Typing indicator sent.');
      } catch (e) {
        await reply(`❌ ${e.message}`);
      }
      break;
    }

    case 'recording': {
      const target = text ? `${text.replace(/[^0-9]/g, '')}@s.whatsapp.net` : jid;
      try {
        await sock.sendPresenceUpdate('recording', target);
        await sleep(3000);
        await sock.sendPresenceUpdate('paused', target);
        await reply('🎤 Recording indicator sent.');
      } catch (e) {
        await reply(`❌ ${e.message}`);
      }
      break;
    }

    case 'readall': {
      try {
        await sock.readMessages([msg.key]);
        await reply('✅ Message marked as read.');
      } catch (e) {
        await reply(`❌ ${e.message}`);
      }
      break;
    }

    case 'bio':
    case 'setbio': {
      if (!text) return reply('❌ Usage: .bio <text>');
      try {
        await sock.updateProfileStatus(text);
        await reply(`✅ Bio updated:\n_${text}_`);
      } catch (e) {
        await reply(`❌ ${e.message}`);
      }
      break;
    }

    default:
      return false;
  }
  return true;
}
