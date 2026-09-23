import { NextResponse } from "next/server";
import { providersFor } from "@/lib/providers/for-workspace";
import { assertFeature } from "@/lib/api/plan-gate";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { normaliseList } from "@/lib/agent/allowlist";
import { getPlanner, shapePlan } from "@/lib/agent/outline";
import { enqueue } from "@/lib/jobs/queue";
import {
  ApprovalError, RunStateError, actionsFor, approve, beginOutline, cancelRun, createRun,
  getRun, hasOtherApprover, proposeOutline, reviseOutline,
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
        queue: run.status === "approved" ? await queuePlace(run.id) : null,
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

/** Asks for a run, and plans it. Nothing records. */
export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "The agent requires a database." }, { status: 503 });
  }

  let body: {
    brief?: unknown;
    allowed_origins?: unknown;
    entry_url?: unknown;
    project_id?: unknown;
    revise_of?: unknown;
    keep_steps?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "agent.run", { workspaceId: actor.workspaceId });
    const outside = await assertFeature(actor.workspaceId, "agent", "The Riff Agent");
    if (outside) return outside;

    // A revision names the run it replaces. It carries every field of the
    // form, edited or not; the steps are planned again from the brief unless
    // the person chose to keep the ones they had.
    let source: Awaited<ReturnType<typeof getRun>> = null;
    if (body.revise_of !== undefined) {
      if (typeof body.revise_of !== "string" || !UUID.test(body.revise_of)) {
        return NextResponse.json({ error: "No such run." }, { status: 404 });
      }
      source = await getRun(actor.workspaceId, body.revise_of);
      if (!source) return NextResponse.json({ error: "No such run." }, { status: 404 });
      if (source.status === "approved" || source.status === "recording") {
        return NextResponse.json({ error: "That run is recording or about to; wait for it to finish, then revise it." }, { status: 409 });
      }
    }

    const brief = typeof body.brief === "string" ? body.brief.trim() : "";
    if (brief.length < 10) {
      return NextResponse.json(
        { error: "A brief has to say what to demonstrate." },
        { status: 422 },
      );
    }

    const origins = normaliseList(
      Array.isArray(body.allowed_origins) ? (body.allowed_origins as string[]) : [],
    );
    if (origins.length === 0) {
      // An empty allowlist is not "anywhere", it is "nowhere", and refusing
      // here is clearer than planning a run that can reach nothing.
      return NextResponse.json(
        { error: "A run needs at least one allowed origin." },
        { status: 422 },
      );
    }

    const entryUrl = typeof body.entry_url === "string" && body.entry_url.trim() ? body.entry_url.trim() : null;

    let run = await createRun({
      workspaceId: actor.workspaceId,
      brief,
      actor,
      entryUrl,
      projectId: typeof body.project_id === "string" && UUID.test(body.project_id) ? body.project_id : null,
    });

    run = await beginOutline(run);

    // Kept steps are checked against the sites as they are now, exactly as
    // planned ones are: a step on a site that was taken off the list is
    // removed and reported.
    const plan =
      source && body.keep_steps === true && (source.outline ?? []).length > 0
        ? shapePlan((source.outline ?? []) as Record<string, unknown>[], origins)
        : await getPlanner((await providersFor(actor.workspaceId)).anthropic.key).plan({
            brief,
            allowedOrigins: origins,
            entryUrl: entryUrl ?? undefined,
          });

    run = await proposeOutline(run, plan.outline, origins);

    // A run still waiting for approval is replaced, not left beside its
    // revision for somebody to approve by mistake.
    if (source && source.status === "awaiting_approval") {
      await cancelRun(source, actor, "Replaced by a revised run.").catch(() => {});
    }

    return NextResponse.json(
      {
        run: shape(run),
        // Shown to whoever approves. A plan that reads as approvable while
        // hiding a step nobody would approve is the failure this gate is
        // for.
        removed: plan.removed,
      },
      { status: 201 },
    );
  } catch (error) {
    return handle(error);
  }
}

/** Approves a run, or cancels it. */
export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "The agent requires a database." }, { status: 503 });
  }

  let body: { id?: unknown; decision?: unknown; reason?: unknown; outline?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "A run id is required." }, { status: 400 });

  try {
    const actor = await resolveActor(request);

    if (body.decision === "edit") {
      authorize(actor, "agent.run", { workspaceId: actor.workspaceId });
      const run = await getRun(actor.workspaceId, id);
      if (!run) return NextResponse.json({ error: "No such run." }, { status: 404 });
      const raw = Array.isArray(body.outline) ? (body.outline as Record<string, unknown>[]) : [];
      // Checked exactly as a planned outline is: a step off the allowlist is
      // removed and reported, never kept.
      const plan = shapePlan(raw, run.allowedOrigins);
      if (plan.removed.length > 0) {
        return NextResponse.json(
          { error: `Step "${plan.removed[0].intent}" goes to ${plan.removed[0].url ?? "a page"}, ${plan.removed[0].reason}.` },
          { status: 422 },
        );
      }
      const updated = await reviseOutline(run, plan.outline, actor);
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

    if (decision === "approve") {
      // The worker does the recording. One job per run, however many times
      // approval is retried.
      await enqueue({
        workspaceId: actor.workspaceId,
        kind: "agent",
        payload: { runId: updated.id },
        idempotencyKey: `agent:${updated.id}`,
        maxAttempts: 1,
      });
    }

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
async function queuePlace(runId: string): Promise<{ queued_at: string; ahead: number } | null> {
  const [job] = await getDb()
    .select({ createdAt: s.jobs.createdAt, status: s.jobs.status })
    .from(s.jobs)
    .where(and(eq(s.jobs.kind, "agent"), sql`${s.jobs.payload}->>'runId' = ${runId}`))
    .orderBy(desc(s.jobs.createdAt))
    .limit(1);
  if (!job || job.status !== "queued") return null;
  const [ahead] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(s.jobs)
    .where(and(sql`${s.jobs.status} in ('queued', 'running')`, lt(s.jobs.createdAt, job.createdAt)));
  return { queued_at: job.createdAt.toISOString(), ahead: Number(ahead?.n ?? 0) };
}
