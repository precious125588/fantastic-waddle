import test from "node:test";
import assert from "node:assert/strict";
import ownership from "../sessionOwnership.js";

test("session ownership uses the same canonical folder as pair.js", () => {
  assert.match(
    ownership.sessionDirFor("2349068551055@s.whatsapp.net"),
    /2349068551055@s\.whatsapp\.net$/,
  );
  assert.equal(
    ownership.sessionDirFor("2349068551055"),
    ownership.sessionDirFor("2349068551055@s.whatsapp.net"),
  );
});