import { NextResponse } from "next/server";
import { desc, eq, isNull, and } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { createRecording } from "@/lib/db/repositories/recordings";
import { recordQuietly } from "@/lib/audit/log";

/**
 * Recordings.
 *
 * A take is created here *before* its bytes exist, and the upload then writes
 * into it. That ordering is what makes a failed upload visible — a row in
 * `awaiting_upload` is somebody's recording that did not make it, which is
 * worth knowing — and what makes the upload restartable, because the storage
 * key is derived from the id rather than chosen per attempt.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "recording.create");
  if ("response" in guard) return guard.response;

  let body: { source?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const allowed = ["extension", "desktop", "upload", "connector", "agent"] as const;
  const source = allowed.includes(body.source as (typeof allowed)[number])
    ? (body.source as (typeof allowed)[number])
    : "upload";

  const recording = await createRecording({
    workspaceId: guard.actor.workspaceId,
    createdBy: guard.actor.memberId,
    source,
  });

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "recording.started",
    resourceType: "recording",
    resourceId: recording.id,
    metadata: { source },
  });

  return NextResponse.json({ id: recording.id, status: recording.status }, { status: 201 });
}

/** Recent takes, for a "pick up where you left off" list. */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;

  const rows = await getDb()
    .select()
    .from(s.recordings)
    .where(
      and(
        eq(s.recordings.workspaceId, guard.actor.workspaceId),
        isNull(s.recordings.deletedAt),
      ),
    )
    .orderBy(desc(s.recordings.createdAt))
    .limit(25);

  return NextResponse.json({
    recordings: rows.map((row) => ({
      id: row.id,
      status: row.status,
      source: row.source,
      bytes: row.bytes,
      duration_sec: row.durationSec,
      created_at: row.createdAt.toISOString(),
      // Whether a transcript exists, never the transcript itself — this list
      // is a picker, and a take's words can be long.
      transcribed: row.transcript !== null,
    })),
  });
}
