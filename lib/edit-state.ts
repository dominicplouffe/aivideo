import type { Project, Segment, TranscriptWord } from "@/lib/app-data";
import { wordKey } from "@/lib/segments";

/**
 * The edit: what the Studio saves, and how every reader of a transcript
 * applies it. Lives in `lib` rather than the component tree because the
 * render worker, the API routes and the repository all have to agree with
 * the editor about which words survive and what they say.
 */

/**
 * A word, or a run of words, rewritten by hand.
 *
 * Two corrections, deliberately one object. A transcription error ("CLO"
 * for "Claude") changes what is shown and what a narrator says, so `text`
 * alone. A brand spelling ("Qore", said "core") keeps the transcriber's
 * pronunciation while changing the spelling, so `text` plus `spoken`. The
 * transcriber wrote down what it heard, which is why the original word is
 * usually the right thing to keep saying.
 */
export interface WordEdit {
  /** How many transcript words this replaces, starting at its key. */
  span: number;
  /** What the transcript, the captions and Riff show. */
  text: string;
  /** What a narrator says, when it differs from `text`. */
  spoken?: string;
}

/**
 * How a chapter's footage meets its reading, when a voice narrates.
 *
 * `fit` is the retimer's judgement: still footage held or hurried first,
 * motion kept near its recorded speed, trimming last. `hold` plays the
 * footage as recorded and parks on the last frame until the reading ends,
 * or ends the footage where the reading does. `stretch` runs the footage at
 * one speed so it ends with the reading. The trims take footage off the
 * chapter's start and end before any of that — the seconds of fumbling
 * before the point, or the wait after it.
 */
export interface SceneTiming {
  mode: "fit" | "hold" | "stretch";
  trimStartSec: number;
  trimEndSec: number;
  /** Seconds of picture before the reading begins: a beat to take the screen in. */
  leadInSec: number;
}

export const DEFAULT_SCENE_TIMING: SceneTiming = { mode: "fit", trimStartSec: 0, trimEndSec: 0, leadInSec: 0 };
/** A pause before a scene longer than this is a scene of its own. */
export const MAX_LEAD_IN_SEC = 10;
/** A chapter keeps at least this much footage, however it is trimmed. */
export const MIN_CHAPTER_SEC = 0.5;

export interface EditState {
  removeFillers: boolean;
  deletedSegments: Set<number>;
  /** Per-chapter footage timing under a narrator, keyed by chapter index. Absent means `fit`, untrimmed. */
  sceneTiming: Map<number, SceneTiming>;
  /**
   * Sync points: a word pinned to a frame. Keyed with `wordKey`; the value is
   * the source second the word should land on. The retimer treats a pin as
   * an anchor it may not move, so the person can say "this word, this
   * screen" where the automatic fit guessed wrong.
   */
  syncPoints: Map<string, number>;
  /**
   * Words cut by hand, keyed with `wordKey`. Independent of the filler
   * toggle: a filler is removed by the toggle whether or not it is here, and
   * a word here is removed whatever the toggle says.
   */
  cutWords: Set<string>;
  /** Words rewritten by hand, keyed with `wordKey` on the first word. */
  wordEdits: Map<string, WordEdit>;
  studioSound: boolean;
  captions: boolean;
  presenter: boolean;
  zoomEnabled: boolean;
}

/**
 * The saved shape of an `EditState`.
 *
 * Sets and maps become arrays on the wire, because JSON has neither and a
 * `Set` serializes to `{}` without a word of complaint — which is exactly
 * how a "saved" edit turns out to have saved nothing at all.
 */
export interface StoredWordEdit {
  s: number;
  w: number;
  n: number;
  text: string;
  spoken?: string;
}

export interface StoredSceneTiming {
  s: number;
  mode: SceneTiming["mode"];
  trimStart: number;
  trimEnd: number;
  lead?: number;
}

export interface StoredEditState {
  removeFillers?: boolean;
  deletedSegments?: number[];
  sceneTiming?: StoredSceneTiming[];
  /** `{ s, w, at }`: chapter index, word index, source second. */
  syncPoints?: { s: number; w: number; at: number }[];
  /** `[chapter index, word index]` pairs; see `wordKey`. */
  cutWords?: [number, number][];
  wordEdits?: StoredWordEdit[];
  studioSound?: boolean;
  captions?: boolean;
  presenter?: boolean;
  zoomEnabled?: boolean;
}

