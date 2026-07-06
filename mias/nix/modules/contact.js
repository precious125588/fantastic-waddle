/**
 * NIX — Contact Intelligence Module
 */
import { getOwnerName, greet } from '../owner.js';
import { stagedSend, sendNix, reactNix, nixFooter } from '../ui.js';
import { prexzyGet } from '../api.js';
import axios from 'axios';

function cleanNumber(n) { return String(n || '').replace(/[^0-9]/g, ''); }
function getJid(msg) { return msg.key.remoteJid; }
function getTargetFromMsg(msg, args) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.participant || ctx?.mentionedJid?.[0];
  if (quoted) return quoted;
  if (args?.length) {
    const n = cleanNumber(args[0]);
    if (n.length >= 7) return `${n}@s.whatsapp.net`;
  }
  return null;
}

export async function profile(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetFromMsg(msg, args);
  if (!target) {
    await sendNix(sock, msg, `📸 *Profile Picture*\n\nUsage: \`.nix profile <number>\`\nOr reply to someone's message.\nExample: \`.nix profile 2349012345678\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '📸');
  try {
    const picUrl = await sock.profilePictureUrl(target, 'image');
    const resp = await axios.get(picUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const buf = Buffer.from(resp.data);
    await sock.sendMessage(getJid(msg), {
      image: buf,
      caption: `📸 *Profile Picture*\n\n${greet(owner)} here's the profile photo for \`${target.split('@')[0]}\`${nixFooter()}`
    }, { quoted: msg });
    await reactNix(sock, msg, '✅');
  } catch {
    await sendNix(sock, msg, `❌ *Profile Picture*\n\n${greet(owner)} I was unable to fetch the profile picture for \`${target.split('@')[0]}\`.\n_They may have restricted their photo._${nixFooter()}`);
  }
}

