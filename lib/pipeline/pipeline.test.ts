import assert from "node:assert/strict";
import test from "node:test";
import { editedDuration, segmentTranscript } from "./segment";
import {
  hydrateEditState,
  serializeEditState,
  sourceTimeAt,
  buildTimeline,
  timelineDuration,
  DEFAULT_EDIT_STATE,
} from "@/components/app/studio/types";
import type { TranscriptionResult } from "@/lib/providers/types";
import type { Project } from "@/lib/app-data";
import { wordKey } from "@/lib/segments";
import { occurrencesOf, resolveWords, withTrailingPunctuation } from "@/lib/edit-state";

/** Builds a transcript from "word@start-end" shorthand, so tests stay legible. */
function transcript(spec: string, durationSec?: number): TranscriptionResult {
  const words = spec
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [word, range] = token.split("@");
      const [start, end] = range.split("-").map(Number);
      return { word, start, end, confidence: 0.95 };
    });
  return {
    language: "en",
    durationSec: durationSec ?? (words.at(-1)?.end ?? 0),
    words,
  };
}

test("a pause after a full stop starts a new chapter", () => {
  const drafts = segmentTranscript(
    transcript(`
      Here@0-0.4 is@0.4-0.7 the@0.7-0.9 shipments@0.9-1.6 board.@1.6-2.9
      Every@3.8-4.3 row@4.3-4.7 is@4.7-4.9 one@4.9-5.2 delivery.@5.2-6.4
    `),
  );
  assert.equal(drafts.length, 2);
  // A chapter title is a label, not a sentence: the trailing stop is dropped.
  assert.equal(drafts[0].title, "Here is the shipments board");
  assert.equal(drafts[1].ordinal, 1);
  // The gap between them belongs to neither chapter.
  assert.ok(drafts[1].startSec > drafts[0].endSec);
});

test("a pause mid-sentence does not start a chapter", () => {
  const drafts = segmentTranscript(
    transcript(`
      Here@0-0.4 is@0.4-0.7 the@0.7-0.9 shipments@0.9-1.6 board@1.6-2.9
      and@4.0-4.3 every@4.3-4.7 row@4.7-5.4 is@5.4-5.6 a@5.6-5.7 delivery.@5.7-6.4
    `),
  );
  assert.equal(drafts.length, 1);
});

test("hard fillers are marked, never removed", () => {
  const [draft] = segmentTranscript(
    transcript("So@0-0.3 um@0.3-0.6 click@0.6-1.1 here.@1.1-1.6"),
  );
  assert.equal(draft.words.length, 4, "every word survives the import");
  assert.deepEqual(
    draft.words.map((w) => Boolean(w.cut)),
    [false, true, false, false],
  );
});

test("a soft filler inside a sentence is left alone", () => {
  // "like" spoken mid-phrase is doing a job; only a stranded one is a tic.
  const [draft] = segmentTranscript(
    transcript("looks@0-0.4 like@0.4-0.7 this@0.7-1.0 one.@1.0-1.4"),
  );
  assert.equal(draft.words.find((w) => w.w === "like")?.cut, undefined);

  const [stranded] = segmentTranscript(
    transcript("so@0-0.4 like@0.9-1.2 this@1.8-2.1 one.@2.1-2.5"),
  );
  assert.equal(stranded.words.find((w) => w.w === "like")?.cut, true);
});

test("silent footage becomes one chapter spanning the take", () => {
  const drafts = segmentTranscript({ language: "en", durationSec: 42, words: [] });
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].endSec, 42);
  assert.deepEqual(drafts[0].words, []);
});

test("a long unbroken monologue is still cut into chapters", () => {
  const words = Array.from({ length: 300 }, (_, i) => `word${i}@${i * 0.4}-${i * 0.4 + 0.3}`);
  const drafts = segmentTranscript(transcript(words.join(" ")));
  assert.ok(drafts.length > 4, `expected several chapters, got ${drafts.length}`);
  for (const draft of drafts) {
    assert.ok(draft.endSec - draft.startSec <= 25, "no chapter runs past the ceiling");
  }
});

test("a two-word tail is folded into the chapter before it", () => {
  const drafts = segmentTranscript(
    transcript(`
      Here@0-0.4 is@0.4-0.7 the@0.7-0.9 shipments@0.9-1.6 board.@1.6-2.9
      Thanks.@4.0-4.4
    `),
  );
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].words.at(-1)?.w, "Thanks.");
});

test("edited duration counts only the words that survive the cut", () => {
  const drafts = segmentTranscript(transcript("So@0-0.3 um@0.3-1.3 click.@1.3-1.6"));
  // 0.3 + 0.3 spoken, plus the 0.35 breath. The cut "um" costs a full second.
  assert.ok(Math.abs(editedDuration(drafts) - 0.95) < 0.001);
});

/* ------------------------------------------------ the Studio's saved state */

