import { spawn } from "node:child_process";
import type { Frame } from "./types";

/**
 * Sampling frames out of a recording.
 *
 * One ffmpeg process writing PNGs to a pipe, parsed by scanning for the PNG
 * signature and the IEND chunk. Writing to a temporary directory instead
 * would mean unmasked frames of a customer's product sitting on disk — which
 * is the exact thing this whole subsystem exists to prevent. They stay in
 * memory and are dropped as soon as they have been read.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND = Buffer.from("IEND");

export interface SampleOptions {
  /** Frames per second to inspect. Two is enough to catch a page. */
  fps?: number;
  /** Longest edge in pixels. OCR gains nothing above this and costs time. */
  maxEdge?: number;
  binary?: string;
  signal?: AbortSignal;
}

/** Splits a stream of concatenated PNGs into individual images. */
export function splitPngs(buffer: Buffer): Buffer[] {
  const images: Buffer[] = [];
  let start = buffer.indexOf(PNG_SIGNATURE);

  while (start !== -1) {
    const iend = buffer.indexOf(IEND, start);
    if (iend === -1) break;
    // IEND's four-byte length and CRC bracket the type, so the image ends
    // four bytes past the type's end.
    const end = iend + IEND.length + 4;
    images.push(buffer.subarray(start, end));
    start = buffer.indexOf(PNG_SIGNATURE, end);
  }

  return images;
}

export async function sampleFrames(
  sourcePath: string,
  options: SampleOptions = {},
): Promise<Frame[]> {
  const fps = options.fps ?? 2;
  const maxEdge = options.maxEdge ?? 1280;

  const args = [
    "-hide_banner",
    "-loglevel", "error",
    "-i", sourcePath,
    "-vf", `fps=${fps},scale='min(${maxEdge},iw)':-2`,
    "-f", "image2pipe",
    "-vcodec", "png",
    "-",
  ];

  const chunks: Buffer[] = [];
  let stderr = "";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(options.binary ?? "ffmpeg", args, { signal: options.signal });
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });

  return splitPngs(Buffer.concat(chunks)).map((png, index) => ({
    // The first sampled frame is at 0, and each one is 1/fps later. Taken
    // from the index rather than a timestamp because `fps=` resamples, so
    // the source's own presentation times no longer line up.
    atSec: index / fps,
    png,
  }));
}
