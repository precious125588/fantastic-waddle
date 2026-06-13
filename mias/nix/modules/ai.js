/**
 * NIX — AI Assistant Module
 */
import { getOwnerName, greet } from '../owner.js';
import { stagedSend, sendNix, reactNix, nixFooter, typingOn, typingOff, wait } from '../ui.js';
import { nixAiChat, prexzyGet } from '../api.js';

async function doAI(sock, msg, prompt, system = '', stages = 3) {
  const jid = msg.key.remoteJid;
  await typingOn(sock, jid);
  const result = await nixAiChat(prompt, system);
  await typingOff(sock, jid);
  if (!result) {
    await sendNix(sock, msg, `❌ Nix AI is currently unable to process this request. Please try again.${nixFooter()}`);
    return;
  }
  return result;
}

export async function aiChat(sock, msg, args) {
  const owner = getOwnerName();
  const prompt = args.join(' ');
  if (!prompt) {
    await sendNix(sock, msg, `🤖 *Nix AI*\n\nUsage: \`.nix ai <your message>\`\nExample: \`.nix ai explain black holes\`\nOr: "Nix ai what is quantum physics"${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🤖');
  const system = `You are Nix, a smart and helpful WhatsApp AI assistant for ${owner}. Be concise, clear, and professional. Use simple formatting.`;
  const result = await doAI(sock, msg, prompt, system);
  if (result) {
    await stagedSend(sock, msg, `🤖 *Nix AI*\n\n${result}${nixFooter()}`, { skipStages: true });
  }
}

export async function summarize(sock, msg, args) {
  const owner = getOwnerName();
  const text = args.join(' ') || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '';
  if (!text) {
    await sendNix(sock, msg, `📝 *Summarize*\n\nUsage: \`.nix summarize <text>\`\nOr reply to a message with \`.nix summarize\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '📝');
  const result = await doAI(sock, msg, `Summarize this text concisely in bullet points:\n\n${text}`);
  if (result) {
    await stagedSend(sock, msg, `📝 *Summary*\n\n${result}${nixFooter()}`, { skipStages: true });
  }
}

export async function rewrite(sock, msg, args) {
  const text = args.join(' ') || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '';
  if (!text) {
    await sendNix(sock, msg, `✏️ *Rewrite*\n\nUsage: \`.nix rewrite <text>\`\nOr reply to a message with \`.nix rewrite\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '✏️');
  const result = await doAI(sock, msg, `Rewrite and improve this text while keeping the same meaning:\n\n${text}`);
  if (result) {
    await stagedSend(sock, msg, `✏️ *Rewritten*\n\n${result}${nixFooter()}`, { skipStages: true });
  }
}

export async function translate(sock, msg, args) {
  if (args.length < 2) {
    await sendNix(sock, msg, `🌐 *Translate*\n\nUsage: \`.nix translate <language> <text>\`\nExample: \`.nix translate French Hello how are you\`${nixFooter()}`);
    return;
  }
  const lang = args[0];
  const text = args.slice(1).join(' ');
  await reactNix(sock, msg, '🌐');
  const result = await doAI(sock, msg, `Translate this text to ${lang}. Only return the translation, nothing else:\n\n${text}`);
  if (result) {
    await stagedSend(sock, msg, `🌐 *Translated to ${lang}*\n\n📝 Original: _${text}_\n\n✅ Translation: *${result}*${nixFooter()}`, { skipStages: true });
  }
}