test("edit state survives a round trip through JSON", () => {
  const state = {
    ...DEFAULT_EDIT_STATE,
    removeFillers: false,
    captions: false,
    deletedSegments: new Set([3, 1, 1]),
  };
  const wire = JSON.parse(JSON.stringify(serializeEditState(state)));
  const back = hydrateEditState(wire);

  assert.equal(back.removeFillers, false);
  assert.equal(back.captions, false);
  assert.deepEqual([...back.deletedSegments], [1, 3]);
  assert.equal(back.zoomEnabled, true, "untouched flags keep their default");
});

test("a Set would serialize to nothing, which is why it is an array on the wire", () => {
  // Guards the bug this shape exists to prevent: JSON.stringify(new Set([1]))
  // is "{}", so a "saved" edit would have saved no deletions at all.
  assert.equal(JSON.stringify(new Set([1, 2])), "{}");
  assert.equal(JSON.stringify(serializeEditState(DEFAULT_EDIT_STATE).deletedSegments), "[]");
});

test("a malformed or absent saved state falls back to the defaults", () => {
  for (const input of [null, undefined, "nonsense", 7, { deletedSegments: "all" }]) {
    const state = hydrateEditState(input);
    assert.equal(state.removeFillers, true);
    assert.equal(state.deletedSegments.size, 0);
  }
});

/* ------------------------------------------------ edited time → source time */

function projectWith(drafts: ReturnType<typeof segmentTranscript>): Project {
  return {
    id: "p", slug: "p", title: "p", description: "", status: "ready",
    durationSec: 0, sourceDurationSec: 0, updatedAt: "", createdAt: "",
    owner: "", brandKit: "", voice: "", locales: [], outputs: [],
    views: 0, completion: 0, ctaClicks: 0, collection: "",
    segments: drafts.map((d, i) => ({
      id: `s${i}`, title: d.title, start: d.startSec, end: d.endSec, words: d.words,
    })),
  };
}

test("the playhead maps back to where the words actually are in the file", () => {
  // "um" runs from 0.3 to 1.3 in the source and is cut from the edit, so
  // edited time 0.3 must point at 1.3 in the file, not at 0.3.
  const drafts = segmentTranscript(transcript("So@0-0.3 um@0.3-1.3 click.@1.3-1.6"));
  const project = projectWith(drafts);
  const timeline = buildTimeline(project, DEFAULT_EDIT_STATE);

  assert.equal(sourceTimeAt(timeline, 0), 0);
  assert.ok(Math.abs((sourceTimeAt(timeline, 0.31) ?? 0) - 1.31) < 0.02);
});

test("a take with no speech still plays, start to end", () => {
  // Recorded without a microphone, or over music: Deepgram hears nothing,
  // and the editor must still show the footage rather than a zero-length
  // edit with a play button that does nothing.
  const silent: TranscriptionResult = { language: "en", durationSec: 47.8, words: [] };
  const drafts = segmentTranscript(silent);
  assert.equal(drafts.length, 1);
  assert.ok(Math.abs(editedDuration(drafts) - (47.8 + 0.35)) < 0.001);

  const timeline = buildTimeline(projectWith(drafts), DEFAULT_EDIT_STATE);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].silent, true);
  assert.equal(timeline[0].text, "");
  assert.ok(Math.abs(timelineDuration(timeline) - 47.8) < 0.001);
  // No words means nothing was cut, so edited time is source time.
  assert.equal(sourceTimeAt(timeline, 0), 0);
  assert.ok(Math.abs((sourceTimeAt(timeline, 12.5) ?? 0) - 12.5) < 0.001);
});

test("a word cut by hand leaves the timeline and the file skips over it", () => {
  const drafts = segmentTranscript(
    transcript("Open@0-0.4 the@0.4-0.6 shipments@0.6-1.2 board.@1.2-1.8"),
  );
  const timeline = buildTimeline(projectWith(drafts), {
    ...DEFAULT_EDIT_STATE,
    cutWords: new Set([wordKey(0, 1)]),
  });
  assert.deepEqual(
    timeline.map((w) => w.text),
    ["Open", "shipments", "board."],
  );
  // "shipments" now starts at 0.4 in the edit and still at 0.6 in the file.
  assert.ok(Math.abs((sourceTimeAt(timeline, 0.41) ?? 0) - 0.61) < 0.02);
});

test("hand cuts survive the trip through the saved edit state", () => {
  const state = { ...DEFAULT_EDIT_STATE, cutWords: new Set([wordKey(2, 5), wordKey(0, 1)]) };
  const stored = serializeEditState(state);
  assert.deepEqual(stored.cutWords, [[0, 1], [2, 5]]);
  assert.deepEqual([...hydrateEditState(stored).cutWords], [wordKey(0, 1), wordKey(2, 5)]);

  // Anything that is not a pair of non-negative integers is dropped, not trusted.
  const hydrated = hydrateEditState({ cutWords: [[1], ["a", 2], [-1, 0], [3, 4, 5], [1, 2]] });
  assert.deepEqual([...hydrated.cutWords], [wordKey(1, 2)]);
});

