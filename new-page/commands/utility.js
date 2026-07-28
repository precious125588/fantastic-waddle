import { sleep, runtime, isBotOwner, isOwnerOrSudo } from '../lib/utils.js';
import { speedTest, getWeather, translate } from '../lib/api.js';
import { buildMenu } from '../menu.js';
import os from 'os';

const START_TIME = Date.now();

export async function handleUtility(sock, msg, { command, args, jid, sender, text, reply }) {
  switch (command) {

    case 'ping': {
      const t = Date.now();
      const m = await reply('🏓 Pong...');
      const lat = Date.now() - t;
      await sock.sendMessage(jid, {
        text: `🏓 *PING*\n━━━━━━━━━━━━━━\n⚡ Latency: *${lat}ms*\n✅ Bot is alive!`,
        edit: m.key,
      });
      break;
    }

    case 'alive': {
      await reply(
        `✅ *BOT IS ALIVE*\n━━━━━━━━━━━━━━\n` +
        `🤖 Bot: *${process.env.BOT_NAME || 'NEW PAGE'}*\n` +
        `⏳ Uptime: *${runtime(Date.now() - START_TIME)}*\n` +
        `📅 Date: *${new Date().toLocaleString()}*\n` +
        `⚡ Node: *${process.version}*\n` +
        `💾 RAM: *${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB*`
      );
      break;
    }

    case 'runtime':
    case 'uptime': {
      await reply(`⏳ *UPTIME*\n━━━━━━━━━━━━━━\n${runtime(Date.now() - START_TIME)}`);
      break;
    }

    case 'speed': {
      const m = await reply('🌐 Running speed test...');
      const res = await speedTest();
      await sock.sendMessage(jid, {
        text: `🌐 *SPEED TEST*\n━━━━━━━━━━━━━━\n📡 Ping: *${res.ping}ms*\n📥 Download: *${res.download} Mbps*`,
        edit: m.key,
      });
      break;
    }

    case 'menu':
    case 'help': {
      if (text) {
        const cat = text.toLowerCase().trim();
        const { buildCategoryMenu } = await import('../menu.js');
        return reply(buildCategoryMenu(cat));
      }
      await reply(buildMenu());
      break;
    }

    case 'info': {
      const mem = process.memoryUsage();
      await reply(
        `ℹ️ *BOT INFO*\n━━━━━━━━━━━━━━\n` +
        `🤖 Name: *${process.env.BOT_NAME || 'NEW PAGE'}*\n` +
        `📦 Version: *1.0.0*\n` +
        `🖥 Platform: *${os.platform()} ${os.arch()}*\n` +
        `⚡ Node: *${process.version}*\n` +
        `💾 RAM: *${(mem.rss / 1024 / 1024).toFixed(1)} MB*\n` +
        `⏳ Uptime: *${runtime(Date.now() - START_TIME)}*\n` +
        `🔢 Commands: *100*`
      );
      break;
    }

    case 'time': {
      const now = new Date();
      await reply(
        `🕐 *TIME*\n━━━━━━━━━━━━━━\n` +
        `📅 Date: *${now.toDateString()}*\n` +
        `🕐 Time: *${now.toTimeString().slice(0, 8)}*\n` +
        `🌍 UTC: *${now.toUTCString()}*`
      );
      break;
    }

    case 'weather': {
      if (!text) return reply('❌ Usage: .weather <city>');
      const m = await reply(`🌦 Checking weather for *${text}*...`);
      const res = await getWeather(text);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return;
      }
      const d = res.data;
      await sock.sendMessage(jid, {
        text:
          `🌦 *WEATHER — ${text.toUpperCase()}*\n━━━━━━━━━━━━━━\n` +
          `🌡 Temp: *${d.temperature || d.temp || d.current?.temp_c || '?'}°C*\n` +
          `💧 Humidity: *${d.humidity || d.current?.humidity || '?'}%*\n` +
          `🌬 Wind: *${d.wind || d.current?.wind_kph || '?'} km/h*\n` +
          `☁️ Condition: *${d.condition || d.weather?.[0]?.description || d.current?.condition?.text || '?'}*`,
        edit: m.key,
      });
      break;
    }

    case 'translate':
    case 'tr': {
      if (!text) return reply('❌ Usage: .translate <lang> <text>\nExample: .translate fr Hello World');
      const parts = text.split(' ');
      const lang = parts[0];
      const input = parts.slice(1).join(' ');
      if (!input) return reply('❌ Usage: .translate <lang> <text>');
      const m = await reply('🌍 Translating...');
      const res = await translate(input, lang);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return;
      }
      await sock.sendMessage(jid, {
        text: `🌍 *TRANSLATE → ${lang.toUpperCase()}*\n━━━━━━━━━━━━━━\n📝 Input: ${input}\n✅ Result: *${res.result}*`,
        edit: m.key,
      });
      break;
    }

    default:
      return false;
  }
  return true;
}
