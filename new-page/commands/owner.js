/**
 * NEW PAGE — Owner Commands  v3
 * Full deps usage:
 *  node-os-utils    → .botstat  (CPU usage, free memory)
 *  performance-now  → precise uptime milliseconds
 *  moment-timezone  → .botstat and .time  (timezone-aware timestamps)
 *  human-readable   → format bytes in a human-readable way
 *  figlet           → .botstat banner
 */
import { isBotOwner, isOwnerOrSudo, runtime, formatBytes } from '../lib/utils.js';
import { getSudoList, addSudo, removeSudo, setSetting, getSetting } from '../lib/db.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const START_TIME = Date.now();

// ── Lazy loaders ─────────────────────────────────────────────────────────────
async function loadOsUtils()  { return (await import('node-os-utils')).default || (await import('node-os-utils')); }
async function loadPerfNow()  { return (await import('performance-now')).default; }
async function loadMoment()   { return (await import('moment-timezone')).default; }
async function loadHumanR()   {
  const mod = await import('human-readable');
  return mod.default || mod;
}
async function loadFiglet()   { return (await import('figlet')).default; }

// ── Get real CPU % via node-os-utils ─────────────────────────────────────────
async function getCpuUsage() {
  try {
    const osUtils = await loadOsUtils();
    const cpu = osUtils.cpu || osUtils.default?.cpu;
    if (cpu && typeof cpu.usage === 'function') {
      const pct = await cpu.usage();
      return `${pct.toFixed(1)}%`;
    }
  } catch {}
  // Fallback
  const cpus = os.cpus();
  const total = cpus.reduce((a, c) => {
    const s = c.times;
    return a + s.user + s.nice + s.sys + s.irq + s.idle;
  }, 0);
  const idle = cpus.reduce((a, c) => a + c.times.idle, 0);
  return `${((1 - idle / total) * 100).toFixed(1)}%`;
}

// ── Format bytes human-readable ───────────────────────────────────────────────
async function fmtBytes(bytes) {
  try {
    const hr = await loadHumanR();
    // human-readable can be: hr(value, opts) or hr.fileSize(bytes)
    if (typeof hr === 'function') return hr(bytes, { prefix: 'binary' });
    if (typeof hr.fileSize === 'function') return hr.fileSize(bytes);
    if (typeof hr.size === 'function')     return hr.size(bytes);
  } catch {}
  return formatBytes(bytes); // native fallback from utils.js
}

// ─────────────────────────────────────────────────────────────────────────────