/** Longer than this is not a word, it is a paste. */
export const MAX_EDIT_TEXT = 200;
/** A rewrite spanning more words than this is a rewrite of the recording. */
export const MAX_EDIT_SPAN = 40;

export const DEFAULT_EDIT_STATE: EditState = {
  removeFillers: true,
  deletedSegments: new Set<number>(),
  sceneTiming: new Map<number, SceneTiming>(),
  syncPoints: new Map<string, number>(),
  cutWords: new Set<string>(),
  wordEdits: new Map<string, WordEdit>(),
  studioSound: true,
  captions: true,
  presenter: false,
  zoomEnabled: true,
};

/** A stored scene timing that can be trusted, or null. Defaults are not stored. */
export function parseStoredSceneTiming(raw: unknown): (StoredSceneTiming & { key: number }) | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (!Number.isInteger(e.s) || (e.s as number) < 0) return null;
  const mode = e.mode === "hold" || e.mode === "stretch" ? e.mode : "fit";
  const seconds = (v: unknown, max = 3600) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : 0);
  const trimStart = seconds(e.trimStart);
  const trimEnd = seconds(e.trimEnd);
  const lead = seconds(e.lead, MAX_LEAD_IN_SEC);
  if (mode === "fit" && trimStart === 0 && trimEnd === 0 && lead === 0) return null;
  return { key: e.s as number, s: e.s as number, mode, trimStart, trimEnd, ...(lead > 0 ? { lead } : {}) };
}

/** A stored sync point that can be trusted, or null. */
export function parseStoredSyncPoint(raw: unknown): { key: string; s: number; w: number; at: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const ints = [e.s, e.w].every((n) => Number.isInteger(n) && (n as number) >= 0);
  if (!ints || typeof e.at !== "number" || !Number.isFinite(e.at) || e.at < 0 || e.at > 86_400) return null;
  return { key: wordKey(e.s as number, e.w as number), s: e.s as number, w: e.w as number, at: Math.round(e.at * 1000) / 1000 };
}

/** A stored word edit that can be trusted, or null. */
export function parseStoredWordEdit(raw: unknown): (StoredWordEdit & { key: string }) | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const ints = [e.s, e.w, e.n].every((n) => Number.isInteger(n) && (n as number) >= 0);
  if (!ints || (e.n as number) < 1 || (e.n as number) > MAX_EDIT_SPAN) return null;
  if (typeof e.text !== "string") return null;
  const text = e.text.trim();
  if (!text || text.length > MAX_EDIT_TEXT) return null;
  const spoken = typeof e.spoken === "string" ? e.spoken.trim() : "";
  if (spoken.length > MAX_EDIT_TEXT) return null;
  return {
    key: wordKey(e.s as number, e.w as number),
    s: e.s as number,
    w: e.w as number,
    n: e.n as number,
    text,
    ...(spoken && spoken !== text ? { spoken } : {}),
  };
}

