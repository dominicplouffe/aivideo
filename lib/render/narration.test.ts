import assert from "node:assert/strict";
import test from "node:test";
import type { Project } from "@/lib/app-data";
import type { SynthesisProvider, SynthesisRequest } from "@/lib/providers/types";
import { buildEdl } from "./edl";
import { narrate } from "./narration";

/**
 * The fitting rules, exercised with a synthesizer whose clip lengths are
 * under the test's control. Nothing here touches a vendor or a database:
 * what is being checked is our arithmetic, not theirs.
 */

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "prj_1", slug: "p", title: "P", description: "", status: "ready",
    durationSec: 0, sourceDurationSec: 20, updatedAt: "", createdAt: "",
    owner: "", brandKit: "", voice: "", locales: ["en-US"], outputs: ["video"],
    views: 0, completion: 0, ctaClicks: 0, collection: "",
    voiceId: "voice-uuid",
    editState: {},
    segments: [
      // 4 seconds of footage: words at 0.5s each.
      { id: "seg_1", title: "Open", start: 0, end: 4, words: [
        { w: "Open", t: 0, d: 1 }, { w: "the", t: 1, d: 1 }, { w: "board.", t: 2, d: 2 },
      ] },
      // 2 seconds of footage.
      { id: "seg_2", title: "Save", start: 6, end: 8, words: [{ w: "Then", t: 6, d: 1 }, { w: "save.", t: 7, d: 1 }] },
    ],
    ...overrides,
  } as Project;
}

/** Speaks every request at `secondsPerWord`, honouring the pace it is given. */
function synthesizer(secondsPerWord: number) {
  const requests: SynthesisRequest[] = [];
  const provider: SynthesisProvider = {
    name: "stub-synthesis",
    async synthesize(req) {
      requests.push(req);
      const words = req.text.split(/\s+/).length;
      const pace = req.direction?.pace ?? 1;
      return {
        audioUrl: `signed://${req.voiceId}/${words}`,
        storageUrl: `storage://ws/synthesis/${req.voiceId}/${words}-${pace}.wav`,
        durationSec: (words * secondsPerWord) / pace,
        sampleRate: 44100,
      };
    },
    async listVoices() { return []; },
    async cloneVoice() { throw new Error("not used"); },
  };
  return { provider, requests };
}

const voice = { id: "voice-uuid", name: "Rhys", providerVoiceId: "el_rhys", available: true, revokedAt: null };
const lookup = async (id: string) => (id === voice.id ? voice : null);

test("a project with no chosen voice keeps the audio on its recording", async () => {
  const p = project({ voiceId: null });
  const edl = buildEdl({ project: p, sourceUrl: "file://a.mp4" });
  const { provider } = synthesizer(0.5);
  assert.equal(await narrate({ edl, project: p, workspaceId: "ws", synthesis: provider, lookupVoice: lookup }), null);
});

test("each chapter is read from the words the edit keeps, and placed where it begins", async () => {
  const p = project({ editState: { cutWords: [[0, 1]] } }); // cut "the"
  const edl = buildEdl({ project: p, sourceUrl: "file://a.mp4", cutWords: new Set(["0:1"]) });
  const { provider, requests } = synthesizer(0.5);

  const result = await narrate({ edl, project: p, workspaceId: "ws", synthesis: provider, lookupVoice: lookup });
  assert.ok(result);
  assert.deepEqual(requests.map((r) => r.text), ["Open board.", "Then save."]);
  assert.equal(requests[0].voiceId, "el_rhys");
  assert.equal(requests[0].workspaceId, "ws");
  // Narration carries our voice id, which is what the consent check reads.
  assert.deepEqual(result.edl.audio.map((t) => [t.kind, t.at, t.voiceId, t.tempo]), [
    ["narration", 0, "voice-uuid", undefined],
    ["narration", 3, "voice-uuid", undefined],
  ]);
  assert.equal(result.report.voice.name, "Rhys");
  assert.deepEqual(result.report.chapters.map((c) => [c.pace, c.tempo, c.overrunSec]), [[1, 1, 0], [1, 1, 0]]);
});

