import assert from "node:assert/strict";
import test from "node:test";
import { parseRange } from "./media";

/**
 * Range parsing, which a video player depends on and which is easy to get
 * subtly wrong in a way that still returns 206 and still looks fine.
 */

test("an open-ended range runs to the last byte", () => {
  assert.deepEqual(parseRange("bytes=0-", 1000), { start: 0, end: 999 });
  assert.deepEqual(parseRange("bytes=500-", 1000), { start: 500, end: 999 });
});

test("a closed range is inclusive at both ends", () => {
  // HTTP counts `bytes=0-0` as one byte, not zero.
  assert.deepEqual(parseRange("bytes=0-0", 1000), { start: 0, end: 0 });
  assert.deepEqual(parseRange("bytes=10-19", 1000), { start: 10, end: 19 });
});

test("a suffix range counts back from the end", () => {
  // `bytes=-500` is the last 500 bytes. Read as "up to byte 500" it serves
  // the wrong part of the file under a 206 that looks perfectly healthy —
  // and an MP4's index lives at the end, so this is exactly the request a
  // player makes first.
  assert.deepEqual(parseRange("bytes=-500", 1000), { start: 500, end: 999 });
  assert.deepEqual(parseRange("bytes=-5000", 1000), { start: 0, end: 999 });
});

test("an end past the file is clamped rather than refused", () => {
  assert.deepEqual(parseRange("bytes=900-99999", 1000), { start: 900, end: 999 });
});

test("a start past the file is unsatisfiable", () => {
  assert.equal(parseRange("bytes=1000-", 1000), "unsatisfiable");
  assert.equal(parseRange("bytes=5000-6000", 1000), "unsatisfiable");
  assert.equal(parseRange("bytes=50-10", 1000), "unsatisfiable");
});

test("no header and unparseable headers mean the whole file", () => {
  for (const header of [null, "", "bytes=", "items=0-10", "bytes=abc-def", "bytes=0-1,5-6"]) {
    assert.equal(parseRange(header, 1000), null, `${header}`);
  }
});
