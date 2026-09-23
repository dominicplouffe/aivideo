import { NextResponse } from "next/server";
import { assertFeature } from "@/lib/api/plan-gate";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { normaliseList, withinAllowlist } from "@/lib/agent/allowlist";
import { listCredentials } from "@/lib/agent/credentials";
import { shapePlan } from "@/lib/agent/outline";
import { enqueue } from "@/lib/jobs/queue";
import {
  ApprovalError, RunStateError, actionsFor, approve, cancelRun,
  createReviewedRun, getRun, hasOtherApprover, retryRun, updateRequest, type RunRequest,
} from "@/lib/agent/run";

/**
 * Agent runs.
 *
 * Asking for a run and approving one are different permissions, held by
 * different roles, because the gate is the product — a plan that will drive
 * a browser with real credentials, unattended, should not be checked only by
 * the person who asked for it.
 *
 * This route can put a run into `awaiting_approval` and into `approved`. It
 * cannot put one into `recording`: that transition belongs to the driver,
 * and only from `approved`.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handle(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ApprovalError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof RunStateError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  throw error;
}

function shape(run: typeof s.agentRuns.$inferSelect) {
  return {
    id: run.id,
    status: run.status,
    brief: run.brief,
    outline: run.outline ?? [],
    allowed_origins: run.allowedOrigins,
    entry_url: run.entryUrl,
    sign_ins: run.signIns,
    attempt: run.attempt,
    project_id: run.projectId,
    revised_from: run.revisedFrom,
    requested_by: run.requestedByEmail,
    approved_by: run.approvedByEmail,
    approved_at: run.approvedAt?.toISOString() ?? null,
    started_at: run.startedAt?.toISOString() ?? null,
    finished_at: run.finishedAt?.toISOString() ?? null,
    error: run.error,
  };
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "The agent requires a database." }, { status: 503 });
  }

  const id = new URL(request.url).searchParams.get("id");

  try {
    const actor = await resolveActor(request);
    authorize(actor, "project.view", { workspaceId: actor.workspaceId });

    if (id) {
      if (!UUID.test(id)) return NextResponse.json({ error: "No such run." }, { status: 404 });
      const run = await getRun(actor.workspaceId, id);
      if (!run) return NextResponse.json({ error: "No such run." }, { status: 404 });

      // The full trail, refusals included. This is the artefact a security
      // reviewer asks for, so it is a first-class response rather than
      // something reconstructed from logs.
      const actions = await actionsFor(run.id);
      return NextResponse.json({
        run: shape(run),
        queue: run.status === "approved" ? await queuePlace(run) : null,
        actions: actions.map((action) => ({
          ordinal: action.ordinal,
          kind: action.kind,
          outline_ordinal: action.outlineOrdinal,
          url: action.url,
          target: action.target,
          detail: action.detail,
          refused_reason: action.refusedReason,
          at_ms: action.atMs,
        })),
      });
    }

    const runs = await getDb()
      .select()
      .from(s.agentRuns)
      .where(eq(s.agentRuns.workspaceId, actor.workspaceId))
      .orderBy(desc(s.agentRuns.createdAt))
      .limit(50);

    return NextResponse.json({ runs: runs.map(shape) });
  } catch (error) {
    return handle(error);
  }
}

/**
 * Everything a person filled in for a run, checked as the server would
 * check a planned one: sites normalised, every step inside them, and every
 * chosen sign-in stored for exactly the site it is chosen for.
 */
async function parseRequest(
  body: Record<string, unknown>,
  workspaceId: string,
): Promise<{ ok: true; request: RunRequest } | { ok: false; error: string }> {
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";
  if (brief.length < 10) return { ok: false, error: "Say what to demonstrate, in a sentence or two." };
  const origins = normaliseList(Array.isArray(body.allowed_origins) ? (body.allowed_origins as string[]) : []);
  if (origins.length === 0) return { ok: false, error: "Name at least one site the agent may go to." };
  const entryUrl = typeof body.entry_url === "string" && body.entry_url.trim() ? body.entry_url.trim() : null;
  if (entryUrl && !withinAllowlist(entryUrl, origins).ok) {
    return { ok: false, error: "The start page has to be on one of the sites above." };
  }
  const plan = shapePlan(Array.isArray(body.outline) ? (body.outline as Record<string, unknown>[]) : [], origins);
  if (plan.removed.length > 0) {
    const first = plan.removed[0];
    return { ok: false, error: `Step "${first.intent}" goes to ${first.url ?? "a page"}, ${first.reason}.` };
  }
  if (plan.outline.length === 0) return { ok: false, error: "A run needs at least one step. Plan the steps from the brief, or add one." };

  const signIns: Record<string, string> = {};
  const raw = body.sign_ins && typeof body.sign_ins === "object" ? (body.sign_ins as Record<string, unknown>) : {};
  const stored = (await listCredentials(workspaceId)).filter((c) => !c.revoked);
  for (const [origin, label] of Object.entries(raw)) {
    if (typeof label !== "string" || !label) continue;
    if (!origins.includes(origin)) continue;
    if (!stored.some((c) => c.label === label && c.origin === origin)) {
      return { ok: false, error: `The sign-in chosen for ${origin} is not stored for that site any more. Choose it again.` };
    }
    signIns[origin] = label;
  }
  return { ok: true, request: { brief, allowedOrigins: origins, entryUrl, outline: plan.outline, signIns } };
}