test("the narrator reads the spoken form of a rewritten word", async () => {
  const p = project({
    editState: { wordEdits: [{ s: 0, w: 1, n: 1, text: "Qore", spoken: "core" }, { s: 1, w: 0, n: 1, text: "Now" }] },
  });
  const edl = buildEdl({ project: p, sourceUrl: "file://a.mp4" });
  const { provider, requests } = synthesizer(0.5);
  await narrate({ edl, project: p, workspaceId: "ws", synthesis: provider, lookupVoice: lookup });
  assert.deepEqual(requests.map((r) => r.text), ["Open core board.", "Now save."]);
});

test("a reading that runs long is paced by the vendor first, then stretched, then reported", async () => {
  const p = project();
  const edl = buildEdl({ project: p, sourceUrl: "file://a.mp4" });
  // 1.6s per word: seg_1 (3 words) reads 4.8s for 4s of footage — a 1.2× pace
  // fits it exactly. seg_2 (2 words) reads 3.2s for 2s: pace maxes at 1.2
  // (2.67s), the stretch takes the rest (1.333×).
  const { provider, requests } = synthesizer(1.6);
  const result = await narrate({ edl, project: p, workspaceId: "ws", synthesis: provider, lookupVoice: lookup });
  assert.ok(result);

  const [first, second] = result.report.chapters;
  assert.equal(first.pace, 1.2);
  assert.equal(first.tempo, 1);
  assert.equal(first.overrunSec, 0);
  assert.equal(second.pace, 1.2);
  assert.ok(Math.abs(second.tempo - 1.333) < 0.001, `tempo ${second.tempo}`);
  assert.equal(second.overrunSec, 0);
  // The mix is told the stretch; the clip's stated duration is the fitted one.
  const track = result.edl.audio[1];
  assert.ok(Math.abs((track.tempo ?? 1) - 1.333) < 0.001);
  assert.ok(Math.abs(track.durationSec - 2) < 0.01);
  // Two vendor calls per long chapter: the first at natural pace, the second fitted.
  assert.equal(requests.length, 4);
});

test("past what pacing and stretching can absorb, the overrun is reported rather than hidden", async () => {
  const p = project();
  const edl = buildEdl({ project: p, sourceUrl: "file://a.mp4" });
  // 3s per word: seg_2 reads 6s for 2s of footage. Pace 1.2 → 5s; stretch caps at 1.35 → 3.7s. Still 1.7s over.
  const { provider } = synthesizer(3);
  const result = await narrate({ edl, project: p, workspaceId: "ws", synthesis: provider, lookupVoice: lookup });
  const second = result!.report.chapters[1];
  assert.equal(second.tempo, 1.35);
  assert.ok(second.overrunSec > 1.6 && second.overrunSec < 1.8, `overrun ${second.overrunSec}`);
});

test("a deleted chapter is not read, and a withdrawn or missing voice is refused before anything is bought", async () => {
  const p = project({ editState: { deletedSegments: [0] } });
  const edl = buildEdl({ project: p, sourceUrl: "file://a.mp4", deletedSegments: new Set([0]) });
  const { provider, requests } = synthesizer(0.5);
  const result = await narrate({ edl, project: p, workspaceId: "ws", synthesis: provider, lookupVoice: lookup });
  assert.deepEqual(requests.map((r) => r.text), ["Then save."]);
  assert.equal(result!.report.chapters.length, 1);

  const revoked = { ...voice, revokedAt: new Date() };
  const before = requests.length;
  await assert.rejects(
    () => narrate({ edl, project: p, workspaceId: "ws", synthesis: provider, lookupVoice: async () => revoked }),
    /consent was withdrawn/,
  );
  await assert.rejects(
    () => narrate({ edl, project: p, workspaceId: "ws", synthesis: provider, lookupVoice: async () => null }),
    /no longer exists/,
  );
  await assert.rejects(
    () => narrate({ edl, project: p, workspaceId: "ws", synthesis: provider, lookupVoice: async () => ({ ...voice, available: false }) }),
    /no longer offered/,
  );
  assert.equal(requests.length, before);
});