test("a rewritten run of words is one token that keeps the time of the words it replaces", () => {
  const drafts = segmentTranscript(transcript("Open@0-0.4 C@0.4-0.6 L@0.6-0.8 O@0.8-1.0 now.@1.0-1.5"));
  const project = projectWith(drafts);
  const state = {
    ...DEFAULT_EDIT_STATE,
    wordEdits: new Map([[wordKey(0, 1), { span: 3, text: "Claude" }]]),
  };
  const words = resolveWords(project.segments[0], 0, state);
  assert.deepEqual(
    words.map((w) => [w.text, w.spoken, w.original, w.t, w.d, w.edited]),
    [["Open", "Open", "Open", 0, 0.4, false], ["Claude", "Claude", "C L O", 0.4, 0.6, true], ["now.", "now.", "now.", 1, 0.5, false]],
  );
  const timeline = buildTimeline(project, state);
  assert.deepEqual(timeline.map((w) => [w.text, w.start, w.end]), [["Open", 0, 0.4], ["Claude", 0.4, 1], ["now.", 1, 1.5]]);
  // The file is untouched: edited time 0.5 is 0.5 in the source.
  assert.ok(Math.abs((sourceTimeAt(timeline, 0.5) ?? 0) - 0.5) < 0.001);
});

test("a brand spelling shows one thing and says another", () => {
  const drafts = segmentTranscript(transcript("Open@0-0.4 Core@0.4-0.8 now.@0.8-1.2"));
  const project = projectWith(drafts);
  const state = {
    ...DEFAULT_EDIT_STATE,
    wordEdits: new Map([[wordKey(0, 1), { span: 1, text: "Qore", spoken: "Core" }]]),
  };
  const [, qore] = resolveWords(project.segments[0], 0, state);
  assert.equal(qore.text, "Qore");
  assert.equal(qore.spoken, "Core");
  // A cut on the rewritten token removes it from the timeline like any word.
  const cut = { ...state, cutWords: new Set([wordKey(0, 1)]) };
  assert.deepEqual(buildTimeline(project, cut).map((w) => w.text), ["Open", "now."]);
});

test("word edits survive the trip through the saved edit state, and junk does not", () => {
  const state = {
    ...DEFAULT_EDIT_STATE,
    wordEdits: new Map([
      [wordKey(1, 4), { span: 1, text: "Qore", spoken: "Core" }],
      [wordKey(0, 2), { span: 3, text: "Claude" }],
    ]),
  };
  const stored = serializeEditState(state);
  assert.deepEqual(stored.wordEdits, [
    { s: 0, w: 2, n: 3, text: "Claude" },
    { s: 1, w: 4, n: 1, text: "Qore", spoken: "Core" },
  ]);
  const back = hydrateEditState(stored);
  assert.deepEqual([...back.wordEdits.entries()], [...state.wordEdits.entries()].sort());

  const hydrated = hydrateEditState({
    wordEdits: [
      { s: 0, w: 0, n: 1, text: "ok" },
      { s: 0, w: 1, n: 0, text: "no span" },
      { s: 0, w: 2, n: 1, text: "   " },
      { s: -1, w: 2, n: 1, text: "negative" },
      { s: 0, w: 3, n: 1, text: "same", spoken: "same" },
      "nope",
    ],
  });
  assert.deepEqual(
    [...hydrated.wordEdits.entries()],
    [[wordKey(0, 0), { span: 1, text: "ok" }], [wordKey(0, 3), { span: 1, text: "same" }]],
  );
});

test("apply to all finds every place the transcriber wrote the phrase, punctuation aside", () => {
  const drafts = segmentTranscript(
    transcript("Open@0-0.4 C@0.4-0.6 L@0.6-0.8 O.@0.8-1.0 Ask@1.0-1.2 c@1.2-1.4 l@1.4-1.6 o@1.6-1.8 again.@1.8-2.4"),
  );
  const project = projectWith(drafts);
  assert.deepEqual(occurrencesOf(project, ["C", "L", "O"]), [
    { segIndex: 0, wordIndex: 1, span: 3 },
    { segIndex: 0, wordIndex: 5, span: 3 },
  ]);
  // The transcriber's trailing punctuation stays unless the person typed their own.
  assert.equal(withTrailingPunctuation("Claude", "O."), "Claude.");
  assert.equal(withTrailingPunctuation("Claude", "o"), "Claude");
  assert.equal(withTrailingPunctuation("Claude!", "O."), "Claude!");
});

test("keeping the fillers makes edited time and source time agree again", () => {
  const drafts = segmentTranscript(transcript("So@0-0.3 um@0.3-1.3 click.@1.3-1.6"));
  const timeline = buildTimeline(projectWith(drafts), {
    ...DEFAULT_EDIT_STATE,
    removeFillers: false,
  });
  assert.ok(Math.abs((sourceTimeAt(timeline, 0.5) ?? 0) - 0.5) < 0.02);
});