export function hydrateEditState(stored: unknown): EditState {
  if (!stored || typeof stored !== "object") return DEFAULT_EDIT_STATE;
  const raw = stored as StoredEditState;
  const flag = (value: unknown, fallback: boolean) =>
    typeof value === "boolean" ? value : fallback;

  const wordEdits = new Map<string, WordEdit>();
  for (const entry of Array.isArray(raw.wordEdits) ? raw.wordEdits : []) {
    const parsed = parseStoredWordEdit(entry);
    if (parsed) {
      wordEdits.set(parsed.key, {
        span: parsed.n,
        text: parsed.text,
        ...(parsed.spoken ? { spoken: parsed.spoken } : {}),
      });
    }
  }

  const sceneTiming = new Map<number, SceneTiming>();
  for (const entry of Array.isArray(raw.sceneTiming) ? raw.sceneTiming : []) {
    const parsed = parseStoredSceneTiming(entry);
    if (parsed) {
      sceneTiming.set(parsed.key, {
        mode: parsed.mode,
        trimStartSec: parsed.trimStart,
        trimEndSec: parsed.trimEnd,
        leadInSec: parsed.lead ?? 0,
      });
    }
  }

  const syncPoints = new Map<string, number>();
  for (const entry of Array.isArray(raw.syncPoints) ? raw.syncPoints : []) {
    const parsed = parseStoredSyncPoint(entry);
    if (parsed) syncPoints.set(parsed.key, parsed.at);
  }

  return {
    removeFillers: flag(raw.removeFillers, DEFAULT_EDIT_STATE.removeFillers),
    sceneTiming,
    syncPoints,
    deletedSegments: new Set(
      Array.isArray(raw.deletedSegments)
        ? raw.deletedSegments.filter((n): n is number => Number.isInteger(n) && n >= 0)
        : [],
    ),
    cutWords: new Set(
      Array.isArray(raw.cutWords)
        ? raw.cutWords
            .filter(
              (pair): pair is [number, number] =>
                Array.isArray(pair) &&
                pair.length === 2 &&
                pair.every((n) => Number.isInteger(n) && n >= 0),
            )
            .map(([segIndex, wordIndex]) => wordKey(segIndex, wordIndex))
        : [],
    ),
    wordEdits,
    studioSound: flag(raw.studioSound, DEFAULT_EDIT_STATE.studioSound),
    captions: flag(raw.captions, DEFAULT_EDIT_STATE.captions),
    presenter: flag(raw.presenter, DEFAULT_EDIT_STATE.presenter),
    zoomEnabled: flag(raw.zoomEnabled, DEFAULT_EDIT_STATE.zoomEnabled),
  };
}

export function serializeEditState(state: EditState): StoredEditState {
  const pair = (key: string) => key.split(":").map(Number) as [number, number];
  return {
    removeFillers: state.removeFillers,
    deletedSegments: [...state.deletedSegments].sort((a, b) => a - b),
    cutWords: [...state.cutWords].map(pair).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    sceneTiming: [...state.sceneTiming.entries()]
      .filter(([, t]) => t.mode !== "fit" || t.trimStartSec > 0 || t.trimEndSec > 0 || t.leadInSec > 0)
      .map(([s, t]) => ({
        s,
        mode: t.mode,
        trimStart: t.trimStartSec,
        trimEnd: t.trimEndSec,
        ...(t.leadInSec > 0 ? { lead: t.leadInSec } : {}),
      }))
      .sort((a, b) => a.s - b.s),
    syncPoints: [...state.syncPoints.entries()]
      .map(([key, at]) => {
        const [s, w] = pair(key);
        return { s, w, at };
      })
      .sort((a, b) => a.s - b.s || a.w - b.w),
    wordEdits: [...state.wordEdits.entries()]
      .map(([key, edit]) => {
        const [s, w] = pair(key);
        return { s, w, n: edit.span, text: edit.text, ...(edit.spoken ? { spoken: edit.spoken } : {}) };
      })
      .sort((a, b) => a.s - b.s || a.w - b.w),
    studioSound: state.studioSound,
    captions: state.captions,
    presenter: state.presenter,
    zoomEnabled: state.zoomEnabled,
  };
}

/**
 * The footage a chapter contributes under a narrator: its span, less the
 * trims, never shorter than `MIN_CHAPTER_SEC`. A trim that would leave less
 * is pulled back rather than refused, so the chapter always has a picture.
 */
export function chapterSpan(
  seg: Pick<Segment, "start" | "end">,
  segIndex: number,
  state: Pick<EditState, "sceneTiming">,
): { start: number; end: number } {
  const timing = state.sceneTiming.get(segIndex) ?? DEFAULT_SCENE_TIMING;
  const full = seg.end - seg.start;
  if (full <= MIN_CHAPTER_SEC) return { start: seg.start, end: seg.end };
  let start = seg.start + timing.trimStartSec;
  let end = seg.end - timing.trimEndSec;
  if (end - start < MIN_CHAPTER_SEC) {
    // Both trims cannot be honoured; keep the start trim and give the end back.
    end = Math.min(seg.end, start + MIN_CHAPTER_SEC);
    if (end > seg.end) end = seg.end;
    if (end - start < MIN_CHAPTER_SEC) start = Math.max(seg.start, end - MIN_CHAPTER_SEC);
  }
  return { start, end };
}

