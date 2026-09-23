import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFreezeLog } from "./stillness";

describe("parseFreezeLog", () => {
  const log = [
    "Input #0, matroska,webm, from 'take.webm':",
    "  Duration: 00:00:13.20, start: 0.000000, bitrate: 81 kb/s",
    "[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 1.5",
    "[freezedetect @ 0x1] lavfi.freezedetect.freeze_duration: 2.0",
    "[freezedetect @ 0x1] lavfi.freezedetect.freeze_end: 3.5",
    "[freezedetect @ 0x1] lavfi.freezedetect.freeze_start: 9.0",
  ].join("\n");

  it("pairs starts with ends", () => {
    assert.deepEqual(parseFreezeLog(log), [[1.5, 3.5]]);
  });

  it("closes a freeze that ran to the end of the file at the file's length", () => {
    assert.deepEqual(parseFreezeLog(log, 13.2), [[1.5, 3.5], [9, 13.2]]);
  });

  it("does not invent a span when the end is before the start", () => {
    assert.deepEqual(parseFreezeLog("freeze_start: 9.0", 5), []);
  });
});
