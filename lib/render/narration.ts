import type { Project } from "@/lib/app-data";
import type { SynthesisProvider } from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/errors";
import { hydrateEditState, isWordRemoved, type EditState } from "@/components/app/studio/types";
import { segmentOutputSeconds, withNarration, type Edl, type NarrationClip } from "./edl";

/**
 * Reads a project's transcript aloud in the voice it chose.
 *
 * One clip per surviving chapter, from the words the edit keeps — a word cut
 * from the transcript is a word the narrator never says, which is the whole
 * premise of editing video by editing text. The clip lands where the chapter
 * begins on the finished timeline and the mix drops the recording's own
 * audio in its favour.
 *
 * **Fitting.** A synthetic reading rarely runs exactly as long as the person
 * took to say it. When it runs short, the silence until the next chapter is
 * simply part of the shot. When it runs long it would talk over the next
 * chapter, so it is fitted in two steps: the vendor is asked to read faster,
 * within the range it allows, and any remainder is a time-stretch in the
 * mix, capped where a voice starts to sound hurried. Past that cap the
 * overrun is reported rather than hidden, so the person can shorten the
 * chapter's words or accept the overlap knowingly.
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
  /** How long the footage for this chapter runs. */
  availableSec: number;
  /** How long the narration runs after fitting. */
  spokenSec: number;
  /** Pace requested from the vendor, 1 when unchanged. */
  pace: number;
  /** Time-stretch applied in the mix, 1 when unchanged. */
  tempo: number;
  /** Seconds the narration still overruns the footage, 0 when it fits. */
  overrunSec: number;
}

export interface NarrationReport {
  voice: { id: string; name: string };
  chapters: NarratedChapter[];
}

export interface NarrateInput {
  edl: Edl;
  project: Project;
  workspaceId: string;
  synthesis: SynthesisProvider;
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

/** What a chapter's narrator says: its words, less the ones the edit removes. */
export function chapterText(project: Project, state: EditState, segIndex: number): string {
  const segment = project.segments[segIndex];
  if (!segment) return "";
  return segment.words
    .filter((word, wordIndex) => !isWordRemoved(state, segIndex, wordIndex, word))
    .map((word) => word.w)
    .join(" ")
    .trim();
}

export async function narrate(input: NarrateInput): Promise<{ edl: Edl; report: NarrationReport } | null> {
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
  const clips: NarrationClip[] = [];
  const chapters: NarratedChapter[] = [];

  for (const [segIndex, segment] of project.segments.entries()) {
    if (state.deletedSegments.has(segIndex)) continue;
    const text = chapterText(project, state, segIndex);
    if (!text) continue;

    const availableSec = segmentOutputSeconds(edl, segment.id);
    if (availableSec <= 0) continue;

    const request = {
      text,
      voiceId: voice.providerVoiceId,
      locale: edl.locale,
      workspaceId: input.workspaceId,
    };
    let result = await input.synthesis.synthesize(request);
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

    clips.push({
      segmentId: segment.id,
      url: result.storageUrl ?? result.audioUrl,
      durationSec: spokenSec,
      voiceId: voice.id,
      tempo,
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

  return {
    edl: withNarration(edl, clips),
    report: { voice: { id: voice.id, name: voice.name }, chapters },
  };
}
