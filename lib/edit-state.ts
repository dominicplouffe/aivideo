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
}

export const DEFAULT_SCENE_TIMING: SceneTiming = { mode: "fit", trimStartSec: 0, trimEndSec: 0 };
/** A chapter keeps at least this much footage, however it is trimmed. */
export const MIN_CHAPTER_SEC = 0.5;

export interface EditState {
  removeFillers: boolean;
  deletedSegments: Set<number>;
  /** Per-chapter footage timing under a narrator, keyed by chapter index. Absent means `fit`, untrimmed. */
  sceneTiming: Map<number, SceneTiming>;
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
  music: boolean;
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
}

export interface StoredEditState {
  removeFillers?: boolean;
  deletedSegments?: number[];
  sceneTiming?: StoredSceneTiming[];
  /** `[chapter index, word index]` pairs; see `wordKey`. */
  cutWords?: [number, number][];
  wordEdits?: StoredWordEdit[];
  studioSound?: boolean;
  captions?: boolean;
  music?: boolean;
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
  cutWords: new Set<string>(),
  wordEdits: new Map<string, WordEdit>(),
  studioSound: true,
  captions: true,
  music: true,
  presenter: false,
  zoomEnabled: true,
};

/** A stored scene timing that can be trusted, or null. Defaults are not stored. */
export function parseStoredSceneTiming(raw: unknown): (StoredSceneTiming & { key: number }) | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (!Number.isInteger(e.s) || (e.s as number) < 0) return null;
  const mode = e.mode === "hold" || e.mode === "stretch" ? e.mode : "fit";
  const seconds = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(v, 3600) : 0);
  const trimStart = seconds(e.trimStart);
  const trimEnd = seconds(e.trimEnd);
  if (mode === "fit" && trimStart === 0 && trimEnd === 0) return null;
  return { key: e.s as number, s: e.s as number, mode, trimStart, trimEnd };
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
    if (parsed) sceneTiming.set(parsed.key, { mode: parsed.mode, trimStartSec: parsed.trimStart, trimEndSec: parsed.trimEnd });
  }

  return {
    removeFillers: flag(raw.removeFillers, DEFAULT_EDIT_STATE.removeFillers),
    sceneTiming,
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
    music: flag(raw.music, DEFAULT_EDIT_STATE.music),
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
      .filter(([, t]) => t.mode !== "fit" || t.trimStartSec > 0 || t.trimEndSec > 0)
      .map(([s, t]) => ({ s, mode: t.mode, trimStart: t.trimStartSec, trimEnd: t.trimEndSec }))
      .sort((a, b) => a.s - b.s),
    wordEdits: [...state.wordEdits.entries()]
      .map(([key, edit]) => {
        const [s, w] = pair(key);
        return { s, w, n: edit.span, text: edit.text, ...(edit.spoken ? { spoken: edit.spoken } : {}) };
      })
      .sort((a, b) => a.s - b.s || a.w - b.w),
    studioSound: state.studioSound,
    captions: state.captions,
    music: state.music,
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
 * the person typed their own.
 */
export function withTrailingPunctuation(text: string, originalLastWord: string): string {
  if (/[.,!?;:]$/.test(text)) return text;
  const trailing = originalLastWord.match(/[.,!?;:]+$/)?.[0] ?? "";
  return text + trailing;
}
