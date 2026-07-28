import { isBotOwner, isOwnerOrSudo, runtime, formatBytes } from '../lib/utils.js';
import { getSudoList, addSudo, removeSudo, setSetting, getSetting } from '../lib/db.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const START_TIME = Date.now();

export async function handleOwner(sock, msg, { command, args, jid, sender, text, reply, mentionedJids }) {
  if (!isOwnerOrSudo(sender)) {
    return false; // Let main handler respond with "Owner only"
  }

  switch (command) {

    case 'broadcast':
    case 'bc': {
      if (!text) return reply('❌ Usage: .broadcast <message>');
      if (!isBotOwner(sender)) return reply('❌ Owner only.');
      const m = await reply('📢 Broadcasting...');
      let sent = 0;
      try {
        const chats = await sock.fetchChats?.() || [];
        for (const chat of chats.slice(0, 100)) {
          try {
            await sock.sendMessage(chat.id, { text: `📢 *BROADCAST*\n━━━━━━━━━━━━━━\n${text}` });
            sent++;
          } catch {}
        }
      } catch {}
      await sock.sendMessage(jid, { text: `✅ Broadcast sent to *${sent}* chats.`, edit: m.key });
      break;
    }

    case 'setsudo':
    case 'addsudo':
    case 'sudo': {
      if (!isBotOwner(sender)) return reply('❌ Owner only.');
      const target = mentionedJids[0] || (text ? `${text.replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
      if (!target) return reply('❌ Tag someone or provide a number.');
      const num = target.split('@')[0];
      addSudo(num);
      await reply(`✅ *+${num}* added to sudo list.`);
      break;
    }

    case 'delsudo':
    case 'removesudo': {
      if (!isBotOwner(sender)) return reply('❌ Owner only.');
      const target = mentionedJids[0] || (text ? `${text.replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
      if (!target) return reply('❌ Tag someone or provide a number.');
      const num = target.split('@')[0];
      removeSudo(num);
      await reply(`✅ *+${num}* removed from sudo list.`);
      break;
    }

    case 'listsudo':
    case 'getsudo': {
      const list = getSudoList();
      await reply(
        `👑 *SUDO LIST*\n━━━━━━━━━━━━━━\n` +
        (list.length ? list.map((n, i) => `${i + 1}. +${n}`).join('\n') : '_No sudo users set._')
      );
      break;
    }

    case 'restart': {
      if (!isBotOwner(sender)) return reply('❌ Owner only.');
      await reply('🔄 Restarting bot...');
      setTimeout(() => process.exit(0), 1500);
      break;
    }

    case 'eval':
    case 'exec': {
      if (!isBotOwner(sender)) return reply('❌ Owner only.');
      if (!text) return reply('❌ Usage: .eval <code>');
      try {
        // eslint-disable-next-line no-eval
        let result = eval(text);
        if (result instanceof Promise) result = await result;
        const out = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
        await reply(`✅ *EVAL*\n\`\`\`\n${out.slice(0, 2000)}\n\`\`\``);
      } catch (e) {
        await reply(`❌ *ERROR*\n${e.message}`);
      }
      break;
    }

    case 'setprefix': {
      if (!isBotOwner(sender)) return reply('❌ Owner only.');
      if (!text || text.length > 3) return reply('❌ Usage: .setprefix <1-3 chars>');
      setSetting('prefix', text.trim());
      await reply(`✅ Prefix changed to *${text.trim()}*\n_Restart bot to apply._`);
      break;
    }

    case 'cleartmp': {
      let deleted = 0;
      try {
        const tmp = os.tmpdir();
        const files = fs.readdirSync(tmp).filter(f => f.startsWith('np_'));
        for (const f of files) {
          try { fs.unlinkSync(path.join(tmp, f)); deleted++; } catch {}
        }
      } catch {}
      await reply(`🗑️ Cleared *${deleted}* temp files.`);
      break;
    }

    case 'botstat':
    case 'stats': {
      const mem = process.memoryUsage();
      const uptime = Date.now() - START_TIME;
      await reply(
        `📊 *BOT STATISTICS*\n━━━━━━━━━━━━━━\n` +
        `🤖 Bot: *${process.env.BOT_NAME || 'NEW PAGE'}*\n` +
        `⏳ Uptime: *${runtime(uptime)}*\n` +
        `💾 RAM (RSS): *${(mem.rss / 1024 / 1024).toFixed(1)} MB*\n` +
        `💾 Heap Used: *${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB*\n` +
        `💾 Heap Total: *${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB*\n` +
        `⚡ Node: *${process.version}*\n` +
        `🖥 OS: *${os.platform()} ${os.arch()}*\n` +
        `💻 CPU: *${os.cpus()[0]?.model?.trim() || 'Unknown'}*\n` +
        `🧮 CPUs: *${os.cpus().length} cores*\n` +
        `🔢 PID: *${process.pid}*\n` +
        `📦 Commands: *100*`
      );
      break;
    }

    case 'setname':
    case 'botname': {
      if (!isBotOwner(sender)) return reply('❌ Owner only.');
      if (!text) return reply('❌ Usage: .setname <name>');
      try {
        await sock.updateProfileName(text);
        await reply(`✅ Bot name changed to *${text}*.`);
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