/**
 * Saves a run the person has reviewed in the editor.
 *
 * With no `revise_of`, a new run. With `revise_of` naming a run that made
 * a project, a new run that records into a new project and points back at
 * the original, which stays as it is. Nothing records until approval.
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "The agent requires a database." }, { status: 503 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "agent.run", { workspaceId: actor.workspaceId });
    const outside = await assertFeature(actor.workspaceId, "agent", "The Riff Agent");
    if (outside) return outside;

    let revisedFrom: string | null = null;
    if (body.revise_of !== undefined) {
      const id = typeof body.revise_of === "string" ? body.revise_of : "";
      const source = UUID.test(id) ? await getRun(actor.workspaceId, id) : null;
      if (!source) return NextResponse.json({ error: "No such run." }, { status: 404 });
      if (!source.projectId) {
        return NextResponse.json({ error: "That run made no project, so it is fixed and retried as itself." }, { status: 409 });
      }
      revisedFrom = source.id;
    }

    const parsed = await parseRequest(body, actor.workspaceId);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });

    const run = await createReviewedRun({ workspaceId: actor.workspaceId, actor, request: parsed.request, revisedFrom });
    return NextResponse.json({ run: shape(run) }, { status: 201 });
  } catch (error) {
    return handle(error);
  }
}

/** Approves a run, or cancels it. */
export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "The agent requires a database." }, { status: 503 });
  }

  let body: { id?: unknown; decision?: unknown; reason?: unknown } & Record<string, unknown>;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "A run id is required." }, { status: 400 });

  try {
    const actor = await resolveActor(request);

    // Edit: a waiting run changes in place; a run that stopped before it
    // made anything is reopened as its next attempt, for approval again.
    if (body.decision === "edit") {
      authorize(actor, "agent.run", { workspaceId: actor.workspaceId });
      const run = await getRun(actor.workspaceId, id);
      if (!run) return NextResponse.json({ error: "No such run." }, { status: 404 });
      const parsed = await parseRequest(body as Record<string, unknown>, actor.workspaceId);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 });
      const updated =
        run.status === "awaiting_approval"
          ? await updateRequest(run, parsed.request, actor)
          : await retryRun(run, parsed.request, actor);
      return NextResponse.json({ run: shape(updated) });
    }

    const decision = body.decision === "approve" ? "approve" : "cancel";
    authorize(
      actor,
      decision === "approve" ? "agent.approve" : "agent.run",
      { workspaceId: actor.workspaceId },
    );

    const run = await getRun(actor.workspaceId, id);
    if (!run) return NextResponse.json({ error: "No such run." }, { status: 404 });

    const updated =
      decision === "approve"
        ? await approve(run, actor, {
            allowSelfApproval: !(await hasOtherApprover(actor.workspaceId, actor.memberId)),
          })
        : await cancelRun(run, actor, typeof body.reason === "string" ? body.reason : "cancelled");

    // The worker does the recording. One job per attempt of the run,
    // however many times approval is retried.
    if (decision === "approve") await queueRecording(updated);

    return NextResponse.json({ run: shape(updated) });
  } catch (error) {
    return handle(error);
  }
}

/**
 * Where an approved run's job stands: when it joined the line and how much
 * background work is ahead of it. Renders go first in the worker, so every
 * queued job created earlier counts, whatever its kind.
 */
/**
 * Puts an approved run in line for the recorder.
 *
 * Keyed on the run *and its attempt*. Keyed on the run alone, a run that
 * was fixed and retried was approved, handed to the queue, and matched to
 * its first attempt's finished job — so nothing was queued and the page
 * said "Starting shortly" for ever.
 */
async function queueRecording(run: { id: string; workspaceId: string; attempt: number }) {
  await enqueue({
    workspaceId: run.workspaceId,
    kind: "agent",
    payload: { runId: run.id, attempt: run.attempt },
    idempotencyKey: `agent:${run.id}:${run.attempt}`,
    maxAttempts: 1,
  });
}

async function queuePlace(run: { id: string; workspaceId: string; attempt: number }): Promise<{ queued_at: string; ahead: number } | null> {
  const latest = async () =>
    (
      await getDb()
        .select({ createdAt: s.jobs.createdAt, status: s.jobs.status })
        .from(s.jobs)
        .where(and(eq(s.jobs.kind, "agent"), sql`${s.jobs.payload}->>'runId' = ${run.id}`))
        .orderBy(desc(s.jobs.createdAt))
        .limit(1)
    )[0];
  let job = await latest();
  // An approved run with no live job is a run nobody will ever record.
  // Whatever caused it, the answer is to put it in line, not to wait.
  if (!job || (job.status !== "queued" && job.status !== "running")) {
    await queueRecording(run);
    job = await latest();
  }
  if (!job || job.status !== "queued") return null;
  const [ahead] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(s.jobs)
    .where(and(sql`${s.jobs.status} in ('queued', 'running')`, lt(s.jobs.createdAt, job.createdAt)));
  return { queued_at: job.createdAt.toISOString(), ahead: Number(ahead?.n ?? 0) };
}
