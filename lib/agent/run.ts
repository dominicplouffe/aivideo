import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { recordQuietly } from "@/lib/audit/log";
import { normaliseList } from "./allowlist";

/**
 * The run state machine, which is where the approval gate actually lives.
 *
 * The product promise is that nothing the agent produces reaches a
 * customer-facing surface without a person saying yes. A promise like that
 * is worth exactly as much as the place it is enforced, and a check in a
 * route handler or a disabled button in the UI is worth nothing: the first
 * is one `fetch` away from being skipped, the second is a CSS class.
 *
 * So it is here, in the transition table. `recording` has exactly one legal
 * predecessor — `approved` — and `approved` is reachable only through
 * `approve()`, which refuses without a member id and writes that id to the
 * row. There is no code path from `outlining` to `recording`. An agent that
 * could put itself into `recording` is an agent that records whatever it
 * decided to.
 */

export type RunStatus =
  | "drafted"
  | "outlining"
  | "awaiting_approval"
  | "approved"
  | "recording"
  | "recorded"
  | "failed"
  | "cancelled";

/**
 * Legal transitions, written out in full.
 *
 * Written as data rather than as `if` statements for the same reason the
 * permission matrix is: a reviewer can read this and see the whole answer,
 * and "can the agent get to recording without an approval" is a question
 * they can settle by looking rather than by tracing calls.
 */
export const TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  drafted: ["outlining", "cancelled"],
  outlining: ["awaiting_approval", "failed", "cancelled"],
  // Note what is absent: awaiting_approval cannot reach recording.
  awaiting_approval: ["approved", "cancelled", "failed"],
  approved: ["recording", "cancelled"],
  recording: ["recorded", "failed", "cancelled"],
  recorded: [],
  failed: [],
  cancelled: [],
};

export class RunStateError extends Error {
  constructor(readonly from: RunStatus, readonly to: RunStatus) {
    super(`An agent run cannot go from ${from} to ${to}.`);
    this.name = "RunStateError";
  }
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export type Run = typeof s.agentRuns.$inferSelect;

/**
 * Who did something.
 *
 * `memberId` is nullable, matching the audit log, because the interesting
 * case is precisely the caller that has no member row — a service account,
 * a script with an API key. `approve` refuses those, and the refusal has to
 * be reachable to be worth anything; a type that made it impossible to pass
 * null would make the guard dead code that reads like a control.
 */
export type ActingParty = { memberId: string | null; email: string | null };
/** One thing the agent may do on a page, named the way a person reads it. */
export type StepAction =
  | { kind: "click"; target: string }
  | { kind: "fill"; target: string; value: string };

export type OutlineStep = {
  ordinal: number;
  /** One visible action, in plain words. What the approver reads. */
  intent: string;
  /** The page this step navigates to, if it navigates. */
  url?: string;
  /** What the narrator says while this step is on screen. */
  narration?: string;
  /** The one action taken on the page, or none: some steps only show a page. */
  action?: StepAction;
};

/**
 * A hash of the outline as approved.
 *
 * Without it, "approved" means "somebody approved *an* outline", and an
 * outline edited after approval would still be carrying that approval. The
 * recorder checks this before its first action, so a rewritten plan fails
 * closed rather than running under somebody else's name.
 */
export function outlineHash(outline: OutlineStep[]): string {
  const canonical = outline
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((step) => `${step.ordinal}\u0000${step.intent.trim()}\u0000${step.url ?? ""}`)
    .join("\u0001");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/* ----------------------------------------------------------------- moves */

async function move(run: Run, to: RunStatus, changes: Partial<typeof s.agentRuns.$inferInsert> = {}): Promise<Run> {
  const from = run.status as RunStatus;
  if (!canTransition(from, to)) throw new RunStateError(from, to);

  const [updated] = await getDb()
    .update(s.agentRuns)
    .set({ status: to, ...changes })
    // The status is part of the predicate, so two concurrent callers cannot
    // both read `approved` and both move the run on. The loser updates zero
    // rows and is told the transition is illegal, which it now is.
    .where(and(eq(s.agentRuns.id, run.id), eq(s.agentRuns.status, from)))
    .returning();

  if (!updated) throw new RunStateError(from, to);
  return updated;
}

export async function createRun(input: {
  workspaceId: string;
  brief: string;
  actor: ActingParty;
  projectId?: string | null;
  entryUrl?: string | null;
}): Promise<Run> {
  const [run] = await getDb()
    .insert(s.agentRuns)
    .values({
      workspaceId: input.workspaceId,
      brief: input.brief,
      entryUrl: input.entryUrl ?? null,
      projectId: input.projectId ?? null,
      requestedBy: input.actor.memberId,
      requestedByEmail: input.actor.email,
      status: "drafted",
    })
    .returning();

  await note(run, input.actor, "agent.run_requested", { brief: input.brief.slice(0, 500) });
  return run;
}

export async function beginOutline(run: Run): Promise<Run> {
  return move(run, "outlining");
}

export async function proposeOutline(
  run: Run,
  outline: OutlineStep[],
  allowedOrigins: string[],
): Promise<Run> {
  if (outline.length === 0) {
    return move(run, "failed", { error: "The agent produced no plan for that brief." });
  }

  return move(run, "awaiting_approval", {
    outline,
    // Frozen onto the run here. Reading the workspace's list at action time
    // would mean an approval granted against one set of origins could be
    // executed against another.
    allowedOrigins: normaliseList(allowedOrigins),
  });
}

/**
 * Replaces the plan of a run that is waiting for approval.
 *
 * Only there: an approved plan is hashed and a recording one is running,
 * and changing either would make "approved" mean something other than what
 * was read. The approval, when it comes, covers the plan as edited.
 */
export async function reviseOutline(run: Run, outline: OutlineStep[], actor: ActingParty): Promise<Run> {
  if (run.status !== "awaiting_approval") {
    throw new RunStateError(run.status as RunStatus, "awaiting_approval");
  }
  if (outline.length === 0) throw new ApprovalError("A plan needs at least one step.");
  const [updated] = await getDb()
    .update(s.agentRuns)
    .set({ outline })
    .where(and(eq(s.agentRuns.id, run.id), eq(s.agentRuns.status, "awaiting_approval")))
    .returning();
  if (!updated) throw new RunStateError(run.status as RunStatus, "awaiting_approval");
  await note(updated, actor, "agent.run_plan_edited", { steps: outline.length });
  return updated;
}

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalError";
  }
}

