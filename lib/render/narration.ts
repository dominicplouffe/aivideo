import type { Project } from "@/lib/app-data";
import type { SynthesisProvider } from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/errors";
import { chapterSpan, hydrateEditState, isWordRemoved, resolveWords, type EditState } from "@/lib/edit-state";
import {
  narrationCaptions, segmentOutputSeconds, withClipsFor, withNarration,
  type Edl, type EdlCaption, type NarrationClip,
} from "./edl";
import { anchorsFromWords, retimeChapter, type RetimeSummary } from "./retime";
import { wordKey } from "@/lib/segments";
import type { StillSpan } from "@/lib/pipeline/stillness";

/**
 * Reads a project's transcript aloud in the voice it chose.
 *
 * One clip per surviving chapter, from the words the edit keeps — a word cut
 * from the transcript is a word the narrator never says, which is the whole
 * premise of editing video by editing text. The clip lands where the chapter
 * begins on the finished timeline and the mix drops the recording's own
 * audio in its favour.
 *
 * **Fitting.** A synthetic reading never runs exactly as long as the person
 * took to say it, so one of the two has to bend. Over continuous footage it
 * is the footage: the transcriber timed each word as spoken and the
 * synthesizer times it as read, and between those anchors the picture is
 * held, hurried or, last of all, trimmed to fit — see `retimeChapter`. The
 * voice is never hurried. The older path, for a word-cut EDL with no room to
 * bend, still paces the voice and stretches it within limits, and reports
 * what it could not fit.
 */

/** Slightly long is fine: nobody hears a three-percent overrun. */
const FIT_TOLERANCE = 1.03;
/** What the vendor accepts as a pace. */
const VENDOR_PACE_MAX = 1.2;
/** Beyond this a stretched voice is audibly rushed. */
const TEMPO_MAX = 1.35;

export interface NarratedChapter {
  segIndex: number;
  title: string;
  /** How long the footage for this chapter ran before fitting. */
  availableSec: number;
  /** How long the narration runs after fitting. */
  spokenSec: number;
  /** Pace requested from the vendor, 1 when unchanged. */
  pace: number;
  /** Time-stretch applied in the mix, 1 when unchanged. */
  tempo: number;
  /** Seconds the narration still overruns the footage, 0 when it fits. */
  overrunSec: number;
  /** How the footage was bent to the reading, when it was the footage that bent. */
  retime?: RetimeSummary;
}

export interface NarrationReport {
  voice: { id: string; name: string };
  chapters: NarratedChapter[];
}

/**
 * What a browser needs to play the narrated edit without rendering it: the
 * readings as playable URLs placed on the finished timeline, and each
 * surviving word's moment on that timeline, so the script can follow along.
 */
export interface NarrationPreview {
  audio: { segmentId: string; url: string; at: number; durationSec: number }[];
  words: { segIndex: number; wordIndex: number; start: number; end: number }[];
}

