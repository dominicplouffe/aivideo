/**
 * The watch bitmap.
 *
 * One bit per second of an asset. Bit `n` set means second `n` was watched
 * at least once, which is what makes "scrubbed back and rewatched the
 * pricing bit three times" a thing the data can say — a duration counter
 * cannot, and a list of intervals needs merging before it can answer
 * anything.
 *
 * Stored as a Postgres `bit varying`, so the retention curve is
 * `get_bit(watched, n)` over a `generate_series` and needs no pipeline, no
 * warehouse and no nightly job.
 *
 * A forty-minute demo is 2,400 bits, about 300 bytes. The obvious
 * alternative — a row per progress ping — is 1,200 rows for the same
 * session, which is how an analytics feature becomes an infrastructure
 * project.
 */

/** Clamp: a client can send anything, including a runtime of 10^9 seconds. */
export const MAX_ASSET_SECONDS = 6 * 60 * 60;

export function emptyBitmap(seconds: number): string {
  return "0".repeat(clampLength(seconds));
}

function clampLength(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 1;
  return Math.min(MAX_ASSET_SECONDS, Math.ceil(seconds));
}

/**
 * Builds a bitmap from the seconds a player reports.
 *
 * Out-of-range and duplicate seconds are ignored rather than rejected: the
 * input comes from a browser on somebody else's page, where a paused tab, a
 * clock change or a re-edited asset can all produce a second that does not
 * exist. Dropping the view because one number is odd loses real data to
 * protect nothing.
 */
export function bitmapFrom(seconds: Iterable<number>, assetSeconds: number): string {
  const length = clampLength(assetSeconds);
  const bits = new Uint8Array(length);

  for (const second of seconds) {
    if (!Number.isFinite(second)) continue;
    const index = Math.floor(second);
    if (index < 0 || index >= length) continue;
    bits[index] = 1;
  }

  let out = "";
  for (const bit of bits) out += bit ? "1" : "0";
  return out;
}

/** Merges a returning viewer's new seconds into what they had already seen. */
export function mergeBitmaps(a: string, b: string): string {
  const length = Math.max(a.length, b.length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += a[i] === "1" || b[i] === "1" ? "1" : "0";
  }
  return out;
}

export function countWatched(bitmap: string): number {
  let total = 0;
  for (const bit of bitmap) if (bit === "1") total += 1;
  return total;
}

/**
 * Whether the viewer reached the end.
 *
 * "The end" is the last 5% rather than the final second. Players stop
 * reporting a moment early, an outro card runs past the last spoken word,
 * and a completion rate that reads 0% because nobody saw second 2,399 is a
 * metric nobody will trust twice.
 */
export function reachedEnd(bitmap: string, tailFraction = 0.05): boolean {
  if (bitmap.length === 0) return false;
  const tail = Math.max(1, Math.floor(bitmap.length * tailFraction));
  return bitmap.slice(-tail).includes("1");
}

/**
 * Parses the compact wire format: a run-length encoding of watched spans.
 *
 * `"0-12,30-44"` rather than 27 numbers. The beacon has a size limit —
 * `sendBeacon` refuses a large body and the browser will not tell the page
 * it did — and spans are what a player naturally produces anyway.
 */
export function parseSpans(value: string, assetSeconds: number): number[] {
  const length = clampLength(assetSeconds);
  const seconds: number[] = [];

  for (const span of value.split(",")) {
    const trimmed = span.trim();
    if (!trimmed) continue;

    // Matched, not coerced. Splitting "-5--1" on "-" and running the pieces
    // through Number() yields a perfectly plausible 0-to-5 range out of
    // input that means nothing — garbage should produce nothing, not a
    // believable answer.
    const match = /^(\d+)(?:-(\d+))?$/.exec(trimmed);
    if (!match) continue;

    const start = Number(match[1]);
    const end = match[2] === undefined ? start : Number(match[2]);

    const from = Math.max(0, Math.min(start, end));
    const to = Math.min(length - 1, Math.max(start, end));
    for (let second = from; second <= to; second++) seconds.push(second);
  }

  return seconds;
}
