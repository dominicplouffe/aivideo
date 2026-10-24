import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { processProject } from "@/lib/pipeline/process";
import { recordQuietly } from "@/lib/audit/log";

/**
 * Transcribe a take and cut it into chapters.
 *
 * Synchronous, and awaited by the caller. A queue would be the reflex here,
 * and there is one — but a queue only helps if something is draining it, and
 * on a fresh install nothing is. A person who has just recorded their screen
 * should not have to discover that a second process exists before their
 * transcript appears. The work is a single vendor call on media we already
 * hold, and the recorder shows it happening.
 *
 * Safe to call twice. `processProject` replaces a project's segments rather
 * than appending, which is what makes the retry button on a failed project
 * something a person can press without thinking about it.
 */
export const dynamic = "force-dynamic";
// Transcription of a long take outlasts the default serverless budget.
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  const outcome = await processProject(guard.actor.workspaceId, id);

  if (!outcome.ok) {
    await recordQuietly({
      workspaceId: guard.actor.workspaceId,
      actor: guard.actor,
      action: "project.process_failed",
      resourceType: "project",
      resourceId: id,
      metadata: { reason: outcome.reason },
    });
    return NextResponse.json({ error: outcome.reason }, { status: 422 });
  }

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "project.processed",
    resourceType: "project",
    resourceId: id,
    metadata: {
      segments: outcome.segments,
      words: outcome.words,
      provider: outcome.provider,
    },
  });

  return NextResponse.json({
    segments: outcome.segments,
    words: outcome.words,
    // The take as recorded. The edited length is reported separately: an
    // 86.6s upload used to come back as "duration_sec: 72", which was the
    // length after fillers and pauses, under the wrong name.
    duration_sec: Math.round(outcome.sourceDurationSec * 10) / 10,
    edited_duration_sec: Math.round(outcome.durationSec * 10) / 10,
    // Named so the Studio can say where the words came from. A transcript
    // from `mock-transcription` is invented, and the person reading it is
    // entitled to know that before they spend an hour editing it.
    provider: outcome.provider,
  });
}