export interface NarrateInput {
  edl: Edl;
  project: Project;
  workspaceId: string;
  synthesis: SynthesisProvider;
  /** Respellings from the workspace glossary: shown text → how it is said. */
  pronunciations?: Record<string, string>;
  /** Whether to caption the reading. Defaults to the edit's captions toggle, on. */
  captions?: boolean;
  /** Where the recording's picture stands still; lets the retimer bend still footage first. */
  stillness?: StillSpan[] | null;
  /**
   * Whether the EDL keeps chapters whole (see BuildEdlInput.continuous), so
   * the footage can bend to the reading. Every narrated render is built that
   * way; false only for the older word-cut path, where the voice bends.
   */
  continuous?: boolean;
  /** Called as each chapter starts and once at the end, for a progress bar: chapters done, of how many. */
  onChapter?: (done: number, total: number) => void;
  /** Looks a voice up. Injectable so the fitting logic can be tested without a database. */
  lookupVoice: (id: string) => Promise<{
    id: string;
    name: string;
    providerVoiceId: string;
    available: boolean;
    revokedAt: Date | null;
  } | null>;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** A chapter's surviving words: what is shown, and what is said. */
export function chapterWords(project: Project, state: EditState, segIndex: number): { text: string; spoken: string }[] {
  const segment = project.segments[segIndex];
  if (!segment) return [];
  return resolveWords(segment, segIndex, state)
    .filter((word) => !isWordRemoved(state, segIndex, word.wordIndex, word))
    .map((word) => ({ text: word.text, spoken: word.spoken }));
}

/**
 * What a chapter's narrator says: its words as rewritten, in their spoken
 * form where one was given, less the ones the edit removes.
 */
export function chapterText(project: Project, state: EditState, segIndex: number): string {
  return chapterWords(project, state, segIndex)
    .map((word) => word.spoken)
    .join(" ")
    .trim();
}

/**
 * Applies the glossary's respellings to one spoken word, keeping its
 * punctuation. Done here, per word, rather than in the adapter over the
 * whole text, so the count of tokens sent is known word by word — which is
 * what lets the vendor's timings be mapped back onto the transcript's words.
 */
function respell(spoken: string, pronunciations: Record<string, string>): string {
  const m = spoken.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
  if (!m) return spoken;
  const [, lead, core, trail] = m;
  for (const [term, saidAs] of Object.entries(pronunciations)) {
    if (core.toLowerCase() === term.toLowerCase()) return `${lead}${saidAs}${trail}`;
  }
  return spoken;
}

/** Caption cues from the vendor's word timings, grouped like the word-timed captions are. */
function captionsFromTimings(
  words: { text: string; start: number; end: number }[],
  at: number,
): EdlCaption[] {
  const cues: EdlCaption[] = [];
  let group: { text: string; start: number; end: number }[] = [];
  const flush = () => {
    if (group.length === 0) return;
    cues.push({ from: at + group[0].start, until: at + group[group.length - 1].end, text: group.map((w) => w.text).join(" ") });
    group = [];
  };
  for (const w of words) {
    group.push(w);
    if (/[.!?]$/.test(w.text) || group.length >= 7) flush();
  }
  flush();
  return cues;
}

export async function narrate(
  input: NarrateInput,
): Promise<{ edl: Edl; report: NarrationReport; preview: NarrationPreview } | null> {
  const { project, edl } = input;
  if (!project.voiceId) return null;

  const voice = await input.lookupVoice(project.voiceId);
  if (!voice) {
    throw new ProviderError(
      "The voice chosen for this project no longer exists. Pick another in the Studio's Audio tab.",
      { provider: "render-worker", retryable: false },
    );
  }
  if (voice.revokedAt) {
    // The same refusal the worker makes at the last moment, made here first
    // so a withdrawn voice is not synthesized before being refused.
    throw new ProviderError(
      `Refusing to render: consent was withdrawn for ${voice.name} (${voice.id}). ` +
        "Choose a voice that is still permitted.",
      { provider: "render-worker", retryable: false },
    );
  }
  if (!voice.available) {
    throw new ProviderError(
      `${voice.name} is no longer offered by the synthesis provider. ` +
        "Choose another voice in the Studio's Audio tab.",
      { provider: "render-worker", retryable: false },
    );
  }

  const state = hydrateEditState(project.editState);
  const pronunciations = input.pronunciations ?? {};
  const wantCaptions = input.captions ?? state.captions;
  const clips: NarrationClip[] = [];
  const chapters: NarratedChapter[] = [];
  const preview: NarrationPreview = { audio: [], words: [] };
  let working = edl;

  const total = project.segments.filter((_, index) => !state.deletedSegments.has(index)).length;
  let done = 0;

  for (const [segIndex, segment] of project.segments.entries()) {
    if (state.deletedSegments.has(segIndex)) continue;
    input.onChapter?.(done++, total);

    // The chapter's surviving words, each with what is shown, what is said
    // (respelled per the glossary), where it was spoken in the recording,
    // and how many tokens it sends — so the vendor's timings map back.
    const kept = resolveWords(segment, segIndex, state)
      .filter((word) => !isWordRemoved(state, segIndex, word.wordIndex, word))
      .map((word) => {
        const spoken = word.spoken
          .split(/\s+/)
          .filter(Boolean)
          .map((token) => respell(token, pronunciations))
          .join(" ");
        return {
          text: word.text,
          spoken,
          sourceStart: word.t,
          wordIndex: word.wordIndex,
          tokens: spoken.split(/\s+/).filter(Boolean).length,
        };
      })
      .filter((word) => word.tokens > 0);
    const text = kept.map((w) => w.spoken).join(" ").trim();
    if (!text) continue;

    const availableSec = segmentOutputSeconds(working, segment.id);
    if (availableSec <= 0) continue;
    const chapterClips = working.clips.filter((clip) => clip.label === segment.id);
    const continuous = input.continuous ?? true;

    const request = { text, voiceId: voice.providerVoiceId, locale: working.locale, workspaceId: input.workspaceId };
    let result = await input.synthesis.synthesize(request);

    // The vendor's timing per transcript word: the first token's start and
    // the last token's end of the tokens that word sent.
    const timed: { text: string; start: number; end: number; sourceStart: number; wordIndex: number }[] = [];
    if (result.words && result.words.length === kept.reduce((n, w) => n + w.tokens, 0)) {
      let cursor = 0;
      for (const word of kept) {
        const first = result.words[cursor];
        const last = result.words[cursor + word.tokens - 1];
        timed.push({ text: word.text, start: first.start, end: last.end, sourceStart: word.sourceStart, wordIndex: word.wordIndex });
        cursor += word.tokens;
      }
    }
    // Without vendor timings, words are spread evenly over the reading so
    // the preview still has something to follow.
    const wordMoments = (at: number, seconds: number) =>
      timed.length > 0
        ? timed.map((w) => ({ segIndex, wordIndex: w.wordIndex, start: at + w.start, end: at + w.end }))
        : kept.map((w, i) => ({
            segIndex,
            wordIndex: w.wordIndex,
            start: at + (seconds * i) / kept.length,
            end: at + (seconds * (i + 1)) / kept.length,
          }));

    if (continuous) {
      // The footage bends to the reading. Anchors where a sentence ends on
      // both clocks; still footage is held or hurried first. A lead-in is a
      // beat of picture before the reading: the footage has to cover it too,
      // and every moment of the reading sits that much later.
      const lead = state.sceneTiming.get(segIndex)?.leadInSec ?? 0;
      const occupies = lead + result.durationSec;
      const trimmed = chapterSpan(segment, segIndex, state);
      const anchors = anchorsFromWords(
        timed.map((w) => {
          const pinned = state.syncPoints.get(wordKey(segIndex, w.wordIndex));
          return {
            source: w.sourceStart,
            output: lead + w.start,
            sentenceEnd: /[.!?]$/.test(w.text),
            ...(pinned !== undefined ? { pinnedSource: Math.min(trimmed.end, Math.max(trimmed.start, pinned)) } : {}),
          };
        }),
        { sourceStart: trimmed.start, sourceEnd: trimmed.end, narrationSec: occupies },
      );
      const bounds = chapterSpan(segment, segIndex, state);
      const fitted = retimeChapter({
        sourceStart: bounds.start,
        sourceEnd: bounds.end,
        narrationSec: occupies,
        anchors,
        still: input.stillness ?? [],
        mode: state.sceneTiming.get(segIndex)?.mode ?? "fit",
      });
      working = withClipsFor(
        working,
        segment.id,
        fitted.clips.map((clip) => ({ ...clip, label: segment.id })),
      );
      const chapterStart = (working.clips.find((clip) => clip.label === segment.id)?.outputStart ?? 0) + lead;
      preview.audio.push({ segmentId: segment.id, url: result.audioUrl, at: chapterStart, durationSec: result.durationSec });
      preview.words.push(...wordMoments(chapterStart, result.durationSec));
      clips.push({
        segmentId: segment.id,
        url: result.storageUrl ?? result.audioUrl,
        durationSec: result.durationSec,
        voiceId: voice.id,
        // The reading starts after the lead-in; see `narrationTracks`.
        offsetSec: lead,
        ...(wantCaptions
          ? {
              captions:
                timed.length > 0
                  ? captionsFromTimings(timed, chapterStart)
                  : narrationCaptions(kept.map((w) => w.text), chapterStart, result.durationSec),
            }
          : {}),
      });
      chapters.push({
        segIndex,
        title: segment.title,
        availableSec: round(availableSec),
        spokenSec: round(result.durationSec),
        pace: 1,
        tempo: 1,
        overrunSec: 0,
        retime: fitted.summary,
      });
      continue;
    }

    // A word-cut EDL has no footage to bend, so the voice bends instead.
    const chapterStart = chapterClips[0]?.outputStart ?? 0;
    let pace = 1;
    if (result.durationSec > availableSec * FIT_TOLERANCE) {
      pace = Math.min(VENDOR_PACE_MAX, result.durationSec / availableSec);
      result = await input.synthesis.synthesize({ ...request, direction: { pace } });
    }
    let tempo = 1;
    if (result.durationSec > availableSec * FIT_TOLERANCE) {
      tempo = Math.min(TEMPO_MAX, result.durationSec / availableSec);
    }
    const spokenSec = result.durationSec / tempo;
    preview.audio.push({ segmentId: segment.id, url: result.audioUrl, at: chapterStart, durationSec: spokenSec });
    preview.words.push(...wordMoments(chapterStart, spokenSec));
    clips.push({
      segmentId: segment.id,
      url: result.storageUrl ?? result.audioUrl,
      durationSec: spokenSec,
      voiceId: voice.id,
      tempo,
      ...(wantCaptions
        ? { captions: narrationCaptions(kept.map((w) => w.text), chapterStart, Math.min(spokenSec, availableSec)) }
        : {}),
    });
    chapters.push({
      segIndex,
      title: segment.title,
      availableSec: round(availableSec),
      spokenSec: round(spokenSec),
      pace: round(pace),
      tempo: round(tempo),
      overrunSec: round(Math.max(0, spokenSec - availableSec)),
    });
  }

  input.onChapter?.(total, total);

  return {
    edl: withNarration(working, clips),
    report: { voice: { id: voice.id, name: voice.name }, chapters },
    preview,
  };
}
