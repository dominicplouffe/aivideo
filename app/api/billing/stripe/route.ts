import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { verifyStripeSignature, type Subscription } from "@/lib/billing/stripe";
import { planForPrice } from "@/lib/billing/stripe";
import {
  applySubscription, claimEvent, linkCustomer, rollPeriod, workspaceForCustomer,
} from "@/lib/billing/sync";

/**
 * Stripe's webhook.
 *
 * The only path that writes a workspace's plan, and the reason it can be
 * trusted with that is the signature check three lines in. Everything about
 * this handler is arranged around two properties.
 *
 * **The body is read as text, once, before anything parses it.** The
 * signature is over the exact bytes Stripe sent; parsing and re-serialising
 * changes whitespace and key order and the signature never matches again.
 * That is why this route does not use `request.json()` at all.
 *
 * **Every delivery is claimed before it is acted on.** Stripe retries for
 * three days, including deliveries we handled perfectly well but answered
 * slowly. A retried `invoice.paid` that granted a second period is a bug
 * that arrives as a support ticket rather than as an exception.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    // 200, not an error. A deployment with no database has nothing to
    // record, and a non-2xx here puts Stripe into three days of retries
    // over a state that will not change.
    return NextResponse.json({ ok: true, handled: false });
  }

  const raw = await request.text();
  const verdict = verifyStripeSignature(
    process.env.STRIPE_WEBHOOK_SECRET,
    raw,
    request.headers.get("stripe-signature"),
  );

  if (!verdict.ok) {
    // One status for every verification failure. Telling a caller which
    // part of their forgery was wrong is free help they have not earned.
    return NextResponse.json({ error: "Signature verification failed." }, { status: 400 });
  }

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const id = typeof event.id === "string" ? event.id : "";
  const type = typeof event.type === "string" ? event.type : "";
  const object = event.data?.object ?? {};

  if (!id || !type) {
    return NextResponse.json({ error: "Event is missing an id or a type." }, { status: 400 });
  }

  const customerId = String(object.customer ?? "");
  const workspace = customerId ? await workspaceForCustomer(customerId) : null;

  if (!(await claimEvent(id, type, workspace?.id ?? null))) {
    // Already handled. A 200 stops the retries, which is the correct
    // outcome: the work is done.
    return NextResponse.json({ ok: true, handled: false, reason: "already-handled" });
  }

  switch (type) {
    case "checkout.session.completed": {
      // The one moment a workspace learns its customer id. `client_reference_id`
      // is set when the checkout session is created, and it is the only thing
      // tying a Stripe customer to a tenant.
      const workspaceId = String(object.client_reference_id ?? "");
      const customer = String(object.customer ?? "");
      if (workspaceId && customer) await linkCustomer(workspaceId, customer);
      return NextResponse.json({ ok: true, handled: true, linked: Boolean(workspaceId && customer) });
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = fromEvent(object);
      const outcome = await applySubscription(subscription, {
        cancelled: type === "customer.subscription.deleted",
      });
      return NextResponse.json({ ok: true, handled: outcome.ok, outcome });
    }

    case "invoice.paid": {
      if (!workspace) return NextResponse.json({ ok: true, handled: false });
      // The period rolls when the customer has paid for a fresh allowance,
      // not on a timer of ours — a timer drifts out of step with Stripe's
      // billing anchor and gives somebody a free week or a short month,
      // every month, forever.
      const periodStart = Number(object.period_start ?? 0);
      await rollPeriod(workspace.id, periodStart ? new Date(periodStart * 1000) : new Date());
      return NextResponse.json({ ok: true, handled: true });
    }

    case "invoice.payment_failed": {
      // Deliberately nothing here. Stripe moves the subscription to
      // `past_due` and sends a `customer.subscription.updated` for it, and
      // `past_due` still grants access — locking somebody out of their own
      // demos over an expired card costs more goodwill than the invoice is
      // worth, and dunning has days to fix it.
      return NextResponse.json({ ok: true, handled: true, action: "none" });
    }

    default:
      // Acknowledged so Stripe stops retrying. A 202 says "received, not
      // acted on", which is exactly true.
      return NextResponse.json({ ok: true, handled: false, type }, { status: 202 });
  }
}

/**
 * Reads a subscription out of an event payload.
 *
 * Not re-fetched from the API first. The event carries the object as it was
 * at the moment of the change, and a fetch would return whatever it looks
 * like *now* — so two events arriving out of order would both apply the
 * later state, and a downgrade followed by an upgrade would lose the
 * upgrade.
 */
function fromEvent(object: Record<string, unknown>): Subscription {
  const items = (object.items ?? {}) as { data?: { price?: { id?: string } }[] };
  const priceId = items.data?.[0]?.price?.id ?? "";

  return {
    id: String(object.id ?? ""),
    customerId: String(object.customer ?? ""),
    // An unrecognised price falls back to free rather than being guessed at.
    // Guessing high charges somebody for something they did not buy.
    plan: planForPrice(priceId) ?? "free",
    status: (object.status as Subscription["status"]) ?? "incomplete",
    currentPeriodStart: new Date(Number(object.current_period_start ?? 0) * 1000),
    currentPeriodEnd: new Date(Number(object.current_period_end ?? 0) * 1000),
    cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
  };
}
