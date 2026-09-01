/**
 * NIX — WhatsApp Management Module v3.0
 * FIX: block/unblock strips device suffix from JID (fixes "bad request" in newer Baileys)
 * FIX: deleteMsg uses fromMe:true for admin group deletions (fixes "del not working" bug)
 * FIX: Comprehensive JID validation before all block/unblock operations
 * FIX: Local block-list fallback if WhatsApp API rejects (business/LID contacts)
 */
import { getOwnerName, greet } from '../owner.js';
import { sendNix, reactNix, nixFooter } from '../ui.js';

function getJid(msg) { return msg.key.remoteJid; }
function isGroup(jid) { return String(jid).endsWith('@g.us'); }
function cleanNumber(n) { return String(n || '').replace(/[^0-9]/g, ''); }
function toJid(n) { const c = cleanNumber(n); return c ? `${c}@s.whatsapp.net` : null; }

// Local fallback block list (in-memory, persists while bot is running)
if (!globalThis._localBlockList) globalThis._localBlockList = new Set();

/**
 * Normalize a JID for block/unblock — strips device suffix (:0, :1 etc.)
 * WhatsApp block/unblock ONLY works on bare <number>@s.whatsapp.net
 */
function normalizeUserJid(jid) {
  if (!jid || typeof jid !== 'string') return null;
  const raw = jid.trim();
  if (raw.endsWith('@g.us') || raw.endsWith('@newsletter') || raw === 'status@broadcast') return null;
  // Strip device suffix: "1234567890:2@s.whatsapp.net" → "1234567890@s.whatsapp.net"
  const local = raw.split('@')[0].split(':')[0];
  const num   = local.replace(/[^0-9]/g, '');
  if (!num || num.length < 6 || num.length > 15) return null;
  return `${num}@s.whatsapp.net`;
}

function _extractNumberFromVcard(vcard) {
  if (!vcard || typeof vcard !== 'string') return null;
  const m = vcard.match(/waid=(\d{6,15})/i) || vcard.match(/TEL[^:]*:\+?(\d{6,15})/i);
  return m ? m[1] : null;
}

function getTargetJid(msg, args) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.participant || ctx?.mentionedJid?.[0];
  if (quoted) return quoted;
  const mentions = ctx?.mentionedJid;
  if (mentions && mentions.length) return mentions[0];
  const qm = ctx?.quotedMessage;
  if (qm?.contactMessage?.vcard) {
    const n = _extractNumberFromVcard(qm.contactMessage.vcard);
    if (n) return `${n}@s.whatsapp.net`;
  }
  if (qm?.contactsArrayMessage?.contacts?.length) {
    for (const c of qm.contactsArrayMessage.contacts) {
      const n = _extractNumberFromVcard(c?.vcard);
      if (n) return `${n}@s.whatsapp.net`;
    }
  }
  if (args && args.length) {
    for (const a of args) {
      const c = cleanNumber(a);
      if (c && c.length >= 6) return `${c}@s.whatsapp.net`;
    }
  }
  return null;
}

export async function kick(sock, msg, args) {
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) { await sendNix(sock, msg, `⚠️ *${owner}*, this command only works inside a group chat.${nixFooter()}`); return; }
  const target = getTargetJid(msg, args);
  if (!target) {
    await sendNix(sock, msg, `⚠️ *${owner}*, who should I remove?\n\nReply to their message or use:\n\`.nix kick <number>\`\n\nExample: \`.nix kick 2349012345678\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🦵');
  try {
    await sock.groupParticipantsUpdate(jid, [target], 'remove');
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `✅ *Done, ${owner}!*\n\n\`${target.split('@')[0]}\` has been removed from the group.${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Couldn't remove them, ${owner}.*\n\nMake sure I'm an admin in this group.${nixFooter()}`);
  }
}

export async function closeGroup(sock, msg) {
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) { await sendNix(sock, msg, `⚠️ *${owner}*, use this inside a group chat.${nixFooter()}`); return; }
  await reactNix(sock, msg, '🔒');
  try {
    await sock.groupSettingUpdate(jid, 'announcement');
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `🔒 *Group locked, ${owner}!*\n\nOnly admins can send messages now.\nUse \`.nix open\` when you're ready to open it again.${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Couldn't lock the group, ${owner}.*\n\nMake sure I'm an admin here.${nixFooter()}`);
  }
}

export async function openGroup(sock, msg) {
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) { await sendNix(sock, msg, `⚠️ *${owner}*, use this inside a group chat.${nixFooter()}`); return; }
  await reactNix(sock, msg, '🔓');
  try {
    await sock.groupSettingUpdate(jid, 'not_announcement');
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `🔓 *Group is open now, ${owner}!*\n\nAll members can send messages again.${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Couldn't open the group, ${owner}.*\n\nMake sure I'm an admin here.${nixFooter()}`);
  }
}

