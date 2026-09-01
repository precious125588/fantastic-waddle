import { senderNum, isOwnerOrSudo, sleep } from '../lib/utils.js';
import { getAutoFeat, setAutoFeat, getSetting, setSetting } from '../lib/db.js';


/** Only bare <digits>@s.whatsapp.net is accepted by WhatsApp block/unblock. */
function normalizeUserJid(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const low = raw.toLowerCase();
  if (low.endsWith('@g.us') || low.endsWith('@broadcast') || low.endsWith('@newsletter') || low.endsWith('@lid')) return null;
  const num = raw.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  if (num.length < 7 || num.length > 15) return null;
  return `${num}@s.whatsapp.net`;
}

export async function handleWhatsApp(sock, msg, { command, args, jid, sender, text, reply, mentionedJids, quotedSender }) {
  switch (command) {

    case 'block':
    case 'unblock': {
      if (!isOwnerOrSudo(sender)) return reply('❌ Owner only.');
      const action = command === 'block' ? 'block' : 'unblock';
      const target = normalizeUserJid(mentionedJids[0] || quotedSender || text);
      if (!target) {
        return reply(`❌ Tag someone, reply, or provide a valid number.\nUsage: .${action} <number>\n_Groups, status and channels cannot be ${action}ed._`);
      }
      const selfJid = normalizeUserJid(sock.user?.id || '');
      if (selfJid && selfJid === target) return reply('❌ Cannot block the bot itself.');
      try {
        await sock.updateBlockStatus(target, action);
      } catch (e) {
        return reply(`❌ ${action} failed for ${target.split('@')[0]}: ${e?.message || e}`);
      }
      // Verify against WhatsApp's own blocklist where supported.
      let note = '';
      try {
        if (typeof sock.fetchBlocklist === 'function') {
          const list = (await sock.fetchBlocklist()) || [];
          const nums = list.map(j => String(j).split('@')[0].split(':')[0].replace(/[^0-9]/g, ''));
          const isBlocked = nums.includes(target.split('@')[0]);
          if (action === 'block' && !isBlocked) return reply(`❌ WhatsApp accepted the block but the number is still not on the blocklist.`);
          if (action === 'unblock' && isBlocked) return reply(`❌ WhatsApp accepted the unblock but the number is still blocked.`);
          note = '\n✅ Verified against WhatsApp blocklist.';
        }
      } catch {}
      await reply(action === 'block'
        ? `🚫 Blocked *${target.split('@')[0]}*${note}`
        : `🔓 Unblocked *${target.split('@')[0]}*${note}`);
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
