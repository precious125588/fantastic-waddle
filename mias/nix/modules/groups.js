/**
 * NIX — Group Intelligence Module
 */
import { getOwnerName, greet } from '../owner.js';
import { stagedSend, sendNix, reactNix, nixFooter, formatNumber } from '../ui.js';

function getJid(msg) { return msg.key.remoteJid; }
function isGroup(jid) { return String(jid).endsWith('@g.us'); }
function cleanNumber(n) { return String(n || '').replace(/[^0-9]/g, ''); }
function toJid(n) { const c = cleanNumber(n); return c ? `${c}@s.whatsapp.net` : null; }

export async function listGroups(sock, msg) {
  await reactNix(sock, msg, '👥');
  const owner = getOwnerName();
  try {
    const store = sock.store || sock._store;
    let groupList = [];
    if (store?.chats) {
      groupList = Object.values(store.chats).filter(c => String(c?.id || c?.jid || '').endsWith('@g.us'));
    }
    if (!groupList.length) {
      await sendNix(sock, msg, `👥 *Groups*\n\n${greet(owner)} you are not in any groups yet.${nixFooter()}`);
      return;
    }
    const lines = groupList.slice(0, 20).map((g, i) => `${i + 1}. *${g.name || g.subject || 'Unnamed Group'}*`).join('\n');
    const text = `👥 *Your Groups*\n\n${greet(owner)} you are in *${formatNumber(groupList.length)}* group(s):\n\n${lines}${groupList.length > 20 ? `\n_...and ${groupList.length - 20} more_` : ''}${nixFooter()}`;
    await stagedSend(sock, msg, text, { stages: 3 });
  } catch {
    await sendNix(sock, msg, `👥 *Groups*\n\n${greet(owner)} I was unable to fetch your group list.${nixFooter()}`);
  }
}

export async function groupStats(sock, msg) {
  await reactNix(sock, msg, '📊');
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) {
    await sendNix(sock, msg, `⚠️ This command must be used inside a group chat.${nixFooter()}`);
    return;
  }
  try {
    const meta = await sock.groupMetadata(jid);
    const adminList = meta.participants.filter(p => p.admin).map(p => `• \`${p.id.split('@')[0]}\``).join('\n') || 'None';
    const text = `📊 *Group Statistics*
━━━━━━━━━━━━━━━━━━━━━━

${greet(owner)} here's the breakdown for this group:

📛 *Name:* ${meta.subject || 'Unknown'}
👥 *Members:* ${formatNumber(meta.participants.length)}
👑 *Admins:* ${meta.participants.filter(p => p.admin).length}
📅 *Created:* ${meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : 'Unknown'}
🔒 *Mode:* ${meta.announce ? 'Admin-only (Closed)' : 'Open (All members)'}
📝 *Description:*
${meta.desc || '_No description set_'}

👑 *Admin List:*
${adminList}
━━━━━━━━━━━━━━━━━━━━━━${nixFooter()}`;
    await stagedSend(sock, msg, text, { stages: 4 });
  } catch {
    await sendNix(sock, msg, `📊 *Group Stats*\n\n${greet(owner)} I was unable to fetch group statistics.${nixFooter()}`);
  }
}

export async function activeGroups(sock, msg) {
  await reactNix(sock, msg, '🔥');
  const owner = getOwnerName();
  try {
    const store = sock.store || sock._store;
    let groups = [];
    if (store?.chats) {
      groups = Object.values(store.chats)
        .filter(c => String(c?.id || c?.jid || '').endsWith('@g.us'))
        .sort((a, b) => (b.unreadCount || 0) - (a.unreadCount || 0))
        .slice(0, 10);
    }
    if (!groups.length) { await sendNix(sock, msg, `🔥 No active groups found.${nixFooter()}`); return; }
    const lines = groups.map((g, i) => `${i + 1}. *${g.name || g.subject || 'Unknown'}* — ${g.unreadCount || 0} unread`).join('\n');
    await stagedSend(sock, msg, `🔥 *Most Active Groups*\n\n${greet(owner)} your top active groups:\n\n${lines}${nixFooter()}`, { stages: 3 });
  } catch {
    await sendNix(sock, msg, `🔥 *Active Groups*\n\n${greet(owner)} I was unable to analyze group activity.${nixFooter()}`);
  }
}

export async function inactiveGroups(sock, msg) {
  await reactNix(sock, msg, '💤');
  const owner = getOwnerName();
  try {
    const store = sock.store || sock._store;
    let groups = [];
    if (store?.chats) {
      groups = Object.values(store.chats)
        .filter(c => String(c?.id || c?.jid || '').endsWith('@g.us') && (c?.unreadCount || 0) === 0)
        .slice(0, 10);
    }
    if (!groups.length) { await sendNix(sock, msg, `💤 No inactive groups found.${nixFooter()}`); return; }
    const lines = groups.map((g, i) => `${i + 1}. *${g.name || g.subject || 'Unknown'}*`).join('\n');
    await stagedSend(sock, msg, `💤 *Inactive Groups*\n\n${greet(owner)} these groups have low activity:\n\n${lines}${nixFooter()}`, { stages: 3 });
  } catch {
    await sendNix(sock, msg, `💤 *Inactive Groups*\n\n${greet(owner)} I was unable to analyze group activity.${nixFooter()}`);
  }
}

