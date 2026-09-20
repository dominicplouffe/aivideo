import type { DirectionProvider, ZoomKeyframe } from "./types";

/**
 * The camera direction engine.
 *
 * This is first-party logic, not a stand-in for a vendor: there is no API to
 * buy that decides where a demo should push in. It reads what the user
 * actually did — clicks, their targets' geometry — against the aligned
 * transcript, and produces the zooms and cuts an editor would.
 *
 * Three rules encode what makes the result watchable rather than seasick:
 *
 *  - **Suppression.** Two pushes inside 1.2 seconds read as a twitch. The
 *    second click is part of the same beat; the camera stays put.
 *  - **Target-sized framing.** A small control earns a tighter frame. Scale
 *    is capped so the source pixels stay sharp at output resolution.
 *  - **Narration-aware holds.** The camera holds until the sentence
 *    describing the moment finishes, not for a fixed count. This is why
 *    word-level transcript alignment is a hard requirement upstream.
 */

const FILLERS = new Set(["um", "uh", "so", "like", "basically", "actually", "just", "yeah"]);

export const heuristicDirection: DirectionProvider = {
  name: "direction-engine",
  async direct({ events, transcript, maxScale = 2.2 }) {
    const keyframes: ZoomKeyframe[] = [];
    let lastAt = -Infinity;

    for (const e of events) {
      if (e.kind !== "click") continue;
      // Suppression: never push twice inside 1.2 seconds.
      if (e.at - lastAt < 1.2) continue;

      const bounds = e.bounds ?? { x: 50, y: 40, w: 12, h: 6 };
      const area = Math.max(1, bounds.w * bounds.h);
      // Smaller targets earn a tighter frame, capped so the source stays sharp.
      const scale = Math.min(maxScale, 1 + 90 / area);

      // Hold until the narration stops describing this moment.
      const narrationEnd =
        transcript.words.find((w) => w.start > e.at + 0.4 && /[.!?]$/.test(w.word))?.end ?? e.at + 2.4;

      keyframes.push({
        at: e.at,
        holdSec: Math.max(1.1, narrationEnd - e.at),
        scale: Number(scale.toFixed(2)),
        anchor: { x: bounds.x, y: bounds.y },
        easing: "push",
        inferred: !e.selector,
      });
      lastAt = e.at;
    }

    const cuts = transcript.words
      .filter((w) => FILLERS.has(w.word.toLowerCase().replace(/\W/g, "")))
      .map((w) => ({ start: w.start, end: w.end, reason: "filler" }));

    return { keyframes, cuts };
  },
};
