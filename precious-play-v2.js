// =========================================================================
//  precious-play-v2.js  · repo root
//
//  THIN FX WRAPPER for ".play" — delegates the heavy lifting to the
//  streaming worker (download-worker.cjs) and the safe-delivery shim
//  (playv2-deliver.cjs). The actual picker UX still lives inside
//  mias/index.js so existing listeners / quoted-key handling on the
//  WA socket are preserved.
// =========================================================================

'use strict';

const { _p2Deliver } = require('./mias/lib/playv2-deliver.cjs');

async function play(sock, entry, choice, quotedKey) {
  return _p2Deliver(sock, entry, choice, quotedKey);
}

module.exports = { play };
