'use strict';
/**
 * nexray_bot.js — All new NexRay-powered commands for MIAS MDX bot.
 * Uses the bot's own cmd() system (not addcmd).
 * Called from the bottom of mias/index.js via require('./nexray_bot').
 *
 * module.exports = function(cmd, CONFIG, sendReply, react, downloadContentFromMessage, axios, nx)
 */

// ── helpers shared across all handlers ────────────────────────────────────────
const _isImgBuf = (b) => b && b.length > 500 && (b[0] === 0xFF || b[0] === 0x89 || b[0] === 0x47 || b[0] === 0x42 || b[0] === 0x52);
const _isAudBuf = (b) => b && b.length > 500 && (b.slice(0,3).toString('utf8') === 'ID3' || (b[0]===0xFF && (b[1]&0xE0)===0xE0) || b.slice(0,4).toString('ascii')==='OggS');
const _isVidBuf = (b) => b && b.length > 1000 && (b.slice(4,8).toString('ascii')==='ftyp' || b.slice(0,12).toString('ascii').includes('moov') || b.slice(0,12).toString('ascii').includes('mdat'));

// Resolve NexRay response to buffer (for image/media endpoints)
async function _nxMedia(res, axiosInst) {
  if (!res) return null;
  if (res.type === 'media' && Buffer.isBuffer(res.buffer) && res.buffer.length > 500) return res.buffer;
  const url = res?.result?.url || res?.data?.url || res?.url || res?.image;
  if (url) {
    try {
      const r = await axiosInst.get(url, { responseType: 'arraybuffer', timeout: 60000 });
      return Buffer.from(r.data);
    } catch {}
  }
  return null;
}

// Resolve NexRay response to text
function _nxText(res) {
  if (!res) return null;
  return res?.result || res?.data?.result || res?.data?.message || res?.answer || res?.text || res?.message || null;
}