export async function members(sock, msg) {
  await reactNix(sock, msg, '👤');
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) { await sendNix(sock, msg, `⚠️ Use this command inside a group.${nixFooter()}`); return; }
  try {
    const meta = await sock.groupMetadata(jid);
    const pList = meta.participants.slice(0, 20).map((p, i) => {
      const num = p.id.split('@')[0];
      const badge = p.admin === 'superadmin' ? '👑' : p.admin ? '⭐' : '👤';
      return `${i + 1}. ${badge} \`${num}\``;
    }).join('\n');
    const text = `👤 *Group Members*\n\n${greet(owner)} *${meta.subject}* has *${formatNumber(meta.participants.length)}* member(s):\n\n${pList}${meta.participants.length > 20 ? `\n_...and ${meta.participants.length - 20} more_` : ''}${nixFooter()}`;
    await stagedSend(sock, msg, text, { stages: 3 });
  } catch {
    await sendNix(sock, msg, `👤 *Members*\n\n${greet(owner)} I was unable to fetch the member list.${nixFooter()}`);
  }
}

export async function groupSummary(sock, msg) {
  await reactNix(sock, msg, '📋');
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) { await sendNix(sock, msg, `⚠️ Use this command inside a group.${nixFooter()}`); return; }
  try {
    const meta = await sock.groupMetadata(jid);
    const admins = meta.participants.filter(p => p.admin).length;
    const regular = meta.participants.length - admins;
    const text = `📋 *Group Summary — ${meta.subject}*\n\n👥 Total Members: *${meta.participants.length}*\n👑 Admins: *${admins}*\n👤 Regular: *${regular}*\n🔒 Type: *${meta.announce ? 'Admin Only' : 'Open'}*\n📝 Description: _${meta.desc || 'None'}_\n📅 Created: ${meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : 'Unknown'}${nixFooter()}`;
    await stagedSend(sock, msg, text, { stages: 3 });
  } catch {
    await sendNix(sock, msg, `📋 *Group Summary*\n\n${greet(owner)} I was unable to summarize this group.${nixFooter()}`);
  }
}

export async function tagAll(sock, msg, args) {
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) { await sendNix(sock, msg, `⚠️ Use this command inside a group.${nixFooter()}`); return; }
  try {
    const meta = await sock.groupMetadata(jid);
    const customMsg = args.join(' ') || `📢 Attention everyone!`;
    const mentions = meta.participants.map(p => p.id);
    const tagText = mentions.map(j => `@${j.split('@')[0]}`).join(' ');
    await sock.sendMessage(jid, {
      text: `${customMsg}\n\n${tagText}`,
      mentions
    }, { quoted: msg });
    await reactNix(sock, msg, '✅');
  } catch {
    await sendNix(sock, msg, `❌ *Tag All*\n\nFailed to tag members. Make sure I am an admin.${nixFooter()}`);
  }
}

export async function groupInvite(sock, msg) {
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) { await sendNix(sock, msg, `⚠️ Use this command inside a group.${nixFooter()}`); return; }
  try {
    const code = await sock.groupInviteCode(jid);
    await sendNix(sock, msg, `🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${code}\n\n${greet(owner)} share this link to invite people.${nixFooter()}`);
    await reactNix(sock, msg, '✅');
  } catch {
    await sendNix(sock, msg, `❌ Failed to get invite link. Make sure I am an admin.${nixFooter()}`);
  }
}

export async function revokeInvite(sock, msg) {
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) { await sendNix(sock, msg, `⚠️ Use this command inside a group.${nixFooter()}`); return; }
  try {
    await sock.groupRevokeInvite(jid);
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `✅ *Invite Link Revoked*\n\n${greet(owner)} the old invite link is now invalid. Generate a new one with \`.nix invite\`.${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ Failed to revoke invite link. Make sure I am an admin.${nixFooter()}`);
  }
}

export async function leaveGroup(sock, msg) {
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) { await sendNix(sock, msg, `⚠️ Use this command inside a group.${nixFooter()}`); return; }
  try {
    const meta = await sock.groupMetadata(jid);
    await sendNix(sock, msg, `👋 *Leaving Group*\n\n${greet(owner)} leaving *${meta.subject}* now...${nixFooter()}`);
    await sock.groupLeave(jid);
  } catch {
    await sendNix(sock, msg, `❌ Failed to leave group.${nixFooter()}`);
  }
}
