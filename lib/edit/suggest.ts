import type { Project } from "@/lib/app-data";
import { isWordRemoved, resolveWords, type EditState } from "@/lib/edit-state";
import { wordKey } from "@/lib/segments";
import { buildTimeline, timelineDuration } from "@/components/app/studio/types";

/**
 * Suggested cuts: what an AI proposes to remove, turned into an edit a
 * person can preview and apply.
 *
 * The model names chapters and quotes phrases; everything else is decided
 * here, from the transcript's own word timings. The length an option
 * promises is the length the edit will have, because it is computed the
 * same way the Studio computes it — never taken from the model.
 */

export type SuggestGoal = { kind: "tighten" } | { kind: "target"; targetSec: number };

export interface RawOption {
  label: string;
  summary: string;
  /** Chapter ordinals to drop. */
  chapters: number[];
  /** Phrases to cut, quoted from the chapter's text as it reads now. */
  phrases: { chapter: number; text: string }[];
  meets_target?: boolean;
}

export interface CutOption {
  id: string;
  label: string;
  summary: string;
  beforeSec: number;
  afterSec: number;
  /** For a target goal: whether the option gets there. */
  meetsTarget: boolean | null;
  chapters: { index: number; title: string; sec: number }[];
  /** Phrases as word runs within a chapter, by the words' original indices. */
  phrases: { seg: number; from: number; to: number; text: string; sec: number }[];
  /** Every word key the option cuts; what `applyOption` adds to `cutWords`. */
  cutKeys: string[];
  /** Phrases the model quoted that are not in the script. Shown, not applied. */
  unmatched: string[];
}

/** A word, lower-cased and stripped of punctuation, for matching a quote against the script. */
export function bareWord(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");
}

/**
 * Finds a quoted phrase in a chapter's spoken words. The first contiguous
 * run whose bare words match, or null. Words already cut are skipped over
 * when matching, since the model never saw them.
 */
export function matchPhrase(
  words: { wordIndex: number; text: string }[],
  phrase: string,
): { from: number; to: number } | null {
  const target = phrase.split(/\s+/).map(bareWord).filter(Boolean);
  if (target.length === 0) return null;
  const bare = words.map((w) => bareWord(w.text));
  for (let start = 0; start + target.length <= bare.length; start++) {
    let ok = true;
    for (let k = 0; k < target.length; k++) {
      if (bare[start + k] !== target[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return { from: words[start].wordIndex, to: words[start + target.length - 1].wordIndex };
  }
  return null;
}

/** The spoken words of a chapter after the current edit: what the model was shown. */
export function spokenWordsOf(project: Project, state: EditState, segIndex: number) {
  const segment = project.segments[segIndex];
  if (!segment) return [];
  return resolveWords(segment, segIndex, state).filter((w) => !isWordRemoved(state, segIndex, w.wordIndex, w));
}

export function editDuration(project: Project, state: EditState): number {
  return timelineDuration(buildTimeline(project, state, { continuous: Boolean(project.voiceId) }));
}

/** The edit with an option's cuts made. Never touches what is already cut. */
export function applyOption(state: EditState, option: CutOption): EditState {
  const deletedSegments = new Set(state.deletedSegments);
  for (const chapter of option.chapters) deletedSegments.add(chapter.index);
  const cutWords = new Set(state.cutWords);
  for (const key of option.cutKeys) cutWords.add(key);
  return { ...state, deletedSegments, cutWords };
}

/**
 * A model's proposal, checked against the script and measured.
 *
 * Chapters that do not exist or are already dropped are ignored; phrases
 * that cannot be found are reported rather than guessed at. An option that
 * would change nothing comes back null.
 */
export function optionFromProposal(
  project: Project,
  state: EditState,
  raw: RawOption,
  goal: SuggestGoal,
  id: string,
): CutOption | null {
  const chapters: CutOption["chapters"] = [];
  for (const index of [...new Set(raw.chapters)].sort((a, b) => a - b)) {
    if (!Number.isInteger(index) || index < 0 || index >= project.segments.length) continue;
    if (state.deletedSegments.has(index)) continue;
    const words = spokenWordsOf(project, state, index);
    chapters.push({ index, title: project.segments[index].title, sec: words.reduce((n, w) => n + w.d, 0) });
  }
  const dropped = new Set(chapters.map((c) => c.index));

  const phrases: CutOption["phrases"] = [];
  const cutKeys: string[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const phrase of raw.phrases) {
    if (!Number.isInteger(phrase.chapter) || phrase.chapter < 0 || phrase.chapter >= project.segments.length) continue;
    if (dropped.has(phrase.chapter) || state.deletedSegments.has(phrase.chapter)) continue;
    let seg = phrase.chapter;
    let words = spokenWordsOf(project, state, seg);
    let match = matchPhrase(words, phrase.text);
    if (!match) {
      // The model quoted it right but filed it under the wrong chapter, as
      // happens near a chapter boundary. Take the phrase if exactly one
      // other chapter has it; a phrase found in several is too common to cut.
      const elsewhere = project.segments
        .map((_, i) => i)
        .filter((i) => i !== phrase.chapter && !dropped.has(i) && !state.deletedSegments.has(i))
        .map((i) => ({ i, words: spokenWordsOf(project, state, i) }))
        .map((c) => ({ ...c, match: matchPhrase(c.words, phrase.text) }))
        .filter((c) => c.match !== null);
      if (elsewhere.length !== 1) {
        unmatched.push(phrase.text);
        continue;
      }
      seg = elsewhere[0].i;
      words = elsewhere[0].words;
      match = elsewhere[0].match!;
    }
    const run = words.filter((w) => w.wordIndex >= match.from && w.wordIndex <= match.to);
    const keys = run.map((w) => wordKey(seg, w.wordIndex)).filter((k) => !seen.has(k));
    if (keys.length === 0) continue;
    for (const k of keys) seen.add(k);
    cutKeys.push(...keys);
    phrases.push({
      seg,
      from: match.from,
      to: match.to,
      text: run.map((w) => w.text).join(" "),
      sec: run.reduce((n, w) => n + w.d, 0),
    });
  }

  if (chapters.length === 0 && cutKeys.length === 0) return null;

  const beforeSec = editDuration(project, state);
  const option: CutOption = {
    id,
    label: raw.label.trim().slice(0, 40) || "Option",
    summary: raw.summary.trim().slice(0, 200),
    beforeSec,
    afterSec: 0,
    meetsTarget: null,
    chapters,
    phrases,
    cutKeys,
    unmatched,
  };
  option.afterSec = editDuration(project, applyOption(state, option));
  if (goal.kind === "target") option.meetsTarget = option.afterSec <= goal.targetSec + 0.5;
  return option;
}
