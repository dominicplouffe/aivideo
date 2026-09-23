import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { getProjectById } from "@/lib/db/repositories/projects";
import { getRecording } from "@/lib/db/repositories/recordings";
import { getVoice } from "@/lib/db/repositories/voices";
import { listGlossary } from "@/lib/db/repositories/glossary";
import { pronunciationsFor } from "@/lib/pipeline/glossary";
import { providerReport } from "@/lib/providers";
import { capabilityLive, providersFor } from "@/lib/providers/for-workspace";
import { ProviderError } from "@/lib/providers/errors";
import { hydrateEditState } from "@/lib/edit-state";
import { buildEdl } from "@/lib/render/edl";
import { narrate } from "@/lib/render/narration";

/**
 * The narrated edit, planned but not rendered.
 *
 * Exactly the work the render worker does up to the encode — every chapter
 * read in the chosen voice, the footage fitted to the readings — returned
 * as the clips with their speeds and holds, the readings as playable URLs,
 * and each word's moment, so the Studio can play the result in the browser.
 * The readings are cached by content, so previewing and then rendering
 * buys each chapter once.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  const resolved = await providersFor(guard.actor.workspaceId);
  const synthesis = capabilityLive(resolved, "synthesis", providerReport());
  if (!synthesis.live) {
    return NextResponse.json({ error: synthesis.hint || "Synthesis is not configured, so there is no voice to preview." }, { status: 409 });
  }

  const { id } = await context.params;
  const project = await getProjectById(guard.actor.workspaceId, id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });
  if (!project.voiceId) return NextResponse.json({ error: "Choose a voice first." }, { status: 409 });
  if (!project.recordingId) return NextResponse.json({ error: "This project has no recording." }, { status: 409 });

  const recording = await getRecording(guard.actor.workspaceId, project.recordingId);
  const state = hydrateEditState(project.editState);
  const edl = buildEdl({
    project,
    sourceUrl: "preview://unused",
    removeFillers: state.removeFillers,
    deletedSegments: state.deletedSegments,
    cutWords: state.cutWords,
    wordEdits: state.wordEdits,
    sceneTiming: state.sceneTiming,
    continuous: true,
    captions: state.captions,
  });

  try {
    const result = await narrate({
      edl,
      project,
      workspaceId: guard.actor.workspaceId,
      synthesis: resolved.providers.synthesis,
      pronunciations: pronunciationsFor(await listGlossary(guard.actor.workspaceId)),
      stillness: recording?.stillness ?? null,
      lookupVoice: getVoice,
    });
    if (!result) return NextResponse.json({ error: "Choose a voice first." }, { status: 409 });
    return NextResponse.json({
      voice: result.report.voice,
      duration_sec: result.edl.durationSec,
      clips: result.edl.clips.map((clip) => ({
        segment_id: clip.label,
        source_start: clip.sourceStart,
        source_end: clip.sourceEnd,
        output_start: clip.outputStart,
        speed: clip.speed ?? 1,
        hold_sec: clip.holdSec ?? 0,
      })),
      audio: result.preview.audio.map((a) => ({ segment_id: a.segmentId, url: a.url, at: a.at, duration_sec: a.durationSec })),
      words: result.preview.words.map((w) => ({ seg: w.segIndex, word: w.wordIndex, start: w.start, end: w.end })),
      report: result.report,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      // In the server log as well as the response: a 409 in the request log
      // alone says nothing about which vendor refused, or why.
      console.warn(`[narration] ${error.detail.provider} refused (${error.detail.status ?? "no status"}${error.detail.code ? ` ${error.detail.code}` : ""}): ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: error.retryable ? 502 : 409 });
    }
    throw error;
  }
}
