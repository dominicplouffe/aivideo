import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { Stripe } from "@/lib/billing/stripe";
import { usage } from "@/lib/billing/metering";
import { planFor, type Plan } from "@/lib/billing/plans";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Starts a purchase. Answers with a Stripe Checkout URL; the plan itself is
 * written only when Stripe's webhook says the subscription exists.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "billing.manage");
  if ("response" in guard) return guard.response;

  let body: { plan?: unknown; packs?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const plan = body.plan as Plan;
  if (plan !== "byok" && plan !== "studio") {
    return NextResponse.json({ error: 'plan must be "byok" or "studio".' }, { status: 422 });
  }
  const packs = plan === "studio" && Number.isInteger(body.packs) && (body.packs as number) >= 0 ? Math.min(20, body.packs as number) : 0;

  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "Payments are not configured on this deployment (STRIPE_SECRET_KEY)." }, { status: 503 });
  }

  const snapshot = await usage(guard.actor.workspaceId);
  if (snapshot.plan !== "free") {
    return NextResponse.json(
      { error: `This workspace is on ${planFor(snapshot.plan).name}. Change plans from the billing portal.` },
      { status: 409 },
    );
  }
  const [workspace] = await getDb()
    .select({ customerId: s.workspaces.stripeCustomerId })
    .from(s.workspaces)
    .where(eq(s.workspaces.id, guard.actor.workspaceId))
    .limit(1);

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  try {
    const url = await new Stripe({ apiKey: key }).createCheckoutSession({
      workspaceId: guard.actor.workspaceId,
      customerId: workspace?.customerId ?? null,
      customerEmail: guard.actor.email ?? null,
      plan,
      packs,
      successUrl: `${origin}/app/billing?purchased=${plan}`,
      cancelUrl: `${origin}/app/billing`,
    });
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Checkout could not be started." }, { status: 502 });
  }
}
