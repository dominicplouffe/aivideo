import { spawn } from "node:child_process";

/**
 * Camera direction for an upload that carries no click or cursor events.
 *
 * The picture is the only record of where the action is, so it is read from
 * the picture: frames sampled small and grey, each compared with the one
 * before it, and the change summed per segment. A step zooms on the middle of
 * what changed during it — a moving cursor, a field filling in, a page
 * arriving. A step where the whole frame moved (a scroll, a navigation) gets
 * a gentler zoom, because there is no one place to look.
 */

const W = 128;
const H = 72;
const FPS = 2;

export interface GreyFrames {
  fps: number;
  width: number;
  height: number;
  frames: Uint8Array[];
}

export interface Framing {
  scale: number;
  x: number;
  y: number;
}

export async function sampleGreyFrames(file: string, binary = "ffmpeg"): Promise<GreyFrames> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, [
      "-hide_banner", "-loglevel", "error", "-i", file,
      "-vf", `fps=${FPS},scale=${W}:${H},format=gray`, "-f", "rawvideo", "-",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 300)}`))));
  });
  const all = Buffer.concat(chunks);
  const size = W * H;
  const frames: Uint8Array[] = [];
  for (let o = 0; o + size <= all.length; o += size) frames.push(new Uint8Array(all.subarray(o, o + size)));
  return { fps: FPS, width: W, height: H, frames };
}

/** One frame-to-frame change covering more than this share of the frame is a whole-frame change. */
export const WHOLE_FRAME_SHARE = 0.4;
export const WHOLE_FRAME_MAX_SCALE = 1.2;

/** Where to look during [startSec, endSec), or null when nothing on screen changed near it. */
export function framingFor(g: GreyFrames, startSec: number, endSec: number): Framing | null {
  // Widen a quiet window once: the change that explains a step often lands
  // just before or after the words about it.
  return measure(g, startSec, endSec) ?? measure(g, startSec - 2, endSec + 2);
}

function measure(g: GreyFrames, startSec: number, endSec: number): Framing | null {
  const first = Math.max(1, Math.floor(startSec * g.fps));
  const last = Math.min(g.frames.length - 1, Math.ceil(endSec * g.fps));
  const size = g.width * g.height;
  const heat = new Float64Array(size);
  // A step that opens on a whole-frame change (a page drawing in, a
  // navigation) has no single place to look: the centroid lands wherever the
  // page happened to paint first. Such a step zooms gently, never closer than
  // WHOLE_FRAME_MAX_SCALE.
  let wholeFrame = false;
  for (let f = first; f <= last; f++) {
    const a = g.frames[f - 1];
    const b = g.frames[f];
    let changed = 0;
    for (let i = 0; i < size; i++) {
      const d = Math.abs(a[i] - b[i]);
      if (d > 8) { heat[i] += d; changed++; }
    }
    if (f - first < g.fps && changed / size > WHOLE_FRAME_SHARE) wholeFrame = true;
  }
  let mass = 0, sx = 0, sy = 0, cells = 0;
  for (let i = 0; i < size; i++) {
    if (heat[i] === 0) continue;
    const x = (i % g.width) + 0.5;
    const y = Math.floor(i / g.width) + 0.5;
    mass += heat[i]; sx += heat[i] * x; sy += heat[i] * y; cells++;
  }
  if (cells < 2) return null;
  const cx = sx / mass / g.width;
  const cy = sy / mass / g.height;
  // Share of the frame that changed: small and local zooms in closer.
  const spread = cells / size;
  const local = spread > 0.4 ? 1.2 : spread > 0.15 ? 1.35 : 1.55;
  const scale = wholeFrame ? Math.min(local, WHOLE_FRAME_MAX_SCALE) : local;
  return { scale, x: round(cx), y: round(cy) };
}

function round(v: number): number {
  return Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
}
