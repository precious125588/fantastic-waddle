MIAS replacement files
======================

These files address the two reported behaviours:

1. TikTok numbered replies such as `1.3`, `.1.3`, `2.1`, and button/native-flow
   variants are routed to the pending picker, even when WhatsApp changes the
   linked-device suffix on the chat JID. The download reaction is forced before
   media retrieval, the status message says exactly what is being downloaded
   and uploaded, and the same status is edited to `Here is your ...` on success.
   Failures keep the picker available.
2. AIO/TikTok media downloads now check temporary disk space, clean only known
   stale MIAS temporary files, enforce a 64 MB default media limit, and return
   a visible WhatsApp error instead of leaving `Catching link...` hanging on
   ENOSPC.

Copy these paths over the matching paths in the project:

  mias/index.js
  mias/features/tiktok.js
  mias/lib/diskGuard.js

The test file is included for local verification:

  tests/tiktok-picker-and-disk.test.mjs

Optional environment values:

  DOWNLOAD_MAX_MB=64       maximum downloaded media size
  DOWNLOAD_MIN_FREE_MB=128 minimum free temporary disk space to keep reserved

Do not copy `.env`, auth folders, session folders, node_modules, or generated
package-lock files from the development workspace.