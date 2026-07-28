import {
  tiktokDL, ytDL, ytInfo, igDL, fbDL, twitterDL,
  spotifySearch, soundcloudDL, mediafireDL, pinterestDL,
  fetchBuffer,
} from '../lib/api.js';
import { downloadMedia } from '../lib/utils.js';

export async function handleDownload(sock, msg, { command, args, jid, sender, text, reply, quotedMsg }) {
  switch (command) {

    // ── TikTok video ────────────────────────────────────────────────────────
    case 'tiktok':
    case 'tt': {
      if (!text) return reply('❌ Usage: .tiktok <url>');
      const m = await reply('⬇️ Downloading TikTok...');
      const res = await tiktokDL(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const videoUrl = d.videoUrl || d.video || d.playAddr || d.play;
      if (!videoUrl) {
        await sock.sendMessage(jid, { text: '❌ No video URL found.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, { text: '📥 Sending...', edit: m.key });
      const buf = await fetchBuffer(videoUrl);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch video.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        video: buf,
        caption: `🎵 ${d.title || d.desc || 'TikTok'}\n👤 ${d.author || d.nickname || ''}`,
        mimetype: 'video/mp4',
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── TikTok audio ────────────────────────────────────────────────────────
    case 'tiktokmp3':
    case 'ttmp3': {
      if (!text) return reply('❌ Usage: .tiktokmp3 <url>');
      const m = await reply('🎵 Extracting TikTok audio...');
      const res = await tiktokDL(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const audioUrl = d.music || d.audioUrl || d.musicUrl;
      if (!audioUrl) {
        await sock.sendMessage(jid, { text: '❌ No audio URL found.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, { text: '📥 Sending audio...', edit: m.key });
      const buf = await fetchBuffer(audioUrl);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch audio.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        audio: buf,
        mimetype: 'audio/mp4',
        ptt: false,
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── YouTube search ──────────────────────────────────────────────────────
    case 'ytsearch':
    case 'yts': {
      if (!text) return reply('❌ Usage: .ytsearch <query>');
      const m = await reply('🔍 Searching YouTube...');
      const res = await ytInfo(text);
      if (!res.ok || !res.videos.length) {
        await sock.sendMessage(jid, { text: `❌ ${res.error || 'No results.'}`, edit: m.key });
        return true;
      }
      const list = res.videos.slice(0, 5).map((v, i) =>
        `${i + 1}. *${v.title}*\n   👤 ${v.author?.name || v.author}\n   ⏱ ${v.timestamp || v.duration?.timestamp}\n   🔗 ${v.url}`
      ).join('\n\n');
      await sock.sendMessage(jid, {
        text: `🎬 *YOUTUBE RESULTS*\n━━━━━━━━━━━━━\n\n${list}`,
        edit: m.key,
      });
      break;
    }

    // ── YouTube mp4 ─────────────────────────────────────────────────────────
    case 'ytmp4':
    case 'yt': {
      if (!text) return reply('❌ Usage: .ytmp4 <url or query>');
      const m = await reply('⬇️ Downloading YouTube video...');
      let url = text.trim();
      if (!url.includes('youtu')) {
        const s = await ytInfo(url);
        if (!s.ok || !s.videos.length) {
          await sock.sendMessage(jid, { text: '❌ No results found.', edit: m.key });
          return true;
        }
        url = s.videos[0].url;
      }
      const res = await ytDL(url, 'mp4');
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const videoUrl = d.url || d.video || d.download?.url || d.link;
      if (!videoUrl) {
        await sock.sendMessage(jid, { text: '❌ Download link not found.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, { text: '📥 Sending video...', edit: m.key });
      const buf = await fetchBuffer(videoUrl);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch video.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        video: buf,
        caption: `🎬 ${d.title || 'YouTube Video'}\n📦 ${(buf.length / 1024 / 1024).toFixed(1)} MB`,
        mimetype: 'video/mp4',
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── YouTube mp3 ─────────────────────────────────────────────────────────
    case 'ytmp3':
    case 'ymp3': {
      if (!text) return reply('❌ Usage: .ytmp3 <url or query>');
      const m = await reply('🎵 Downloading YouTube audio...');
      let url = text.trim();
      if (!url.includes('youtu')) {
        const s = await ytInfo(url);
        if (!s.ok || !s.videos.length) {
          await sock.sendMessage(jid, { text: '❌ No results found.', edit: m.key });
          return true;
        }
        url = s.videos[0].url;
      }
      const res = await ytDL(url, 'mp3');
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const audioUrl = d.url || d.audio || d.download?.url || d.link;
      if (!audioUrl) {
        await sock.sendMessage(jid, { text: '❌ Audio link not found.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, { text: '📥 Sending audio...', edit: m.key });
      const buf = await fetchBuffer(audioUrl);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch audio.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        audio: buf,
        mimetype: 'audio/mpeg',
        ptt: false,
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── Instagram ───────────────────────────────────────────────────────────
    case 'igdl':
    case 'ig': {
      if (!text) return reply('❌ Usage: .igdl <instagram url>');
      const m = await reply('⬇️ Downloading from Instagram...');
      const res = await igDL(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const mediaUrl = d.url || d.video || d.image || d.media;
      if (!mediaUrl) {
        await sock.sendMessage(jid, { text: '❌ Media link not found.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, { text: '📥 Sending...', edit: m.key });
      const buf = await fetchBuffer(mediaUrl);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch.', edit: m.key });
        return true;
      }
      const isVideo = d.type === 'video' || mediaUrl.includes('.mp4');
      if (isVideo) {
        await sock.sendMessage(jid, { video: buf, caption: d.caption || '📸 Instagram', mimetype: 'video/mp4' }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, { image: buf, caption: d.caption || '📸 Instagram', mimetype: 'image/jpeg' }, { quoted: msg });
      }
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── Facebook ────────────────────────────────────────────────────────────
    case 'fbdl':
    case 'fb': {
      if (!text) return reply('❌ Usage: .fbdl <facebook url>');
      const m = await reply('⬇️ Downloading from Facebook...');
      const res = await fbDL(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const videoUrl = d.url || d.hd || d.sd || d.video;
      if (!videoUrl) {
        await sock.sendMessage(jid, { text: '❌ Video link not found.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, { text: '📥 Sending video...', edit: m.key });
      const buf = await fetchBuffer(videoUrl);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, { video: buf, caption: d.title || '📘 Facebook', mimetype: 'video/mp4' }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── Twitter/X ───────────────────────────────────────────────────────────
    case 'twitter':
    case 'twdl':
    case 'xdl': {
      if (!text) return reply('❌ Usage: .twitter <url>');
      const m = await reply('⬇️ Downloading from Twitter/X...');
      const res = await twitterDL(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const videoUrl = d.url || d.video || d.hd || d.sd;
      if (!videoUrl) {
        await sock.sendMessage(jid, { text: '❌ Video link not found.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, { text: '📥 Sending...', edit: m.key });
      const buf = await fetchBuffer(videoUrl);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, { video: buf, caption: d.text || d.caption || '🐦 Twitter/X', mimetype: 'video/mp4' }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── Spotify ─────────────────────────────────────────────────────────────
    case 'spotify': {
      if (!text) return reply('❌ Usage: .spotify <song name>');
      const m = await reply('🎵 Searching Spotify...');
      const res = await spotifySearch(text);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const info =
        `🎵 *SPOTIFY RESULT*\n━━━━━━━━━━━━━━\n` +
        `🎤 Title: *${d.title || d.name || '?'}*\n` +
        `👤 Artist: *${d.artist || d.artists?.join(', ') || '?'}*\n` +
        `💿 Album: *${d.album || '?'}*\n` +
        `⏱ Duration: *${d.duration || '?'}*\n` +
        `🔗 ${d.url || d.link || d.preview_url || ''}`;
      if (d.image || d.thumbnail || d.cover) {
        const imgBuf = await fetchBuffer(d.image || d.thumbnail || d.cover);
        if (imgBuf) {
          await sock.sendMessage(jid, { image: imgBuf, caption: info, mimetype: 'image/jpeg' }, { quoted: msg });
          await sock.sendMessage(jid, { delete: m.key });
          break;
        }
      }
      await sock.sendMessage(jid, { text: info, edit: m.key });
      break;
    }

    // ── Play (YouTube audio by search) ──────────────────────────────────────
    case 'play':
    case 'song': {
      if (!text) return reply('❌ Usage: .play <song name>');
      const m = await reply('🎵 Searching song...');
      const s = await ytInfo(text);
      if (!s.ok || !s.videos.length) {
        await sock.sendMessage(jid, { text: '❌ Song not found.', edit: m.key });
        return true;
      }
      const v = s.videos[0];
      await sock.sendMessage(jid, { text: `🎵 Found: *${v.title}*\n⬇️ Downloading...`, edit: m.key });
      const res = await ytDL(v.url, 'mp3');
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const audioUrl = res.data?.url || res.data?.audio || res.data?.download?.url || res.data?.link;
      if (!audioUrl) {
        await sock.sendMessage(jid, { text: '❌ Audio link not found.', edit: m.key });
        return true;
      }
      const buf = await fetchBuffer(audioUrl);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch audio.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        audio: buf,
        mimetype: 'audio/mpeg',
        ptt: false,
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── Video by search ─────────────────────────────────────────────────────
    case 'video':
    case 'vid': {
      if (!text) return reply('❌ Usage: .video <query>');
      const m = await reply('🎬 Searching video...');
      const s = await ytInfo(text);
      if (!s.ok || !s.videos.length) {
        await sock.sendMessage(jid, { text: '❌ Video not found.', edit: m.key });
        return true;
      }
      const v = s.videos[0];
      await sock.sendMessage(jid, { text: `🎬 Found: *${v.title}*\n⬇️ Downloading...`, edit: m.key });
      const res = await ytDL(v.url, 'mp4');
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const videoUrl = res.data?.url || res.data?.video || res.data?.download?.url || res.data?.link;
      if (!videoUrl) {
        await sock.sendMessage(jid, { text: '❌ Video link not found.', edit: m.key });
        return true;
      }
      const buf = await fetchBuffer(videoUrl);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch video.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        video: buf,
        caption: `🎬 ${v.title}`,
        mimetype: 'video/mp4',
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── SoundCloud ──────────────────────────────────────────────────────────
    case 'soundcloud':
    case 'sc': {
      if (!text) return reply('❌ Usage: .soundcloud <url>');
      const m = await reply('🎵 Downloading from SoundCloud...');
      const res = await soundcloudDL(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const audioUrl = d.url || d.audio || d.download;
      if (!audioUrl) {
        await sock.sendMessage(jid, { text: '❌ Audio link not found.', edit: m.key });
        return true;
      }
      const buf = await fetchBuffer(audioUrl);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch audio.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── MediaFire ───────────────────────────────────────────────────────────
    case 'mediafire':
    case 'mf': {
      if (!text) return reply('❌ Usage: .mediafire <url>');
      const m = await reply('⬇️ Getting MediaFire link...');
      const res = await mediafireDL(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        text: `📁 *MEDIAFIRE*\n━━━━━━━━━━━━━━\n🔗 Direct link:\n${res.url}`,
        edit: m.key,
      });
      break;
    }

    // ── Pinterest ───────────────────────────────────────────────────────────
    case 'pindl':
    case 'pinterest': {
      if (!text) return reply('❌ Usage: .pindl <pinterest url>');
      const m = await reply('⬇️ Downloading from Pinterest...');
      const res = await pinterestDL(text.trim());
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const d = res.data;
      const mediaUrl = d.url || d.image || d.video;
      if (!mediaUrl) {
        await sock.sendMessage(jid, { text: '❌ Media link not found.', edit: m.key });
        return true;
      }
      const buf = await fetchBuffer(mediaUrl);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, { image: buf, caption: '📌 Pinterest', mimetype: 'image/jpeg' }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    // ── Media info ──────────────────────────────────────────────────────────
    case 'mediainfo': {
      if (!text) return reply('❌ Usage: .mediainfo <url>');
      const m = await reply('🔍 Checking media info...');
      const { default: axios } = await import('axios');
      try {
        const head = await axios.head(text.trim(), { timeout: 10000 });
        const ct = head.headers['content-type'] || 'unknown';
        const cl = head.headers['content-length'];
        const size = cl ? `${(parseInt(cl) / 1024 / 1024).toFixed(2)} MB` : 'unknown';
        await sock.sendMessage(jid, {
          text: `ℹ️ *MEDIA INFO*\n━━━━━━━━━━━━━━\n🔗 URL: ${text.trim().slice(0, 60)}...\n📄 Type: *${ct}*\n📦 Size: *${size}*`,
          edit: m.key,
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ ${e.message}`, edit: m.key });
      }
      break;
    }

    default:
      return false;
  }
  return true;
}
