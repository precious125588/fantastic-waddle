import { askGPT, askGemini, imagineAI, fetchBuffer } from '../lib/api.js';

export async function handleAI(sock, msg, { command, args, jid, sender, text, reply, quotedMsg }) {
  switch (command) {

    case 'gpt':
    case 'ai':
    case 'chatgpt': {
      if (!text) return reply('❌ Usage: .gpt <your question>');
      const m = await reply('🤖 Thinking...');
      const res = await askGPT(text);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        text: `🤖 *GPT*\n━━━━━━━━━━━━━━\n❓ ${text}\n\n💬 ${res.result}`,
        edit: m.key,
      });
      break;
    }

    case 'gemini': {
      if (!text) return reply('❌ Usage: .gemini <your question>');
      const m = await reply('✨ Asking Gemini...');
      const res = await askGemini(text);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        text: `✨ *GEMINI*\n━━━━━━━━━━━━━━\n❓ ${text}\n\n💬 ${res.result}`,
        edit: m.key,
      });
      break;
    }

    case 'ask': {
      if (!text) return reply('❌ Usage: .ask <question>');
      const m = await reply('🤔 Processing...');
      const res = await askGPT(text);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        text: `💡 *ANSWER*\n━━━━━━━━━━━━━━\n${res.result}`,
        edit: m.key,
      });
      break;
    }

    case 'imagine':
    case 'ai2img':
    case 'aiimage': {
      if (!text) return reply('❌ Usage: .imagine <prompt>');
      const m = await reply('🎨 Generating image...');
      const res = await imagineAI(text);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      const buf = await fetchBuffer(res.url);
      if (!buf) {
        await sock.sendMessage(jid, { text: '❌ Failed to fetch generated image.', edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        image: buf,
        caption: `🎨 *AI IMAGE*\n✏️ Prompt: ${text}`,
        mimetype: 'image/jpeg',
      }, { quoted: msg });
      await sock.sendMessage(jid, { delete: m.key });
      break;
    }

    case 'codeai':
    case 'code': {
      if (!text) return reply('❌ Usage: .codeai <coding question>');
      const m = await reply('💻 Generating code...');
      const res = await askGPT(`Write code for: ${text}. Only respond with code and brief explanation.`);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        text: `💻 *CODE AI*\n━━━━━━━━━━━━━━\n📝 ${text}\n\n\`\`\`\n${res.result}\n\`\`\``,
        edit: m.key,
      });
      break;
    }

    case 'rewrite': {
      if (!text) return reply('❌ Usage: .rewrite <text to rewrite>');
      const m = await reply('✍️ Rewriting...');
      const res = await askGPT(`Rewrite this text in a better way: "${text}"`);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        text: `✍️ *REWRITE*\n━━━━━━━━━━━━━━\n📝 Original:\n${text}\n\n✅ Rewritten:\n${res.result}`,
        edit: m.key,
      });
      break;
    }

    case 'summarize':
    case 'summary': {
      if (!text) return reply('❌ Usage: .summarize <text to summarize>');
      const m = await reply('📝 Summarizing...');
      const res = await askGPT(`Summarize this in 3-5 bullet points: "${text}"`);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        text: `📝 *SUMMARY*\n━━━━━━━━━━━━━━\n${res.result}`,
        edit: m.key,
      });
      break;
    }

    case 'poem': {
      if (!text) return reply('❌ Usage: .poem <topic>');
      const m = await reply('📜 Writing poem...');
      const res = await askGPT(`Write a short beautiful poem about: "${text}"`);
      if (!res.ok) {
        await sock.sendMessage(jid, { text: `❌ ${res.error}`, edit: m.key });
        return true;
      }
      await sock.sendMessage(jid, {
        text: `📜 *POEM: ${text.toUpperCase()}*\n━━━━━━━━━━━━━━\n${res.result}`,
        edit: m.key,
      });
      break;
    }

    default:
      return false;
  }
  return true;
}
