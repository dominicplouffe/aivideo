import { readFile } from "node:fs/promises";
import type { OutlineStep, Run } from "./run";
import type { StepTiming } from "./driver";
import { createProject, replaceSegments, saveVoice, setProjectStatus } from "@/lib/db/repositories/projects";
import { attachMedia, attachStillness, createRecording, mediaKeyFor } from "@/lib/db/repositories/recordings";
import { listVoicesForWorkspace } from "@/lib/db/repositories/voices";
import { titleFor, type SegmentDraft } from "@/lib/pipeline/segment";
import { detectStillness } from "@/lib/pipeline/stillness";
import { probe } from "@/lib/render/ffmpeg";
import { getStorage } from "@/lib/storage";

/**
 * From a finished run to a project in the Studio.
 *
 * The agent's video has no voice on it, so there is nothing to transcribe.
 * The script is the plan: each step's narration becomes a chapter over the
 * footage that step was on screen for, its words laid evenly across the
 * span so the Studio can edit them like any transcript. With a voice chosen
 * the export reads that script, fitted to the footage by the retimer, which
 * is the same path a recorded take with a replaced voice goes through.
 */

/** A brief, shortened to a project title at a word boundary. */
export function titleFromBrief(brief: string, limit = 78): string {
  const flat = brief.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat.replace(/[.]$/, "");
  const cut = flat.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[,:;.]$/, "")}…`;
}

/**
 * Chapters from the plan and the step timings.
 *
 * A step with nothing to say still gets a chapter, with its intent as the
 * line, so the video is never a stretch of footage with no script under
 * it. The last chapter runs to the end of the video. Words are spread so
 * each occupies an equal share of its chapter, leaving a little air.
 */
export function segmentsFromSteps(outline: OutlineStep[], steps: StepTiming[], durationSec: number): SegmentDraft[] {
  const drafts: SegmentDraft[] = [];
  const timed = steps.filter((t) => outline[t.ordinal]).sort((a, b) => a.ordinal - b.ordinal);
  timed.forEach((timing, i) => {
    const step = outline[timing.ordinal];
    const startSec = Math.max(0, timing.startMs / 1000);
    const endSec = i === timed.length - 1 ? Math.max(startSec + 0.5, durationSec) : Math.max(startSec + 0.5, timed[i + 1].startMs / 1000);
    const text = (step.narration ?? step.intent).trim();
    const tokens = text.split(/\s+/).filter(Boolean);
    const span = endSec - startSec;
    const slot = span / Math.max(1, tokens.length);
    const words = tokens.map((w, k) => ({ w, t: round(startSec + k * slot), d: round(Math.max(0.05, slot * 0.85)) }));
    drafts.push({
      ordinal: i,
      title: titleFor(words, i),
      startSec: round(startSec),
      endSec: round(endSec),
      action: step.action ? `${step.action.kind} → ${step.action.target}` : null,
      words,
    });
  });
  return drafts;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Stores the video, makes the project and its chapters, picks a voice.
 *
 * Best effort past the project: a missing ffprobe or an unmeasured take
 * still leaves a project a person can open. Returns what the run records.
 */
export async function finalizeRun(input: {
  run: Run;
  videoPath: string | null;
  steps: StepTiming[];
  ffprobeBinary?: string;
}): Promise<{ recordingId: string | null; projectId: string | null }> {
  const { run } = input;
  if (!input.videoPath) return { recordingId: null, projectId: null };
  const outline = (run.outline ?? []) as OutlineStep[];

  const bytes = new Uint8Array(await readFile(input.videoPath));
  const probed = await probe(input.videoPath, input.ffprobeBinary).catch(() => null);
  const durationSec = probed?.durationSec && probed.durationSec > 0
    ? probed.durationSec
    : Math.max(1, (input.steps.at(-1)?.endMs ?? 1000) / 1000);

  const recording = await createRecording({ workspaceId: run.workspaceId, createdBy: run.requestedBy, source: "agent" });
  const mediaKey = mediaKeyFor(recording);
  await getStorage().put({ workspaceId: run.workspaceId, path: mediaKey }, bytes, "video/webm");
  await attachMedia(recording.id, {
    mediaKey,
    bytes: bytes.byteLength,
    durationSec,
    width: probed?.width ?? null,
    height: probed?.height ?? null,
  });
  // Where the picture stands still, for fitting the narration to it later.
  await detectStillness(input.videoPath)
    .then((spans) => attachStillness(recording.id, spans))
    .catch((error) => console.warn(`[agent] stillness not measured for ${recording.id}:`, error instanceof Error ? error.message : error));

  const project = await createProject({
    workspaceId: run.workspaceId,
    recordingId: recording.id,
    ownerId: run.requestedBy,
    title: titleFromBrief(run.brief),
    description: run.brief.slice(0, 500),
    sourceDurationSec: durationSec,
    collection: "Riff Agent",
  });
  const drafts = segmentsFromSteps(outline, input.steps, durationSec);
  await replaceSegments(project.id, drafts);
  await setProjectStatus(project.id, "ready", { durationSec });

  // A voice, so "Hear it narrated" works the moment the project opens. The
  // first studio voice the workspace has synced; none is fine too.
  const voices = await listVoicesForWorkspace(run.workspaceId).catch(() => []);
  const voice = voices.find((v) => v.kind === "studio" && v.available && !v.revokedAt) ?? voices.find((v) => v.available && !v.revokedAt);
  if (voice) await saveVoice(run.workspaceId, project.id, voice.id).catch(() => false);

  return { recordingId: recording.id, projectId: project.id };
}
