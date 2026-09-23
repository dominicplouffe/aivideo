import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "@/lib/app-data";
import { DEFAULT_EDIT_STATE, type EditState } from "@/lib/edit-state";
import { applyOption, matchPhrase, optionFromProposal } from "./suggest";

const words = (text: string, at = 0) =>
  text.split(" ").map((w, i) => ({ w, t: at + i * 0.5, d: 0.4 }));

const project = {
  id: "p", slug: "p", title: "Demo", description: "", status: "ready", durationSec: 0, sourceDurationSec: 30,
  updatedAt: "", createdAt: "", owner: "", brandKit: "", voice: "", locales: [], outputs: ["video"], views: 0, completion: 0, ctaClicks: 0, collection: "",
  voiceId: null,
  segments: [
    { id: "a", title: "Hello", start: 0, end: 5, words: words("Okay so, I think basically this is the dashboard."), zoom: null, zoomInferred: false },
    { id: "b", title: "Aside", start: 5, end: 10, words: words("By the way my cat is called Nike.", 5), zoom: null, zoomInferred: false },
    { id: "c", title: "Close", start: 10, end: 15, words: words("And that is the whole flow.", 10), zoom: null, zoomInferred: false },
  ],
} as unknown as Project;

const fresh = (): EditState => ({
  ...DEFAULT_EDIT_STATE,
  removeFillers: false,
  deletedSegments: new Set(),
  cutWords: new Set(),
  wordEdits: new Map(),
  sceneTiming: new Map(),
  syncPoints: new Map(),
});

describe("matchPhrase", () => {
  it("finds a quoted run regardless of case and punctuation", () => {
    const run = project.segments[0].words.map((w, i) => ({ wordIndex: i, text: w.w }));
    assert.deepEqual(matchPhrase(run, "i think basically"), { from: 2, to: 4 });
    assert.deepEqual(matchPhrase(run, "Okay so"), { from: 0, to: 1 });
    assert.equal(matchPhrase(run, "the cat"), null);
  });
});

describe("optionFromProposal", () => {
  it("turns chapters and quoted phrases into an edit and measures it from the words", () => {
    const state = fresh();
    const option = optionFromProposal(
      project,
      state,
      {
        label: "Medium",
        summary: "Drops the aside and the hedges.",
        chapters: [1, 7],
        phrases: [{ chapter: 0, text: "I think basically" }, { chapter: 2, text: "not in the script" }],
      },
      { kind: "tighten" },
      "tighten-1",
    );
    assert.ok(option);
    assert.deepEqual(option.chapters.map((c) => c.index), [1], "a chapter that does not exist is ignored");
    assert.deepEqual(option.cutKeys, ["0:2", "0:3", "0:4"]);
    assert.deepEqual(option.unmatched, ["not in the script"]);
    assert.ok(option.afterSec < option.beforeSec);
    // Three words of 0.4 s plus the gaps between them, and the whole second chapter.
    assert.ok(option.beforeSec - option.afterSec > 4, `saved ${option.beforeSec - option.afterSec}`);
    const next = applyOption(state, option);
    assert.ok(next.deletedSegments.has(1));
    assert.ok(next.cutWords.has("0:3"));
    assert.equal(state.cutWords.size, 0, "the original edit is untouched");
  });

  it("is null when nothing would change", () => {
    const state = fresh();
    state.deletedSegments.add(1);
    const option = optionFromProposal(project, state, { label: "x", summary: "", chapters: [1], phrases: [{ chapter: 0, text: "zebra" }] }, { kind: "tighten" }, "t");
    assert.equal(option, null);
  });

  it("says whether a target was met, from the measured length", () => {
    const option = optionFromProposal(project, fresh(), { label: "To target", summary: "", chapters: [1, 2], phrases: [] }, { kind: "target", targetSec: 6 }, "t");
    assert.ok(option);
    assert.equal(option.meetsTarget, option.afterSec <= 6.5);
  });
});
