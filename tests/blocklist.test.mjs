// node --test tests/blocklist.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import * as BL from "../mias/lib/blocklist.js";

function makeSock({ blocklist = [], failWith = null, applies = true, me = "111222333444" } = {}) {
  const state = new Set(blocklist.map(String));
  const calls = [];
  return {
    calls,
    user: { id: `${me}:12@s.whatsapp.net` },
    async updateBlockStatus(jid, action) {
      calls.push([jid, action]);
      if (failWith) throw Object.assign(new Error(failWith), { data: 400 });
      if (!applies) return;
      const n = jid.split("@")[0];
      if (action === "block") state.add(n); else state.delete(n);
    },
    async fetchBlocklist() { return [...state].map((n) => `${n}@s.whatsapp.net`); },
    async onWhatsApp(n) { return [{ jid: `${String(n).replace(/[^0-9]/g, "")}@s.whatsapp.net`, exists: true }]; },
  };
}

test("normalizeUserJid accepts only individual user targets", () => {
  assert.equal(BL.normalizeUserJid("2349068551055@s.whatsapp.net"), "2349068551055@s.whatsapp.net");
  assert.equal(BL.normalizeUserJid("2349068551055:12@s.whatsapp.net"), "2349068551055@s.whatsapp.net");
  assert.equal(BL.normalizeUserJid("+234 906 855 1055"), "2349068551055@s.whatsapp.net");
  for (const bad of [
    "12036304@g.us", "status@broadcast", "1203@broadcast", "abc@newsletter",
    "9987@lid", "", null, undefined, "123", "1234567890123456789@s.whatsapp.net",
  ]) assert.equal(BL.normalizeUserJid(bad), "", `expected reject: ${bad}`);
});

test("group / status targets are refused before any API call", async () => {
  BL._resetCacheForTests();
  const sock = makeSock();
  const res = await BL.setBlockStatus(sock, "12036304@g.us", "block");
  assert.equal(res.ok, false);
  assert.equal(res.code, "invalid-target");
  assert.equal(sock.calls.length, 0);
});

test("self target is refused", async () => {
  BL._resetCacheForTests();
  const sock = makeSock({ me: "111222333444" });
  const res = await BL.setBlockStatus(sock, "111222333444@s.whatsapp.net", "block");
  assert.equal(res.ok, false);
  assert.equal(res.code, "self-target");
  assert.equal(sock.calls.length, 0);
});

test("block sends a bare user jid and is verified against the blocklist", async () => {
  BL._resetCacheForTests();
  const sock = makeSock();
  const res = await BL.setBlockStatus(sock, "2349068551055:3@s.whatsapp.net", "block");
  assert.equal(res.ok, true);
  assert.equal(res.verified, true);
  assert.deepEqual(sock.calls, [["2349068551055@s.whatsapp.net", "block"]]);
  assert.equal(BL.isBlockedJid("2349068551055@s.whatsapp.net"), true);
});

test("unblock actually clears the state and is verified", async () => {
  BL._resetCacheForTests();
  const sock = makeSock({ blocklist: ["2349068551055"] });
  const res = await BL.setBlockStatus(sock, "2349068551055", "unblock");
  assert.equal(res.ok, true);
  assert.equal(res.verified, true);
  assert.equal(BL.isBlockedJid("2349068551055"), false);
});

test("unblock that WhatsApp accepts but does not apply is reported as a failure", async () => {
  BL._resetCacheForTests();
  const sock = makeSock({ blocklist: ["2349068551055"], applies: false });
  const res = await BL.setBlockStatus(sock, "2349068551055", "unblock");
  assert.equal(res.ok, false);
  assert.equal(res.verified, false);
  assert.equal(res.code, "not-applied");
});

test("API errors are surfaced transparently, never swallowed", async () => {
  BL._resetCacheForTests();
  const sock = makeSock({ failWith: "bad-request" });
  const res = await BL.setBlockStatus(sock, "2349068551055", "block");
  assert.equal(res.ok, false);
  assert.match(res.error, /bad-request/);
  assert.equal(res.code, 400);
});

test("already-blocked / already-unblocked short-circuits without an API call", async () => {
  BL._resetCacheForTests();
  const sock = makeSock({ blocklist: ["2349068551055"] });
  const res = await BL.setBlockStatus(sock, "2349068551055", "block");
  assert.equal(res.ok, true);
  assert.equal(res.alreadyInState, true);
  assert.equal(sock.calls.length, 0);
});

test("@lid targets resolve to a phone jid before blocking", async () => {
  BL._resetCacheForTests();
  const sock = makeSock();
  sock.signalRepository = { lidMapping: { getPNForLID: async () => "2349068551055@s.whatsapp.net" } };
  const res = await BL.setBlockStatus(sock, "77665544@lid", "block");
  assert.equal(res.ok, true);
  assert.deepEqual(sock.calls, [["2349068551055@s.whatsapp.net", "block"]]);
});

test("global gate: messages from blocked users are dropped, own messages kept", async () => {
  BL._resetCacheForTests();
  const sock = makeSock({ blocklist: ["2349068551055"] });
  await BL.fetchBlocklist(sock, { force: true });
  const batch = [
    { key: { remoteJid: "2349068551055@s.whatsapp.net" } },
    { key: { remoteJid: "12036304@g.us", participant: "2349068551055@s.whatsapp.net" } },
    { key: { remoteJid: "2349068551055@s.whatsapp.net", fromMe: true } },
    { key: { remoteJid: "5551234567@s.whatsapp.net" } },
  ];
  const kept = batch.filter((m) => m.key.fromMe || !BL.isBlockedJid(m.key.participant || m.key.remoteJid));
  assert.equal(kept.length, 2);
});

test("call gate: only blocked callers are rejected", async () => {
  BL._resetCacheForTests();
  const sock = makeSock({ blocklist: ["2349068551055"] });
  await BL.fetchBlocklist(sock, { force: true });
  const rejected = [];
  for (const call of [
    { id: "a", from: "2349068551055@s.whatsapp.net" },
    { id: "b", from: "5551234567@s.whatsapp.net" },
    { id: "c", from: "12036304@g.us", isGroup: true },
  ]) {
    if (!call.isGroup && BL.isBlockedJid(call.from)) rejected.push(call.id);
  }
  assert.deepEqual(rejected, ["a"]);
});
