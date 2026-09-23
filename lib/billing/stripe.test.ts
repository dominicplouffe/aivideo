import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { ProviderError } from "@/lib/providers/errors";
import {
  STRIPE_TOLERANCE_SEC, Stripe, grantsAccess, planForPrice, verifyStripeSignature, readItems, toSubscription,
} from "./stripe";

/**
 * The division of labour is what these tests hold: Stripe owns what somebody
 * pays for, we own what they used. The one genuinely subtle part is webhook
 * verification, which decides whether an unauthenticated POST can grant a
 * subscription.
 */

const SECRET = "whsec_test";
const BODY = '{"id":"evt_1","type":"invoice.paid"}';

function sign(secret: string, body: string, timestampSec: number, extra: string[] = []): string {
  const digest = createHmac("sha256", secret).update(`${timestampSec}.${body}`, "utf8").digest("hex");
  return [`t=${timestampSec}`, `v1=${digest}`, ...extra].join(",");
}

// --- webhook signatures ----------------------------------------------------

test("a genuine signature verifies", () => {
  const header = sign(SECRET, BODY, 1_700_000_000);
  assert.deepEqual(verifyStripeSignature(SECRET, BODY, header, { nowSec: 1_700_000_000 }), {
    ok: true,
    timestampSec: 1_700_000_000,
  });
});

test("no configured secret refuses, rather than accepting anything", () => {
  const header = sign(SECRET, BODY, 1_700_000_000);
  // Accepting an unverifiable delivery would make an unauthenticated
  // endpoint that grants subscriptions.
  assert.deepEqual(verifyStripeSignature(undefined, BODY, header), {
    ok: false,
    reason: "unconfigured",
  });
});

test("a captured delivery goes stale instead of replaying forever", () => {
  const header = sign(SECRET, BODY, 1_700_000_000);
  // A replayed invoice.paid is a free subscription.
  assert.deepEqual(
    verifyStripeSignature(SECRET, BODY, header, { nowSec: 1_700_000_000 + STRIPE_TOLERANCE_SEC + 1 }),
    { ok: false, reason: "stale" },
  );
});

test("every v1 signature is checked, not just the first", () => {
  // Stripe sends two during a secret rotation. Checking only one breaks
  // every delivery for the window in which an operator is rotating —
  // exactly when they are least able to tell whether it is their fault.
  const rotated = createHmac("sha256", "whsec_new").update(`1700000000.${BODY}`).digest("hex");
  const header = `t=1700000000,v1=${rotated},${sign(SECRET, BODY, 1_700_000_000).split(",")[1]}`;

  assert.equal(verifyStripeSignature(SECRET, BODY, header, { nowSec: 1_700_000_000 }).ok, true);
  assert.equal(verifyStripeSignature("whsec_new", BODY, header, { nowSec: 1_700_000_000 }).ok, true);
});

test("a tampered body is refused", () => {
  const header = sign(SECRET, BODY, 1_700_000_000);
  const tampered = BODY.replace("invoice.paid", "invoice.void");
  assert.deepEqual(verifyStripeSignature(SECRET, tampered, header, { nowSec: 1_700_000_000 }), {
    ok: false,
    reason: "mismatch",
  });
});

test("a malformed or short header is refused, not crashed on", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.deepEqual(verifyStripeSignature(SECRET, BODY, null), { ok: false, reason: "malformed" });
  assert.deepEqual(verifyStripeSignature(SECRET, BODY, "garbage"), { ok: false, reason: "malformed" });
  assert.deepEqual(verifyStripeSignature(SECRET, BODY, "t=abc,v1=ff"), { ok: false, reason: "malformed" });
  // A short signature must not throw inside the constant-time comparison.
  assert.deepEqual(verifyStripeSignature(SECRET, BODY, `t=${now},v1=ff`), {
    ok: false,
    reason: "mismatch",
  });
});

// --- plans and access ------------------------------------------------------

test("a price maps to a plan by configuration, never by a baked-in id", () => {
  // The same code runs against test-mode and live-mode prices with
  // different identifiers; an id in a build is wrong in one of them.
  process.env.STRIPE_PRICE_STUDIO = "price_live_studio";
  assert.equal(planForPrice("price_live_studio"), "studio");
  assert.equal(planForPrice("price_unknown"), null);
  delete process.env.STRIPE_PRICE_STUDIO;
});

test("a failed renewal does not lock somebody out of their own demos", () => {
  // Stripe's dunning retries for days, and that is the window to fix an
  // expired card in. Locking the account costs more than the invoice.
  assert.equal(grantsAccess("past_due"), true);
  assert.equal(grantsAccess("active"), true);
  assert.equal(grantsAccess("trialing"), true);
  assert.equal(grantsAccess("canceled"), false);
  assert.equal(grantsAccess("unpaid"), false);
  assert.equal(grantsAccess("incomplete"), false);
});

// --- the client ------------------------------------------------------------

function stripe(fetchImpl: typeof fetch) {
  return new Stripe({ apiKey: "sk_test", fetchImpl, baseUrl: "https://stripe.test" });
}

test("every write carries an idempotency key", async () => {
  let headers: Record<string, string> = {};
  await stripe(async (_url, init) => {
    headers = init?.headers as Record<string, string>;
    return new Response(JSON.stringify({ url: "https://portal.test" }), { status: 200 });
  }).reportUsage({
    subscriptionItemId: "cus_1",
    seconds: 4200,
    workspaceId: "ws_1",
    periodStartsAt: new Date("2026-01-01T00:00:00Z"),
  });

  // A timeout on a charge is indistinguishable from a success. Retrying
  // without a key is how somebody is billed twice for one subscription.
  assert.equal(headers["Idempotency-Key"], "usage:ws_1:2026-01-01T00:00:00.000Z");
});

