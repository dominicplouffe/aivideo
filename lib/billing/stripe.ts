import { createHmac, timingSafeEqual } from "node:crypto";
import { ProviderError, isRetryableStatus } from "@/lib/providers/errors";
import { PLAN_CATALOGUE, type Plan } from "./plans";

/**
 * Stripe.
 *
 * The division of labour is the whole design, and getting it backwards is
 * how billing systems end up with two numbers that disagree:
 *
 *  - **Stripe owns the money.** What plan somebody is on, whether their card
 *    works, what they have been charged. We never write those to our
 *    database from a client request; we read them from Stripe.
 *  - **We own the usage.** Seconds rendered is a fact about our own system,
 *    measured in our own ledger, and pushed to Stripe for invoicing. Asking
 *    Stripe how much someone used would be asking it to remember something
 *    only we can observe.
 *
 * Spoken over REST with an injectable transport, like the other vendor
 * adapters here. The surface used is four endpoints, and the one genuinely
 * subtle part — webhook signature verification — is implemented and tested
 * rather than taken on faith from a dependency.
 */

export interface StripeConfig {
  apiKey: string;
  /** Verifies inbound webhooks. From the Stripe dashboard, not the API key. */
  webhookSecret?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface Subscription {
  id: string;
  customerId: string;
  plan: Plan;
  /** Packs of extra projects on the subscription: the quantity of the pack price's item. */
  packs: number;
  status: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

/**
 * Maps a Stripe price to one of our plans.
 *
 * Driven by environment rather than hardcoded ids, because the same code
 * runs against test-mode and live-mode prices with different identifiers,
 * and an id baked into a build is an id that is wrong in one of them.
 *
 *   STRIPE_PRICE_BYOK         the yearly price for Bring your own keys
 *   STRIPE_PRICE_STUDIO       the monthly price for Studio
 *   STRIPE_PRICE_STUDIO_PACK  the monthly price for one pack of ten projects
 */
export function planForPrice(priceId: string): Plan | null {
  for (const plan of Object.keys(PLAN_CATALOGUE) as Plan[]) {
    const configured = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
    if (configured && configured === priceId) return plan;
  }
  return null;
}

/** The price id for a plan, from the environment. Null when not configured. */
export function priceForPlan(plan: Plan): string | null {
  return process.env[`STRIPE_PRICE_${plan.toUpperCase()}`]?.trim() || null;
}

export function packPriceId(): string | null {
  return process.env.STRIPE_PRICE_STUDIO_PACK?.trim() || null;
}

/** Reads plan and packs out of a subscription's items, however they are ordered. */
export function readItems(items: { price?: { id?: string }; quantity?: number; id?: string }[]): {
  plan: Plan | null;
  packs: number;
  packItemId: string | null;
} {
  let plan: Plan | null = null;
  let packs = 0;
  let packItemId: string | null = null;
  const pack = packPriceId();
  for (const item of items) {
    const priceId = item.price?.id ?? "";
    if (pack && priceId === pack) {
      packs += Number(item.quantity ?? 1);
      packItemId = item.id ?? null;
      continue;
    }
    plan ??= planForPrice(priceId);
  }
  return { plan, packs, packItemId };
}

// --- webhook signatures ----------------------------------------------------

export type StripeVerdict =
  | { ok: true; timestampSec: number }
  | { ok: false; reason: "malformed" | "stale" | "mismatch" | "unconfigured" };

/** Stripe's tolerance recommendation, and a sensible one. */
export const STRIPE_TOLERANCE_SEC = 300;

/**
 * Verifies a `Stripe-Signature` header.
 *
 * The header carries a timestamp and one or more `v1` signatures, each an
 * HMAC over `${timestamp}.${body}`. Three details matter and are easy to
 * get wrong:
 *
 *  1. **The raw body, byte for byte.** Parsing and re-serialising the JSON
 *     first changes whitespace and key order, and the signature will never
 *     match. The route must read the body as text before touching it.
 *  2. **Every `v1` value, not the first.** Stripe sends two during a secret
 *     rotation, and checking only one breaks every delivery for the window
 *     in which an operator is rotating — exactly when they are least able to
 *     tell whether it is their fault.
 *  3. **A tolerance window.** Without it a captured delivery replays
 *     forever, and a replayed `invoice.paid` is a free subscription.
 */
export function verifyStripeSignature(
  secret: string | undefined,
  body: string,
  header: string | null,
  options: { toleranceSec?: number; nowSec?: number } = {},
): StripeVerdict {
  // No secret configured means no verification is possible. Accepting the
  // delivery anyway would make an unauthenticated endpoint that grants
  // subscriptions — refusing is the only safe default.
  if (!secret) return { ok: false, reason: "unconfigured" };
  if (!header) return { ok: false, reason: "malformed" };

  let timestampSec = NaN;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t") timestampSec = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }

  if (!Number.isFinite(timestampSec) || signatures.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  const now = options.nowSec ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSec ?? STRIPE_TOLERANCE_SEC;
  if (Math.abs(now - timestampSec) > tolerance) return { ok: false, reason: "stale" };

  const expected = createHmac("sha256", secret)
    .update(`${timestampSec}.${body}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");

  for (const candidate of signatures) {
    const given = Buffer.from(candidate, "utf8");
    // Length first: timingSafeEqual throws on a mismatch, and the length of
    // a hex digest is not a secret.
    if (given.length !== expectedBuffer.length) continue;
    if (timingSafeEqual(given, expectedBuffer)) return { ok: true, timestampSec };
  }

  return { ok: false, reason: "mismatch" };
}

// --- the client ------------------------------------------------------------

export class Stripe {
  readonly name = "stripe";

  constructor(private readonly config: StripeConfig) {
    if (!config.apiKey) throw new Error("Stripe requires an API key (STRIPE_SECRET_KEY).");
  }

  private get base() {
    return this.config.baseUrl ?? "https://api.stripe.com";
  }

  /**
   * One request.
   *
   * Every write carries an idempotency key. A network timeout on a charge is
   * indistinguishable from a success, and retrying without a key is how a
   * customer is billed twice for one subscription — Stripe's own answer to
   * the problem, and free to use.
   */
  private async call(
    method: "GET" | "POST",
    path: string,
    options: { form?: Record<string, string>; idempotencyKey?: string } = {},
  ): Promise<Record<string, unknown>> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 20_000);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      // Pinned, so a Stripe API upgrade is a deliberate change rather than
      // something that happens to an unattended deployment on a Tuesday.
      "Stripe-Version": "2025-08-27.basil",
    };
    if (options.form) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

    try {
      const response = await fetchImpl(`${this.base}${path}`, {
        method,
        headers,
        body: options.form ? new URLSearchParams(options.form).toString() : undefined,
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const error = (payload.error ?? {}) as { message?: string; code?: string };
        throw new ProviderError(
          `Stripe ${path} returned ${response.status}: ${error.message ?? "unknown error"}`,
          {
            provider: this.name,
            // A card decline is not a transient failure; repeating it just
            // declines again. Stripe marks those 402.
            retryable: response.status !== 402 && isRetryableStatus(response.status),
            status: response.status,
          },
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(`Stripe was unreachable: ${String(error)}`, {
        provider: this.name,
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Reads a subscription. Stripe is the authority on what someone pays for. */
  async getSubscription(subscriptionId: string): Promise<Subscription> {
    const payload = await this.call("GET", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
    return toSubscription(payload);
  }

  /**
   * A Checkout session for a plan, and for Studio the packs to start with.
   *
   * The workspace rides along as `client_reference_id`; the webhook reads
   * it back from `checkout.session.completed`, which is the one moment a
   * workspace learns its Stripe customer. An existing customer is reused so
   * a workspace never ends up with two.
   */
  async createCheckoutSession(input: {
    workspaceId: string;
    customerId: string | null;
    customerEmail: string | null;
    plan: Plan;
    packs: number;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const price = priceForPlan(input.plan);
    if (!price) {
      throw new ProviderError(`No Stripe price is configured for the ${input.plan} plan (STRIPE_PRICE_${input.plan.toUpperCase()}).`, {
        provider: this.name,
        retryable: false,
      });
    }
    const form: Record<string, string> = {
      mode: "subscription",
      client_reference_id: input.workspaceId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      // Stripe collects the tax id and address; we never see a card number.
      "tax_id_collection[enabled]": "true",
      allow_promotion_codes: "true",
    };
    const pack = packPriceId();
    if (input.plan === "studio" && input.packs > 0 && pack) {
      form["line_items[1][price]"] = pack;
      form["line_items[1][quantity]"] = String(input.packs);
    }
    if (input.customerId) form.customer = input.customerId;
    else if (input.customerEmail) form.customer_email = input.customerEmail;
    const payload = await this.call("POST", "/v1/checkout/sessions", {
      form,
      idempotencyKey: `checkout:${input.workspaceId}:${input.plan}:${input.packs}:${Date.now().toString(36).slice(0, 6)}`,
    });
    const url = payload.url;
    if (typeof url !== "string") {
      throw new ProviderError("Stripe did not return a checkout URL.", { provider: this.name, retryable: false });
    }
    return url;
  }

  /**
   * Sets how many packs a Studio subscription carries. Adds the pack item
   * when there is none yet, removes it at zero, otherwise changes its
   * quantity; Stripe prorates. The webhook then writes the new count.
   */
  async setPacks(subscriptionId: string, packs: number): Promise<void> {
    const pack = packPriceId();
    if (!pack) {
      throw new ProviderError("No Stripe price is configured for project packs (STRIPE_PRICE_STUDIO_PACK).", {
        provider: this.name,
        retryable: false,
      });
    }
    const payload = await this.call("GET", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
    const items = ((payload.items ?? {}) as { data?: { id?: string; price?: { id?: string }; quantity?: number }[] }).data ?? [];
    const { packItemId } = readItems(items);
    const key = `packs:${subscriptionId}:${packs}`;
    if (packItemId) {
      if (packs === 0) {
        await this.call("POST", `/v1/subscription_items/${encodeURIComponent(packItemId)}`, {
          form: { quantity: "0", proration_behavior: "create_prorations" },
          idempotencyKey: key,
        });
        // Stripe deletes an item at quantity zero only through DELETE.
        await this.call("POST", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
          form: { [`items[0][id]`]: packItemId, [`items[0][deleted]`]: "true", proration_behavior: "create_prorations" },
          idempotencyKey: `${key}:remove`,
        });
      } else {
        await this.call("POST", `/v1/subscription_items/${encodeURIComponent(packItemId)}`, {
          form: { quantity: String(packs), proration_behavior: "create_prorations" },
          idempotencyKey: key,
        });
      }
    } else if (packs > 0) {
      await this.call("POST", "/v1/subscription_items", {
        form: { subscription: subscriptionId, price: pack, quantity: String(packs), proration_behavior: "create_prorations" },
        idempotencyKey: key,
      });
    }
  }

  /** Asks Stripe to end a subscription when its current period does. */
  async cancelAtPeriodEnd(subscriptionId: string): Promise<void> {
    await this.call("POST", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      form: { cancel_at_period_end: "true" },
      idempotencyKey: `cancel:${subscriptionId}`,
    });
  }

  /**
   * Reports metered usage for a period.
   *
   * Seconds, matching the ledger exactly. Converting to minutes here would
   * reintroduce the rounding the whole metering design exists to avoid, and
   * it would round on the invoice, where the customer reads it.
   *
   * The idempotency key is the workspace and period rather than a
   * timestamp, so a retried report replaces rather than adds.
   */
  async reportUsage(input: {
    subscriptionItemId: string;
    seconds: number;
    workspaceId: string;
    periodStartsAt: Date;
  }): Promise<void> {
    if (input.seconds < 0) throw new Error("Refusing to report negative usage.");

    await this.call("POST", "/v1/billing/meter_events", {
      form: {
        event_name: "demoriff_video_seconds",
        "payload[value]": String(Math.ceil(input.seconds)),
        "payload[stripe_customer_id]": input.subscriptionItemId,
      },
      idempotencyKey: `usage:${input.workspaceId}:${input.periodStartsAt.toISOString()}`,
    });
  }

  /**
   * A billing portal session, so a customer manages their own card.
   *
   * Deliberately not a form of our own. Card details that never touch our
   * servers are card details we cannot leak, and the portal is also where
   * Stripe handles the regulatory parts — SCA, tax, dunning — that are very
   * easy to implement slightly wrong.
   */
  async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string> {
    const payload = await this.call("POST", "/v1/billing_portal/sessions", {
      form: { customer: input.customerId, return_url: input.returnUrl },
    });
    const url = payload.url;
    if (typeof url !== "string") {
      throw new ProviderError("Stripe did not return a portal URL.", {
        provider: this.name,
        retryable: false,
      });
    }
    return url;
  }
}

export function toSubscription(payload: Record<string, unknown>): Subscription {
  const items = (payload.items ?? {}) as { data?: { id?: string; price?: { id?: string }; quantity?: number }[] };
  const { plan, packs } = readItems(items.data ?? []);

  return {
    id: String(payload.id ?? ""),
    customerId: String(payload.customer ?? ""),
    // An unrecognised price is treated as the free plan rather than guessed
    // at. Guessing high charges somebody for something they did not buy;
    // guessing low gives away a plan. Free is the one that fails safe and is
    // visible immediately.
    plan: plan ?? "free",
    packs,
    status: (payload.status as Subscription["status"]) ?? "incomplete",
    currentPeriodStart: new Date(Number(payload.current_period_start ?? 0) * 1000),
    currentPeriodEnd: new Date(Number(payload.current_period_end ?? 0) * 1000),
    cancelAtPeriodEnd: Boolean(payload.cancel_at_period_end),
  };
}

/**
 * Whether a subscription status should still grant access.
 *
 * `past_due` does: a failed renewal is usually an expired card, and locking
 * somebody out of their own demos over it costs more goodwill than the
 * invoice is worth. Stripe's dunning retries for days, and that is the
 * window to fix it in.
 */
export function grantsAccess(status: Subscription["status"]): boolean {
  return status === "trialing" || status === "active" || status === "past_due";
}
