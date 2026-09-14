#!/usr/bin/env node
/**
 * precious-session-fix.cjs — runtime repair pass, run from fix_all.cjs on boot.
 *
 * It re-asserts the two guarantees that make pairing survive a redeploy, even if
 * a future copy of mias/index.js / pair.js / server.js is dropped in unpatched:
 *
 *   G1  Session root is inside the Railway volume (/app/nexstore/pairing).
 *   G2  No code path HARD-DELETES a live session folder. Any remaining
 *       fs.rmSync(<session dir>, {recursive:true,force:true}) /
 *       deleteFolderRecursive(<session dir>) is rewritten to quarantine
 *       (rename aside) — a session is never destroyed by a stale 401/logout.
 *
 * Safe + idempotent: a file with no such call reports "clean".
 */
'use strict';

try {
  const fs = require('fs');
  const path = require('path');
  const SP = require('./sessionPaths');

  SP.ensureSessionRoot();

  const targets = [
    { file: 'pair.js',                          req: './sessionPaths' },
    { file: 'server.js',                        req: './sessionPaths' },
    { file: 'index.js',                         req: './sessionPaths' },
    { file: 'autoload.js',                      req: './sessionPaths' },
    { file: 'mias/index.js',                    req: '../sessionPaths' },
    { file: path.join('deploy', 'deploymentManager.js'), req: '../sessionPaths' },
  ];

  const SESSIONISH = /(pairing|sessionDir|SESSION_DIR|sessionPath|AUTH_DIR|auth_info|authDir|dirPath|sessions?)/i;

  function skipBalanced(src, open) {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return -1;
  }

  let totalRewrites = 0;

  for (const t of targets) {
    const full = path.join(__dirname, t.file);
    if (!fs.existsSync(full)) continue;
    let src = fs.readFileSync(full, 'utf8');
    const original = src;
    let rewrites = 0;

    /* ── fs.rmSync(<session-ish>, {recursive:true, force:true}) ──────────── */
    let idx = 0;
    while ((idx = src.indexOf('fs.rmSync(', idx)) !== -1) {
      const argStart = idx + 'fs.rmSync('.length;
      const argEnd = src.indexOf(',', argStart);
      if (argEnd === -1) { idx = argStart; continue; }
      const arg = src.slice(argStart, argEnd).trim();
      const close = skipBalanced(src, idx + 'fs.rmSync'.length);
      if (close === -1) { idx = argStart; continue; }
      if (!SESSIONISH.test(arg) || /quarantineDir/.test(arg) || /\.quarantine-/.test(arg)) { idx = close; continue; }
      const safeArg = (/^[A-Za-z_$][\w$.\[\]]*$/.test(arg) || /^process\.env/.test(arg))
        ? arg
        : JSON.stringify(arg); // never allow injected code from an expression
      const pre = src.slice(0, idx);
      const post = src.slice(close);
      src = pre + 'require(\'' + t.req + '\').quarantineDir(' + safeArg + ', \'stale/logout session — quarantined, never deleted\')' + post;
      idx = pre.length + 70;
      rewrites++;
    }

    /* ── deleteFolderRecursive(<session-ish>) ────────────────────────────── */
    src = src.replace(/deleteFolderRecursive\(([^)]*(?:session|AUTH|pairing|auth_info)[^)]*)\)/gi, function (m, arg) {
      rewrites++;
      return 'require(\'' + t.req + '\').quarantineDir(' + arg.trim() + ', \'stale/logout session — quarantined, never deleted\')';
    });

    if (src !== original) {
      fs.writeFileSync(full, src, 'utf8');
      console.log('[precious-session-fix] ' + t.file + ': rewrote ' + rewrites + ' destructive session delete(s) → quarantine ✓');
    } else {
      console.log('[precious-session-fix] ' + t.file + ': clean (no destructive session delete) ✓');
    }
    totalRewrites += rewrites;
  }

  console.log('[precious-session-fix] session root = ' + SP.ensureSessionRoot() + ' | total rewrites = ' + totalRewrites);
} catch (e) {
  console.log('[precious-session-fix] skipped:', e && e.message);
}
