import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { record } from "@/lib/audit/log";
import { aiAllowance, overageCents, projectCapacity, usage } from "@/lib/billing/metering";
import { formatPrice, planFor, projectLimit } from "@/lib/billing/plans";

/**
 * Usage and the hard stop.
 *
 * Reading usage needs `billing.view`, which an admin has; changing anything
 * needs `billing.manage`, which only the owner has. That split is the whole
 * point of having the two permissions: the person who runs the workspace can
 * see what it costs without being able to change what the company pays.
 */

function respondToAuthFailure(error: unknown): NextResponse | null {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Usage requires a database; this deployment is running on fixtures." },
      { status: 503 },
    );
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "billing.view", { workspaceId: actor.workspaceId });

    const snapshot = await usage(actor.workspaceId);
    const plan = planFor(snapshot.plan);
    const [projects, suggestions, riff] = await Promise.all([
      projectCapacity(actor.workspaceId),
      aiAllowance(actor.workspaceId, "suggestion"),
      aiAllowance(actor.workspaceId, "riff"),
    ]);

    return NextResponse.json({
      plan: {
        id: plan.id,
        name: plan.name,
        price_cents: plan.priceCents,
        price: formatPrice(snapshot.plan, snapshot.projectPacks),
        term: plan.term,
        packs: snapshot.projectPacks,
        pack: plan.projectPack,
        term_ends_at: snapshot.planTermEndsAt?.toISOString() ?? null,
        own_keys: plan.ai.ownKeys,
      },
      projects: { used: projects.used, limit: projectLimit(snapshot.plan, snapshot.projectPacks) },
      ai: {
        suggestions: { used: suggestions.used, limit: suggestions.limit },
        riff: { used: riff.used, limit: riff.limit },
      },
      period_starts_at: snapshot.periodStartsAt.toISOString(),
      // Seconds, with minutes alongside for display. The API states the
      // unit it meters in; rounding is the caller's problem, once.
      included_seconds: snapshot.limitSeconds,
      topup_seconds: snapshot.topupSeconds,
      used_seconds: snapshot.usedSeconds,
      remaining_seconds: snapshot.remainingSeconds,
      used_minutes: Number((snapshot.usedSeconds / 60).toFixed(1)),
      fraction_used: Number(snapshot.fractionUsed.toFixed(4)),
      overage_cents: overageCents(snapshot),
      hard_stop_at_limit: snapshot.hardStopAtLimit,
      // Said plainly, because the consequence is what a customer is deciding
      // about when they read this screen.
      at_limit_behaviour: snapshot.hardStopAtLimit
        ? "Rendering pauses when the allowance runs out."
        : plan.overageCentsPerSecond === null
          ? "Rendering pauses when the allowance runs out; this plan has no overage."
          : "Rendering continues and overage is billed.",
    });
  } catch (error) {
    const response = respondToAuthFailure(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Billing settings require a database; this deployment is running on fixtures." },
      { status: 503 },
    );
  }

  let body: { hard_stop_at_limit?: unknown };
  try {
    body = (await request.json()) as { hard_stop_at_limit?: unknown };
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.hard_stop_at_limit !== "boolean") {
    return NextResponse.json(
      { error: "hard_stop_at_limit must be true or false." },
      { status: 400 },
    );
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "billing.manage", { workspaceId: actor.workspaceId });

    const { getDb } = await import("@/lib/db/client");
    const s = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    const before = await usage(actor.workspaceId);
    await getDb()
      .update(s.workspaces)
      .set({ hardStopAtLimit: body.hard_stop_at_limit })
      .where(eq(s.workspaces.id, actor.workspaceId));

    // Turning the stop off is a decision to accept a bill, and turning it on
    // is a decision to accept an outage. Both belong in the trail.
    await record({
      workspaceId: actor.workspaceId,
      actor,
      action: body.hard_stop_at_limit ? "billing.hard_stop.enabled" : "billing.hard_stop.disabled",
      resourceType: "workspace",
      resourceId: actor.workspaceId,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      metadata: { from: before.hardStopAtLimit, to: body.hard_stop_at_limit },
    });

    const snapshot = await usage(actor.workspaceId);
    return NextResponse.json({
      hard_stop_at_limit: snapshot.hardStopAtLimit,
      effect: snapshot.hardStopAtLimit
        ? "Rendering will pause when the allowance runs out."
        : "Rendering will continue past the allowance and overage will be billed.",
    });
  } catch (error) {
    const response = respondToAuthFailure(error);
    if (response) return response;
    throw error;
  }
}
