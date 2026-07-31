// sessionOwnership.js — single source of truth for "who owns this WhatsApp session".
//
// THE BUG THIS FIXES
// ------------------
// Two different owners were driving the SAME auth folder (nexstore/pairing/<number>):
//
//   1. pair.js  — the pairing socket, which also auto-reconnects (queuePairing)
//   2. mias/index.js (the child bot spawned by mais_launcher) — AUTH_DIR = same folder
//
// WhatsApp allows exactly ONE live connection per linked-device identity. As soon
// as the child bot connected, WhatsApp kicked the other socket with **401**.
// pair.js read that 401 as "the user unlinked the device", ran forceCleanupSession()
// and DELETED the auth folder (with 3 extra delete sweeps at 250ms/1.5s/5s) right
// out from under the running child. The child then also got 401, wiped AUTH_DIR
// itself, the launcher restarted it, there were no creds left — and the user saw:
//
//      ✅ USER CONNECTED  11:47:53
//      ❌ USER DISCONNECTED 11:48:04  Reason: 401 — logged out/unlinked
//      🧹 Session cleared — pair again
//
// ...roughly ten seconds apart, forever.
//
// THE RULE ENFORCED HERE
// ----------------------
// Only the current owner may reconnect or delete a session. Once pairing hands a
// number over to a bot process, the pairing side becomes a spectator: it must not
// reconnect that identity and must not delete its creds, no matter what status
// code WhatsApp sends it.
//
// Ownership is written to <sessionDir>/.owner.json so it survives a restart of the
// web/pairing process (the child bot keeps running across those restarts).

'use strict';

const fs   = require('fs');
const path = require('path');

const PAIRING_ROOT = path.join(__dirname, 'nexstore', 'pairing');

const OWNER_PAIRING = 'pairing';
const OWNER_BOT     = 'bot';

// A handoff is "settling" for this long. During the window the pairing socket is
// guaranteed to receive a 401/conflict (its identity was taken over on purpose),
// and nothing is allowed to treat that as a logout.
const HANDOFF_SETTLE_MS = 90 * 1000;

function sessionDirFor(numberOrJid) {
  const key = String(numberOrJid || '').split('@')[0].replace(/[^0-9]/g, '');
  return path.join(PAIRING_ROOT, key);
}

function ownerFile(sessionDir) {
  return path.join(sessionDir, '.owner.json');
}

function readOwner(sessionDirOrNumber) {
  const dir = path.isAbsolute(String(sessionDirOrNumber))
    ? String(sessionDirOrNumber)
    : sessionDirFor(sessionDirOrNumber);
  try {
    const raw = fs.readFileSync(ownerFile(dir), 'utf8');
    const payload = JSON.parse(raw);
    if (!payload || !payload.owner) return null;
    return payload;
  } catch {
    return null;
  }
}

function writeOwner(sessionDirOrNumber, owner, extra = {}) {
  const dir = path.isAbsolute(String(sessionDirOrNumber))
    ? String(sessionDirOrNumber)
    : sessionDirFor(sessionDirOrNumber);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      ownerFile(dir),
      JSON.stringify({ owner, pid: process.pid, at: Date.now(), ...extra }, null, 2),
      'utf8'
    );
  } catch {
    /* ownership is advisory — never crash the caller over it */
  }
  return owner;
}

/** Called by pair.js when it opens a pairing socket for a number. */
function claimForPairing(numberOrJid) {
  return writeOwner(numberOrJid, OWNER_PAIRING);
}

/** Called at the moment the pairing socket is closed in favour of a bot process. */
function handOffToBot(numberOrJid, botId = null) {
  return writeOwner(numberOrJid, OWNER_BOT, { botId, handedOffAt: Date.now() });
}

/** True while the child bot (not pairing) owns the identity. */
function isOwnedByBot(numberOrJid) {
  return readOwner(numberOrJid)?.owner === OWNER_BOT;
}

/**
 * True during the seconds right after a handoff, when a 401 on the *pairing*
 * socket is expected and completely normal.
 */
function isHandoffSettling(numberOrJid) {
  const rec = readOwner(numberOrJid);
  if (!rec || rec.owner !== OWNER_BOT) return false;
  const at = rec.handedOffAt || rec.at || 0;
  return Date.now() - at < HANDOFF_SETTLE_MS;
}

/**
 * The guard every destructive path must call before deleting creds.
 * `who` is 'pairing' or 'bot'. Returns true only when that caller is allowed to
 * wipe the session.
 */
function mayWipe(numberOrJid, who) {
  const rec = readOwner(numberOrJid);
  if (!rec) return true;                    // no recorded owner → legacy behaviour
  if (rec.owner === who) {
    // The bot may not wipe during its own handoff settle window either: the
    // first kick it receives is the pairing socket being replaced, not a logout.
    if (who === OWNER_BOT && isHandoffSettling(numberOrJid)) return false;
    return true;
  }
  return false;                             // someone else owns it — hands off
}

/** Called on an explicit user unlink / admin delete, which overrides ownership. */
function release(numberOrJid) {
  const dir = path.isAbsolute(String(numberOrJid))
    ? String(numberOrJid)
    : sessionDirFor(numberOrJid);
  try { fs.unlinkSync(ownerFile(dir)); } catch {}
}

module.exports = {
  OWNER_PAIRING,
  OWNER_BOT,
  HANDOFF_SETTLE_MS,
  PAIRING_ROOT,
  sessionDirFor,
  readOwner,
  claimForPairing,
  handOffToBot,
  isOwnedByBot,
  isHandoffSettling,
  mayWipe,
  release,
};
