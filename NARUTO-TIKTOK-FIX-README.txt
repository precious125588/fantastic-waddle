Naruto TikTok edit replacement
==============================

Root cause
----------
The Naruto command was calling TikWM's search endpoint without its trailing
slash:

  /api/feed/search

TikWM currently returns HTTP 403 for that route. Its JSON search route is:

  /api/feed/search/

Because the Naruto shortcut only uses the hashtag search flow, every hashtag
search returned no candidates and the bot sent the "couldn't find a
downloadable TikTok edit" message.

Replacement
-----------
Copy the files in this archive over the matching paths in the bot:

  mias/features/animeEdits.js
  tests/anime-edit-flow.test.mjs

The command remains `.naruto` (case-insensitive) and sends exactly two
deduplicated TikTok videos sourced from the allow-listed Naruto hashtags.

Verification performed
----------------------
- Unit tests for command routing and the two-result limit: passed.
- Live TikWM hashtag search against the corrected endpoint: returned 20 rows.
- End-to-end fake WhatsApp send of `.naruto`: returned 2 valid MP4 videos
  (11,750,546 bytes and 4,726,351 bytes in the smoke run).