import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnimeEditFlow,
  buildNarutoSearchQueries,
  NARUTO_HASHTAGS,
  NARUTO_RESULTS,
  NARUTO_SEARCH_ANCHOR,
  TIKWM_SEARCH_ENDPOINTS,
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

test("Naruto search always anchors on #narutoedit and rotates every secondary hashtag", () => {
  const queries = buildNarutoSearchQueries();
  const expected = new Set(
    NARUTO_HASHTAGS
      .filter((hashtag) => hashtag.toLowerCase() !== NARUTO_SEARCH_ANCHOR)
      .map((hashtag) => hashtag.toLowerCase()),
  );
  assert.equal(queries.length, expected.size);
  assert.deepEqual(new Set(queries.map((query) => query.split(" ")[1].toLowerCase())), expected);
  assert.ok(queries.every((query) => query.toLowerCase().startsWith(`${NARUTO_SEARCH_ANCHOR} `)));
});

test("Naruto rejects plain and AI-style clips without the edit hashtag", () => {
  assert.equal(isNarutoEditTitle("Naruto"), false);
  assert.equal(isNarutoEditTitle("Naruto AI generated animation"), false);
  assert.equal(isNarutoEditTitle("Obito edit #narutoedit #naruto"), true);
});