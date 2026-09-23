import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { Stripe } from "@/lib/billing/stripe";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** Stripe's billing portal: card, invoices, and plan changes Stripe handles. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "billing.manage");
  if ("response" in guard) return guard.response;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return NextResponse.json({ error: "Payments are not configured on this deployment." }, { status: 503 });

  const [workspace] = await getDb()
    .select({ customerId: s.workspaces.stripeCustomerId })
    .from(s.workspaces)
    .where(eq(s.workspaces.id, guard.actor.workspaceId))
    .limit(1);
  if (!workspace?.customerId) {
    return NextResponse.json({ error: "This workspace has not bought anything yet, so there is no billing account to open." }, { status: 409 });
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  try {
    const url = await new Stripe({ apiKey: key }).createPortalSession({ customerId: workspace.customerId, returnUrl: `${origin}/app/billing` });
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The portal could not be opened." }, { status: 502 });
  }
}
