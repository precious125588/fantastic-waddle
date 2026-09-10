import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnimeEditFlow,
  buildNarutoSearchQueries,
  NARUTO_HASHTAGS,
  NARUTO_RESULTS,
  NARUTO_SEARCH_ANCHORS,
  TIKWM_SEARCH_ENDPOINTS,
  canonicalUrl,
  isNarutoEditTitle,
} from "../mias/features/animeEdits.js";
import { parseCommand } from "../mias/lib/prefix.cjs";

test(".Naruto is routed to the remote anime-edit shortcut", () => {
  const flow = createAnimeEditFlow({ prefix: "." });
  const parsed = parseCommand(".Naruto", ".");

  assert.equal(parsed.isCommand, true);
  assert.equal(parsed.command, "naruto");
  assert.equal(flow.resolve(parsed.command)?.slug, "naruto");
  assert.equal(flow.resolve(parsed.command)?.query, "Naruto");
});

test("raw anime commands resolve when no prefix is configured", () => {
  const flow = createAnimeEditFlow({ prefix: "" });
  const parsed = parseCommand("Naruto", null);

  assert.equal(parsed.isCommand, true);
  assert.equal(parsed.command, "naruto");
  assert.equal(flow.resolve(parsed.command)?.slug, "naruto");
});

test("built-in anime shortcuts all resolve through the same pipeline", () => {
  const flow = createAnimeEditFlow({ prefix: "." });
  for (const command of [
    "naruto",
    "jjk",
    "onepiece",
    "bleach",
    "demonslayer",
    "dragonball",
    "attackontitan",
    "sololeveling",
    "myheroacademia",
    "onepunchman",
    "blackclover",
    "chainsawman",
    "tokyorevengers",
    "bluelock",
  ]) {
    assert.ok(flow.resolve(command), `missing anime shortcut: ${command}`);
  }
});

test("unknown anime-title commands are not routed to the edit pipeline", () => {
  const flow = createAnimeEditFlow({ prefix: "." });
  assert.equal(flow.resolve("animeedit"), null);
  assert.equal(flow.resolve("vinlandsaga"), null);
});

test("Naruto uses exactly two hashtag results and the working TikWM search route", () => {
  assert.equal(NARUTO_RESULTS, 2);
  assert.ok(NARUTO_HASHTAGS.length >= 2);
  const normalizedHashtags = NARUTO_HASHTAGS.map((hashtag) =>
    hashtag.replace(/^#+/, "").toLowerCase(),
  );
  assert.equal(new Set(normalizedHashtags).size, normalizedHashtags.length);
  for (const hashtag of [
    "#sakuraharuno",
    "#borutotwobluevortex",
    "#otsutsukiedits",
    "#shinjutsupowers",
    "#narutoedits4k",
    "#perfectsusanoo",
    "#tentailsedits",
  ]) {
    assert.ok(
      normalizedHashtags.includes(hashtag.slice(1)),
      `missing requested hashtag: ${hashtag}`,
    );
  }
  assert.ok(
    TIKWM_SEARCH_ENDPOINTS.every((endpoint) => endpoint.endsWith("/api/feed/search/")),
    "TikWM hashtag search must use the slash JSON endpoint",
  );

  const flow = createAnimeEditFlow({ prefix: "." });
  const registered = [];
  flow.registerCommands((command, metadata) => registered.push({ command, metadata }));
  const naruto = registered.find((item) => item.command === "naruto");
  assert.ok(naruto);
  assert.match(naruto.metadata.desc, /Send 2 random HD Naruto edits/);
});

test("Naruto search randomly uses one edit anchor and rotates every secondary hashtag", () => {
  const seenAnchors = new Set();
  const originalRandom = Math.random;
  try {
    for (const randomValue of [0, 0.999]) {
      Math.random = () => randomValue;
      const queries = buildNarutoSearchQueries();
      const anchors = new Set(queries.map((query) => query.split(" ")[0].toLowerCase()));
      assert.equal(anchors.size, 1);
      const anchor = [...anchors][0];
      assert.ok(NARUTO_SEARCH_ANCHORS.includes(anchor));
      seenAnchors.add(anchor);
      assert.ok(queries.every((query) => query.split(" ").length === 2));
      assert.ok(queries.every((query) => !NARUTO_SEARCH_ANCHORS.includes(query.split(" ")[1].toLowerCase())));
    }
  } finally {
    Math.random = originalRandom;
  }
  assert.deepEqual(seenAnchors, new Set(NARUTO_SEARCH_ANCHORS));
});

test("canonical URL keys collapse duplicate TikTok links", () => {
  assert.equal(
    canonicalUrl("HTTPS://WWW.TIKTOK.COM/@creator/video/123/?is_from_webapp=1"),
    "https://www.tiktok.com/@creator/video/123",
  );
  assert.equal(
    canonicalUrl("https://www.tiktok.com/@creator/video/123#share"),
    "https://www.tiktok.com/@creator/video/123",
  );
});

test("Naruto rejects plain and AI-style clips without the edit hashtag", () => {
  assert.equal(isNarutoEditTitle("Naruto"), false);
  assert.equal(isNarutoEditTitle("Naruto AI generated animation"), false);
  assert.equal(isNarutoEditTitle("Obito edit #narutoedit #naruto"), true);
  assert.equal(isNarutoEditTitle("Sasuke edit #narutoedits #uchiha"), true);
});