import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTableLiveUrl, getYouTubeEmbedUrl } from "./liveStreams.ts";

const liveEntries = readFileSync(new URL("../../直播入口.txt", import.meta.url), "utf8")
  .trim()
  .split(/\r?\n/)
  .map((line) => {
    const separator = line.indexOf(":");
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] as const;
  });

test("maps every configured table to its YouTube live URL", () => {
  for (const [table, url] of liveEntries) {
    assert.equal(getTableLiveUrl(table), url, `${table} 的直播地址不匹配`);
  }
});

test("does not create a live URL for an unconfigured table", () => {
  assert.equal(getTableLiveUrl("T9"), null);
});

test("converts every configured live URL to its in-page embed URL", () => {
  for (const [table, url] of liveEntries) {
    const videoId = new URL(url).searchParams.get("v");
    assert.equal(
      getYouTubeEmbedUrl(url),
      `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=0&rel=0`,
      `${table} 的嵌入地址不匹配`
    );
  }
});

test("rejects unsupported or malformed embed URLs", () => {
  assert.equal(getYouTubeEmbedUrl("https://example.com/watch?v=U5jvB5DGwzM"), null);
  assert.equal(getYouTubeEmbedUrl("not-a-url"), null);
});