export async function explain(sock, msg, args) {
  const text = args.join(' ') || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '';
  if (!text) {
    await sendNix(sock, msg, `💡 *Explain*\n\nUsage: \`.nix explain <text or topic>\`\nOr reply to a message.${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '💡');
  const result = await doAI(sock, msg, `Explain this in simple, easy-to-understand terms:\n\n${text}`);
  if (result) {
    await stagedSend(sock, msg, `💡 *Explanation*\n\n${result}${nixFooter()}`, { skipStages: true });
  }
}

export async function poem(sock, msg, args) {
  const topic = args.join(' ');
  if (!topic) {
    await sendNix(sock, msg, `🎭 *Poem*\n\nUsage: \`.nix poem <topic>\`\nExample: \`.nix poem the ocean at night\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🎭');
  const result = await doAI(sock, msg, `Write a beautiful, creative poem about: ${topic}. Make it 3-4 stanzas.`);
  if (result) {
    await stagedSend(sock, msg, `🎭 *Poem: ${topic}*\n\n${result}${nixFooter()}`, { skipStages: true });
  }
}

export async function story(sock, msg, args) {
  const topic = args.join(' ');
  if (!topic) {
    await sendNix(sock, msg, `📖 *Story*\n\nUsage: \`.nix story <topic>\`\nExample: \`.nix story a robot who learned to love\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '📖');
  const result = await doAI(sock, msg, `Write a short, engaging story (3-4 paragraphs) about: ${topic}`);
  if (result) {
    await stagedSend(sock, msg, `📖 *Story: ${topic}*\n\n${result}${nixFooter()}`, { skipStages: true });
  }
}

export async function code(sock, msg, args) {
  if (args.length < 2) {
    await sendNix(sock, msg, `💻 *Code Generator*\n\nUsage: \`.nix code <language> <task>\`\nExample: \`.nix code Python sort a list of numbers\`${nixFooter()}`);
    return;
  }
  const lang = args[0];
  const task = args.slice(1).join(' ');
  await reactNix(sock, msg, '💻');
  const result = await doAI(sock, msg, `Write clean ${lang} code to: ${task}. Include brief comments. Format as code.`);
  if (result) {
    await stagedSend(sock, msg, `💻 *${lang} Code*\n\n\`\`\`\n${result}\n\`\`\`${nixFooter()}`, { skipStages: true });
  }
}

export async function fixCode(sock, msg, args) {
  const codeText = args.join(' ') || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '';
  if (!codeText) {
    await sendNix(sock, msg, `🔧 *Fix Code*\n\nUsage: \`.nix fix <code>\`\nOr reply to a code message with \`.nix fix\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🔧');
  const result = await doAI(sock, msg, `Find and fix the bugs in this code. Explain what was wrong and provide the corrected version:\n\n${codeText}`);
  if (result) {
    await stagedSend(sock, msg, `🔧 *Code Fix*\n\n${result}${nixFooter()}`, { skipStages: true });
  }
}

export async function roast(sock, msg, args) {
  const target = args.join(' ');
  if (!target) {
    await sendNix(sock, msg, `🔥 *Roast*\n\nUsage: \`.nix roast <something/someone>\`\nExample: \`.nix roast my coding skills\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🔥');
  const result = await doAI(sock, msg, `Write a funny, creative, and harmless roast about: ${target}. Keep it playful and not offensive.`);
  if (result) {
    await stagedSend(sock, msg, `🔥 *Roast*\n\n${result}${nixFooter()}`, { skipStages: true });
  }
}

export async function define(sock, msg, args) {
  const word = args[0];
  if (!word) {
    await sendNix(sock, msg, `📚 *Define*\n\nUsage: \`.nix define <word>\`\nExample: \`.nix define serendipity\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '📚');
  try {
    const r = await prexzyGet('/tools/dictionary', { word });
    if (r.ok) {
      const d = r.data?.data || r.data;
      const def = d?.definition || d?.meaning || d?.result;
      if (def) {
        await sendNix(sock, msg, `📚 *Definition: ${word}*\n\n${def}${nixFooter()}`);
        return;
      }
    }
  } catch {}
  const result = await doAI(sock, msg, `Define the word "${word}". Include: 1. Definition, 2. Part of speech, 3. Example sentence. Keep it concise.`);
  if (result) {
    await stagedSend(sock, msg, `📚 *Definition: ${word}*\n\n${result}${nixFooter()}`, { skipStages: true });
  }
}

export async function synonym(sock, msg, args) {
  const word = args[0];
  if (!word) {
    await sendNix(sock, msg, `🔤 *Synonyms*\n\nUsage: \`.nix synonym <word>\`\nExample: \`.nix synonym happy\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🔤');
  const result = await doAI(sock, msg, `List 10 synonyms for the word "${word}". Format as a numbered list. Also include antonyms if relevant.`);
  if (result) {
    await stagedSend(sock, msg, `🔤 *Synonyms for "${word}"*\n\n${result}${nixFooter()}`, { skipStages: true });
  }
}
