import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { normaliseList } from "@/lib/agent/allowlist";
import { getPlanner } from "@/lib/agent/outline";
import {
  ApprovalError, RunStateError, actionsFor, approve, beginOutline, cancelRun, createRun,
  getRun, proposeOutline,
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

  let body: { brief?: unknown; allowed_origins?: unknown; entry_url?: unknown; project_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "agent.run", { workspaceId: actor.workspaceId });

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

    let run = await createRun({
      workspaceId: actor.workspaceId,
      brief,
      actor,
      projectId: typeof body.project_id === "string" && UUID.test(body.project_id) ? body.project_id : null,
    });

    run = await beginOutline(run);

    const plan = await getPlanner().plan({
      brief,
      allowedOrigins: origins,
      entryUrl: typeof body.entry_url === "string" ? body.entry_url : undefined,
    });

    run = await proposeOutline(run, plan.outline, origins);

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

  let body: { id?: unknown; decision?: unknown; reason?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID.test(id)) return NextResponse.json({ error: "A run id is required." }, { status: 400 });

  try {
    const actor = await resolveActor(request);

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
        ? await approve(run, actor)
        : await cancelRun(run, actor, typeof body.reason === "string" ? body.reason : "cancelled");

    return NextResponse.json({ run: shape(updated) });
  } catch (error) {
    return handle(error);
  }
}
