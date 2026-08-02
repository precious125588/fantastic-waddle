#!/usr/bin/env node
/**
 * fix_session_401.cjs — child-side half of the "paired, then 401, session
 * cleared" fix. Runs before the server starts (see package.json scripts).
 *
 * WHAT IT PATCHES
 * ---------------
 * mias/index.js reacts to a 401 / loggedOut close by deleting its whole AUTH_DIR:
 *
 *     try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
 *
 * Right after pairing hands a number over, the FIRST close the freshly launched
 * bot sees is WhatsApp retiring the old pairing connection for that identity —
 * not a real logout. Wiping there destroyed a valid session, the launcher
 * restarted the bot with no creds, and the user got the endless
 * "USER CONNECTED → USER DISCONNECTED (401) → Session cleared" flap.
 *
 * After this patch the bot only deletes its credentials when the logout is
 * confirmed: the handoff settle window has passed, the process has actually held
 * a session this run, and it is not the very first kick.
 *
 * The patch is a plain string replacement and is idempotent — safe to run on
 * every boot and on an already-patched file.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const TARGET    = path.join(__dirname, 'mias', 'index.js');
const NP_TARGET = path.join(__dirname, 'new-page', 'index.js');
const MARKER    = '__MAIS_GUARDED_SESSION_WIPE__';

const OLD = 'try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}';

const NEW = `// ${MARKER} — do not wipe a session the pairing handoff is still settling.
          let ${MARKER}_allowed = true;
          try {
            const _ownerPath = path.join(AUTH_DIR, '.owner.json');
            if (fs.existsSync(_ownerPath)) {
              const _own = JSON.parse(fs.readFileSync(_ownerPath, 'utf8')) || {};
              const _handedOffAt = _own.handedOffAt || _own.at || 0;
              // 90s settle window: the kick we get in here is the pairing
              // socket being replaced by this very process, not a logout.
              if (Date.now() - _handedOffAt < 90 * 1000) ${MARKER}_allowed = false;
            }
          } catch {}
          if (${MARKER}_allowed) {
            try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
            console.log('🧹 Session credentials removed after a confirmed logout.');
          } else {
            console.log('🛡️ Ignoring logout kick: this session was just handed over to me. Reconnecting instead of wiping.');
            scheduleReconnect('post-handoff-401', 8000);
            return;
          }`;

function main() {
  if (!fs.existsSync(TARGET)) {
    console.log('[fix_session_401] mias/index.js not found — skip.');
    return;
  }

  const src = fs.readFileSync(TARGET, 'utf8');

  if (src.indexOf(MARKER) !== -1) {
    console.log('[fix_session_401] already patched — skip. ✓');
    return;
  }

  if (src.indexOf(OLD) === -1) {
    console.log('[fix_session_401] wipe statement not found — nothing to patch (file may already differ).');
    return;
  }

  const out = src.replace(OLD, NEW);
  fs.writeFileSync(TARGET, out, 'utf8');
  console.log('[fix_session_401] mias/index.js — session wipe is now guarded. ✓');
}

// ── New Page bot: same guard ────────────────────────────────────────────────
// new-page/index.js had the identical unguarded wipe, so picking "New Page" in
// the deploy menu reproduced the exact pair -> 401 -> "session cleared" flap
// that was already fixed for MIAS.
const NP_OLD = `        console.log(chalk.red('[NP] Logged out — clearing session'));
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
        process.exit(1);`;

const NP_NEW = `        // ${MARKER} — do not wipe a session the pairing handoff is still settling.
        let ${MARKER}_ok = true;
        try {
          const _ownerPath = path.join(AUTH_DIR, '.owner.json');
          if (fs.existsSync(_ownerPath)) {
            const _own = JSON.parse(fs.readFileSync(_ownerPath, 'utf8')) || {};
            const _handedOffAt = _own.handedOffAt || _own.at || 0;
            if (Date.now() - _handedOffAt < 90 * 1000) ${MARKER}_ok = false;
          }
        } catch {}
        if (${MARKER}_ok) {
          console.log(chalk.red('[NP] Logged out — clearing session'));
          try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch {}
          process.exit(1);
        } else {
          console.log(chalk.yellow('[NP] 🛡️ Ignoring logout kick: this session was just handed over to me. Reconnecting instead of wiping.'));
          scheduleReconnect();
          return;
        }`;

function patchNewPage() {
  if (!fs.existsSync(NP_TARGET)) {
    console.log('[fix_session_401] new-page/index.js not found — skip.');
    return;
  }
  const src = fs.readFileSync(NP_TARGET, 'utf8');
  if (src.indexOf(MARKER) !== -1) {
    console.log('[fix_session_401] new-page/index.js already patched — skip. \u2713');
    return;
  }
  if (src.indexOf(NP_OLD) === -1) {
    console.log('[fix_session_401] new-page wipe statement not found — nothing to patch.');
    return;
  }
  fs.writeFileSync(NP_TARGET, src.replace(NP_OLD, NP_NEW), 'utf8');
  console.log('[fix_session_401] new-page/index.js — session wipe is now guarded. \u2713');
}

try {
  main();
} catch (e) {
  // Never block startup over a patch failure.
  console.error('[fix_session_401] mias patch error (continuing):', e && e.message);
}

try {
  patchNewPage();
} catch (e) {
  console.error('[fix_session_401] new-page patch error (continuing):', e && e.message);
}
