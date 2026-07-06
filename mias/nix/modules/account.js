/**
 * NIX — Account Intelligence Module
 */
import { getOwnerName, greet } from '../owner.js';
import { stagedSend, sendNix, reactNix, nixFooter, formatNumber } from '../ui.js';

function _contactCount(sock) {
  try {
    if (sock?._knownContacts && typeof sock._knownContacts.size === 'number') {
      return [...sock._knownContacts].filter(j => String(j).endsWith('@s.whatsapp.net')).length;
    }
    const store = sock?.store || sock?._store;
    if (store?.contacts) return Object.keys(store.contacts).filter(j => j.endsWith('@s.whatsapp.net')).length;
  } catch {}
  return 0;
}

export async function contacts(sock, msg) {
  await reactNix(sock, msg, '📞');
  const owner = getOwnerName();
  try {
    const count = _contactCount(sock);
    const text = `📞 *Contact Count*\n\n${greet(owner)} you have *${formatNumber(count)}* contacts saved on WhatsApp.\n${nixFooter()}`;
    await stagedSend(sock, msg, text, { stages: 3 });
  } catch {
    await sendNix(sock, msg, `📞 *Contact Count*\n\n${greet(owner)} I was unable to access your contact list at this time.\n_Try again in a moment._${nixFooter()}`);
  }
}

export async function groups(sock, msg) {
  await reactNix(sock, msg, '👥');
  const owner = getOwnerName();
  try {
    const store = sock.store || sock._store;
    let count = 0;
    let groupList = [];
    if (store?.chats) {
      const chats = Object.values(store.chats);
      groupList = chats.filter(c => String(c?.id || c?.jid || '').endsWith('@g.us'));
      count = groupList.length;
    }
    const text = `👥 *Group Count*\n\n${greet(owner)} you are in *${formatNumber(count)}* WhatsApp groups.\n${nixFooter()}`;
    await stagedSend(sock, msg, text, { stages: 3 });
  } catch {
    await sendNix(sock, msg, `👥 *Group Count*\n\n${greet(owner)} I was unable to access your group list at this time.${nixFooter()}`);
  }
}

export async function unread(sock, msg) {
  await reactNix(sock, msg, '📬');
  const owner = getOwnerName();
  try {
    const store = sock.store || sock._store;
    let count = 0;
    if (store?.chats) {
      const chats = Object.values(store.chats);
      count = chats.filter(c => (c?.unreadCount || 0) > 0).length;
    }
    const text = `📬 *Unread Chats*\n\n${greet(owner)} you have *${formatNumber(count)}* chats with unread messages.\n${nixFooter()}`;
    await stagedSend(sock, msg, text, { stages: 3 });
  } catch {
    await sendNix(sock, msg, `📬 *Unread Chats*\n\n${greet(owner)} I was unable to check your unread messages.${nixFooter()}`);
  }
}

export async function accountReport(sock, msg) {
  await reactNix(sock, msg, '📊');
  const owner = getOwnerName();
  try {
    const store = sock.store || sock._store;
    let groupCount = 0, unreadCount = 0, totalChats = 0;
    const contactCount = _contactCount(sock);
    if (store?.chats) {
      const chats = Object.values(store.chats);
      totalChats = chats.length;
      groupCount = chats.filter(c => String(c?.id || c?.jid || '').endsWith('@g.us')).length;
      unreadCount = chats.filter(c => (c?.unreadCount || 0) > 0).length;
    }
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
    const uptimeStr = `${h}h ${m}m ${s}s`;
    const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const text = `📊 *Account Intelligence Report*
━━━━━━━━━━━━━━━━━━━━━━
${greet(owner)} here's your full account analysis:

👤 *Account Overview*
• Total Contacts: *${formatNumber(contactCount)}*
• Total Chats: *${formatNumber(totalChats)}*
• Group Chats: *${formatNumber(groupCount)}*
• Private Chats: *${formatNumber(totalChats - groupCount)}*
• Unread Messages: *${formatNumber(unreadCount)}*

⚙️ *Bot Status*
• Uptime: *${uptimeStr}*
• Memory: *${mem} MB*
• Node.js: *${process.version}*
• Platform: *${process.platform}*

📅 *Report Time:* ${new Date().toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━${nixFooter()}`;
    await stagedSend(sock, msg, text, { stages: 5 });
  } catch {
    await sendNix(sock, msg, `📊 *Account Report*\n\n${greet(owner)} I encountered an error generating your report.${nixFooter()}`);
  }
}

export async function blocked(sock, msg) {
  await reactNix(sock, msg, '🚫');
  const owner = getOwnerName();
  try {
    const list = await sock.fetchBlocklist?.() || [];
    if (!list.length) {
      await sendNix(sock, msg, `🚫 *Blocked Contacts*\n\n${greet(owner)} you have no blocked contacts.${nixFooter()}`);
      return;
    }
    const lines = list.map((j, i) => `${i + 1}. \`${j.split('@')[0]}\``).join('\n');
    await stagedSend(sock, msg, `🚫 *Blocked Contacts*\n\n${greet(owner)} you have *${list.length}* blocked contact(s):\n\n${lines}${nixFooter()}`, { stages: 3 });
  } catch {
    await sendNix(sock, msg, `🚫 *Blocked Contacts*\n\n${greet(owner)} I was unable to fetch your blocked list.${nixFooter()}`);
  }
}

export async function archived(sock, msg) {
  await reactNix(sock, msg, '📁');
  const owner = getOwnerName();
  try {
    const store = sock.store || sock._store;
    let archList = [];
    if (store?.chats) {
      archList = Object.values(store.chats).filter(c => c?.archived);
    }
    if (!archList.length) {
      await sendNix(sock, msg, `📁 *Archived Chats*\n\n${greet(owner)} you have no archived chats.${nixFooter()}`);
      return;
    }
    const lines = archList.slice(0, 15).map((c, i) => `${i + 1}. ${c.name || c.id || 'Unknown'}`).join('\n');
    await stagedSend(sock, msg, `📁 *Archived Chats*\n\n${greet(owner)} you have *${archList.length}* archived chat(s):\n\n${lines}${archList.length > 15 ? `\n_...and ${archList.length - 15} more_` : ''}${nixFooter()}`, { stages: 2 });
  } catch {
    await sendNix(sock, msg, `📁 *Archived Chats*\n\n${greet(owner)} I was unable to fetch archived chats.${nixFooter()}`);
  }
}

export async function setStatus(sock, msg, args) {
  const owner = getOwnerName();
  const statusText = args.join(' ');
  if (!statusText) {
    await sendNix(sock, msg, `⚠️ *${owner}*, what should your status say?\n\nUsage: \`.nix status <text>\`\nExample: \`.nix status Powered by Nix 🧠\`\n\nTo clear it: \`.nix clearstatus\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '✏️');
  try {
    await sock.updateProfileStatus(statusText);
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `✅ *Done, ${owner}!*\n\nYour WhatsApp about is now set to:\n_"${statusText}"_${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Couldn't update your status, ${owner}.*\n\nTry again in a moment.${nixFooter()}`);
  }
}

export async function clearStatus(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '🧹');
  try {
    await sock.updateProfileStatus('');
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `🧹 *Done, ${owner}!*\n\nYour WhatsApp about has been cleared.${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Couldn't clear your status, ${owner}.*${nixFooter()}`);
  }
}