module.exports = function registerNexrayCmds(cmd, CONFIG, sendReply, react, downloadContentFromMessage, axios, nx) {
  if (!nx) {
    console.error('[nexray_bot] nx is null — NexRay wrapper not loaded, skipping registration.');
    return;
  }
  const P = CONFIG.PREFIX || '.';

  // ──────────────────────────────────────────────────────────────────────────
  // AI COMMANDS
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['alisia', 'ai-alisia'], { desc: 'Chat with Alisia AI — .alisia <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}alisia <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.alisia({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *Alisia AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Alisia error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['andisearch', 'andi'], { desc: 'Andi AI web search — .andisearch <query>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}andisearch <query>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.andisearch({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🔍 *Andi Search*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['bypass', 'humanize'], { desc: 'Bypass/humanize AI-generated text — .bypass <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}bypass <text to humanize>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.bypass({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `✅ *Humanized Text*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['nxclaude', 'claudeai'], { desc: 'Chat with Claude AI — .nxclaude <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}nxclaude <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.claude({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *Claude AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['copilot', 'nxcopilot'], { desc: 'Chat with Microsoft Copilot — .copilot <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}copilot <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.copilot({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *Copilot*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['deepimg', 'aiimage2'], { desc: 'Generate image with DeepAI — .deepimg <prompt>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}deepimg <prompt>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.ai.deepimg({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🖼️ *DeepAI*\n${args.join(' ')}` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['deepsearch', 'nxdeepsearch'], { desc: 'DeepSearch AI — .deepsearch <query>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}deepsearch <query>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.deepsearch({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🔍 *DeepSearch*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['dolphinai', 'dolphin'], { desc: 'Dolphin AI chat — .dolphinai <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}dolphinai <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.dolphin({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🐬 *Dolphin AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['dreamanalyze', 'analisdream'], { desc: 'Analyze your dream — .dreamanalyze <dream description>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}dreamanalyze <your dream>`);
    await react(sock, msg, '🌙');
    try {
      const r = await nx.ai.dreamanalyze({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🌙 *Dream Analysis*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['duckai', 'duckduck'], { desc: 'DuckDuckGo AI chat — .duckai <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}duckai <your question>`);
    await react(sock, msg, '🦆');
    try {
      const r = await nx.ai.duck({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🦆 *DuckDuckGo AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['epsilon', 'epsilonai'], { desc: 'Epsilon AI chat — .epsilon <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}epsilon <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.epsilon({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *Epsilon AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['feloai', 'felo'], { desc: 'Felo AI search — .feloai <query>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}feloai <query>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.felo({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🔍 *Felo AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['geminitts', 'gtts2'], { desc: 'Gemini text-to-speech — .geminitts <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}geminitts <text to speak>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.ai.geminiTts({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios);
      if (buf && _isAudBuf(buf)) {
        await sock.sendMessage(msg.key.remoteJid, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
      } else { throw new Error('No audio'); }
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['gitagpt', 'gita'], { desc: 'Bhagavad Gita AI answers — .gitagpt <question>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}gitagpt <your question>`);
    await react(sock, msg, '🕉️');
    try {
      const r = await nx.ai.gitagpt({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🕉️ *Bhagavad Gita AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['glmai', 'glm'], { desc: 'GLM AI chat — .glmai <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}glmai <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.glm({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *GLM AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['gpt35', 'nxgpt3'], { desc: 'GPT-3.5 chat — .gpt35 <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}gpt35 <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.gpt35({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *GPT-3.5*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['ideogram', 'ideoimg'], { desc: 'Generate image with Ideogram AI — .ideogram <prompt>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}ideogram <image prompt>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.ai.ideogram({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🖼️ *Ideogram AI*\n${args.join(' ')}` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['img2prompt', 'image2prompt'], { desc: 'Generate prompt from image — reply to image with .img2prompt', category: 'AI' }, async (sock, msg, args) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM) return sendReply(sock, msg, `Reply to an image with ${P}img2prompt`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.ai.image2prompt({ url: _url });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `✍️ *Image Prompt*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['islamcity', 'islamicity'], { desc: 'Islamic Q&A — .islamcity <question>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}islamcity <your Islamic question>`);
    await react(sock, msg, '☪️');
    try {
      const r = await nx.ai.islamcity({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `☪️ *IslamCity*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['islamicai', 'islamai'], { desc: 'Islamic AI Q&A — .islamicai <question>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}islamicai <your question>`);
    await react(sock, msg, '☪️');
    try {
      const r = await nx.ai.islamic({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `☪️ *Islamic AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['kimiAI', 'kimi'], { desc: 'Kimi AI chat — .kimi <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}kimi <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.kimi({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *Kimi AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['luminai', 'lumin'], { desc: 'Lumin AI — .luminai <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}luminai <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.lumin({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *Lumin AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['magicstudio', 'magicimg'], { desc: 'Magic Studio image generation — .magicstudio <prompt>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}magicstudio <image prompt>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.ai.magicstudio({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `✨ *Magic Studio*\n${args.join(' ')}` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['mathgpt', 'mathsolve'], { desc: 'Solve math problems — .mathgpt <problem>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}mathgpt <math problem>`);
    await react(sock, msg, '🧮');
    try {
      const r = await nx.ai.mathgpt({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🧮 *MathGPT*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['monicaai', 'monica'], { desc: 'Monica AI chat — .monicaai <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}monicaai <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.monica({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *Monica AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['nexrayai', 'nxai'], { desc: 'NexRay AI chat — .nexrayai <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}nexrayai <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.nexray({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *NexRay AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['perplexityai', 'perplexity'], { desc: 'Perplexity AI search — .perplexityai <query>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}perplexityai <query>`);
    await react(sock, msg, '🔍');
    try {
      const r = await nx.ai.perplexity({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🔍 *Perplexity AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['quillbot', 'paraphrase'], { desc: 'Paraphrase text with QuillBot — .quillbot <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}quillbot <text to paraphrase>`);
    await react(sock, msg, '✍️');
    try {
      const r = await nx.ai.quillbot({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `✍️ *QuillBot Paraphrase*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['simisimi', 'simi'], { desc: 'Chat with SimiSimi — .simisimi <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}simisimi <your message>`);
    await react(sock, msg, '💬');
    try {
      const r = await nx.ai.simisimi({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `💬 *SimiSimi*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['ailogo', 'sologo'], { desc: 'Generate logo with AI — .ailogo <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}ailogo <logo text>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.ai.sologo({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🎨 *AI Logo*\n${args.join(' ')}` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['aistory', 'cerita'], { desc: 'Generate a short story with AI — .aistory <theme>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}aistory <story theme>`);
    await react(sock, msg, '📖');
    try {
      const r = await nx.ai.story({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `📖 *AI Story*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['aimusic', 'suno'], { desc: 'Generate music with Suno AI — .aimusic <description>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}aimusic <music description>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.ai.suno({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios);
      if (buf && _isAudBuf(buf)) {
        await sock.sendMessage(msg.key.remoteJid, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
      } else {
        const t = _nxText(r); if (!t) throw new Error('No audio/response');
        await sendReply(sock, msg, `🎵 *Suno AI Music*\n\n${t}`);
      }
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['turbochat', 'turbo'], { desc: 'TurboChat AI — .turbochat <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}turbochat <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.turbochat({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *TurboChat AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['veniceai', 'venice'], { desc: 'Venice AI chat — .veniceai <text>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}veniceai <your question>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.ai.venice({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤖 *Venice AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['veo2', 'aivideo'], { desc: 'Generate video with Veo2 AI — .veo2 <prompt>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}veo2 <video prompt>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.ai.veo2({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios);
      if (buf && buf.length > 1000) {
        await sock.sendMessage(msg.key.remoteJid, { video: buf, mimetype: 'video/mp4', caption: `🎬 *Veo2 AI Video*\n${args.join(' ')}` }, { quoted: msg });
      } else { throw new Error('No video generated'); }
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['veo3', 'aivideo3'], { desc: 'Generate video with Veo3 AI — .veo3 <prompt>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}veo3 <video prompt>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.ai.veo3({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios);
      if (buf && buf.length > 1000) {
        await sock.sendMessage(msg.key.remoteJid, { video: buf, mimetype: 'video/mp4', caption: `🎬 *Veo3 AI Video*\n${args.join(' ')}` }, { quoted: msg });
      } else { throw new Error('No video generated'); }
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['webpilot', 'browseweb'], { desc: 'Browse/summarize a website — .webpilot <url>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}webpilot <website url>`);
    await react(sock, msg, '🌐');
    try {
      const r = await nx.ai.webpilot({ url: args[0] });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🌐 *WebPilot*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['writesonic', 'aiwrite'], { desc: 'AI writing assistant — .writesonic <topic>', category: 'AI' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}writesonic <writing topic>`);
    await react(sock, msg, '✍️');
    try {
      const r = await nx.ai.writesonic({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `✍️ *WriteSonic AI*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // CANVAS COMMANDS
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['ship', 'shipcouple'], { desc: 'Ship two names together — .ship <name1> <name2>', category: 'CANVAS' }, async (sock, msg, args) => {
    if (args.length < 2) return sendReply(sock, msg, `Usage: ${P}ship <name1> <name2>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.canvas.ship({ username1: args[0], username2: args[1] });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `❤️ *Ship: ${args[0]} × ${args[1]}*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['lirikcard', 'lyriccard'], { desc: 'Generate lyric card — .lirikcard <text>', category: 'CANVAS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}lirikcard <song lyric text>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.canvas.lirik({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🎵 *Lyric Card*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['cangura', 'guracard'], { desc: 'Generate Gura canvas — .cangura <text>', category: 'CANVAS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}cangura <text>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.canvas.gura({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🦈 *Gura Canvas*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['canwanted', 'wantedcard'], { desc: 'Generate WANTED card — .canwanted <text>', category: 'CANVAS' }, async (sock, msg, args) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    const text = args.join(' ') || 'WANTED';
    if (!_imgM) return sendReply(sock, msg, `Reply to an image with ${P}canwanted [text]`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.canvas.wanted({ url: _url, text });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🔫 *WANTED*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['canwasted', 'wasted'], { desc: 'WASTED effect on image — reply to image with .wasted', category: 'CANVAS' }, async (sock, msg) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM) return sendReply(sock, msg, `Reply to an image with ${P}wasted`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.canvas.wasted({ url: _url });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `💀 *WASTED*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['pixelate', 'pixelimg'], { desc: 'Pixelate an image — reply to image with .pixelate', category: 'CANVAS' }, async (sock, msg) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM) return sendReply(sock, msg, `Reply to an image with ${P}pixelate`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.canvas.pixelate({ url: _url });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🔲 *Pixelated*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['glasseffect', 'glassimg'], { desc: 'Glass effect on image — reply to image with .glasseffect', category: 'CANVAS' }, async (sock, msg) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM) return sendReply(sock, msg, `Reply to an image with ${P}glasseffect`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.canvas.glass({ url: _url });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🪟 *Glass Effect*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['rainboweffect', 'rainbowimg'], { desc: 'Rainbow effect on image — reply to image with .rainboweffect', category: 'CANVAS' }, async (sock, msg) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM) return sendReply(sock, msg, `Reply to an image with ${P}rainboweffect`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.canvas.rainbow({ url: _url });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🌈 *Rainbow Effect*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // BERITA / NEWS (Indonesian)
  // ──────────────────────────────────────────────────────────────────────────
  const _beritaSources = [
    ['antara','antara'],['cnbcindonesia','cnbc'],['cnnindonesia','cnni'],
    ['detik','detik'],['kompas','kompas'],['liputan6','liputan6'],
    ['okezone','okezone'],['suara','suara'],['tempo','tempo'],['tribun','tribun'],
  ];
  for (const [cmd_name, src] of _beritaSources) {
    const _src = src;
    cmd([`berita${cmd_name}`, `news${cmd_name}`], { desc: `Latest news from ${cmd_name} — .berita${cmd_name}`, category: 'INFO' }, async (sock, msg) => {
      await react(sock, msg, '📰');
      try {
        const r = await nx.berita[_src]({});
        const items = r?.result || r?.data || r;
        if (!Array.isArray(items) || !items.length) throw new Error('No news');
        const top = items.slice(0, 5);
        const text = `📰 *${cmd_name.toUpperCase()} News*\n━━━━━━━━━━━━━━━━━━━━\n` +
          top.map((n, i) => `${i+1}. *${n.title || n.judul || 'No title'}*\n   ${n.link || n.url || ''}`).join('\n\n');
        await sendReply(sock, msg, text);
        await react(sock, msg, '✅');
      } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DOWNLOADER (new platforms)
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['douyin', 'douyindl'], { desc: 'Download Douyin video — .douyin <url>', category: 'DOWNLOAD' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}douyin <douyin url>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.downloader.douyin({ url: args[0] });
      const url = r?.result?.url || r?.data?.url || r?.url;
      if (!url) throw new Error('No download URL');
      const buf = Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 90000 })).data);
      await sock.sendMessage(msg.key.remoteJid, { video: buf, mimetype: 'video/mp4', caption: '📱 *Douyin*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['gofiledl', 'gofile'], { desc: 'Download from Gofile — .gofiledl <url>', category: 'DOWNLOAD' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}gofiledl <gofile.io url>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.downloader.gofile({ url: args[0] });
      const url = r?.result?.url || r?.data?.url || r?.url;
      if (!url) { await sendReply(sock, msg, `📁 *GoFile*\n\nDirect link: ${r?.result || JSON.stringify(r?.data || r)}`); }
      else {
        const buf = Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 120000 })).data);
        await sock.sendMessage(msg.key.remoteJid, { document: buf, fileName: `gofile_${Date.now()}.bin`, mimetype: 'application/octet-stream', caption: '📁 *GoFile*' }, { quoted: msg });
      }
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['stickerwa', 'wasticker'], { desc: 'Download WhatsApp sticker pack — .stickerwa <url>', category: 'DOWNLOAD' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}stickerwa <wa.me/addstickers url>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.downloader.stickerwa({ url: args[0] });
      const url = r?.result?.url || r?.data?.url || r?.url;
      if (!url) throw new Error('No URL');
      const buf = Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 })).data);
      await sock.sendMessage(msg.key.remoteJid, { document: buf, fileName: 'stickers.zip', mimetype: 'application/zip', caption: '🗂️ *WhatsApp Stickers*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['threads', 'threadsdl'], { desc: 'Download Threads post — .threads <url>', category: 'DOWNLOAD' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}threads <threads url>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.downloader.threads({ url: args[0] });
      const url = r?.result?.url || r?.data?.url || r?.url;
      if (!url) throw new Error('No download URL');
      const buf = Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 90000 })).data);
      await sock.sendMessage(msg.key.remoteJid, { video: buf, mimetype: 'video/mp4', caption: '🧵 *Threads*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['vimeo', 'vimeodl'], { desc: 'Download Vimeo video — .vimeo <url>', category: 'DOWNLOAD' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}vimeo <vimeo url>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.downloader.vimeo({ url: args[0] });
      const url = r?.result?.url || r?.data?.url || r?.url;
      if (!url) throw new Error('No download URL');
      const buf = Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 120000 })).data);
      await sock.sendMessage(msg.key.remoteJid, { video: buf, mimetype: 'video/mp4', caption: '🎬 *Vimeo*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // EDITOR COMMANDS
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['editwanted', 'wantededit'], { desc: 'WANTED poster effect — reply to image with .editwanted [text]', category: 'EDITOR' }, async (sock, msg, args) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM) return sendReply(sock, msg, `Reply to an image with ${P}editwanted [text]`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.editor.wanted({ url: _url, text: args.join(' ') || 'WANTED' });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🔫 *WANTED*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['editwasted', 'wastededit'], { desc: 'WASTED effect — reply to image with .editwasted', category: 'EDITOR' }, async (sock, msg) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM) return sendReply(sock, msg, `Reply to an image with ${P}editwasted`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.editor.wasted({ url: _url });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `💀 *WASTED*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // EPHOTO COMMANDS — all 26 effects
  // ──────────────────────────────────────────────────────────────────────────
  const _ephotoEffects = [
    ['ephotofire','fire'],['ephotoneon','neon'],['ephotogalaxy','galaxy'],
    ['ephotoanime','anime'],['ephotoart','art'],['ephotoblood','blood'],
    ['ephotoblur','blur'],['ephotobokeh','bokeh'],['ephotobrokenglass','brokenglass'],
    ['ephotocartoon','cartoon'],['ephotoglitch','glitch'],['ephotogold','gold'],
    ['ephotograffiti','graffiti'],['ephotohacker','hacker'],['ephotoice','ice'],
    ['ephotolava','lava'],['ephotolightning','lightning'],['ephotomatrix','matrix'],
    ['ephotometal','metal'],['ephotoocean','ocean'],['ephotopixel','pixel'],
    ['ephotorainbow','rainbow'],['ephotoretro','retro'],['ephotosmoky','smoke'],
    ['ephotospace','space'],['ephotowood','wood'],
  ];
  for (const [cmd_name, effect] of _ephotoEffects) {
    const _effect = effect;
    cmd([cmd_name], { desc: `${_effect.toUpperCase()} photo effect — .${cmd_name} <name>`, category: 'EPHOTO' }, async (sock, msg, args) => {
      if (!args.length) return sendReply(sock, msg, `Usage: ${P}${cmd_name} <your name or text>`);
      await react(sock, msg, '🌀');
      try {
        const r = await nx.ephoto[_effect]({ name: args.join(' ') });
        const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
        await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `✨ *${_effect.toUpperCase()} Effect*\n_${args.join(' ')}_` }, { quoted: msg });
        await react(sock, msg, '✅');
      } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FUN COMMANDS
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['alay', 'alaytext'], { desc: 'Convert text to alay style — .alay <text>', category: 'FUN' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}alay <text>`);
    await react(sock, msg, '😄');
    try {
      const r = await nx.fun.alay({ text: args.join(' ') });
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `😄 *Alay Text*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['livefunfact', 'funfact2'], { desc: 'Get a fun fact — .livefunfact', category: 'FUN' }, async (sock, msg) => {
    await react(sock, msg, '🤩');
    try {
      const r = await nx.fun.livefunfact({});
      const t = _nxText(r); if (!t) throw new Error('No response');
      await sendReply(sock, msg, `🤩 *Fun Fact*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // GAMES COMMANDS
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['asahotak', 'tebakangka'], { desc: 'Number guessing game — .asahotak', category: 'GAMES' }, async (sock, msg) => {
    await react(sock, msg, '🎮');
    try {
      const r = await nx.games.asahotak({});
      const t = _nxText(r) || JSON.stringify(r?.data || r);
      await sendReply(sock, msg, `🎮 *Asah Otak*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['islamicquiz', 'quizislam'], { desc: 'Islamic quiz — .islamicquiz', category: 'GAMES' }, async (sock, msg) => {
    await react(sock, msg, '☪️');
    try {
      const r = await nx.games.islamicquiz({});
      const d = r?.result || r?.data || r;
      if (d?.question) {
        await sendReply(sock, msg, `☪️ *Islamic Quiz*\n━━━━━━━━━━━━━━━━━━━━\n\n❓ ${d.question}\n\nA. ${d.a || ''}\nB. ${d.b || ''}\nC. ${d.c || ''}\nD. ${d.d || ''}\n\n_Answer: ${d.answer || d.jawaban || '?'}_`);
      } else {
        await sendReply(sock, msg, `☪️ *Islamic Quiz*\n\n${_nxText(r) || 'No data'}`);
      }
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['susunkata', 'wordgame'], { desc: 'Word scramble game — .susunkata', category: 'GAMES' }, async (sock, msg) => {
    await react(sock, msg, '🔤');
    try {
      const r = await nx.games.susunkata({});
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : JSON.stringify(d);
      await sendReply(sock, msg, `🔤 *Susun Kata*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['tebakbendera', 'flagquiz'], { desc: 'Flag guessing game — .tebakbendera', category: 'GAMES' }, async (sock, msg) => {
    await react(sock, msg, '🏳️');
    try {
      const r = await nx.games.tebakbendera({});
      const buf = await _nxMedia(r, axios);
      const d = r?.result || r?.data || r;
      if (buf && _isImgBuf(buf)) {
        await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🏳️ *Tebak Bendera*\n_Whose flag is this?_\n\nAnswer: ${d?.answer || d?.jawaban || '?'}` }, { quoted: msg });
      } else {
        await sendReply(sock, msg, `🏳️ *Tebak Bendera*\n\n${_nxText(r) || JSON.stringify(d)}`);
      }
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['tebakgambar', 'picquiz'], { desc: 'Picture guessing game — .tebakgambar', category: 'GAMES' }, async (sock, msg) => {
    await react(sock, msg, '🖼️');
    try {
      const r = await nx.games.tebakgambar({});
      const buf = await _nxMedia(r, axios);
      const d = r?.result || r?.data || r;
      if (buf && _isImgBuf(buf)) {
        await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🖼️ *Tebak Gambar*\n_What is this?_\n\nAnswer: ${d?.answer || d?.jawaban || '?'}` }, { quoted: msg });
      } else {
        await sendReply(sock, msg, `🖼️ *Tebak Gambar*\n\n${_nxText(r) || JSON.stringify(d)}`);
      }
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['tebakkata', 'wordquiz'], { desc: 'Word quiz game — .tebakkata', category: 'GAMES' }, async (sock, msg) => {
    await react(sock, msg, '❓');
    try {
      const r = await nx.games.tebakkata({});
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : (d?.question ? `❓ ${d.question}\n\nAnswer: ${d.answer || d.jawaban || '?'}` : JSON.stringify(d));
      await sendReply(sock, msg, `❓ *Tebak Kata*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['tebaklirik', 'lyricquiz'], { desc: 'Guess the song from lyrics — .tebaklirik', category: 'GAMES' }, async (sock, msg) => {
    await react(sock, msg, '🎵');
    try {
      const r = await nx.games.tebaklirik({});
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : (d?.lirik ? `🎵 _${d.lirik}_\n\nAnswer: ${d.answer || d.jawaban || '?'}` : JSON.stringify(d));
      await sendReply(sock, msg, `🎵 *Tebak Lirik*\n\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // INFORMATION COMMANDS
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['harilibur', 'publicholiday'], { desc: 'Indonesian public holidays — .harilibur [year]', category: 'INFO' }, async (sock, msg, args) => {
    await react(sock, msg, '📅');
    try {
      const r = await nx.information.hariLibur({ year: args[0] || new Date().getFullYear() });
      const items = r?.result || r?.data || r;
      const t = Array.isArray(items) ? items.slice(0,10).map(h => `📅 *${h.tanggal || h.date}* — ${h.nama || h.name}`).join('\n') : _nxText(r);
      await sendReply(sock, msg, `📅 *Hari Libur Indonesia*\n━━━━━━━━━━━━━━━━━━━━\n${t || 'No data'}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['kursrupiah', 'exchangerate'], { desc: 'IDR exchange rate — .kursrupiah', category: 'INFO' }, async (sock, msg) => {
    await react(sock, msg, '💱');
    try {
      const r = await nx.information.kurs({});
      const items = r?.result || r?.data || r;
      const t = Array.isArray(items) ? items.slice(0,10).map(k => `💱 ${k.mata_uang || k.currency}: *${k.kurs_tengah || k.rate || k.nilai}*`).join('\n') : _nxText(r);
      await sendReply(sock, msg, `💱 *Kurs Rupiah BI*\n━━━━━━━━━━━━━━━━━━━━\n${t || 'No data'}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['prakiraan', 'forecast'], { desc: 'Indonesian weather forecast — .prakiraan <city>', category: 'INFO' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}prakiraan <city name>`);
    await react(sock, msg, '🌤️');
    try {
      const r = await nx.information.prakiraan({ city: args.join(' ') });
      const t = _nxText(r) || JSON.stringify(r?.result || r?.data || r);
      await sendReply(sock, msg, `🌤️ *Prakiraan Cuaca*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['cekrekening', 'checkbank'], { desc: 'Check Indonesian bank account — .cekrekening <bank> <no>', category: 'INFO' }, async (sock, msg, args) => {
    if (args.length < 2) return sendReply(sock, msg, `Usage: ${P}cekrekening <bank_code> <account_number>\nExample: ${P}cekrekening bca 1234567890`);
    await react(sock, msg, '🏦');
    try {
      const r = await nx.information.checkRekening({ bank: args[0], no: args[1] });
      const t = _nxText(r) || JSON.stringify(r?.result || r?.data || r);
      await sendReply(sock, msg, `🏦 *Cek Rekening*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // MAKER COMMANDS
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['balogo', 'bluearchivelogo'], { desc: 'Blue Archive logo maker — .balogo <text>', category: 'MAKER' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}balogo <text>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.maker.balogo({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🎮 *Blue Archive Logo*\n_${args.join(' ')}_` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['bannerblur', 'blurbanner'], { desc: 'Blur banner maker — .bannerblur <text>', category: 'MAKER' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}bannerblur <text>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.maker.bannerBlur({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🖼️ *Banner Blur*\n_${args.join(' ')}_` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['fakechat', 'fakewhatsapp'], { desc: 'Create fake WA chat screenshot — .fakechat <name>|<message>', category: 'MAKER' }, async (sock, msg, args) => {
    const text = args.join(' ');
    const [name, ...msgParts] = text.split('|');
    const message = msgParts.join('|').trim();
    if (!name || !message) return sendReply(sock, msg, `Usage: ${P}fakechat <name>|<message>\nExample: ${P}fakechat John|Hello World!`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.maker.fakechat({ name: name.trim(), message });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `💬 *Fake Chat*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['fakegram', 'fakeinstagram'], { desc: 'Create fake Instagram post — .fakegram <username>|<caption>', category: 'MAKER' }, async (sock, msg, args) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    const text = args.join(' ');
    const [username, ...capParts] = text.split('|');
    const caption = capParts.join('|').trim();
    if (!username) return sendReply(sock, msg, `Usage: ${P}fakegram <username>|<caption>\nReply to image or include url`);
    await react(sock, msg, '🌀');
    try {
      let imgUrl = args.find(a => a.startsWith('http')) || null;
      if (!imgUrl && _imgM) {
        const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
        imgUrl = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      }
      const r = await nx.maker.fakegram({ username: username.trim(), caption: caption || '', url: imgUrl || '' });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `📸 *Fake Instagram Post*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['faketweet', 'faketwitter'], { desc: 'Create fake tweet — .faketweet <@user>|<tweet text>', category: 'MAKER' }, async (sock, msg, args) => {
    const text = args.join(' ');
    const [user, ...tweetParts] = text.split('|');
    const tweet = tweetParts.join('|').trim();
    if (!user || !tweet) return sendReply(sock, msg, `Usage: ${P}faketweet <@username>|<tweet text>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.maker.faketweet({ username: user.trim().replace('@',''), tweet });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🐦 *Fake Tweet*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['kaligrafi', 'arabicart'], { desc: 'Arabic calligraphy maker — .kaligrafi <text>', category: 'MAKER' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}kaligrafi <arabic text>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.maker.kaligrafi({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `✍️ *Kaligrafi*\n_${args.join(' ')}_` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['nulis', 'handwriting'], { desc: 'Handwriting effect — .nulis <text>', category: 'MAKER' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}nulis <text to handwrite>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.maker.nulis({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `✍️ *Handwriting*\n_${args.join(' ')}_` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['storify', 'storymaker'], { desc: 'Story card maker — .storify <text>', category: 'MAKER' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}storify <story text>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.maker.storify({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `📖 *Story Card*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['tiktokcrd', 'tiktokcard'], { desc: 'TikTok-style card — .tiktokcrd <text>', category: 'MAKER' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}tiktokcrd <text>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.maker.tiktokcrd({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🎵 *TikTok Card*\n_${args.join(' ')}_` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['watermark', 'addwatermark'], { desc: 'Add watermark to image — reply to image with .watermark <text>', category: 'MAKER' }, async (sock, msg, args) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM || !args.length) return sendReply(sock, msg, `Reply to image with ${P}watermark <your watermark text>`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.maker.watermark({ url: _url, text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🖼️ *Watermarked*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['ytthumb', 'youtubethumb'], { desc: 'Generate YouTube thumbnail — .ytthumb <title>', category: 'MAKER' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}ytthumb <video title>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.maker.ytthumb({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `▶️ *YouTube Thumbnail*\n_${args.join(' ')}_` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['ytcard', 'youtubecard'], { desc: 'Generate YouTube card — .ytcard <title>', category: 'MAKER' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}ytcard <video title>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.maker.ytcard({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `▶️ *YouTube Card*\n_${args.join(' ')}_` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['welcomecard', 'maswelcome'], { desc: 'Generate welcome card — .welcomecard <name>', category: 'MAKER' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}welcomecard <name>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.maker.welcome({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `👋 *Welcome Card*\n_${args.join(' ')}_` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PAYMENT COMMANDS
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['qriscode', 'makeqris'], { desc: 'Generate QRIS payment code — .qriscode <amount>', category: 'PAYMENT' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}qriscode <amount in IDR>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.payment.qris({ amount: args[0] });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `💳 *QRIS Payment*\n💰 Amount: Rp ${args[0]}` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['saweria', 'saweriacek'], { desc: 'Check Saweria donations — .saweria <username>', category: 'PAYMENT' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}saweria <saweria username>`);
    await react(sock, msg, '💸');
    try {
      const r = await nx.payment.saweriaCheck({ username: args[0] });
      const t = _nxText(r) || JSON.stringify(r?.result || r?.data || r);
      await sendReply(sock, msg, `💸 *Saweria Check*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PRIMBON COMMANDS (Indonesian fortune/horoscope)
  // ──────────────────────────────────────────────────────────────────────────
  const _primbon = [
    ['artinama','artinama','name','Name meaning','🔮'],
    ['nomerhoki','nomerhoki','nomer','Lucky number','🔢'],
    ['ramalanbintang','ramalanbintang','bintang','Horoscope (star sign)','⭐'],
    ['ramalanjodoh','ramalanjodoh','nama','Love compatibility','💑'],
    ['ramalanmimpi','ramalanmimpi','mimpi','Dream interpretation','😴'],
    ['ramalannama','ramalannama','nama','Name fortune','🔮'],
    ['ramalanrezeki','ramalanrezeki','nama','Fortune reading','💰'],
    ['ramalanshio','ramalanshio','shio','Chinese zodiac (shio)','🐉'],
    ['ramalanweton','ramalanweton','weton','Javanese weton reading','📅'],
    ['ramalanzodiak','ramalanzodiak','zodiak','Zodiac fortune','♈'],
  ];
  for (const [cmd_name, ep, param, label, emoji] of _primbon) {
    const _ep = ep; const _param = param; const _label = label; const _emoji = emoji;
    cmd([cmd_name], { desc: `${_label} — .${cmd_name} <${_param}>`, category: 'PRIMBON' }, async (sock, msg, args) => {
      if (!args.length) return sendReply(sock, msg, `Usage: ${P}${cmd_name} <${_param}>`);
      await react(sock, msg, _emoji);
      try {
        const params = {}; params[_param] = args.join(' ');
        const r = await nx.primbon[_ep](params);
        const t = _nxText(r) || JSON.stringify(r?.result || r?.data || r);
        await sendReply(sock, msg, `${_emoji} *${_label}*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
        await react(sock, msg, '✅');
      } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RANDOM COMMANDS
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['randomcat', 'catpic'], { desc: 'Random cat picture — .randomcat', category: 'RANDOM' }, async (sock, msg) => {
    await react(sock, msg, '🐱');
    try {
      const r = await nx.random.cat({});
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '🐱 *Random Cat*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['randomdog', 'dogpic'], { desc: 'Random dog picture — .randomdog', category: 'RANDOM' }, async (sock, msg) => {
    await react(sock, msg, '🐶');
    try {
      const r = await nx.random.dog({});
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '🐶 *Random Dog*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['randomwaifu', 'waifupic'], { desc: 'Random waifu picture — .randomwaifu', category: 'RANDOM' }, async (sock, msg) => {
    await react(sock, msg, '🌸');
    try {
      const r = await nx.random.waifu({});
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '🌸 *Random Waifu*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['randomfox', 'foxpic'], { desc: 'Random fox picture — .randomfox', category: 'RANDOM' }, async (sock, msg) => {
    await react(sock, msg, '🦊');
    try {
      const r = await nx.random.fox({});
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '🦊 *Random Fox*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['randomba', 'bapic'], { desc: 'Random Blue Archive picture — .randomba', category: 'RANDOM' }, async (sock, msg) => {
    await react(sock, msg, '🎮');
    try {
      const r = await nx.random.ba({});
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '🎮 *Random Blue Archive*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['randommeme', 'memepic'], { desc: 'Random meme picture — .randommeme', category: 'RANDOM' }, async (sock, msg) => {
    await react(sock, msg, '😂');
    try {
      const r = await nx.random.meme({});
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '😂 *Random Meme*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['randomquote', 'quotepic'], { desc: 'Random quote image — .randomquote', category: 'RANDOM' }, async (sock, msg) => {
    await react(sock, msg, '💬');
    try {
      const r = await nx.random.quote({});
      const buf = await _nxMedia(r, axios);
      if (buf && _isImgBuf(buf)) {
        await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '💬 *Random Quote*' }, { quoted: msg });
      } else {
        const t = _nxText(r); if (!t) throw new Error('No response');
        await sendReply(sock, msg, `💬 *Random Quote*\n\n_${t}_`);
      }
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['animerandom', 'randomanime'], { desc: 'Random anime gif — .animerandom', category: 'RANDOM' }, async (sock, msg) => {
    await react(sock, msg, '🌀');
    try {
      const r = await nx.random.anime({});
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { video: buf, mimetype: 'video/mp4', gifPlayback: true, caption: '🎌 *Random Anime GIF*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) {
      // Try as image fallback
      try {
        const r2 = await nx.random.anime({});
        const buf2 = await _nxMedia(r2, axios);
        if (buf2) await sock.sendMessage(msg.key.remoteJid, { image: buf2, caption: '🎌 *Random Anime*' }, { quoted: msg });
        await react(sock, msg, '✅');
      } catch { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SEARCH COMMANDS (new platforms)
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['shopee', 'shopsearch'], { desc: 'Search Shopee products — .shopee <query>', category: 'SEARCH' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}shopee <product name>`);
    await react(sock, msg, '🛍️');
    try {
      const r = await nx.search.shopee({ text: args.join(' ') });
      const items = r?.result || r?.data || r;
      const t = Array.isArray(items) ? `🛍️ *Shopee Search: ${args.join(' ')}*\n━━━━━━━━━━━━━━━━━━━━\n` +
        items.slice(0,5).map((i, n) => `${n+1}. *${i.name||i.title||'No name'}*\n   💰 ${i.price||i.harga||'?'}\n   🔗 ${i.link||i.url||''}`).join('\n\n')
        : _nxText(r);
      await sendReply(sock, msg, t || 'No results found');
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['tokopedia', 'tokosearch'], { desc: 'Search Tokopedia products — .tokopedia <query>', category: 'SEARCH' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}tokopedia <product name>`);
    await react(sock, msg, '🟢');
    try {
      const r = await nx.search.tokopedia({ text: args.join(' ') });
      const items = r?.result || r?.data || r;
      const t = Array.isArray(items) ? `🟢 *Tokopedia: ${args.join(' ')}*\n━━━━━━━━━━━━━━━━━━━━\n` +
        items.slice(0,5).map((i, n) => `${n+1}. *${i.name||i.title||'No name'}*\n   💰 ${i.price||i.harga||'?'}\n   🔗 ${i.link||i.url||''}`).join('\n\n')
        : _nxText(r);
      await sendReply(sock, msg, t || 'No results found');
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['deezer', 'deezersearch'], { desc: 'Search Deezer music — .deezer <song name>', category: 'SEARCH' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}deezer <song/artist name>`);
    await react(sock, msg, '🎵');
    try {
      const r = await nx.search.deezer({ text: args.join(' ') });
      const items = r?.result || r?.data || r;
      const t = Array.isArray(items) ? `🎵 *Deezer: ${args.join(' ')}*\n━━━━━━━━━━━━━━━━━━━━\n` +
        items.slice(0,5).map((i, n) => `${n+1}. *${i.title||i.name||'No title'}*\n   🎤 ${i.artist||'?'}\n   💿 ${i.album||'?'}\n   🔗 ${i.link||''}`).join('\n\n')
        : _nxText(r);
      await sendReply(sock, msg, t || 'No results found');
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['googlenews', 'gnews'], { desc: 'Google News search — .googlenews <query>', category: 'SEARCH' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}googlenews <news query>`);
    await react(sock, msg, '📰');
    try {
      const r = await nx.search.googlenews({ text: args.join(' ') });
      const items = r?.result || r?.data || r;
      const t = Array.isArray(items) ? `📰 *Google News: ${args.join(' ')}*\n━━━━━━━━━━━━━━━━━━━━\n` +
        items.slice(0,5).map((i, n) => `${n+1}. *${i.title||'No title'}*\n   🔗 ${i.link||i.url||''}`).join('\n\n')
        : _nxText(r);
      await sendReply(sock, msg, t || 'No results found');
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['scholarsearch', 'gscholar'], { desc: 'Google Scholar search — .scholarseach <topic>', category: 'SEARCH' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}scholarseach <research topic>`);
    await react(sock, msg, '🎓');
    try {
      const r = await nx.search.googleScholar({ text: args.join(' ') });
      const items = r?.result || r?.data || r;
      const t = Array.isArray(items) ? `🎓 *Google Scholar: ${args.join(' ')}*\n━━━━━━━━━━━━━━━━━━━━\n` +
        items.slice(0,5).map((i, n) => `${n+1}. *${i.title||'No title'}*\n   📝 ${i.snippet||''}\n   🔗 ${i.link||''}`).join('\n\n')
        : _nxText(r);
      await sendReply(sock, msg, t || 'No results found');
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['wallpaper', 'wallpapersearch'], { desc: 'Search wallpapers — .wallpaper <query>', category: 'SEARCH' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}wallpaper <theme/keyword>`);
    await react(sock, msg, '🖼️');
    try {
      const r = await nx.search.wallpaper({ text: args.join(' ') });
      const buf = await _nxMedia(r, axios);
      if (buf && _isImgBuf(buf)) {
        await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🖼️ *Wallpaper: ${args.join(' ')}*` }, { quoted: msg });
      } else {
        const items = r?.result || r?.data || r;
        const url = Array.isArray(items) ? items[0]?.url || items[0]?.image : null;
        if (url) {
          const b = Buffer.from((await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 })).data);
          await sock.sendMessage(msg.key.remoteJid, { image: b, caption: `🖼️ *Wallpaper: ${args.join(' ')}*` }, { quoted: msg });
        } else throw new Error('No image found');
      }
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['youtubemusic', 'ytmusic'], { desc: 'YouTube Music search — .youtubemusic <song>', category: 'SEARCH' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}youtubemusic <song name>`);
    await react(sock, msg, '🎵');
    try {
      const r = await nx.search.youtubeMusic({ text: args.join(' ') });
      const items = r?.result || r?.data || r;
      const t = Array.isArray(items) ? `🎵 *YouTube Music: ${args.join(' ')}*\n━━━━━━━━━━━━━━━━━━━━\n` +
        items.slice(0,5).map((i, n) => `${n+1}. *${i.title||'No title'}*\n   🎤 ${i.artist||i.channel||'?'}\n   🔗 ${i.link||i.url||''}`).join('\n\n')
        : _nxText(r);
      await sendReply(sock, msg, t || 'No results found');
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['npmpackage', 'npmsearch'], { desc: 'Search NPM packages — .npmpackage <package name>', category: 'SEARCH' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}npmpackage <package name>`);
    await react(sock, msg, '📦');
    try {
      const r = await nx.search.npm({ text: args.join(' ') });
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : (d?.name ? `📦 *${d.name}*\n📝 ${d.description || 'No desc'}\n🔗 ${d.link || ''}` : JSON.stringify(d));
      await sendReply(sock, msg, `📦 *NPM Search*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // STALKER COMMANDS (new)
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['genshinstalk', 'genshininfo'], { desc: 'Genshin Impact player info — .genshinstalk <uid>', category: 'STALK' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}genshinstalk <uid>`);
    await react(sock, msg, '🗡️');
    try {
      const r = await nx.stalker.genshin({ uid: args[0] });
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : JSON.stringify(d, null, 2);
      await sendReply(sock, msg, `🗡️ *Genshin Impact*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['pubgstalk', 'pubginfo'], { desc: 'PUBG player info — .pubgstalk <username>', category: 'STALK' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}pubgstalk <pubg username>`);
    await react(sock, msg, '🎮');
    try {
      const r = await nx.stalker.pubg({ username: args.join(' ') });
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : JSON.stringify(d, null, 2);
      await sendReply(sock, msg, `🎮 *PUBG Player*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['redditorstalk', 'redditor'], { desc: 'Reddit user profile — .redditorstalk <username>', category: 'STALK' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}redditorstalk <reddit username>`);
    await react(sock, msg, '🤖');
    try {
      const r = await nx.stalker.reddit({ username: args[0] });
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : `👤 *u/${d?.name || args[0]}*\n📝 ${d?.description || d?.about || ''}\n👥 Karma: ${d?.karma || d?.link_karma || '?'}`;
      await sendReply(sock, msg, `🤖 *Reddit Profile*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['snackvideostalk', 'snackvideoinfo'], { desc: 'SnackVideo user info — .snackvideostalk <username>', category: 'STALK' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}snackvideostalk <username>`);
    await react(sock, msg, '📱');
    try {
      const r = await nx.stalker.snackvideo({ username: args[0] });
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : JSON.stringify(d, null, 2);
      await sendReply(sock, msg, `📱 *SnackVideo*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['spotifystalk', 'stalkspotify'], { desc: 'Spotify user profile — .spotifystalk <username>', category: 'STALK' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}spotifystalk <spotify username>`);
    await react(sock, msg, '🟢');
    try {
      const r = await nx.stalker.spotify({ username: args[0] });
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : JSON.stringify(d, null, 2);
      await sendReply(sock, msg, `🟢 *Spotify Profile*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['wabio', 'whatsappbio'], { desc: 'WhatsApp user bio — .wabio <number>', category: 'STALK' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}wabio <phone number>`);
    await react(sock, msg, '📱');
    try {
      const r = await nx.stalker.whatsapp({ number: args[0].replace(/[^0-9]/g,'') });
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : JSON.stringify(d, null, 2);
      await sendReply(sock, msg, `📱 *WhatsApp Info*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEXTPRO COMMANDS — all 22 effects
  // ──────────────────────────────────────────────────────────────────────────
  const _textproEffects = [
    ['tpfire','fire'],['tpneon','neon'],['tpgold','gold'],['tpice','ice'],
    ['tpglitch','glitch'],['tpavengers','avengers'],['tpspace','space'],
    ['tpminecraft','minecraft'],['tpmatrix','matrix'],['tpgraffiti','graffiti'],
    ['tpsmoky','smoke'],['tpwood','wood'],['tpocean','ocean'],['tpmetal','metal'],
    ['tplava','lava'],['tpretro','retro'],['tprainbow','rainbow'],['tpblood','blood'],
    ['tpgradient','gradient'],['tpgalaxy','galaxy'],['tpgalaxy2','galaxy2'],['tpemas','emas'],
  ];
  for (const [cmd_name, effect] of _textproEffects) {
    const _effect = effect;
    cmd([cmd_name], { desc: `${_effect.toUpperCase()} text effect — .${cmd_name} <text>`, category: 'TEXTPRO' }, async (sock, msg, args) => {
      if (!args.length) return sendReply(sock, msg, `Usage: ${P}${cmd_name} <your text>`);
      await react(sock, msg, '✨');
      try {
        const r = await nx.textpro[_effect]({ text: args.join(' ') });
        const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
        await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `✨ *${_effect.toUpperCase()} Text*\n_${args.join(' ')}_` }, { quoted: msg });
        await react(sock, msg, '✅');
      } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TOOLS COMMANDS (new)
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['blurface', 'faceblur'], { desc: 'Blur faces in image — reply to image with .blurface', category: 'TOOLS' }, async (sock, msg) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM) return sendReply(sock, msg, `Reply to an image with ${P}blurface`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.tools.blurface({ url: _url });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '😶 *Face Blurred*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['emojimix', 'emix'], { desc: 'Mix two emojis — .emojimix <emoji1> <emoji2>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (args.length < 2) return sendReply(sock, msg, `Usage: ${P}emojimix <emoji1> <emoji2>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.tools.emojimix({ emoji1: args[0], emoji2: args[1] });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: `🎭 *Emoji Mix*: ${args[0]} + ${args[1]}` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['emojigif', 'egif'], { desc: 'Get emoji GIF — .emojigif <emoji>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}emojigif <emoji>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.tools.emojigif({ emoji: args[0] });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { video: buf, mimetype: 'video/mp4', gifPlayback: true, caption: `${args[0]} *Emoji GIF*` }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['faceswap', 'swapface'], { desc: 'Face swap between two images — .faceswap <url1> <url2>', category: 'TOOLS' }, async (sock, msg, args) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (args.length < 2 && !_imgM) return sendReply(sock, msg, `Usage: ${P}faceswap <image_url1> <image_url2>\nOR reply to an image with ${P}faceswap <second_image_url>`);
    await react(sock, msg, '🌀');
    try {
      let url1 = args[0], url2 = args[1];
      if (_imgM && !url2) {
        const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
        url1 = _upload?.result?.url || _upload?.data?.url || _upload?.url;
        url2 = args[0];
      }
      const r = await nx.tools.faceswap({ url1, url2 });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '😵 *Face Swap*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['nsfwcheck', 'ceknsfw'], { desc: 'Check if image is NSFW — reply to image with .nsfwcheck', category: 'TOOLS' }, async (sock, msg) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM) return sendReply(sock, msg, `Reply to an image with ${P}nsfwcheck`);
    await react(sock, msg, '🔍');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.tools.nsfwChecker({ url: _url });
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : `🔞 NSFW: ${d?.nsfw || d?.isNsfw ? '❌ YES' : '✅ NO'}\n📊 Score: ${d?.score || d?.probability || '?'}`;
      await sendReply(sock, msg, `🔍 *NSFW Check*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['trackip', 'iplookup'], { desc: 'Track/lookup IP address — .trackip <ip>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}trackip <ip address>`);
    await react(sock, msg, '🌐');
    try {
      const r = await nx.tools.trackip({ ip: args[0] });
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : `🌐 *IP Track: ${args[0]}*\n━━━━━━━━━━━━━━━━━━━━\n🗺️ Country: ${d?.country||'?'}\n🏙️ City: ${d?.city||'?'}\n📡 ISP: ${d?.isp||'?'}\n📍 Lat: ${d?.lat||'?'}, Lon: ${d?.lon||'?'}`;
      await sendReply(sock, msg, t);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['unblurimg', 'unblur'], { desc: 'Unblur/sharpen image — reply to image with .unblurimg', category: 'TOOLS' }, async (sock, msg) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM) return sendReply(sock, msg, `Reply to a blurry image with ${P}unblurimg`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.tools.unblur({ url: _url });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '🔍 *Unblurred*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['hdvideo', 'videohd'], { desc: 'Enhance video to HD — .hdvideo <video url>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}hdvideo <video url>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.tools.hdvideo({ url: args[0] });
      const url = r?.result?.url || r?.data?.url || r?.url;
      if (!url) throw new Error('No URL returned');
      await sendReply(sock, msg, `🎬 *HD Video*\n\n🔗 Download: ${url}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['image2qr', 'imgtoqr'], { desc: 'Convert image to QR code — reply to image with .image2qr', category: 'TOOLS' }, async (sock, msg) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    if (!_imgM) return sendReply(sock, msg, `Reply to an image with ${P}image2qr`);
    await react(sock, msg, '🌀');
    try {
      const _upload = await nx.uploader.upload({ buffer: await (async () => { const s = await downloadContentFromMessage(_imgM, 'image'); let b = Buffer.from([]); for await (const c of s) b = Buffer.concat([b,c]); return b; })() });
      const _url = _upload?.result?.url || _upload?.data?.url || _upload?.url;
      if (!_url) throw new Error('Upload failed');
      const r = await nx.tools.image2qr({ url: _url });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No QR');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '🔲 *Image to QR*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['removevokal', 'instrumental'], { desc: 'Remove vocals from song — .removevokal <song url>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}removevokal <audio/song url>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.tools.removevokal({ url: args[0] });
      const buf = await _nxMedia(r, axios);
      if (buf && _isAudBuf(buf)) {
        await sock.sendMessage(msg.key.remoteJid, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
      } else {
        const url = r?.result?.url || r?.data?.url || r?.url;
        if (url) await sendReply(sock, msg, `🎵 *Instrumental (no vocals)*\n\n🔗 ${url}`);
        else throw new Error('No audio returned');
      }
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['tiktokearnings', 'ttearnings'], { desc: 'Calculate TikTok earnings — .tiktokearnings <followers>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}tiktokearnings <follower count>`);
    await react(sock, msg, '💰');
    try {
      const r = await nx.tools.tiktokearnings({ followers: args[0] });
      const t = _nxText(r) || JSON.stringify(r?.result || r?.data || r);
      await sendReply(sock, msg, `💰 *TikTok Earnings*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['tiktokhashtags', 'tthashtags'], { desc: 'TikTok hashtag suggestions — .tiktokhashtags <niche>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}tiktokhashtags <niche/topic>`);
    await react(sock, msg, '#️⃣');
    try {
      const r = await nx.tools.tiktokhashtags({ text: args.join(' ') });
      const t = _nxText(r) || JSON.stringify(r?.result || r?.data || r);
      await sendReply(sock, msg, `#️⃣ *TikTok Hashtags*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['usernamegen', 'unamegen'], { desc: 'Generate username ideas — .usernamegen <keyword>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}usernamegen <keyword>`);
    await react(sock, msg, '🆔');
    try {
      const r = await nx.tools.usernamegen({ text: args.join(' ') });
      const t = _nxText(r) || JSON.stringify(r?.result || r?.data || r);
      await sendReply(sock, msg, `🆔 *Username Generator*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['vcc', 'virtualcard'], { desc: 'Generate virtual credit card — .vcc', category: 'TOOLS' }, async (sock, msg) => {
    await react(sock, msg, '💳');
    try {
      const r = await nx.tools.vcc({});
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : `💳 *Virtual Card*\n━━━━━━━━━━━━━━━━━━━━\n💳 Number: ${d?.number||d?.card_number||'?'}\n📅 Expiry: ${d?.expiry||d?.exp||'?'}\n🔐 CVV: ${d?.cvv||'?'}\n👤 Name: ${d?.name||'?'}`;
      await sendReply(sock, msg, t);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['wink', 'winkgif'], { desc: 'Get a wink anime gif — .wink', category: 'TOOLS' }, async (sock, msg) => {
    await react(sock, msg, '😉');
    try {
      const r = await nx.tools.wink({});
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No gif');
      await sock.sendMessage(msg.key.remoteJid, { video: buf, mimetype: 'video/mp4', gifPlayback: true, caption: '😉' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['winrateml', 'mlwinrate'], { desc: 'MLBB win rate calculator — .winrateml <wins> <total>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (args.length < 2) return sendReply(sock, msg, `Usage: ${P}winrateml <wins> <total games>`);
    await react(sock, msg, '🎮');
    try {
      const r = await nx.tools.winrateMLBB({ wins: args[0], total: args[1] });
      const t = _nxText(r) || JSON.stringify(r?.result || r?.data || r);
      await sendReply(sock, msg, `🎮 *ML Win Rate*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['ytsum', 'ytsummarize'], { desc: 'Summarize a YouTube video — .ytsum <youtube url>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}ytsum <youtube url>`);
    await react(sock, msg, '📝');
    try {
      const r = await nx.tools.ytSummarizeV1({ url: args[0] });
      const t = _nxText(r); if (!t) throw new Error('No summary');
      await sendReply(sock, msg, `📝 *YouTube Summary*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['ytsub', 'ytranscribe'], { desc: 'Get subtitles from YouTube — .ytsub <youtube url>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}ytsub <youtube url>`);
    await react(sock, msg, '📜');
    try {
      const r = await nx.tools.ytTranscribe({ url: args[0] });
      const t = _nxText(r); if (!t) throw new Error('No transcript');
      const trimmed = t.length > 4000 ? t.slice(0, 4000) + '\n...[truncated]' : t;
      await sendReply(sock, msg, `📜 *YouTube Transcript*\n━━━━━━━━━━━━━━━━━━━━\n${trimmed}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['whatsmusic', 'cekmusik'], { desc: 'Identify music playing — .whatsmusic <audio url>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}whatsmusic <audio url>`);
    await react(sock, msg, '🎵');
    try {
      const r = await nx.tools.whatsmusic({ url: args[0] });
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : `🎵 *${d?.title||'Unknown'}*\n🎤 ${d?.artist||'?'}\n💿 ${d?.album||'?'}`;
      await sendReply(sock, msg, `🎵 *What's This Music?*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['html2image', 'html2img'], { desc: 'Convert HTML/URL to image — .html2image <url or html>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}html2image <url or html code>`);
    await react(sock, msg, '🌀');
    try {
      const r = await nx.tools.html2img({ url: args.join(' ') });
      const buf = await _nxMedia(r, axios); if (!buf) throw new Error('No image');
      await sock.sendMessage(msg.key.remoteJid, { image: buf, caption: '🌐 *HTML to Image*' }, { quoted: msg });
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['subdomains', 'subdomainfinder'], { desc: 'Find subdomains — .subdomains <domain>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}subdomains <domain.com>`);
    await react(sock, msg, '🔍');
    try {
      const r = await nx.tools.subdomainfinder({ domain: args[0] });
      const d = r?.result || r?.data || r;
      const t = Array.isArray(d) ? d.slice(0,20).join('\n') : (typeof d === 'string' ? d : JSON.stringify(d));
      await sendReply(sock, msg, `🔍 *Subdomains: ${args[0]}*\n━━━━━━━━━━━━━━━━━━━━\n${t || 'None found'}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['dnslookup', 'dnsinfo'], { desc: 'DNS lookup — .dnslookup <domain>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}dnslookup <domain.com>`);
    await react(sock, msg, '🌐');
    try {
      const r = await nx.tools.dnslookup({ domain: args[0] });
      const t = _nxText(r) || JSON.stringify(r?.result || r?.data || r, null, 2);
      await sendReply(sock, msg, `🌐 *DNS Lookup: ${args[0]}*\n━━━━━━━━━━━━━━━━━━━━\n${t}`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  cmd(['webphishing', 'cekphishing'], { desc: 'Check if URL is phishing — .webphishing <url>', category: 'TOOLS' }, async (sock, msg, args) => {
    if (!args.length) return sendReply(sock, msg, `Usage: ${P}webphishing <url to check>`);
    await react(sock, msg, '🔍');
    try {
      const r = await nx.tools.webphishing({ url: args[0] });
      const d = r?.result || r?.data || r;
      const t = typeof d === 'string' ? d : `🔍 *Phishing Check*\n🌐 URL: ${args[0]}\n⚠️ Result: ${d?.phishing ? '❌ PHISHING' : '✅ SAFE'}\n📊 Score: ${d?.score || d?.confidence || '?'}`;
      await sendReply(sock, msg, t);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Error: ${e.message}`); await react(sock, msg, '❌'); }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // UPLOADER COMMAND
  // ──────────────────────────────────────────────────────────────────────────

  cmd(['upload', 'uploadimg'], { desc: 'Upload image/file and get direct link — reply to media with .upload', category: 'TOOLS' }, async (sock, msg) => {
    const _ctx = msg.message?.extendedTextMessage?.contextInfo;
    const _imgM = msg.message?.imageMessage || _ctx?.quotedMessage?.imageMessage;
    const _docM = msg.message?.documentMessage || _ctx?.quotedMessage?.documentMessage;
    const _audM = msg.message?.audioMessage || _ctx?.quotedMessage?.audioMessage;
    const _vidM = msg.message?.videoMessage || _ctx?.quotedMessage?.videoMessage;
    const media = _imgM || _docM || _audM || _vidM;
    if (!media) return sendReply(sock, msg, `Reply to any media with ${P}upload to get a direct link.`);
    await react(sock, msg, '🌀');
    try {
      const type = _imgM ? 'image' : _docM ? 'document' : _audM ? 'audio' : 'video';
      const stream = await downloadContentFromMessage(media, type);
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      const r = await nx.uploader.upload({ buffer: buf });
      const url = r?.result?.url || r?.data?.url || r?.url;
      if (!url) throw new Error('Upload failed — no URL returned');
      await sendReply(sock, msg, `📤 *Upload Successful!*\n\n🔗 ${url}\n\n_File size: ${(buf.length/1024).toFixed(1)} KB_`);
      await react(sock, msg, '✅');
    } catch (e) { await sendReply(sock, msg, `❌ Upload failed: ${e.message}`); await react(sock, msg, '❌'); }
  });

  console.log('[nexray_bot] All NexRay commands registered ✅');
};