test("usage is reported in seconds, matching the ledger exactly", async () => {
  let body = "";
  await stripe(async (_url, init) => {
    body = String(init?.body);
    return new Response("{}", { status: 200 });
  }).reportUsage({
    subscriptionItemId: "cus_1",
    seconds: 71,
    workspaceId: "ws_1",
    periodStartsAt: new Date(),
  });

  // Converting to minutes here would reintroduce the rounding the whole
  // metering design exists to avoid — on the invoice, where it is read.
  assert.match(body, /payload%5Bvalue%5D=71/);
});

test("a card decline is not retried, and an outage is", async () => {
  const declined = await stripe(async () =>
    new Response(JSON.stringify({ error: { message: "Your card was declined." } }), { status: 402 }),
  )
    .createPortalSession({ customerId: "cus_1", returnUrl: "https://app.test" })
    .catch((error: unknown) => error);

  assert.equal(declined instanceof ProviderError, true);
  // Repeating a decline just declines again.
  assert.equal((declined as ProviderError).retryable, false);

  const outage = await stripe(async () => new Response("{}", { status: 503 }))
    .createPortalSession({ customerId: "cus_1", returnUrl: "https://app.test" })
    .catch((error: unknown) => error);
  assert.equal((outage as ProviderError).retryable, true);
});

test("the API version is pinned", async () => {
  let headers: Record<string, string> = {};
  await stripe(async (_url, init) => {
    headers = init?.headers as Record<string, string>;
    return new Response(JSON.stringify({ url: "https://portal.test" }), { status: 200 });
  }).createPortalSession({ customerId: "cus_1", returnUrl: "https://app.test" });

  // So a Stripe API upgrade is a deliberate change rather than something
  // that happens to an unattended deployment on a Tuesday.
  assert.match(headers["Stripe-Version"] ?? "", /^\d{4}-\d{2}-\d{2}/);
});

test("an unrecognised price fails safe to the free plan", async () => {
  const subscription = await stripe(async () =>
    new Response(
      JSON.stringify({
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        current_period_start: 1_700_000_000,
        current_period_end: 1_702_592_000,
        items: { data: [{ price: { id: "price_nobody_configured" } }] },
      }),
      { status: 200 },
    ),
  ).getSubscription("sub_1");

  // Guessing high charges somebody for something they did not buy; guessing
  // low gives away a plan. Free fails safe and is visible immediately.
  assert.equal(subscription.plan, "free");
  assert.equal(subscription.status, "active");
  assert.equal(subscription.currentPeriodStart.toISOString(), "2023-11-14T22:13:20.000Z");
});

test("negative usage is refused rather than credited", async () => {
  await assert.rejects(
    () =>
      stripe(async () => new Response("{}", { status: 200 })).reportUsage({
        subscriptionItemId: "cus_1",
        seconds: -60,
        workspaceId: "ws_1",
        periodStartsAt: new Date(),
      }),
    /negative usage/,
  );
});

test("plan and packs are read from the items, whatever their order", () => {
  process.env.STRIPE_PRICE_STUDIO = "price_studio";
  process.env.STRIPE_PRICE_STUDIO_PACK = "price_pack";
  const subscription = toSubscription({
    id: "sub_9",
    customer: "cus_9",
    status: "active",
    current_period_start: 1_700_000_000,
    current_period_end: 1_702_600_000,
    items: { data: [{ id: "si_pack", price: { id: "price_pack" }, quantity: 3 }, { id: "si_plan", price: { id: "price_studio" }, quantity: 1 }] },
  });
  assert.equal(subscription.plan, "studio");
  assert.equal(subscription.packs, 3);
  assert.deepEqual(readItems([{ id: "si_1", price: { id: "price_studio" } }]), { plan: "studio", packs: 0, packItemId: null });
  delete process.env.STRIPE_PRICE_STUDIO;
  delete process.env.STRIPE_PRICE_STUDIO_PACK;
});

test("checkout carries the workspace, the plan's price and the packs", async () => {
  process.env.STRIPE_PRICE_STUDIO = "price_studio";
  process.env.STRIPE_PRICE_STUDIO_PACK = "price_pack";
  let sent: URLSearchParams | null = null;
  const stripe = new Stripe({
    apiKey: "sk_test",
    fetchImpl: (async (_url: string, init?: RequestInit) => {
      sent = new URLSearchParams(String(init?.body ?? ""));
      return new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/x" }), { status: 200 });
    }) as typeof fetch,
  });
  const url = await stripe.createCheckoutSession({
    workspaceId: "ws_1", customerId: null, customerEmail: "o@example.com", plan: "studio", packs: 2,
    successUrl: "https://app/billing?purchased=studio", cancelUrl: "https://app/billing",
  });
  assert.equal(url, "https://checkout.stripe.com/c/pay/x");
  assert.equal(sent!.get("mode"), "subscription");
  assert.equal(sent!.get("client_reference_id"), "ws_1");
  assert.equal(sent!.get("line_items[0][price]"), "price_studio");
  assert.equal(sent!.get("line_items[1][price]"), "price_pack");
  assert.equal(sent!.get("line_items[1][quantity]"), "2");
  assert.equal(sent!.get("customer_email"), "o@example.com");
  delete process.env.STRIPE_PRICE_STUDIO;
  delete process.env.STRIPE_PRICE_STUDIO_PACK;
});