/**
 * The stored edit after a chapter is split at a word, or merged into the
 * one before it.
 *
 * Everything in the edit that names a chapter is by number, so a split or
 * a merge renumbers it all in one place: deleted scenes, word cuts and
 * rewrites, scene timing, sync points. The first half of a split keeps the
 * chapter's timing; the second half starts fresh. A merge gives the joined
 * chapter the earlier one's timing and drops the later one's, since a
 * chapter has one.
 */
export function remapStoredForSplit(stored: StoredEditState, segIndex: number, wordIndex: number): StoredEditState {
  const seg = (s: number) => (s > segIndex ? s + 1 : s);
  const word = (s: number, w: number): [number, number] =>
    s === segIndex && w >= wordIndex ? [segIndex + 1, w - wordIndex] : [seg(s), w];
  const deleted = (stored.deletedSegments ?? []).flatMap((s) => (s === segIndex ? [segIndex, segIndex + 1] : [seg(s)]));
  return {
    ...stored,
    deletedSegments: [...new Set(deleted)].sort((a, b) => a - b),
    cutWords: (stored.cutWords ?? []).map(([s, w]) => word(s, w)),
    wordEdits: (stored.wordEdits ?? []).map((e) => {
      const [s, w] = word(e.s, e.w);
      return { ...e, s, w };
    }),
    sceneTiming: (stored.sceneTiming ?? []).map((t) => ({ ...t, s: seg(t.s) })),
    syncPoints: (stored.syncPoints ?? []).map((p) => {
      const [s, w] = word(p.s, p.w);
      return { ...p, s, w };
    }),
  };
}

export function remapStoredForMerge(stored: StoredEditState, segIndex: number, previousWordCount: number): StoredEditState {
  // Chapter `segIndex` folds into `segIndex - 1`; its words follow the earlier chapter's.
  const seg = (s: number) => (s >= segIndex ? s - 1 : s);
  const word = (s: number, w: number): [number, number] => (s === segIndex ? [segIndex - 1, w + previousWordCount] : [seg(s), w]);
  const deleted = (stored.deletedSegments ?? [])
    // The joined chapter is deleted only if both halves were.
    .filter((s) => s !== segIndex && s !== segIndex - 1)
    .map(seg)
    .concat(
      (stored.deletedSegments ?? []).includes(segIndex) && (stored.deletedSegments ?? []).includes(segIndex - 1)
        ? [segIndex - 1]
        : [],
    );
  return {
    ...stored,
    deletedSegments: [...new Set(deleted)].sort((a, b) => a - b),
    cutWords: (stored.cutWords ?? []).map(([s, w]) => word(s, w)),
    wordEdits: (stored.wordEdits ?? []).map((e) => {
      const [s, w] = word(e.s, e.w);
      return { ...e, s, w };
    }),
    sceneTiming: (stored.sceneTiming ?? []).filter((t) => t.s !== segIndex).map((t) => ({ ...t, s: seg(t.s) })),
    syncPoints: (stored.syncPoints ?? []).map((p) => {
      const [s, w] = word(p.s, p.w);
      return { ...p, s, w };
    }),
  };
}

/** Whether this edit removes the word: a filler under the toggle, or a hand cut. */
export function isWordRemoved(
  state: Pick<EditState, "removeFillers" | "cutWords">,
  segIndex: number,
  wordIndex: number,
  word: Pick<TranscriptWord, "cut">,
): boolean {
  return (state.removeFillers && Boolean(word.cut)) || state.cutWords.has(wordKey(segIndex, wordIndex));
}

/**
 * A chapter's words after the hand edits, before removals.
 *
 * Every reader of a transcript — the timeline, the transcript panel, the
 * captions, the narrator, Riff — goes through this, so a word rewritten in
 * one place is rewritten in all of them. A rewritten run of words becomes
 * one token: it keeps the source time and duration of the words it
 * replaces, is keyed on the first of them, and loses their filler flags,
 * because the person who typed it meant every word of it.
 */
