import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export function getJid(sock) {
  return sock?.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : null;
}

export function senderNum(jid) {
  return jid?.split('@')[0]?.split(':')[0] || '';
}

export function isGroup(jid) {
  return jid?.endsWith('@g.us');
}

export function isBotOwner(sender) {
  const num = senderNum(sender);
  const owner = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
  return num === owner;
}

export function isSudo(sender) {
  try {
    const sudoPath = path.join(__dirname, '..', 'data', 'sudo.json');
    if (!fs.existsSync(sudoPath)) return false;
    const list = JSON.parse(fs.readFileSync(sudoPath, 'utf8'));
    return list.includes(senderNum(sender));
  } catch { return false; }
}

export function isOwnerOrSudo(sender) {
  return isBotOwner(sender) || isSudo(sender);
}

export async function getGroupAdmins(sock, jid) {
  try {
    const meta = await sock.groupMetadata(jid);
    return meta.participants.filter(p => p.admin).map(p => p.id);
  } catch { return []; }
}

export async function isGroupAdmin(sock, jid, sender) {
  const admins = await getGroupAdmins(sock, jid);
  return admins.includes(sender);
}

export function runtime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatNum(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

export async function downloadMedia(msg) {
  try {
    const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
    const mtype = Object.keys(msg.message || {})[0];
    const content = msg.message?.[mtype];
    if (!content) return null;
    const mediaType = mtype.replace('Message', '');
    const stream = await downloadContentFromMessage(content, mediaType);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch { return null; }
}

export function msgText(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ''
  );
}

export function quoted(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
}

export function quotedSender(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.participant || null;
}

export function mentionedJids(msg) {
  return (
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
    msg.message?.imageMessage?.contextInfo?.mentionedJid ||
    []
  );
}
