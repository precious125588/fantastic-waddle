import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file) {
  const fp = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(fp)) return {};
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch { return {}; }
}

function writeJSON(file, data) {
  const fp = path.join(DATA_DIR, file);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2));
}

// ── Economy ─────────────────────────────────────────────────────────────────
export function getBalance(jid) {
  const db = readJSON('economy.json');
  return db[jid] ?? 0;
}

export function setBalance(jid, amount) {
  const db = readJSON('economy.json');
  db[jid] = Math.max(0, amount);
  writeJSON('economy.json', db);
}

export function addBalance(jid, amount) {
  setBalance(jid, getBalance(jid) + amount);
}

export function deductBalance(jid, amount) {
  const bal = getBalance(jid);
  if (bal < amount) return false;
  setBalance(jid, bal - amount);
  return true;
}

// ── Daily claim ──────────────────────────────────────────────────────────────
export function canClaimDaily(jid) {
  const db = readJSON('daily.json');
  const last = db[jid] || 0;
  return Date.now() - last >= 86400000;
}

export function claimDaily(jid) {
  const db = readJSON('daily.json');
  db[jid] = Date.now();
  writeJSON('daily.json', db);
}

// ── Settings ─────────────────────────────────────────────────────────────────
export function getSetting(key, def = null) {
  const db = readJSON('settings.json');
  return db[key] ?? def;
}

export function setSetting(key, value) {
  const db = readJSON('settings.json');
  db[key] = value;
  writeJSON('settings.json', db);
}

// ── Auto features per JID ────────────────────────────────────────────────────
export function getAutoFeat(jid, feat) {
  const db = readJSON('autofeats.json');
  return db[`${jid}:${feat}`] ?? false;
}

export function setAutoFeat(jid, feat, value) {
  const db = readJSON('autofeats.json');
  db[`${jid}:${feat}`] = value;
  writeJSON('autofeats.json', db);
}

// ── Sudo list ────────────────────────────────────────────────────────────────
export function getSudoList() {
  const db = readJSON('sudo.json');
  return Array.isArray(db) ? db : [];
}

export function addSudo(num) {
  const list = getSudoList();
  const clean = num.replace(/[^0-9]/g, '');
  if (!list.includes(clean)) { list.push(clean); writeJSON('sudo.json', list); }
}

export function removeSudo(num) {
  const clean = num.replace(/[^0-9]/g, '');
  const list = getSudoList().filter(n => n !== clean);
  writeJSON('sudo.json', list);
}

// ── Group settings ───────────────────────────────────────────────────────────
export function getGroupSetting(groupJid, key, def = false) {
  const db = readJSON('groups.json');
  return db[groupJid]?.[key] ?? def;
}

export function setGroupSetting(groupJid, key, value) {
  const db = readJSON('groups.json');
  if (!db[groupJid]) db[groupJid] = {};
  db[groupJid][key] = value;
  writeJSON('groups.json', db);
}
