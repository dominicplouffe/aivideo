import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../client";
import * as s from "../schema";

/**
 * Checkpoints of a project's edit.
 *
 * Kept per project, newest first, and pruned past a ceiling: a person going
 * back wants the last few states, not an archive. Restoring is done by the
 * caller through `saveEditState`; this module only remembers.
 */

export interface Checkpoint {
  id: string;
  projectId: string;
  label: string;
  kind: "ai" | "restore" | "manual";
  editState: Record<string, unknown>;
  createdAt: string;
}

/** More than this and the history is noise. The oldest go first. */
export const MAX_CHECKPOINTS = 30;

function toCheckpoint(row: typeof s.projectCheckpoints.$inferSelect): Checkpoint {
  return {
    id: row.id,
    projectId: row.projectId,
    label: row.label,
    kind: row.kind as Checkpoint["kind"],
    editState: row.editState,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listCheckpoints(workspaceId: string, projectId: string): Promise<Checkpoint[]> {
  const rows = await getDb()
    .select()
    .from(s.projectCheckpoints)
    .where(and(eq(s.projectCheckpoints.workspaceId, workspaceId), eq(s.projectCheckpoints.projectId, projectId)))
    .orderBy(desc(s.projectCheckpoints.createdAt));
  return rows.map(toCheckpoint);
}

export async function getCheckpoint(workspaceId: string, projectId: string, id: string): Promise<Checkpoint | null> {
  const [row] = await getDb()
    .select()
    .from(s.projectCheckpoints)
    .where(
      and(
        eq(s.projectCheckpoints.id, id),
        eq(s.projectCheckpoints.workspaceId, workspaceId),
        eq(s.projectCheckpoints.projectId, projectId),
      ),
    )
    .limit(1);
  return row ? toCheckpoint(row) : null;
}

export async function createCheckpoint(input: {
  workspaceId: string;
  projectId: string;
  label: string;
  kind: Checkpoint["kind"];
  editState: Record<string, unknown>;
  createdBy: string | null;
}): Promise<Checkpoint> {
  const db = getDb();
  const [row] = await db
    .insert(s.projectCheckpoints)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      label: input.label.trim().slice(0, 120),
      kind: input.kind,
      editState: input.editState,
      createdBy: input.createdBy,
    })
    .returning();

  // Prune the oldest past the ceiling, in the same call, so the table never
  // needs a sweeper.
  const all = await db
    .select({ id: s.projectCheckpoints.id })
    .from(s.projectCheckpoints)
    .where(eq(s.projectCheckpoints.projectId, input.projectId))
    .orderBy(asc(s.projectCheckpoints.createdAt));
  if (all.length > MAX_CHECKPOINTS) {
    for (const old of all.slice(0, all.length - MAX_CHECKPOINTS)) {
      await db.delete(s.projectCheckpoints).where(eq(s.projectCheckpoints.id, old.id));
    }
  }
  return toCheckpoint(row);
}
