import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { recordQuietly } from "@/lib/audit/log";
import { Stripe } from "@/lib/billing/stripe";
import { usage } from "@/lib/billing/metering";
import { planFor } from "@/lib/billing/plans";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Ends the subscription when the paid period does.
 *
 * A plan with a minimum term cannot be cancelled before the term is up; the
 * refusal says the date. Nothing is lost on cancellation: the workspace
 * drops to Free and keeps its recordings and history.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "billing.manage");
  if ("response" in guard) return guard.response;

  const snapshot = await usage(guard.actor.workspaceId);
  const plan = planFor(snapshot.plan);
  if (snapshot.plan === "free") return NextResponse.json({ error: "There is nothing to cancel on the Free plan." }, { status: 409 });
  if (snapshot.planTermEndsAt && snapshot.planTermEndsAt.getTime() > Date.now()) {
    return NextResponse.json(
      {
        error: `${plan.name} runs for ${plan.minimumMonths} months. It can be cancelled from ${snapshot.planTermEndsAt.toLocaleDateString()}.`,
        term_ends_at: snapshot.planTermEndsAt.toISOString(),
      },
      { status: 409 },
    );
  }

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return NextResponse.json({ error: "Payments are not configured on this deployment." }, { status: 503 });
  const [workspace] = await getDb()
    .select({ subscriptionId: s.workspaces.stripeSubscriptionId, endsAt: s.workspaces.subscriptionEndsAt })
    .from(s.workspaces)
    .where(eq(s.workspaces.id, guard.actor.workspaceId))
    .limit(1);
  if (!workspace?.subscriptionId) return NextResponse.json({ error: "This workspace has no active subscription." }, { status: 409 });

  try {
    await new Stripe({ apiKey: key }).cancelAtPeriodEnd(workspace.subscriptionId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The subscription could not be cancelled." }, { status: 502 });
  }
  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "billing.cancel_requested",
    resourceType: "workspace",
    resourceId: guard.actor.workspaceId,
    metadata: { plan: snapshot.plan },
  });
  return NextResponse.json({
    cancels_at: workspace.endsAt?.toISOString() ?? null,
    note: "The plan ends when the current period does. Until then everything keeps working.",
  });
}
