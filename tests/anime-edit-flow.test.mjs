import test from "node:test";
import assert from "node:assert/strict";
import { createAnimeEditFlow } from "../mias/features/animeEdits.js";
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