export interface ResolvedWord {
  /** The first underlying transcript word. Cuts are keyed on this. */
  wordIndex: number;
  span: number;
  /** What is shown. */
  text: string;
  /** What is said. */
  spoken: string;
  /** What the transcriber wrote. */
  original: string;
  t: number;
  d: number;
  cut: boolean;
  em: boolean;
  edited: boolean;
}

export function resolveWords(
  segment: Pick<Segment, "words">,
  segIndex: number,
  state: Pick<EditState, "wordEdits">,
): ResolvedWord[] {
  const out: ResolvedWord[] = [];
  const words = segment.words;
  for (let i = 0; i < words.length; ) {
    const edit = state.wordEdits.get(wordKey(segIndex, i));
    if (edit) {
      const span = Math.max(1, Math.min(edit.span, words.length - i));
      const run = words.slice(i, i + span);
      out.push({
        wordIndex: i,
        span,
        text: edit.text,
        spoken: edit.spoken ?? edit.text,
        original: run.map((w) => w.w).join(" "),
        t: run[0].t,
        d: run.reduce((n, w) => n + w.d, 0),
        cut: false,
        em: run.some((w) => Boolean(w.em)),
        edited: true,
      });
      i += span;
      continue;
    }
    const w = words[i];
    out.push({
      wordIndex: i,
      span: 1,
      text: w.w,
      spoken: w.w,
      original: w.w,
      t: w.t,
      d: w.d,
      cut: Boolean(w.cut),
      em: Boolean(w.em),
      edited: false,
    });
    i += 1;
  }
  return out;
}

/** Punctuation and case do not make "Core," a different word from "core". */
export function normalizeToken(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * Every place in the project where the transcriber wrote this run of words.
 *
 * Matched on the transcript, not on the edited text: "Apply to all" fixes
 * what was heard wherever it was heard. Overlapping matches are skipped so
 * one edit does not sit inside another.
 */
export function occurrencesOf(
  project: Pick<Project, "segments">,
  phrase: string[],
): { segIndex: number; wordIndex: number; span: number }[] {
  const wanted = phrase.map(normalizeToken).filter(Boolean);
  if (wanted.length === 0) return [];
  const found: { segIndex: number; wordIndex: number; span: number }[] = [];
  project.segments.forEach((segment, segIndex) => {
    const tokens = segment.words.map((w) => normalizeToken(w.w));
    for (let i = 0; i + wanted.length <= tokens.length; ) {
      const matches = wanted.every((token, k) => tokens[i + k] === token);
      if (matches) {
        found.push({ segIndex, wordIndex: i, span: wanted.length });
        i += wanted.length;
      } else {
        i += 1;
      }
    }
  });
  return found;
}

/**
 * The replacement text an occurrence should get: the person's text, with
 * the trailing punctuation the transcriber put on that occurrence, unless
 * the person typed their own. For glossary terms, which name a word and
 * not its punctuation.
 */
export function withTrailingPunctuation(text: string, originalLastWord: string): string {
  if (/[.,!?;:]$/.test(text)) return text;
  const trailing = originalLastWord.match(/[.,!?;:]+$/)?.[0] ?? "";
  return text + trailing;
}

const trailingOf = (word: string) => word.match(/[.,!?;:]+$/)?.[0] ?? "";

/**
 * What a rewrite gives each occurrence, when the person typed `text` over
 * a selection whose last word was `editedLast`.
 *
 * What was typed is what is shown: a comma deleted in the field is a comma
 * gone, and one added is one added. The first version put the original's
 * punctuation back whenever the typed text had none, which made it
 * impossible to remove a comma at all. The one refinement is for "Apply to
 * all": when the person left the punctuation exactly as the transcriber
 * had it, each other occurrence keeps its own — so "hello," and "hello."
 * become "Hi," and "Hi." rather than both taking the first one's comma.
 */
export function rewriteFor(text: string, editedLast: string, occurrenceLast: string): string {
  const typed = trailingOf(text);
  const edited = trailingOf(editedLast);
  if (typed === edited) {
    // Punctuation untouched: this occurrence keeps its own.
    return text.slice(0, text.length - typed.length) + trailingOf(occurrenceLast);
  }
  return text;
}