export async function muteChat(sock, msg, args) {
  const owner = getOwnerName();
  const jid = getJid(msg);
  await reactNix(sock, msg, '🔇');
  try {
    let duration = 8 * 3600 * 1000;
    if (args[0]) { const n = parseInt(args[0]); if (!isNaN(n)) duration = n * 3600 * 1000; }
    await sock.chatModify({ mute: duration }, jid);
    await reactNix(sock, msg, '✅');
    const hrs = Math.round(duration / 3600000);
    await sendNix(sock, msg, `🔇 *Done, ${owner}!*\n\nThis chat is muted for *${hrs} hour(s)*.\n\nUse \`.nix unmute\` to turn notifications back on.${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Couldn't mute this chat, ${owner}.*\n\nTry again in a moment.${nixFooter()}`);
  }
}

export async function unmuteChat(sock, msg) {
  const owner = getOwnerName();
  const jid = getJid(msg);
  await reactNix(sock, msg, '🔔');
  try {
    await sock.chatModify({ mute: null }, jid);
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `🔔 *Done, ${owner}!*\n\nNotifications for this chat are back on.${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Couldn't unmute this chat, ${owner}.*${nixFooter()}`);
  }
}

export async function promote(sock, msg, args) {
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) { await sendNix(sock, msg, `⚠️ *${owner}*, use this inside a group chat.${nixFooter()}`); return; }
  const target = getTargetJid(msg, args);
  if (!target) {
    await sendNix(sock, msg, `⚠️ *${owner}*, who should I promote?\n\nReply to their message or use:\n\`.nix promote <number>\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '⭐');
  try {
    await sock.groupParticipantsUpdate(jid, [target], 'promote');
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `⭐ *Done, ${owner}!*\n\n\`${target.split('@')[0]}\` is now a group admin.${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Couldn't promote them, ${owner}.*\n\nMake sure I'm an admin here.${nixFooter()}`);
  }
}

export async function demote(sock, msg, args) {
  const owner = getOwnerName();
  const jid = getJid(msg);
  if (!isGroup(jid)) { await sendNix(sock, msg, `⚠️ *${owner}*, use this inside a group chat.${nixFooter()}`); return; }
  const target = getTargetJid(msg, args);
  if (!target) {
    await sendNix(sock, msg, `⚠️ *${owner}*, who should I demote?\n\nReply to their message or use:\n\`.nix demote <number>\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '👇');
  try {
    await sock.groupParticipantsUpdate(jid, [target], 'demote');
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `👇 *Done, ${owner}!*\n\n\`${target.split('@')[0]}\` has been removed from admin.${nixFooter()}`);
  } catch {
    await sendNix(sock, msg, `❌ *Couldn't demote them, ${owner}.*\n\nMake sure I'm an admin here.${nixFooter()}`);
  }
}

/**
 * BLOCK CONTACT — v3 fix.
 * 1. Strip device suffix (:0, :2 etc) before calling updateBlockStatus.
 * 2. If WhatsApp API rejects (business/LID contacts), fall back to local block list.
 */
export async function blockContact(sock, msg, args) {
  const owner = getOwnerName();
  const rawTarget = getTargetJid(msg, args);
  if (!rawTarget) {
    await sendNix(sock, msg, `⚠️ *${owner}*, who should I block?\n\nReply to their message or:\n\`.nix block <number>\`\n\nExample: \`.nix block 2349012345678\`${nixFooter()}`);
    return;
  }

  const target = normalizeUserJid(rawTarget);
  if (!target) {
    await sendNix(sock, msg, `❌ *${owner}*, that doesn't look like a valid user JID.\n_Cannot block groups, newsletters, or broadcast lists._${nixFooter()}`);
    return;
  }

  const selfJid = normalizeUserJid(sock.user?.id || '');
  if (selfJid && target === selfJid) {
    await sendNix(sock, msg, `❌ *${owner}*, you can't block yourself.${nixFooter()}`);
    return;
  }

  await reactNix(sock, msg, '🚫');

  // Try WhatsApp's native block first
  let waBlocked = false;
  let waError = '';
  try {
    const { setBlockStatus } = await import('../../lib/blocklist.js');
    const r = await setBlockStatus(sock, target, 'block');
    waBlocked = r.ok;
    if (!r.ok) waError = r.error;
  } catch (e) {
    waError = e.message || String(e);
    console.error(`[Block] block failed for ${target}:`, waError);
  }

  if (waBlocked) {
    globalThis._localBlockList.add(target);
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `🚫 *Blocked, ${owner}!*\n\n\`${target.split('@')[0]}\` has been blocked.\n\nUse \`.nix unblock ${target.split('@')[0]}\` to unblock.${nixFooter()}`);
  } else {
    // WhatsApp rejected it — apply local block list fallback
    // (bot will silently ignore messages from this JID in the message handler)
    globalThis._localBlockList.add(target);
    await reactNix(sock, msg, '⚠️');
    await sendNix(sock, msg,
      `⚠️ *${owner}*, WhatsApp rejected the block (${waError}).\n\n` +
      `This usually happens with business accounts or contacts WhatsApp protects.\n\n` +
      `✅ *Bot-level block applied instead* — the bot will ignore all messages from \`${target.split('@')[0]}\`.${nixFooter()}`
    );
  }
  console.log(`[WhatsApp] Block applied (wa=${waBlocked}, local=true): ${target}`);
}

