import { githubStalk, npmInfo, phoneLookup } from '../lib/api.js';
import { senderNum } from '../lib/utils.js';

export async function handleStalk(sock, msg, { command, args, jid, sender, text, reply, mentionedJids, quotedSender }) {
  switch (command) {

    case 'github':
    case 'ghstalk': {
      if (!text) return reply('❌ Usage: .github <username>');
      const m = await reply('🔍 Fetching GitHub profile...');
      const res = await githubStalk(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      await sock.sendMessage(jid, {
        text:
          `👨‍💻 *GITHUB — @${d.login}*\n━━━━━━━━━━━━━━\n` +
          `📛 Name: *${d.name || 'N/A'}*\n` +
          `📝 Bio: _${d.bio || 'No bio'}_ \n` +
          `📍 Location: *${d.location || 'N/A'}*\n` +
          `🏢 Company: *${d.company || 'N/A'}*\n` +
          `👥 Followers: *${d.followers}*  |  Following: *${d.following}*\n` +
          `📦 Repos: *${d.public_repos}*\n` +
          `🔗 ${d.html_url}`,
        edit: m.key,
      });
      break;
    }

    case 'npm': {
      if (!text) return reply('❌ Usage: .npm <package-name>');
      const m = await reply('🔍 Fetching NPM package...');
      const res = await npmInfo(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const latest = d['dist-tags']?.latest || 'N/A';
      const info = d.versions?.[latest];
      await sock.sendMessage(jid, {
        text:
          `📦 *NPM — ${d.name}*\n━━━━━━━━━━━━━━\n` +
          `📝 Description: _${d.description || 'N/A'}_\n` +
          `🏷 Latest: *${latest}*\n` +
          `👤 Author: *${typeof d.author === 'string' ? d.author : d.author?.name || 'N/A'}*\n` +
          `📜 License: *${info?.license || d.license || 'N/A'}*\n` +
          `🔗 ${`https://npmjs.com/package/${d.name}`}`,
        edit: m.key,
      });
      break;
    }

    case 'ig':
    case 'igstalk': {
      if (!text) return reply('❌ Usage: .ig <username>');
      const m = await reply('📸 Fetching Instagram profile...');
      try {
        const { default: axios } = await import('axios');
        const { data } = await axios.get(
          `https://www.instagram.com/${text.trim()}/?__a=1&__d=dis`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept': 'application/json',
            },
            timeout: 15000,
          }
        );
        const u = data?.graphql?.user || data?.data?.user;
        if (!u) {
          await sock.sendMessage(jid, { text: '❌ Profile not found or private.', edit: m.key });
          return true;
        }
        await sock.sendMessage(jid, {
          text:
            `📸 *INSTAGRAM — @${u.username}*\n━━━━━━━━━━━━━━\n` +
            `📛 Name: *${u.full_name || 'N/A'}*\n` +
            `📝 Bio: _${u.biography || 'No bio'}_\n` +
            `👥 Followers: *${u.edge_followed_by?.count || u.follower_count || 'N/A'}*\n` +
            `➡️ Following: *${u.edge_follow?.count || u.following_count || 'N/A'}*\n` +
            `📸 Posts: *${u.edge_owner_to_timeline_media?.count || u.media_count || 'N/A'}*\n` +
            `✅ Verified: *${u.is_verified ? 'Yes' : 'No'}*`,
          edit: m.key,
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Could not fetch profile: ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'whois': {
      const target = mentionedJids[0] || quotedSender;
      if (!target) return reply('❌ Tag someone or reply to their message.');
      const m = await reply('🔍 Fetching info...');
      try {
        const meta = await sock.onWhatsApp(target);
        const num = senderNum(target);
        const exists = meta?.[0]?.exists ?? false;
        await sock.sendMessage(jid, {
          text:
            `👤 *WHOIS*\n━━━━━━━━━━━━━━\n` +
            `📱 Number: *+${num}*\n` +
            `🔢 JID: *${target}*\n` +
            `✅ On WhatsApp: *${exists ? 'Yes' : 'No'}*`,
          edit: m.key,
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    case 'phonelookup':
    case 'phone': {
      if (!text) return reply('❌ Usage: .phonelookup <number>');
      const m = await reply('📞 Looking up phone number...');
      const res = await phoneLookup(text.replace(/[^0-9+]/g, ''));
      if (!res.ok) {
        // Fallback: basic info from number format
        const num = text.replace(/[^0-9]/g, '');
        const country = num.startsWith('1') ? '🇺🇸 USA/Canada' :
          num.startsWith('44') ? '🇬🇧 UK' :
          num.startsWith('234') ? '🇳🇬 Nigeria' :
          num.startsWith('91') ? '🇮🇳 India' :
          num.startsWith('27') ? '🇿🇦 South Africa' : '🌍 Unknown';
        await sock.sendMessage(jid, {
          text: `📞 *PHONE LOOKUP*\n━━━━━━━━━━━━━━\n📱 Number: *+${num}*\n🌍 Country: *${country}*`,
          edit: m.key,
        });
        return true;
      }
      const d = res.data;
      await sock.sendMessage(jid, {
        text:
          `📞 *PHONE LOOKUP*\n━━━━━━━━━━━━━━\n` +
          `📱 Number: *${d.number || text}*\n` +
          `🌍 Country: *${d.country || 'N/A'}*\n` +
          `📡 Carrier: *${d.carrier || d.provider || 'N/A'}*\n` +
          `📍 Location: *${d.location || d.state || 'N/A'}*\n` +
          `📶 Type: *${d.type || d.line_type || 'N/A'}*`,
        edit: m.key,
      });
      break;
    }

    default:
      return false;
  }
  return true;
}
