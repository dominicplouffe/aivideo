import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { recordQuietly } from "@/lib/audit/log";
import { Stripe } from "@/lib/billing/stripe";
import { projectCapacity, usage } from "@/lib/billing/metering";
import { planFor, projectLimit } from "@/lib/billing/plans";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * How many packs of extra projects a Studio workspace carries.
 *
 * Changed on the Stripe subscription, which prorates and invoices; the
 * count on the workspace follows from the webhook. Going down is refused
 * while the projects would no longer fit, because a limit met by deleting
 * somebody's work is not a limit anyone chose.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "billing.manage");
  if ("response" in guard) return guard.response;

  let body: { packs?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const packs = body.packs;
  if (!Number.isInteger(packs) || (packs as number) < 0 || (packs as number) > 20) {
    return NextResponse.json({ error: "packs must be a whole number from 0 to 20." }, { status: 422 });
  }

  const snapshot = await usage(guard.actor.workspaceId);
  const plan = planFor(snapshot.plan);
  if (!plan.projectPack) {
    return NextResponse.json({ error: `The ${plan.name} plan does not sell project packs.` }, { status: 409 });
  }
  const capacity = await projectCapacity(guard.actor.workspaceId);
  const after = projectLimit(snapshot.plan, packs as number);
  if (after !== null && capacity.used > after) {
    return NextResponse.json(
      { error: `This workspace has ${capacity.used} projects, more than the ${after} that ${packs} pack${packs === 1 ? "" : "s"} allow. Delete some first.` },
      { status: 409 },
    );
  }

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return NextResponse.json({ error: "Payments are not configured on this deployment." }, { status: 503 });
  const [workspace] = await getDb()
    .select({ subscriptionId: s.workspaces.stripeSubscriptionId })
    .from(s.workspaces)
    .where(eq(s.workspaces.id, guard.actor.workspaceId))
    .limit(1);
  if (!workspace?.subscriptionId) {
    return NextResponse.json({ error: "This workspace has no active subscription to change." }, { status: 409 });
  }

  try {
    await new Stripe({ apiKey: key }).setPacks(workspace.subscriptionId, packs as number);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The packs could not be changed." }, { status: 502 });
  }
  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "billing.packs_requested",
    resourceType: "workspace",
    resourceId: guard.actor.workspaceId,
    metadata: { from: snapshot.projectPacks, to: packs },
  });
  return NextResponse.json({
    requested: packs,
    // The workspace's count changes when Stripe confirms, usually within seconds.
    note: "Stripe is updating the subscription. The new project count applies as soon as it confirms.",
  });
}
