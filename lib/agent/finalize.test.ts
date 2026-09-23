import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { segmentsFromSteps, titleFromBrief } from "./finalize";
import { shapePlan } from "./outline";

describe("segmentsFromSteps", () => {
  const outline = [
    { ordinal: 0, intent: "Open the shipments list", url: "https://app.acme.com/shipments", narration: "You start on the shipments list, where every order in flight is one row." },
    { ordinal: 1, intent: "Create a shipment", action: { kind: "click" as const, target: "New shipment" }, narration: "One click starts a new shipment." },
    { ordinal: 2, intent: "Show tracking" },
  ];
  const steps = [
    { ordinal: 0, startMs: 0, endMs: 4000 },
    { ordinal: 1, startMs: 4000, endMs: 9000 },
    { ordinal: 2, startMs: 9000, endMs: 11000 },
  ];

  it("makes one chapter per step, over the footage the step was on screen for", () => {
    const drafts = segmentsFromSteps(outline, steps, 12);
    assert.equal(drafts.length, 3);
    assert.deepEqual(drafts.map((d) => [d.startSec, d.endSec]), [[0, 4], [4, 9], [9, 12]], "the last runs to the end of the video");
    assert.equal(drafts[1].action, "click → New shipment");
    assert.equal(drafts[2].words.map((w) => w.w).join(" "), "Show tracking", "a step with no narration says its intent");
  });

  it("lays the narration's words evenly across the chapter, inside it", () => {
    const [first] = segmentsFromSteps(outline, steps, 12);
    const words = first.words;
    assert.equal(words.length, 14);
    assert.equal(words[0].t, 0);
    const last = words[words.length - 1];
    assert.ok(last.t + last.d <= 4.0001, `last word ends at ${last.t + last.d}`);
    assert.ok(words.every((w, i) => i === 0 || w.t > words[i - 1].t), "in order");
  });

  it("ignores timings for steps the plan does not have", () => {
    const drafts = segmentsFromSteps(outline, [...steps, { ordinal: 7, startMs: 11000, endMs: 12000 }], 12);
    assert.equal(drafts.length, 3);
  });
});

describe("titleFromBrief", () => {
  it("cuts a long brief at a word and drops a trailing full stop", () => {
    assert.equal(titleFromBrief("Open the shipments list."), "Open the shipments list");
    const long = titleFromBrief("Open the shipments list, create a shipment for the Berlin warehouse, add two line items, and show the tracking page.");
    assert.ok(long.length <= 80 && long.endsWith("…") && !long.includes(" …"));
  });
});

describe("shapePlan with actions and narration", () => {
  it("keeps a well-formed action and narration, drops a malformed action", () => {
    const { outline } = shapePlan(
      [
        { intent: "Create", narration: "  A  new   shipment. ", action: { kind: "click", target: "  New  shipment " } },
        { intent: "Name it", action: { kind: "fill", target: "Reference", value: "BER-0001" } },
        { intent: "Nothing", action: { kind: "hover", target: "x" } },
        { intent: "No target", action: { kind: "click", target: "" } },
      ],
      ["https://app.acme.com"],
    );
    assert.deepEqual(outline[0].action, { kind: "click", target: "New shipment" });
    assert.equal(outline[0].narration, "A new shipment.");
    assert.deepEqual(outline[1].action, { kind: "fill", target: "Reference", value: "BER-0001" });
    assert.equal(outline[1].narration, undefined);
    assert.equal(outline[2].action, undefined);
    assert.equal(outline[3].action, undefined);
  });
});
