import { spawn } from "node:child_process";
import { edlDuration, mapOutputToSource, mapSourceToOutput, type Edl, type EdlClip } from "./edl";

/**
 * Cut edges, snapped to silence.
 *
 * Transcriber word times land up to ~0.3 s off, so a cut placed on them
 * clips the start of a word or leaves the tail of an "um". Before encoding,
 * each edge that is a real cut moves to the quietest 20 ms of audio within
 * SNAP_RADIUS_SEC of where the transcript put it.
 */
export const SNAP_RADIUS_SEC = 0.15;
const HOP_SEC = 0.01;
const RATE = 8000;

export interface Energy {
  hopSec: number;
  /** Mean square of each 10 ms hop. */
  power: Float64Array;
}

export async function audioEnergy(sourcePath: string, ffmpeg = "ffmpeg"): Promise<Energy> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg, ["-v", "error", "-i", sourcePath, "-vn", "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"]);
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
  const pcm = Buffer.concat(chunks);
  const per = Math.round(RATE * HOP_SEC);
  const hops = Math.floor(pcm.length / 2 / per);
  const power = new Float64Array(hops);
  for (let h = 0; h < hops; h++) {
    let sum = 0;
    for (let i = 0; i < per; i++) {
      const v = pcm.readInt16LE((h * per + i) * 2) / 32768;
      sum += v * v;
    }
    power[h] = sum / per;
  }
  return { hopSec: HOP_SEC, power };
}

/** The middle of the quietest 20 ms window in [lo, hi], nearest `t` on a tie. */
export function quietestNear(e: Energy, t: number, lo: number, hi: number): number {
  const from = Math.max(0, Math.ceil(lo / e.hopSec));
  const to = Math.min(e.power.length - 1, Math.floor(hi / e.hopSec));
  if (to - from < 1) return t;
  let best = t;
  let bestPower = Infinity;
  for (let h = from; h < to; h++) {
    const p = e.power[h] + e.power[h + 1];
    const at = (h + 1) * e.hopSec;
    if (p < bestPower - 1e-12 || (Math.abs(p - bestPower) <= 1e-12 && Math.abs(at - t) < Math.abs(best - t))) {
      bestPower = p;
      best = at;
    }
  }
  return best;
}

/**
 * Moves every cut edge to silence and re-times what sits on the cut timeline.
 * Edges where two clips meet in the source (no cut) stay put, and a narrated
 * EDL is left alone: its picture is continuous and its voice is not the take's.
 */
export function snapEdlToQuiet(edl: Edl, e: Energy, radius = SNAP_RADIUS_SEC): Edl {
  if (edl.clips.length === 0 || edl.audio.some((a) => a.kind === "narration")) return edl;
  const old = edl.clips;
  const clips: EdlClip[] = old.map((c) => ({ ...c }));
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const prev = i > 0 ? clips[i - 1] : null;
    const next = i + 1 < old.length ? old[i + 1] : null;
    const joinedBefore = prev !== null && Math.abs(old[i - 1].sourceEnd - old[i].sourceStart) < 1e-6;
    const joinedAfter = next !== null && Math.abs(old[i].sourceEnd - next.sourceStart) < 1e-6;
    if (!joinedBefore) {
      const lo = Math.max(prev ? prev.sourceEnd : 0, c.sourceStart - radius);
      const hi = Math.min(c.sourceStart + radius, c.sourceEnd - 0.05);
      if (hi > lo) c.sourceStart = quietestNear(e, c.sourceStart, lo, hi);
    } else if (prev) {
      c.sourceStart = prev.sourceEnd;
    }
    if (!joinedAfter) {
      const lo = Math.max(c.sourceStart + 0.05, c.sourceEnd - radius);
      const hi = Math.min(c.sourceEnd + radius, next ? next.sourceStart : edl.source.durationSec || Infinity);
      if (hi > lo) c.sourceEnd = quietestNear(e, c.sourceEnd, lo, hi);
    }
  }
  let t = 0;
  for (const c of clips) {
    c.outputStart = t;
    t += c.sourceEnd - c.sourceStart;
  }
  const remap = (out: number, fallback: number) => {
    const src = mapOutputToSource(old, out);
    if (src === null) return fallback;
    const mapped = mapSourceToOutput(clips, src);
    return mapped ?? fallback;
  };
  const durationSec = edlDuration(clips);
  const clamp = (x: number) => Math.min(Math.max(x, 0), durationSec);
  return {
    ...edl,
    clips,
    durationSec,
    captions: edl.captions.map((cue) => ({ ...cue, from: clamp(remap(cue.from, cue.from)), until: clamp(remap(cue.until, cue.until)) })),
    zooms: edl.zooms.map((z) => ({ ...z, at: clamp(remap(z.at, z.at)) })),
    masks: edl.masks.map((m) => ({ ...m, from: clamp(remap(m.from, m.from)), until: clamp(remap(m.until, m.until)) })),
  };
}
