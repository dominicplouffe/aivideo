import { execFile } from "node:child_process";

/**
 * Where a recording's picture stands still.
 *
 * A screen recording is unusually elastic: much of it is a UI waiting for
 * the next click, and a still stretch can be held longer or run faster with
 * nothing lost, where a stretch with motion — typing, scrolling, a dialog
 * sliding in — has to stay near the speed it was recorded at. Knowing which
 * is which is what lets narration be fitted to footage without the picture
 * looking wrong. Measured once, when a take is processed, with ffmpeg's
 * freeze detector; stored on the recording; read by the retimer.
 */

export type StillSpan = [start: number, end: number];

export interface StillnessOptions {
  /** Noise tolerance as a fraction of full scale; cursor blink stays below it. */
  noise?: number;
  /** A stretch shorter than this is not worth holding or hurrying. */
  minSec?: number;
  binary?: string;
}

/**
 * Parses the freeze detector's log into spans. Exported for tests.
 *
 * A freeze that runs to the end of the file never gets a `freeze_end`
 * line, so a still last shot — the commonest shape of a screen recording,
 * and the whole of an agent's static page — was read as motion. With the
 * file's length known, the open span closes there.
 */
export function parseFreezeLog(stderr: string, endSec?: number): StillSpan[] {
  const spans: StillSpan[] = [];
  let start: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const begun = line.match(/freeze_start:\s*([\d.]+)/);
    if (begun) start = Number(begun[1]);
    const ended = line.match(/freeze_end:\s*([\d.]+)/);
    if (ended && start !== null) {
      const end = Number(ended[1]);
      if (end > start) spans.push([start, end]);
      start = null;
    }
  }
  if (start !== null && endSec !== undefined && endSec > start) spans.push([start, endSec]);
  return spans;
}

export function detectStillness(filePath: string, options: StillnessOptions = {}): Promise<StillSpan[]> {
  const noise = options.noise ?? 0.003;
  const minSec = options.minSec ?? 0.5;
  return new Promise((resolve, reject) => {
    execFile(
      options.binary ?? "ffmpeg",
      ["-hide_banner", "-nostats", "-i", filePath, "-an", "-vf", `freezedetect=n=${noise}:d=${minSec}`, "-f", "null", "-"],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) return reject(error);
        // ffmpeg reports the input's duration in its own log; it closes a
        // freeze that ran to the end of the file.
        const duration = String(stderr).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        const endSec = duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : undefined;
        resolve(parseFreezeLog(String(stderr), endSec));
      },
    );
  });
}
