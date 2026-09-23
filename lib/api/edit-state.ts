import { parseStoredSceneTiming, parseStoredSyncPoint, parseStoredWordEdit } from "@/lib/edit-state";

/**
 * What the Studio is allowed to store.
 *
 * An allowlist rather than "whatever the client sent". `edit_state` is JSON
 * written straight into a column and read back by the editor on every load;
 * without this, one stray field from a future branch becomes permanent in
 * every customer's row, and a large one becomes permanent everywhere.
 */
const FLAGS = ["removeFillers", "studioSound", "captions", "presenter", "zoomEnabled"] as const;

/** A chapter list longer than this is not an edit, it is a mistake. */
const MAX_SEGMENTS = 2000;
/** Likewise for words cut by hand — and the ceiling on a word's index. */
const MAX_CUT_WORDS = 20_000;

export function sanitizeEditState(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const flag of FLAGS) {
    if (typeof input[flag] === "boolean") out[flag] = input[flag];
  }

  if (Array.isArray(input.deletedSegments)) {
    if (input.deletedSegments.length > MAX_SEGMENTS) return null;
    const indices = input.deletedSegments.filter(
      (n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < MAX_SEGMENTS,
    );
    out.deletedSegments = [...new Set(indices)].sort((a, b) => a - b);
  }

  if (Array.isArray(input.cutWords)) {
    if (input.cutWords.length > MAX_CUT_WORDS) return null;
    const pairs = input.cutWords.filter(
      (pair): pair is [number, number] =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        Number.isInteger(pair[0]) &&
        pair[0] >= 0 &&
        pair[0] < MAX_SEGMENTS &&
        Number.isInteger(pair[1]) &&
        pair[1] >= 0 &&
        pair[1] < MAX_CUT_WORDS,
    );
    const unique = new Map(pairs.map((pair) => [`${pair[0]}:${pair[1]}`, pair]));
    out.cutWords = [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  if (Array.isArray(input.sceneTiming)) {
    if (input.sceneTiming.length > MAX_SEGMENTS) return null;
    const timings = new Map<number, Record<string, unknown>>();
    for (const entry of input.sceneTiming) {
      const parsed = parseStoredSceneTiming(entry);
      if (!parsed || parsed.s >= MAX_SEGMENTS) continue;
      const { key, ...stored } = parsed;
      timings.set(key, stored);
    }
    out.sceneTiming = [...timings.values()].sort((a, b) => (a.s as number) - (b.s as number));
  }

  if (Array.isArray(input.syncPoints)) {
    if (input.syncPoints.length > MAX_CUT_WORDS) return null;
    const pins = new Map<string, Record<string, unknown>>();
    for (const entry of input.syncPoints) {
      const parsed = parseStoredSyncPoint(entry);
      if (!parsed || parsed.s >= MAX_SEGMENTS || parsed.w >= MAX_CUT_WORDS) continue;
      const { key, ...stored } = parsed;
      pins.set(key, stored);
    }
    out.syncPoints = [...pins.values()].sort((a, b) => (a.s as number) - (b.s as number) || (a.w as number) - (b.w as number));
  }

  if (Array.isArray(input.wordEdits)) {
    if (input.wordEdits.length > MAX_CUT_WORDS) return null;
    const edits = new Map<string, Record<string, unknown>>();
    for (const entry of input.wordEdits) {
      const parsed = parseStoredWordEdit(entry);
      if (!parsed || parsed.s >= MAX_SEGMENTS || parsed.w >= MAX_CUT_WORDS) continue;
      const { key, ...stored } = parsed;
      edits.set(key, stored);
    }
    out.wordEdits = [...edits.values()].sort(
      (a, b) => (a.s as number) - (b.s as number) || (a.w as number) - (b.w as number),
    );
  }

  return out;
}
