import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { mergeSegmentIntoPrevious, splitSegment } from "@/lib/db/repositories/projects";
import { recordQuietly } from "@/lib/audit/log";

/**
 * Reshaping chapters: split one at a word, or merge one into the one
 * before it. Both renumber the chapters after them and remap every edit
 * that names a chapter, in one transaction, so nothing shifts silently.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  let body: { action?: unknown; segment_index?: unknown; word_index?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const segIndex = body.segment_index;
  if (!Number.isInteger(segIndex) || (segIndex as number) < 0) {
    return NextResponse.json({ error: "segment_index must be a chapter index." }, { status: 422 });
  }

  const { id } = await context.params;
  let outcome: { ok: true; segments: number } | { ok: false; reason: string };
  if (body.action === "split") {
    const wordIndex = body.word_index;
    if (!Number.isInteger(wordIndex) || (wordIndex as number) < 0) {
      return NextResponse.json({ error: "word_index must be a word index." }, { status: 422 });
    }
    outcome = await splitSegment(guard.actor.workspaceId, id, segIndex as number, wordIndex as number);
  } else if (body.action === "merge") {
    outcome = await mergeSegmentIntoPrevious(guard.actor.workspaceId, id, segIndex as number);
  } else {
    return NextResponse.json({ error: 'action must be "split" or "merge".' }, { status: 422 });
  }
  if (!outcome.ok) return NextResponse.json({ error: outcome.reason }, { status: 409 });

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: body.action === "split" ? "project.chapter.split" : "project.chapter.merged",
    resourceType: "project",
    resourceId: id,
    metadata: { segmentIndex: segIndex, wordIndex: body.word_index ?? null, segments: outcome.segments },
  });
  return NextResponse.json({ segments: outcome.segments });
}
