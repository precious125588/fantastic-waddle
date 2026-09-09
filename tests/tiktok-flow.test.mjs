import test from "node:test";
import assert from "node:assert/strict";
import {
  extractTikTokUrl,
  normalizeTikTokMode,
  normalizeTikTokResponse,
  parseTikTokMode,
  selectTikTokUrl,
} from "../mias/features/tiktok.js";

test("TikTok reply choices normalize the formats users actually type", () => {
  assert.equal(normalizeTikTokMode("1.3"), "1.3");
  assert.equal(normalizeTikTokMode("option 1.3"), "1.3");
  assert.equal(normalizeTikTokMode("*1,3*"), "1.3");
  assert.equal(normalizeTikTokMode("1 3"), "1.3");
  assert.equal(normalizeTikTokMode("hd"), "1.3");
  assert.equal(normalizeTikTokMode("voice"), "2.3");
  assert.equal(parseTikTokMode("not-an-option"), null);
});

test("TikTok links are extracted without trailing chat punctuation", () => {
  assert.equal(
    extractTikTokUrl("download this: https://www.tiktok.com/@demo/video/12345)."),
    "https://www.tiktok.com/@demo/video/12345",
  );
  assert.equal(
    extractTikTokUrl("www.tiktok.com/@demo/video/12345"),
    "https://www.tiktok.com/@demo/video/12345",
  );
  assert.equal(extractTikTokUrl("https://example.com/video/123"), null);
});

test("TikWM-shaped responses expose real URLs for every media family", () => {
  const info = normalizeTikTokResponse({
    data: {
      title: "Demo",
      author: { nickname: "Creator" },
      play: "https://cdn.example/sd.mp4",
      hdplay: "https://cdn.example/hd.mp4",
      wmplay: "https://cdn.example/wm.mp4",
      music: "https://cdn.example/music.mp3",
    },
  });

  assert.equal(selectTikTokUrl(info, parseTikTokMode("1.1")), "https://cdn.example/sd.mp4");
  assert.equal(selectTikTokUrl(info, parseTikTokMode("1.3")), "https://cdn.example/hd.mp4");
  assert.equal(selectTikTokUrl(info, parseTikTokMode("1.5")), "https://cdn.example/wm.mp4");
  assert.equal(selectTikTokUrl(info, parseTikTokMode("2.1")), "https://cdn.example/music.mp3");
  assert.equal(selectTikTokUrl(info, parseTikTokMode("2.3")), "https://cdn.example/music.mp3");
});