/**
 * UNBLOCK CONTACT — v3 fix.
 */
export async function unblockContact(sock, msg, args) {
  const owner = getOwnerName();
  const rawTarget = getTargetJid(msg, args);
  if (!rawTarget) {
    await sendNix(sock, msg, `⚠️ *${owner}*, who should I unblock?\n\nUse:\n\`.nix unblock <number>\`\n\nOr reply to a message from them.${nixFooter()}`);
    return;
  }

  const target = normalizeUserJid(rawTarget);
  if (!target) {
    await sendNix(sock, msg, `❌ *${owner}*, that doesn't look like a valid user JID.${nixFooter()}`);
    return;
  }

  await reactNix(sock, msg, '🔓');

  let waUnblocked = false;
  let waError = '';
  try {
    const { setBlockStatus } = await import('../../lib/blocklist.js');
    const r = await setBlockStatus(sock, target, 'unblock');
    waUnblocked = r.ok;
    if (!r.ok) waError = r.error;
  } catch (e) {
    waError = e.message || String(e);
    console.error(`[Block] unblock failed for ${target}:`, waError);
  }

  // Always remove from local list
  globalThis._localBlockList.delete(target);

  if (waUnblocked) {
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `🔓 *Unblocked, ${owner}!*\n\n\`${target.split('@')[0]}\` has been fully unblocked.${nixFooter()}`);
  } else {
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg,
      `🔓 *${owner}*, bot-level block removed for \`${target.split('@')[0]}\`.\n` +
      `_Note: WhatsApp API unblock returned an error (${waError}) — go to your phone's WhatsApp to unblock them there too if needed._${nixFooter()}`
    );
  }
  console.log(`[WhatsApp] Unblock applied (wa=${waUnblocked}): ${target}`);
}

export async function addContact(sock, msg, args) {
  const owner = getOwnerName();
  let number = '';
  for (const a of (args || [])) {
    const c = cleanNumber(a);
    if (c && c.length >= 7) { number = c; break; }
  }
  if (!number) {
    await sendNix(sock, msg, `⚠️ *${owner}*, provide a phone number:\n\`.nix addcontact <number>\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '📱');
  try {
    const jid = `${number}@s.whatsapp.net`;
    const [result] = await sock.onWhatsApp(jid);
    if (!result?.exists) {
      await sendNix(sock, msg, `❌ *${owner}*, \`${number}\` is not on WhatsApp.${nixFooter()}`);
      return;
    }
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `✅ *Found on WhatsApp, ${owner}!*\n\nNumber: \`${number}\`\nJID: \`${result.jid}\`\n\nAdd them to your contacts on your phone.${nixFooter()}`);
  } catch (e) {
    await sendNix(sock, msg, `❌ *Lookup failed, ${owner}.*\n_${e.message}_${nixFooter()}`);
  }
}

const _FILLER = new Set(['this','that','the','a','an','number','contact','person','them','him','her','to','number,','number.','saying','say']);

export async function textContact(sock, msg, args) {
  const owner = getOwnerName();
  const target = getTargetJid(msg, args);
  let textToSend = '';
  if (args && args.length) {
    const targetNum = target ? target.split('@')[0] : null;
    const filtered = [];
    let started = false;
    for (const a of args) {
      const lo = a.toLowerCase();
      const c  = cleanNumber(a);
      if (!started && (_FILLER.has(lo) || (targetNum && c === targetNum) || (c && c.length >= 6))) continue;
      started = true;
      filtered.push(a);
    }
    textToSend = filtered.join(' ').trim();
  }
  if (!target) {
    await sendNix(sock, msg, `💬 *Send a Message*\n\n*${owner}*, to message someone use:\n\`.nix text <number> <message>\`\n\nExample:\n\`.nix text 2349012345678 Hey! How are you?\`${nixFooter()}`);
    return;
  }
  if (!textToSend) {
    await sendNix(sock, msg, `⚠️ *${owner}*, what should I say?\n\nExample: \`.nix text ${target.split('@')[0]} Hello there!\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '💬');
  try {
    await sock.sendMessage(target, { text: textToSend });
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `✅ *Message sent, ${owner}!*\n\nSent to: \`${target.split('@')[0]}\`\nMessage: _"${textToSend}"_${nixFooter()}`);
  } catch (e) {
    await sendNix(sock, msg, `❌ *Couldn't send the message, ${owner}.*\n_${e.message}_${nixFooter()}`);
  }
}

