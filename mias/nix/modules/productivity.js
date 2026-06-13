/**
 * NIX — Productivity Module
 * Notes, Todos, Reminders
 */
import { getOwnerName, greet } from '../owner.js';
import { sendNix, reactNix, nixFooter } from '../ui.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'database');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const NOTES_FILE = path.join(DATA_DIR, 'nix_notes.json');
const TODOS_FILE = path.join(DATA_DIR, 'nix_todos.json');
const REMINDERS_FILE = path.join(DATA_DIR, 'nix_reminders.json');

function readJson(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); return true; } catch { return false; }
}

// ── NOTES ─────────────────────────────────────────────────────────────────────
export async function addNote(sock, msg, args) {
  const owner = getOwnerName();
  const text = args.join(' ');
  if (!text) {
    await sendNix(sock, msg, `📝 *Add Note*\n\nUsage: \`.nix note <text>\`\nExample: \`.nix note Buy groceries tomorrow\`${nixFooter()}`);
    return;
  }
  const notes = readJson(NOTES_FILE);
  notes.push({ id: Date.now(), text, date: new Date().toLocaleString() });
  writeJson(NOTES_FILE, notes);
  await reactNix(sock, msg, '✅');
  await sendNix(sock, msg, `📝 *Note Saved*\n\n${greet(owner)} your note has been saved:\n_"${text}"_\n\n📋 You now have *${notes.length}* note(s). View with \`.nix notes\`${nixFooter()}`);
}

export async function viewNotes(sock, msg) {
  const owner = getOwnerName();
  const notes = readJson(NOTES_FILE);
  if (!notes.length) {
    await sendNix(sock, msg, `📋 *Notes*\n\n${greet(owner)} you have no saved notes.\nAdd one with \`.nix note <text>\`${nixFooter()}`);
    return;
  }
  const lines = notes.slice(-10).map((n, i) => `${i + 1}. ${n.text}\n   _${n.date}_`).join('\n\n');
  await sendNix(sock, msg, `📋 *Your Notes* (${notes.length} total)\n\n${greet(owner)}\n\n${lines}${nixFooter()}`);
}

// ── TODOS ─────────────────────────────────────────────────────────────────────
export async function addTodo(sock, msg, args) {
  const owner = getOwnerName();
  const task = args.join(' ');
  if (!task) {
    await sendNix(sock, msg, `✅ *Add Task*\n\nUsage: \`.nix todo <task>\`\nExample: \`.nix todo Finish the project by Friday\`${nixFooter()}`);
    return;
  }
  const todos = readJson(TODOS_FILE);
  todos.push({ id: Date.now(), task, done: false, date: new Date().toLocaleString() });
  writeJson(TODOS_FILE, todos);
  await reactNix(sock, msg, '✅');
  const pending = todos.filter(t => !t.done).length;
  await sendNix(sock, msg, `✅ *Task Added*\n\n${greet(owner)} new task saved:\n_"${task}"_\n\n📋 You have *${pending}* pending task(s). View with \`.nix todos\`${nixFooter()}`);
}

export async function viewTodos(sock, msg) {
  const owner = getOwnerName();
  const todos = readJson(TODOS_FILE);
  if (!todos.length) {
    await sendNix(sock, msg, `✅ *Tasks*\n\n${greet(owner)} you have no tasks yet.\nAdd one with \`.nix todo <task>\`${nixFooter()}`);
    return;
  }
  const pending = todos.filter(t => !t.done);
  const done = todos.filter(t => t.done);
  let text = `✅ *Your Tasks*\n\n${greet(owner)}\n\n`;
  if (pending.length) {
    text += `📌 *Pending (${pending.length}):*\n`;
    text += pending.slice(-8).map((t, i) => `${i + 1}. ◻️ ${t.task}`).join('\n');
  }
  if (done.length) {
    text += `\n\n✅ *Completed (${done.length}):*\n`;
    text += done.slice(-3).map((t, i) => `${i + 1}. ✅ ~~${t.task}~~`).join('\n');
  }
  text += nixFooter();
  await sendNix(sock, msg, text);
}

// ── REMINDERS ────────────────────────────────────────────────────────────────
const activeReminders = new Map();

export async function setReminder(sock, msg, args) {
  const owner = getOwnerName();
  if (args.length < 2) {
    await sendNix(sock, msg, `⏰ *Reminder*\n\nUsage: \`.nix remind <minutes> <message>\`\nExample: \`.nix remind 30 Take a break\`\nExample: \`.nix remind 60 Call mom\`${nixFooter()}`);
    return;
  }
  const minutes = parseInt(args[0]);
  if (isNaN(minutes) || minutes < 1) {
    await sendNix(sock, msg, `⚠️ *Invalid Time*\n\nPlease specify a valid number of minutes.\nExample: \`.nix remind 30 Take a break\`${nixFooter()}`);
    return;
  }
  const reminderMsg = args.slice(1).join(' ');
  const jid = msg.key.remoteJid;
  await reactNix(sock, msg, '⏰');
  await sendNix(sock, msg, `⏰ *Reminder Set*\n\n${greet(owner)} I'll remind you in *${minutes} minute(s)*:\n_"${reminderMsg}"_${nixFooter()}`);
  const reminderId = setTimeout(async () => {
    try {
      await sock.sendMessage(jid, {
        text: `⏰ *Reminder from Nix*\n\n${greet(owner)} you asked me to remind you:\n\n_"${reminderMsg}"_\n\n📅 ${new Date().toLocaleString()}${nixFooter()}`
      });
    } catch {}
    activeReminders.delete(reminderId);
  }, minutes * 60 * 1000);
  activeReminders.set(reminderId, { msg: reminderMsg, minutes, jid });
}