export async function contactAbout(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetFromMsg(msg, args);
  if (!target) {
    await sendNix(sock, msg, `💬 *Contact About*\n\nUsage: \`.nix about <number>\`\nOr reply to someone's message.${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '💬');
  try {
    const status = await sock.fetchStatus(target);
    const about = status?.status || 'No about set';
    const setAt = status?.setAt ? new Date(status.setAt).toLocaleDateString() : 'Unknown';
    await sendNix(sock, msg, `💬 *About: ${target.split('@')[0]}*\n\n${greet(owner)}\n\n_"${about}"_\n📅 Set: ${setAt}${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *About*\n\n${greet(owner)} I was unable to fetch the about for \`${target.split('@')[0]}\`.${nixFooter()}`);
  }
}

export async function lastSeen(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetFromMsg(msg, args);
  if (!target) {
    await sendNix(sock, msg, `👁️ *Last Seen*\n\nUsage: \`.nix lastseen <number>\`\nOr reply to someone's message.${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '👁️');
  try {
    const presence = await sock.presenceSubscribe(target);
    await sendNix(sock, msg, `👁️ *Last Seen*\n\n${greet(owner)} checking last seen for \`${target.split('@')[0]}\`...\n\n_Note: Last seen is only visible if the contact has not restricted their privacy settings._${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `👁️ *Last Seen*\n\n${greet(owner)} I was unable to fetch last seen for \`${target.split('@')[0]}\`.\n_Privacy settings may be restricting access._${nixFooter()}`);
  }
}

export async function isOnline(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetFromMsg(msg, args);
  if (!target) {
    await sendNix(sock, msg, `🟢 *Online Status*\n\nUsage: \`.nix online <number>\`\nOr reply to someone's message.${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🔍');
  try {
    await sock.presenceSubscribe(target);
    await sendNix(sock, msg, `🟢 *Online Check*\n\n${greet(owner)} I'm monitoring \`${target.split('@')[0]}\`'s presence.\n\n_Online status is only visible if the contact allows it in privacy settings._${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Online Status*\n\n${greet(owner)} unable to check online status for \`${target.split('@')[0]}\`.${nixFooter()}`);
  }
}

export async function contactInfo(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetFromMsg(msg, args);
  if (!target) {
    await sendNix(sock, msg, `👤 *Contact Info*\n\nUsage: \`.nix contactinfo <number>\`\nOr reply to someone's message.\nOr say: "Nix get details about this number"${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '👤');
  const num = target.split('@')[0];
  let picUrl = null, about = 'N/A', businessInfo = null;
  try {
    picUrl = await sock.profilePictureUrl(target, 'image');
  } catch {}
  try {
    const status = await sock.fetchStatus(target);
    about = status?.status || 'N/A';
  } catch {}
  try {
    businessInfo = await sock.getBusinessProfile(target);
  } catch {}
  const isBusiness = !!businessInfo?.description;
  const text = `👤 *Contact Details*
━━━━━━━━━━━━━━━━━━━━
${greet(owner)} here's the full info:

📱 *Number:* \`${num}\`
🌍 *JID:* \`${target}\`
💬 *About:* _${about}_
🖼️ *Profile Pic:* ${picUrl ? '✅ Available' : '❌ Hidden'}
🏢 *Business:* ${isBusiness ? `✅ Yes — ${businessInfo.description?.slice(0, 80)}` : '❌ No'}
${businessInfo?.address ? `📍 *Address:* ${businessInfo.address}` : ''}
${businessInfo?.email ? `📧 *Email:* ${businessInfo.email}` : ''}
${businessInfo?.website?.[0] ? `🌐 *Website:* ${businessInfo.website[0]}` : ''}
━━━━━━━━━━━━━━━━━━━━${nixFooter()}`;
  if (picUrl) {
    try {
      const resp = await axios.get(picUrl, { responseType: 'arraybuffer', timeout: 15000 });
      const buf = Buffer.from(resp.data);
      await sock.sendMessage(getJid(msg), { image: buf, caption: text }, { quoted: msg });
      await reactNix(sock, msg, '✅');
      return;
    } catch {}
  }
  await stagedSend(sock, msg, text, { stages: 4 });
}

export async function lastMsg(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetFromMsg(msg, args);
  if (!target) {
    await sendNix(sock, msg, `💬 *Last Message*\n\nUsage: \`.nix lastmsg <number>\`\nOr reply to someone's message.${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '💬');
  const store = sock.store || sock._store;
  try {
    const msgs = store?.messages?.[target]?.array || [];
    const last = [...msgs].reverse().find(m => m.message && !m.key.fromMe);
    if (!last) {
      await sendNix(sock, msg, `💬 *Last Message*\n\n${greet(owner)} no messages found from \`${target.split('@')[0]}\` in memory.${nixFooter()}`);
      return;
    }
    const text = last.message?.conversation || last.message?.extendedTextMessage?.text || '[Media/Non-text message]';
    const time = new Date(last.messageTimestamp * 1000).toLocaleString();
    await sendNix(sock, msg, `💬 *Last Message from ${target.split('@')[0]}*\n\n${greet(owner)}\n\n_"${String(text).slice(0, 500)}"_\n\n📅 Sent: ${time}${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Last Message*\n\n${greet(owner)} I was unable to retrieve the last message.${nixFooter()}`);
  }
}

export async function firstMsg(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetFromMsg(msg, args);
  if (!target) {
    await sendNix(sock, msg, `💬 *First Message*\n\nUsage: \`.nix firstmsg <number>\`\nOr reply to someone's message.${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🗓️');
  const store = sock.store || sock._store;
  try {
    const msgs = store?.messages?.[target]?.array || [];
    const first = msgs.find(m => m.message);
    if (!first) {
      await sendNix(sock, msg, `🗓️ *First Message*\n\n${greet(owner)} no message history for \`${target.split('@')[0]}\` found in memory.${nixFooter()}`);
      return;
    }
    const text = first.message?.conversation || first.message?.extendedTextMessage?.text || '[Media/Non-text]';
    const time = new Date(first.messageTimestamp * 1000).toLocaleString();
    await sendNix(sock, msg, `🗓️ *First Message — ${target.split('@')[0]}*\n\n${greet(owner)}\n\n_"${String(text).slice(0, 500)}"_\n\n📅 ${time}${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *First Message*\n\n${greet(owner)} I was unable to retrieve the first message.${nixFooter()}`);
  }
}

export async function msgCount(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetFromMsg(msg, args);
  if (!target) {
    await sendNix(sock, msg, `📊 *Message Count*\n\nUsage: \`.nix msgcount <number>\`\nOr reply to someone's message.${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '📊');
  const store = sock.store || sock._store;
  try {
    const msgs = store?.messages?.[target]?.array || [];
    const fromThem = msgs.filter(m => !m.key.fromMe).length;
    const fromMe = msgs.filter(m => m.key.fromMe).length;
    await sendNix(sock, msg, `📊 *Message Count — ${target.split('@')[0]}*\n\n${greet(owner)}\n\n📨 From them: *${fromThem}*\n📤 From you: *${fromMe}*\n📊 Total: *${msgs.length}*\n\n_Note: Only includes messages in current session memory._${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Message Count*\n\n${greet(owner)} I was unable to count messages.${nixFooter()}`);
  }
}

export async function searchMsg(sock, msg, args) {
  const owner = getOwnerName();
  const keyword = args.join(' ');
  if (!keyword) {
    await sendNix(sock, msg, `🔍 *Search Messages*\n\nUsage: \`.nix searchmsg <keyword>\`\nExample: \`.nix searchmsg meeting\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🔍');
  const jid = getJid(msg);
  const store = sock.store || sock._store;
  try {
    const msgs = store?.messages?.[jid]?.array || [];
    const found = msgs.filter(m => {
      const t = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
      return t.toLowerCase().includes(keyword.toLowerCase());
    }).slice(-5);
    if (!found.length) {
      await sendNix(sock, msg, `🔍 *Search: "${keyword}"*\n\n${greet(owner)} no messages found containing "${keyword}" in this chat.${nixFooter()}`);
      return;
    }
    const lines = found.map((m, i) => {
      const t = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
      const time = new Date(m.messageTimestamp * 1000).toLocaleString();
      return `${i + 1}. _"${t.slice(0, 100)}"_\n   📅 ${time}`;
    }).join('\n\n');
    await sendNix(sock, msg, `🔍 *Search: "${keyword}"* — ${found.length} result(s)\n\n${greet(owner)}\n\n${lines}${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Search*\n\n${greet(owner)} I was unable to search messages.${nixFooter()}`);
  }
}

export async function deletedMsg(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '🗑️');
  await sendNix(sock, msg, `🗑️ *Deleted Message Recovery*\n\n${greet(owner)} to recover deleted messages, enable *anti-delete* in your main bot settings.\n\nNix saves incoming messages automatically during the session. If anti-delete is active, check your bot's anti-delete log.${nixFooter()}`);
}

export async function editedMsg(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '✏️');
  await sendNix(sock, msg, `✏️ *Edited Message*\n\n${greet(owner)} to track edited messages, reply to the message you think was edited.\n\nIf anti-edit is enabled in your main bot, check the edit log there.${nixFooter()}`);
}

export async function mostActive(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '📊');
  const store = sock.store || sock._store;
  try {
    const chats = store?.chats ? Object.values(store.chats) : [];
    const privates = chats.filter(c => !String(c?.id || c?.jid || '').endsWith('@g.us') && (c?.unreadCount || 0) > 0)
      .sort((a, b) => (b.unreadCount || 0) - (a.unreadCount || 0)).slice(0, 10);
    if (!privates.length) { await sendNix(sock, msg, `📊 *Most Active Contacts*\n\n${greet(owner)} no activity data found.${nixFooter()}`); return; }
    const lines = privates.map((c, i) => `${i + 1}. *${c.name || c.id?.split('@')[0] || 'Unknown'}* — ${c.unreadCount || 0} unread`).join('\n');
    await sendNix(sock, msg, `📊 *Most Active Contacts*\n\n${greet(owner)}\n\n${lines}${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Most Active*\n\n${greet(owner)} I was unable to analyze contact activity.${nixFooter()}`);
  }
}

export async function leastActive(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '💤');
  const store = sock.store || sock._store;
  try {
    const chats = store?.chats ? Object.values(store.chats) : [];
    const privates = chats.filter(c => !String(c?.id || c?.jid || '').endsWith('@g.us') && (c?.unreadCount || 0) === 0).slice(0, 10);
    if (!privates.length) { await sendNix(sock, msg, `💤 *Least Active Contacts*\n\n${greet(owner)} no data available.${nixFooter()}`); return; }
    const lines = privates.map((c, i) => `${i + 1}. *${c.name || c.id?.split('@')[0] || 'Unknown'}*`).join('\n');
    await sendNix(sock, msg, `💤 *Least Active Contacts*\n\n${greet(owner)}\n\n${lines}${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Least Active*\n\n${greet(owner)} I was unable to analyze contact activity.${nixFooter()}`);
  }
}

export async function chatReport(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetFromMsg(msg, args);
  if (!target) {
    await sendNix(sock, msg, `📊 *Chat Report*\n\nUsage: \`.nix chatreport <number>\`\nOr reply to someone's message.${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '📊');
  const store = sock.store || sock._store;
  try {
    const msgs = store?.messages?.[target]?.array || [];
    const fromThem = msgs.filter(m => !m.key.fromMe);
    const fromMe = msgs.filter(m => m.key.fromMe);
    const mediaCount = msgs.filter(m => m.message?.imageMessage || m.message?.videoMessage || m.message?.audioMessage).length;
    const text = `📊 *Chat Report — ${target.split('@')[0]}*
━━━━━━━━━━━━━━━━━━━━
${greet(owner)}

💬 Total Messages: *${msgs.length}*
📨 From them: *${fromThem.length}*
📤 From you: *${fromMe.length}*
🖼️ Media Shared: *${mediaCount}*
📅 Session started: ${new Date(Date.now() - process.uptime() * 1000).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━${nixFooter()}`;
    await stagedSend(sock, msg, text, { stages: 4 });
  } catch {
    await sendNix(sock, msg, `❌ *Chat Report*\n\n${greet(owner)} I was unable to generate a chat report.${nixFooter()}`);
  }
}

export async function streak(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetFromMsg(msg, args);
  if (!target) {
    await sendNix(sock, msg, `🔥 *Chat Streak*\n\nUsage: \`.nix streak <number>\`\nOr reply to someone's message.${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🔥');
  const store = sock.store || sock._store;
  try {
    const msgs = (store?.messages?.[target]?.array || []).sort((a, b) => a.messageTimestamp - b.messageTimestamp);
    if (!msgs.length) { await sendNix(sock, msg, `🔥 *Streak*\n\n${greet(owner)} no messages found for this contact.${nixFooter()}`); return; }
    const days = new Set(msgs.map(m => new Date(m.messageTimestamp * 1000).toDateString()));
    await sendNix(sock, msg, `🔥 *Chat Streak — ${target.split('@')[0]}*\n\n${greet(owner)}\n\n📅 Active days: *${days.size}*\n💬 Total messages: *${msgs.length}*\n🔥 Keep it going!${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Streak*\n\n${greet(owner)} I was unable to calculate the chat streak.${nixFooter()}`);
  }
}

export async function lastCall(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '📞');
  await sendNix(sock, msg, `📞 *Last Call*\n\n${greet(owner)} call history tracking requires the bot to have been active during the call.\n\nTo enable call tracking, make sure your bot's call listener is running. Nix will log calls it witnesses during this session.${nixFooter()}`);
}

export async function missedCalls(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '📵');
  await sendNix(sock, msg, `📵 *Missed Calls*\n\n${greet(owner)} missed call tracking requires the bot to be actively running when calls come in.\n\nMake sure your bot has the call event listener enabled to track missed calls.${nixFooter()}`);
}

export async function lastDoc(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetFromMsg(msg, args) || getJid(msg);
  await reactNix(sock, msg, '📄');
  const store = sock.store || sock._store;
  try {
    const msgs = (store?.messages?.[target]?.array || []).reverse();
    const doc = msgs.find(m => m.message?.documentMessage);
    if (!doc) { await sendNix(sock, msg, `📄 *Last Document*\n\n${greet(owner)} no documents found in this chat's memory.${nixFooter()}`); return; }
    const d = doc.message.documentMessage;
    const time = new Date(doc.messageTimestamp * 1000).toLocaleString();
    await sendNix(sock, msg, `📄 *Last Document*\n\n${greet(owner)}\n\n📎 *${d.fileName || 'Document'}*\n📏 Size: *${d.fileLength ? Math.round(d.fileLength / 1024) + ' KB' : 'Unknown'}*\n📅 Sent: ${time}${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Last Document*\n\n${greet(owner)} I was unable to find the last document.${nixFooter()}`);
  }
}

export async function findDoc(sock, msg, args) {
  const owner = getOwnerName();
  const name = args.join(' ');
  if (!name) { await sendNix(sock, msg, `🔍 *Find Document*\n\nUsage: \`.nix finddoc <filename>\`\nExample: \`.nix finddoc report.pdf\`${nixFooter()}`); return; }
  await reactNix(sock, msg, '🔍');
  const jid = getJid(msg);
  const store = sock.store || sock._store;
  try {
    const msgs = store?.messages?.[jid]?.array || [];
    const found = msgs.filter(m => {
      const fn = m.message?.documentMessage?.fileName || '';
      return fn.toLowerCase().includes(name.toLowerCase());
    });
    if (!found.length) { await sendNix(sock, msg, `🔍 *Find Document: "${name}"*\n\n${greet(owner)} no documents found matching "${name}" in this chat.${nixFooter()}`); return; }
    const lines = found.slice(-5).map((m, i) => {
      const d = m.message.documentMessage;
      const time = new Date(m.messageTimestamp * 1000).toLocaleString();
      return `${i + 1}. 📎 *${d.fileName}*\n   📅 ${time}`;
    }).join('\n\n');
    await sendNix(sock, msg, `🔍 *Found: "${name}"* — ${found.length} result(s)\n\n${greet(owner)}\n\n${lines}${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Find Doc*\n\n${greet(owner)} I was unable to search for documents.${nixFooter()}`);
  }
}

export async function responseTime(sock, msg, args) {
  const owner = getOwnerName();
  await sendNix(sock, msg, `⏱️ *Response Time*\n\n${greet(owner)} response time analysis requires extended message history.\n\n_This feature tracks how quickly you and your contact reply to each other over time._${nixFooter()}`);
}
