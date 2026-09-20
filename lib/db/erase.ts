import { eq, sql } from "drizzle-orm";
import { getDb } from "./client";
import * as s from "./schema";

/**
 * Deleting a workspace, and its trail, deliberately.
 *
 * The append-only trigger on `audit_events` turned a hidden decision into a
 * visible one: a routine `DELETE FROM workspaces` cascades into the audit
 * log, and "deleting the workspace erased the record of who deleted it" is
 * not a property to ship by accident.
 *
 * So there is exactly one supported way to do it, and it makes the erasure
 * explicit. Everything else — an ordinary cascade, a cleanup script, a
 * forgotten test teardown — still fails loudly, which is the whole value of
 * the trigger.
 *
 * This is the account-deletion path. It is also what test teardown uses,
 * on purpose: a test that reaches for a private escape hatch is a test that
 * stops exercising the rule everyone else has to follow.
 */
export async function eraseWorkspace(
  workspaceId: string,
  reason: string,
): Promise<{ auditEntriesDestroyed: number }> {
  if (!reason.trim()) {
    throw new Error("Erasing a workspace requires a stated reason.");
  }

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('demoriff.audit_purge', 'on', true)`);

    const destroyed = await tx
      .delete(s.auditEvents)
      .where(eq(s.auditEvents.workspaceId, workspaceId))
      .returning({ id: s.auditEvents.id });

    await tx.delete(s.workspaces).where(eq(s.workspaces.id, workspaceId));

    if (destroyed.length > 0) {
      // The operator's log is the one record this deletion cannot reach.
      console.warn(
        `[erase] workspace ${workspaceId} deleted with ${destroyed.length} audit ` +
          `entries. Reason: ${reason}`,
      );
    }

    return { auditEntriesDestroyed: destroyed.length };
  });
}