/**
 * A person says yes.
 *
 * Requires a member id, not merely a truthy actor: an approval with no name
 * against it is not an approval, and the audit answer "who agreed to this"
 * has to be a person rather than a service.
 *
 * The approver may not be the requester. Not because a single person cannot
 * be trusted, but because the gate exists to put a second pair of eyes on a
 * plan that will run unattended with real credentials — and a gate that the
 * same person can open for themselves is a formality.
 */
export async function approve(
  run: Run,
  approver: ActingParty,
  options: { allowSelfApproval?: boolean } = {},
): Promise<Run> {
  if (!approver.memberId) {
    throw new ApprovalError("An approval has to have a person's name against it.");
  }
  if (!run.outline || run.outline.length === 0) {
    throw new ApprovalError("There is no outline to approve.");
  }
  if (
    !options.allowSelfApproval &&
    run.requestedBy &&
    run.requestedBy === approver.memberId
  ) {
    throw new ApprovalError(
      "The person who asked for a run cannot be the one who approves it.",
    );
  }

  const selfApproved = Boolean(run.requestedBy && run.requestedBy === approver.memberId);
  const updated = await move(run, "approved", {
    approvedBy: approver.memberId,
    approvedByEmail: approver.email,
    approvedAt: new Date(),
    approvedOutlineHash: outlineHash(run.outline as OutlineStep[]),
  });

  await note(updated, approver, "agent.run_approved", {
    steps: run.outline.length,
    allowedOrigins: updated.allowedOrigins,
    // Said in the trail, so a reviewer reading it later knows no second
    // pair of eyes was available rather than assuming one looked.
    selfApproved,
  });
  return updated;
}

/**
 * Whether anybody other than this member could approve a run.
 *
 * The two-person rule needs two people. In a workspace where the requester
 * is the only active member allowed to approve — a founder on their own —
 * insisting on a second approver makes the agent unusable rather than
 * safer, so the requester may approve their own run there, and the audit
 * entry says so. The moment a second owner, admin or reviewer exists, the
 * rule is back.
 */
export async function hasOtherApprover(workspaceId: string, memberId: string | null): Promise<boolean> {
  const rows = await getDb()
    .select({ id: s.members.id })
    .from(s.members)
    .where(
      and(
        eq(s.members.workspaceId, workspaceId),
        isNull(s.members.deactivatedAt),
        inArray(s.members.role, ["owner", "admin", "reviewer"]),
      ),
    );
  return rows.some((row) => row.id !== memberId);
}