export async function forwardMsg(sock, msg, args) {
  const owner = getOwnerName();
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (!quoted) {
    await sendNix(sock, msg, `⚠️ *${owner}*, reply to a message to forward it:\n\`.nix forward <number>\`${nixFooter()}`);
    return;
  }
  const targetArg = args?.[0];
  const targetNum = cleanNumber(targetArg || '');
  if (!targetNum || targetNum.length < 6) {
    await sendNix(sock, msg, `⚠️ *${owner}*, specify who to forward to:\n\`.nix forward <number>\`${nixFooter()}`);
    return;
  }
  const targetJid = `${targetNum}@s.whatsapp.net`;
  await reactNix(sock, msg, '↗️');
  try {
    const stanzaId   = ctx.stanzaId;
    const remoteJid  = ctx.remoteJid || getJid(msg);
    const participant = ctx.participant;
    const fakeMsg = { key: { id: stanzaId, remoteJid, fromMe: false, participant }, message: quoted };
    await sock.copyNForward(targetJid, fakeMsg, true);
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `✅ *Forwarded, ${owner}!*\n\nMessage sent to \`${targetNum}\`.${nixFooter()}`);
  } catch (e) {
    await sendNix(sock, msg, `❌ *Forward failed, ${owner}.*\n_${e.message}_${nixFooter()}`);
  }
}

/**
 * DELETE MESSAGE — v3 fix.
 *
 * Root cause of "del not deleting member chats when bot is admin":
 * In newer Baileys, deleting another person's message in a group as admin
 * requires sending the delete stanza with `fromMe: false` AND the correct
 * `participant` field set to who originally sent the message.
 * If participant is missing WhatsApp silently ignores it.
 *
 * Additionally we try a second approach (fromMe: true trick) as fallback,
 * which works in some Baileys builds where the first method is rejected.
 */
export async function deleteMsg(sock, msg, args) {
  const owner = getOwnerName();
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.stanzaId) {
    await sendNix(sock, msg, `⚠️ *${owner}*, reply to a message to delete it:\n\`.nix delete\`${nixFooter()}`);
    return;
  }
  await reactNix(sock, msg, '🗑️');

  const remoteJid   = ctx.remoteJid || getJid(msg);
  const isGroupMsg  = String(remoteJid).endsWith('@g.us');
  const participant = ctx.participant || null;
  let deleted = false;

  // Attempt 1: standard delete with participant (works for most Baileys versions)
  try {
    const key = {
      id: ctx.stanzaId,
      remoteJid,
      fromMe: false,
      ...(isGroupMsg && participant ? { participant } : {}),
    };
    await sock.sendMessage(remoteJid, { delete: key });
    deleted = true;
  } catch (e1) {
    console.error('[Delete] Attempt 1 failed:', e1.message);

    // Attempt 2: fromMe:true trick (works on some Baileys builds for admin delete)
    if (isGroupMsg) {
      try {
        const key2 = {
          id: ctx.stanzaId,
          remoteJid,
          fromMe: true,
          ...(participant ? { participant } : {}),
        };
        await sock.sendMessage(remoteJid, { delete: key2 });
        deleted = true;
      } catch (e2) {
        console.error('[Delete] Attempt 2 failed:', e2.message);
      }
    }
  }

  if (deleted) {
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `✅ *Deleted, ${owner}!*${nixFooter()}`);
  } else {
    await reactNix(sock, msg, '❌');
    await sendNix(sock, msg,
      `❌ *Delete failed, ${owner}.*\n\n_Make sure I'm an admin in this group, then reply to the message you want deleted._${nixFooter()}`
    );
  }
}

export async function clearStatus(sock, msg) {
  const owner = getOwnerName();
  await reactNix(sock, msg, '🧹');
  try {
    await sock.updateProfileStatus('');
    await reactNix(sock, msg, '✅');
    await sendNix(sock, msg, `✅ *Status cleared, ${owner}!*\n\nYour WhatsApp bio is now empty.${nixFooter()}`);
  } catch (e) {
    await sendNix(sock, msg, `❌ *Couldn't clear status, ${owner}.*\n_${e.message}_${nixFooter()}`);
  }
}