export async function handleOwner(sock, msg, { command, args, jid, sender, text, reply, mentionedJids }) {
  if (!isOwnerOrSudo(sender)) {
    return false; // main handler shows "owner only" message
  }

  switch (command) {

    // ── BROADCAST ────────────────────────────────────────────────────────────
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

    // ── SETSUDO ───────────────────────────────────────────────────────────────
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

    // ── DELSUDO ───────────────────────────────────────────────────────────────
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

    // ── LISTSUDO ──────────────────────────────────────────────────────────────
    case 'listsudo':
    case 'getsudo': {
      const list = getSudoList();
      await reply(
        `👑 *SUDO LIST*\n━━━━━━━━━━━━━━\n` +
        (list.length ? list.map((n, i) => `${i + 1}. +${n}`).join('\n') : '_No sudo users set._')
      );
      break;
    }

    // ── RESTART ───────────────────────────────────────────────────────────────
    case 'restart': {
      if (!isBotOwner(sender)) return reply('❌ Owner only.');
      await reply('🔄 Restarting bot...');
      setTimeout(() => process.exit(0), 1500);
      break;
    }

    // ── EVAL / EXEC ───────────────────────────────────────────────────────────
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

    // ── SETPREFIX ─────────────────────────────────────────────────────────────
    case 'setprefix': {
      if (!isBotOwner(sender)) return reply('❌ Owner only.');
      if (!text || text.length > 3) return reply('❌ Usage: .setprefix <1-3 chars>');
      setSetting('prefix', text.trim());
      await reply(`✅ Prefix changed to *${text.trim()}*\n_Restart bot to apply._`);
      break;
    }

    // ── CLEARTMP ──────────────────────────────────────────────────────────────
    case 'cleartmp': {
      let deleted = 0;
      try {
        const tmpDir = os.tmpdir();
        const files  = fs.readdirSync(tmpDir).filter(f => f.startsWith('np_') || f.startsWith('np-'));
        for (const f of files) {
          try { fs.unlinkSync(path.join(tmpDir, f)); deleted++; } catch {}
        }
      } catch {}
      await reply(`🗑️ Cleared *${deleted}* temp files.`);
      break;
    }

    // ── BOTSTAT — node-os-utils + performance-now + moment-timezone + human-readable ──
    case 'botstat':
    case 'stats': {
      const m = await reply('📊 Gathering system stats...');
      try {
        const [cpuStr, moment] = await Promise.all([getCpuUsage(), loadMoment()]);
        const perfNow = await loadPerfNow();

        const mem      = process.memoryUsage();
        const sysTotal = os.totalmem();
        const sysFree  = os.freemem();
        const sysUsed  = sysTotal - sysFree;

        const [rssStr, heapUsedStr, heapTotalStr, sysTotalStr, sysUsedStr] = await Promise.all([
          fmtBytes(mem.rss),
          fmtBytes(mem.heapUsed),
          fmtBytes(mem.heapTotal),
          fmtBytes(sysTotal),
          fmtBytes(sysUsed),
        ]);

        // moment-timezone for precise time display
        const now      = moment().tz(process.env.BOT_TIMEZONE || 'UTC');
        const timeStr  = now.format('ddd, MMM Do YYYY • HH:mm:ss z');

        // performance-now for precise process uptime
        const preciseMs = typeof perfNow === 'function' ? perfNow() : Date.now() - START_TIME;
        const uptime    = runtime(Math.round(preciseMs));

        await sock.sendMessage(jid, {
          text:
            `📊 *BOT STATISTICS*\n━━━━━━━━━━━━━━\n` +
            `🤖 Bot: *${process.env.BOT_NAME || 'NEW PAGE'}*\n` +
            `⏳ Uptime: *${uptime}*\n` +
            `🕐 Time: *${timeStr}*\n\n` +
            `*── Process Memory ──*\n` +
            `💾 RSS: *${rssStr}*\n` +
            `💾 Heap Used: *${heapUsedStr}*\n` +
            `💾 Heap Total: *${heapTotalStr}*\n\n` +
            `*── System ──*\n` +
            `🖥️ CPU Usage: *${cpuStr}*\n` +
            `💻 CPU: *${os.cpus()[0]?.model?.trim() || 'Unknown'}* (${os.cpus().length} cores)\n` +
            `🖥️ RAM Used: *${sysUsedStr}* / ${sysTotalStr}\n` +
            `⚡ Node: *${process.version}*\n` +
            `🖥️ OS: *${os.platform()} ${os.arch()}*\n` +
            `🔢 PID: *${process.pid}*\n` +
            `📦 Commands: *120+*`,
          edit: m.key,
        });
      } catch (e) {
        // Plain fallback
        const mem = process.memoryUsage();
        await sock.sendMessage(jid, {
          text:
            `📊 *BOT STATISTICS*\n━━━━━━━━━━━━━━\n` +
            `🤖 Bot: *${process.env.BOT_NAME || 'NEW PAGE'}*\n` +
            `⏳ Uptime: *${runtime(Date.now() - START_TIME)}*\n` +
            `💾 RAM: *${(mem.rss / 1024 / 1024).toFixed(1)} MB*\n` +
            `⚡ Node: *${process.version}*\n` +
            `🖥️ OS: *${os.platform()} ${os.arch()}*\n` +
            `Error getting full stats: ${e.message}`,
          edit: m.key,
        });
      }
      break;
    }

    // ── SETNAME ───────────────────────────────────────────────────────────────
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

    // ── UPTIME (moment-timezone) ──────────────────────────────────────────────
    case 'sysuptime':
    case 'systemtime': {
      const moment = await loadMoment();
      const tz = text?.trim() || process.env.BOT_TIMEZONE || 'UTC';
      let now;
      try { now = moment().tz(tz); } catch { now = moment().utc(); }
      const sysUp = os.uptime();
      const sysUpStr = runtime(sysUp * 1000);
      await reply(
        `⏰ *SYSTEM TIME*\n━━━━━━━━━━━━━━\n` +
        `📅 ${now.format('dddd, MMMM Do YYYY')}\n` +
        `🕐 ${now.format('HH:mm:ss')} (${now.format('z')})\n\n` +
        `⏳ Bot uptime: *${runtime(Date.now() - START_TIME)}*\n` +
        `🖥️ System uptime: *${sysUpStr}*`
      );
      break;
    }

    default:
      return false;
  }
  return true;
}
