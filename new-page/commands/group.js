import { isGroupAdmin, isOwnerOrSudo, isGroup, senderNum, sleep } from '../lib/utils.js';
import { getGroupSetting, setGroupSetting } from '../lib/db.js';

export async function handleGroup(sock, msg, { command, args, jid, sender, text, reply, mentionedJids, quotedMsg, quotedSender }) {
  if (!isGroup(jid)) return false;

  async function isBotAdmin() {
    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    return isGroupAdmin(sock, jid, botJid);
  }

  async function requireBotAdmin() {
    if (!await isBotAdmin()) {
      await reply('❌ Bot must be admin to use this command.');
      return false;
    }
    return true;
  }

  async function requireUserAdmin() {
    if (!await isGroupAdmin(sock, jid, sender)) {
      await reply('❌ You need to be admin to use this command.');
      return false;
    }
    return true;
  }

  switch (command) {

    case 'kick':
    case 'remove': {
      if (!await requireUserAdmin() || !await requireBotAdmin()) return true;
      const targets = mentionedJids.length ? mentionedJids :
        quotedSender ? [quotedSender] :
        text ? [`${text.replace(/[^0-9]/g, '')}@s.whatsapp.net`] : [];
      if (!targets.length) return reply('❌ Tag someone or reply to their message.');
      for (const t of targets) {
        try {
          await sock.groupParticipantsUpdate(jid, [t], 'remove');
        } catch {}
      }
      await reply(`✅ Kicked ${targets.length} member(s).`);
      break;
    }

    case 'add': {
      if (!await requireUserAdmin() || !await requireBotAdmin()) return true;
      const numbers = text ? text.trim().split(/[\s,]+/).map(n => n.replace(/[^0-9]/g, '') + '@s.whatsapp.net') : [];
      if (!numbers.length) return reply('❌ Usage: .add <number(s)>');
      for (const n of numbers) {
        try { await sock.groupParticipantsUpdate(jid, [n], 'add'); } catch {}
      }
      await reply(`✅ Added ${numbers.length} member(s).`);
      break;
    }

    case 'promote':
    case 'admin': {
      if (!await requireUserAdmin() || !await requireBotAdmin()) return true;
      const targets = mentionedJids.length ? mentionedJids : quotedSender ? [quotedSender] : [];
      if (!targets.length) return reply('❌ Tag or reply to someone.');
      for (const t of targets) {
        try { await sock.groupParticipantsUpdate(jid, [t], 'promote'); } catch {}
      }
      await reply(`✅ Promoted ${targets.length} member(s) to admin.`);
      break;
    }

    case 'demote': {
      if (!await requireUserAdmin() || !await requireBotAdmin()) return true;
      const targets = mentionedJids.length ? mentionedJids : quotedSender ? [quotedSender] : [];
      if (!targets.length) return reply('❌ Tag or reply to someone.');
      for (const t of targets) {
        try { await sock.groupParticipantsUpdate(jid, [t], 'demote'); } catch {}
      }
      await reply(`✅ Demoted ${targets.length} member(s) from admin.`);
      break;
    }

    case 'mute':
    case 'close': {
      if (!await requireUserAdmin() || !await requireBotAdmin()) return true;
      await sock.groupSettingUpdate(jid, 'announcement');
      await reply('🔇 Group muted — only admins can send messages.');
      break;
    }

    case 'unmute':
    case 'open': {
      if (!await requireUserAdmin() || !await requireBotAdmin()) return true;
      await sock.groupSettingUpdate(jid, 'not_announcement');
      await reply('🔔 Group unmuted — everyone can send messages.');
      break;
    }

    case 'kickall': {
      if (!await requireUserAdmin() || !await requireBotAdmin()) return true;
      const meta = await sock.groupMetadata(jid);
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const admins = meta.participants.filter(p => p.admin).map(p => p.id);
      const toKick = meta.participants
        .filter(p => !admins.includes(p.id) && p.id !== botJid)
        .map(p => p.id);
      if (!toKick.length) return reply('❌ No non-admin members to kick.');
      await reply(`⚠️ Kicking ${toKick.length} members...`);
      for (let i = 0; i < toKick.length; i += 5) {
        const batch = toKick.slice(i, i + 5);
        try { await sock.groupParticipantsUpdate(jid, batch, 'remove'); } catch {}
        await sleep(500);
      }
      await reply(`✅ Kicked ${toKick.length} members.`);
      break;
    }

    case 'tagall': {
      if (!await requireUserAdmin()) return true;
      const meta = await sock.groupMetadata(jid);
      const members = meta.participants.map(p => p.id);
      const msg2 = text || '📢 Attention everyone!';
      const mentions = members.map(m => `@${m.split('@')[0]}`).join(' ');
      await sock.sendMessage(jid, {
        text: `📢 *TAG ALL*\n${msg2}\n\n${mentions}`,
        mentions: members,
      });
      break;
    }

    case 'hidetag':
    case 'htag': {
      if (!await requireUserAdmin()) return true;
      const meta = await sock.groupMetadata(jid);
      const members = meta.participants.map(p => p.id);
      await sock.sendMessage(jid, {
        text: text || '📢',
        mentions: members,
      });
      break;
    }

    case 'antilink': {
      if (!await requireUserAdmin()) return true;
      const val = text?.toLowerCase() === 'on';
      setGroupSetting(jid, 'antilink', val);
      await reply(`🔗 Anti-link *${val ? 'ON' : 'OFF'}*.`);
      break;
    }

    case 'antispam': {
      if (!await requireUserAdmin()) return true;
      const val = text?.toLowerCase() === 'on';
      setGroupSetting(jid, 'antispam', val);
      await reply(`🚫 Anti-spam *${val ? 'ON' : 'OFF'}*.`);
      break;
    }

    case 'setgdesc':
    case 'setdesc': {
      if (!await requireUserAdmin() || !await requireBotAdmin()) return true;
      if (!text) return reply('❌ Usage: .setgdesc <description>');
      await sock.groupUpdateDescription(jid, text);
      await reply('✅ Group description updated.');
      break;
    }

    default:
      return false;
  }
  return true;
}
