import test from "node:test";
import assert from "node:assert/strict";
import {
  createStatusEditFlow,
  buildStatusVideoMessage,
  getMp4DurationSeconds,
  parseStatusPlatform,
  parseStatusQuantity,
} from "../mias/lib/statusEditFlow.js";

test("status platform choices accept numbers and names", () => {
  assert.equal(parseStatusPlatform("1"), "tiktok");
  assert.equal(parseStatusPlatform("Pinterest"), "pinterest");
  assert.equal(parseStatusPlatform("option 3"), "youtube");
  assert.equal(parseStatusPlatform("YouTube"), "youtube");
  assert.equal(parseStatusPlatform("fb"), "facebook");
  assert.equal(parseStatusPlatform("option 5"), null);
});

test("status videos never carry a caption and only use the approved mimetype", () => {
  const payload = buildStatusVideoMessage(Buffer.from("video"));
  assert.equal(payload.mimetype, "video/mp4");
  assert.equal(Object.hasOwn(payload, "caption"), false);
});

test("status quantities are capped at five", () => {
  assert.equal(parseStatusQuantity("1"), 1);
  assert.equal(parseStatusQuantity("3 edits"), 3);
  assert.equal(parseStatusQuantity("10 videos"), 5);
  assert.equal(parseStatusQuantity("zero"), 0);
});

test("malformed media does not report a duration", () => {
  assert.equal(getMp4DurationSeconds(Buffer.from("not an mp4")), 0);
});

test("status wizard advances only from quoted bot prompts", async () => {
  let counter = 0;
  const sent = [];
  const sock = {
    async sendMessage(jid, content, options) {
      const message = { key: { id: `prompt-${++counter}`, remoteJid: jid } };
      sent.push({ jid, content, options, message });
      return message;
    },
  };
  const original = {
    key: { remoteJid: "2349000000000@s.whatsapp.net" },
    message: { conversation: ".status" },
  };
  const flow = createStatusEditFlow({ prefix: "." });

  await flow.start(sock, original);
  assert.match(sent.at(-1).content.text, /What status edit/i);

  const topicReply = {
    key: { remoteJid: original.key.remoteJid },
    message: {
      extendedTextMessage: {
        text: "Naruto",
        contextInfo: { stanzaId: "prompt-1", quotedMessage: { conversation: "prompt" } },
      },
    },
  };
  assert.equal(await flow.handleReply(sock, topicReply, "Naruto"), true);
  assert.match(sent.at(-1).content.text, /TikTok/);

  const platformReply = {
    key: { remoteJid: original.key.remoteJid },
    message: {
      extendedTextMessage: {
        text: "2",
        contextInfo: { stanzaId: "prompt-2", quotedMessage: { conversation: "menu" } },
      },
    },
  };
  assert.equal(await flow.handleReply(sock, platformReply, "2"), true);
  assert.match(sent.at(-1).content.text, /How many edits/i);

  const quantityReply = {
    key: { remoteJid: original.key.remoteJid },
    message: {
      extendedTextMessage: {
        text: "0",
        contextInfo: { stanzaId: "prompt-3", quotedMessage: { conversation: "quantity" } },
      },
    },
  };
  assert.equal(await flow.handleReply(sock, quantityReply, "0"), true);
  assert.match(sent.at(-1).content.text, /1 to 5/i);
});