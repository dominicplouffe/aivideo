import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { getProjectById } from "@/lib/db/repositories/projects";
import { getVoice } from "@/lib/db/repositories/voices";
import { getProviders, providerReport } from "@/lib/providers";
import { ProviderError } from "@/lib/providers/errors";
import { hydrateEditState } from "@/lib/edit-state";
import { buildEdl, segmentOutputSeconds } from "@/lib/render/edl";
import { chapterText } from "@/lib/render/narration";
import { listGlossary } from "@/lib/db/repositories/glossary";
import { pronunciationsFor } from "@/lib/pipeline/glossary";

/**
 * Hear one chapter in the project's chosen voice before rendering.
 *
 * `POST { segment_index }` synthesizes that chapter's kept words and returns
 * a playable URL — the same clip, content-addressed, that a render would
 * make first, so previewing a chapter and then rendering it costs one
 * synthesis, not two. The response also says how long the reading runs
 * against the chapter's footage, which is the thing a person most wants to
 * know before they commit to a render.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  let body: { segment_index?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const segIndex = body.segment_index;
  if (!Number.isInteger(segIndex) || (segIndex as number) < 0) {
    return NextResponse.json({ error: "segment_index must be a chapter index." }, { status: 422 });
  }

  const synthesis = providerReport().find((entry) => entry.capability === "synthesis");
  if (!synthesis?.live) {
    return NextResponse.json(
      { error: "Synthesis is not configured, so there is no voice to preview." },
      { status: 409 },
    );
  }

  const { id } = await context.params;
  const project = await getProjectById(guard.actor.workspaceId, id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });
  if (!project.voiceId) {
    return NextResponse.json({ error: "Choose a voice first." }, { status: 409 });
  }
  const segment = project.segments[segIndex as number];
  if (!segment) return NextResponse.json({ error: "No such chapter." }, { status: 404 });

  const voice = await getVoice(project.voiceId);
  if (!voice || (voice.workspaceId !== null && voice.workspaceId !== guard.actor.workspaceId)) {
    return NextResponse.json({ error: "The chosen voice no longer exists." }, { status: 409 });
  }
  if (voice.revokedAt) {
    return NextResponse.json({ error: `${voice.name} has withdrawn consent.` }, { status: 409 });
  }
  if (!voice.available) {
    return NextResponse.json(
      { error: `${voice.name} is no longer offered by the synthesis provider.` },
      { status: 409 },
    );
  }

  const state = hydrateEditState(project.editState);
  const text = chapterText(project, state, segIndex as number);
  if (!text) {
    return NextResponse.json(
      { error: "This chapter has no words left to read." },
      { status: 422 },
    );
  }

  // The chapter's running time under the current edit, from the same
  // arithmetic the render uses. The source URL is a placeholder: nothing
  // here reads the footage, only measures it.
  const edl = buildEdl({
    project,
    sourceUrl: "preview://unused",
    removeFillers: state.removeFillers,
    deletedSegments: state.deletedSegments,
    cutWords: state.cutWords,
    wordEdits: state.wordEdits,
    sceneTiming: state.sceneTiming,
    continuous: true,
  });
  const availableSec = segmentOutputSeconds(edl, segment.id);

  try {
    const pronunciations = pronunciationsFor(await listGlossary(guard.actor.workspaceId));
    const clip = await getProviders().synthesis.synthesize({
      text,
      voiceId: voice.providerVoiceId,
      locale: edl.locale,
      workspaceId: guard.actor.workspaceId,
      ...(Object.keys(pronunciations).length > 0 ? { pronunciations } : {}),
    });
    return NextResponse.json({
      voice: { id: voice.id, name: voice.name },
      chapter: { index: segIndex, title: segment.title },
      text,
      audio_url: clip.audioUrl,
      duration_sec: Math.round(clip.durationSec * 100) / 100,
      available_sec: Math.round(availableSec * 100) / 100,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.retryable ? 502 : 409 });
    }
    throw error;
  }
}
