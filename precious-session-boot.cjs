#!/usr/bin/env node
/**
 * precious-session-boot.cjs
 * Runs on every boot (hooked into fix_all.cjs by PATCH.cjs).
 *
 *  1. Makes sure the session root inside the volume exists
 *     (default: /app/nexstore/pairing).
 *  2. MIGRATES any session folders an older build created OUTSIDE the volume
 *     (prezzy_auth / auth_info_baileys / session / …) INTO the volume, so the
 *     pairing that already exists on this container is not lost when the next
 *     deploy replaces the image.
 *  3. Prints a clear report so Railway logs prove where creds live.
 *
 * Idempotent: safe to run on every single boot.
 */
'use strict';

try {
  const fs = require('fs');
  const path = require('path');
  const SP = require('./sessionPaths');

  const root = SP.ensureSessionRoot();
  const onVolume = SP.isVolumeMounted();
  console.log('[precious-session-boot] session root = ' + root);
  console.log('[precious-session-boot] volume mounted at /app/nexstore = ' + (onVolume ? 'YES ✓' : 'no'));
  if (!onVolume && process.env.RAILWAY_ENVIRONMENT) {
    console.log('[precious-session-boot] ⚠ Railway volume NOT found — mount one at /app/nexstore or sessions will not survive deploys.');
  }

  let migrated = 0;
  for (const legacy of SP.legacySessionDirs()) {
    let entries = [];
    try {
      if (!fs.existsSync(legacy) || !fs.statSync(legacy).isDirectory()) continue;
      entries = fs.readdirSync(legacy);
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      try {
        const srcDir = path.join(legacy, entry);
        if (!fs.statSync(srcDir).isDirectory()) continue;
        if (!fs.existsSync(path.join(srcDir, 'creds.json'))) continue; // not a real session
        const dstDir = path.join(root, entry);
        if (fs.existsSync(path.join(dstDir, 'creds.json'))) continue;   // volume copy wins
        fs.mkdirSync(dstDir, { recursive: true });
        for (const f of fs.readdirSync(srcDir)) {
          try {
            fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));
          } catch (e) {}
        }
        migrated++;
        console.log('[precious-session-boot] migrated session ' + entry + ' from ' + path.basename(legacy) + ' into the volume ✓');
      } catch (e) {}
    }
  }

  try {
    const count = fs.readdirSync(root).filter(function (n) {
      try {
        return fs.statSync(path.join(root, n)).isDirectory() &&
          !n.includes('.quarantine-') &&
          fs.existsSync(path.join(root, n, 'creds.json'));
      } catch (e) {
        return false;
      }
    }).length;
    console.log('[precious-session-boot] usable paired sessions on the volume: ' + count + (migrated ? ' (+' + migrated + ' migrated)' : ''));
  } catch (e) {}
} catch (e) {
  console.log('[precious-session-boot] skipped:', e && e.message);
}