/**
 * Starts recording.
 *
 * Re-checks the approval rather than trusting the status alone. The status
 * says a transition happened; the hash says *what* was approved is what is
 * about to run.
 */
export async function beginRecording(run: Run): Promise<Run> {
  if (!run.approvedBy || !run.approvedAt) {
    throw new ApprovalError("This run has not been approved by anybody.");
  }
  if (run.approvedOutlineHash !== outlineHash((run.outline ?? []) as OutlineStep[])) {
    throw new ApprovalError(
      "The outline has changed since it was approved. It needs approving again.",
    );
  }

  return move(run, "recording", { startedAt: new Date() });
}

export async function finishRecording(
  run: Run,
  produced: { recordingId: string | null; projectId?: string | null } | null,
): Promise<Run> {
  return move(run, "recorded", {
    recordingId: produced?.recordingId ?? null,
    ...(produced?.projectId ? { projectId: produced.projectId } : {}),
    finishedAt: new Date(),
  });
}

export async function failRun(run: Run, error: string): Promise<Run> {
  return move(run, "failed", { error: error.slice(0, 1000), finishedAt: new Date() });
}

export async function cancelRun(
  run: Run,
  actor: ActingParty,
  reason = "cancelled",
): Promise<Run> {
  const updated = await move(run, "cancelled", { error: reason, finishedAt: new Date() });
  await note(updated, actor, "agent.run_cancelled", { reason, from: run.status });
  return updated;
}

/* ------------------------------------------------------------- the audit */

export interface RecordedAction {
  kind: typeof s.agentActions.$inferInsert["kind"];
  outlineOrdinal?: number | null;
  url?: string | null;
  target?: string | null;
  detail?: Record<string, unknown> | null;
  refusedReason?: string | null;
  atMs?: number;
}

/**
 * Appends one action to the run's trail.
 *
 * Refusals are recorded the same as anything else. A run audit that holds
 * only what happened cannot answer the question a reviewer actually asks —
 * what did it *try* to do — and an agent that silently drops a refused
 * navigation is indistinguishable from one that never attempted it.
 */
export async function recordAction(runId: string, action: RecordedAction): Promise<void> {
  // One write at a time per run, in the order they were asked for. A page
  // that loads fires its refused requests all at once, and each write
  // numbers itself from the last one stored: two in flight together took
  // the same number and the second broke the unique key.
  const previous = writing.get(runId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => appendAction(runId, action));
  writing.set(runId, next);
  try {
    await next;
  } finally {
    if (writing.get(runId) === next) writing.delete(runId);
  }
}

const writing = new Map<string, Promise<void>>();

async function appendAction(runId: string, action: RecordedAction): Promise<void> {
  const db = getDb();
  // Retried on a clash anyway: another process writing the same run's trail
  // is not covered by the in-process queue above.
  for (let attempt = 0; ; attempt++) {
    const [last] = await db
      .select({ ordinal: s.agentActions.ordinal })
      .from(s.agentActions)
      .where(eq(s.agentActions.runId, runId))
      .orderBy(desc(s.agentActions.ordinal))
      .limit(1);
    try {
      await db.insert(s.agentActions).values({
        runId,
        ordinal: (last?.ordinal ?? -1) + 1,
        kind: action.kind,
        outlineOrdinal: action.outlineOrdinal ?? null,
        url: action.url ?? null,
        target: action.target ?? null,
        detail: action.detail ?? null,
        refusedReason: action.refusedReason ?? null,
        atMs: Math.max(0, Math.round(action.atMs ?? 0)),
      });
      return;
    } catch (error) {
      const code = (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;
      if (code !== "23505" || attempt >= 4) throw error;
    }
  }
}

export async function actionsFor(runId: string) {
  return getDb()
    .select()
    .from(s.agentActions)
    .where(eq(s.agentActions.runId, runId))
    .orderBy(asc(s.agentActions.ordinal));
}

export async function getRun(workspaceId: string, runId: string): Promise<Run | null> {
  const [run] = await getDb()
    .select()
    .from(s.agentRuns)
    // Scoped in the query. A run id is not a secret.
    .where(and(eq(s.agentRuns.id, runId), eq(s.agentRuns.workspaceId, workspaceId)))
    .limit(1);
  return run ?? null;
}

async function note(
  run: Run,
  actor: ActingParty,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await recordQuietly({
    workspaceId: run.workspaceId,
    actor,
    action,
    resourceType: "agent_run",
    resourceId: run.id,
    metadata,
  });
}
