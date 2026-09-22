import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

/**
 * Recordings: the source take, before it is anything else.
 *
 * A recording is created *before* its bytes arrive, in `awaiting_upload`.
 * That ordering matters: the row is what the upload writes into, so a take
 * that fails halfway leaves a visible record of what was attempted rather
 * than nothing at all. It is also what makes the upload restartable — the
 * key is derived from the id, so the same take always writes to the same
 * place instead of scattering orphaned blobs.
 */

export type Recording = typeof s.recordings.$inferSelect;

export async function createRecording(input: {
  workspaceId: string;
  createdBy: string | null;
  source: typeof s.recordings.$inferInsert["source"];
}): Promise<Recording> {
  const [row] = await getDb()
    .insert(s.recordings)
    .values({
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
      source: input.source,
      status: "awaiting_upload",
    })
    .returning();
  return row;
}

/** Where a recording's media lives. Derived, never chosen by a caller. */
export function mediaKeyFor(recording: Pick<Recording, "id">): string {
  return `recordings/${recording.id}/source.webm`;
}

export async function getRecording(
  workspaceId: string,
  id: string,
): Promise<Recording | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;

  const [row] = await getDb()
    .select()
    .from(s.recordings)
    .where(
      and(
        eq(s.recordings.id, id),
        // Scoped in the query. A recording id is not a secret, and this is
        // somebody's screen.
        eq(s.recordings.workspaceId, workspaceId),
        isNull(s.recordings.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Records that the bytes arrived, and what they were. */
export async function attachMedia(
  id: string,
  media: {
    mediaKey: string;
    bytes: number;
    durationSec?: number | null;
    width?: number | null;
    height?: number | null;
    events?: unknown[] | null;
  },
): Promise<Recording> {
  const [row] = await getDb()
    .update(s.recordings)
    .set({
      mediaKey: media.mediaKey,
      bytes: media.bytes,
      durationSec: media.durationSec ?? null,
      width: media.width ?? null,
      height: media.height ?? null,
      events: media.events ?? null,
      status: "uploaded",
    })
    .where(eq(s.recordings.id, id))
    .returning();
  return row;
}

export async function setStatus(
  id: string,
  status: typeof s.recordings.$inferInsert["status"],
): Promise<void> {
  await getDb().update(s.recordings).set({ status }).where(eq(s.recordings.id, id));
}

/** Stores where the picture stands still. Null when it could not be measured. */
export async function attachStillness(recordingId: string, stillness: [number, number][] | null): Promise<void> {
  await getDb().update(s.recordings).set({ stillness }).where(eq(s.recordings.id, recordingId));
}

/** Stores a word-level transcript against the take it came from. */
export async function attachTranscript(
  id: string,
  transcript: { language: string; words: unknown[] } | null,
): Promise<void> {
  await getDb()
    .update(s.recordings)
    .set({ transcript, status: transcript ? "ready" : "failed" })
    .where(eq(s.recordings.id, id));
}
