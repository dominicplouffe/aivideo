import assert from "node:assert/strict";
import test from "node:test";
import { checkStripePrices, reconcilePrices, type StripePriceLite } from "./price-check";

const LIVE: StripePriceLite[] = [
  { id: "price_studio", lookup_key: "demoriff_studio_monthly", unit_amount: 9_900, currency: "usd", active: true, recurring: { interval: "month" } },
  { id: "price_byok", lookup_key: "demoriff_byok_yearly", unit_amount: 24_000, currency: "usd", active: true, recurring: { interval: "year" } },
  { id: "price_pack", lookup_key: "demoriff_studio_pack_monthly", unit_amount: 4_900, currency: "usd", active: true, recurring: { interval: "month" } },
];

test("BYOK set to the pack price is corrected to the $240/yr price", () => {
  // The live misconfiguration: the one BYOK checkout ever created charged the pack.
  const env: Record<string, string | undefined> = {
    STRIPE_PRICE_BYOK: "price_pack",
    STRIPE_PRICE_STUDIO: "price_studio",
    STRIPE_PRICE_STUDIO_PACK: "price_pack",
  };
  const findings = reconcilePrices(LIVE, env);
  assert.equal(env.STRIPE_PRICE_BYOK, "price_byok");
  assert.deepEqual(findings.find((f) => f.env === "STRIPE_PRICE_BYOK"), {
    env: "STRIPE_PRICE_BYOK", status: "corrected", from: "price_pack", to: "price_byok",
  });
  assert.equal(findings.find((f) => f.env === "STRIPE_PRICE_STUDIO")?.status, "ok");
});

test("an unset price is filled from its lookup key", () => {
  const env: Record<string, string | undefined> = {};
  reconcilePrices(LIVE, env);
  assert.equal(env.STRIPE_PRICE_STUDIO, "price_studio");
  assert.equal(env.STRIPE_PRICE_BYOK, "price_byok");
});

test("a lookup key on the wrong amount is reported and not used", () => {
  const env: Record<string, string | undefined> = { STRIPE_PRICE_STUDIO: "price_studio" };
  const wrong = LIVE.map((p) => (p.lookup_key === "demoriff_studio_monthly" ? { ...p, id: "price_x", unit_amount: 4_900 } : p));
  const findings = reconcilePrices(wrong, env);
  assert.equal(env.STRIPE_PRICE_STUDIO, "price_studio");
  assert.equal(findings.find((f) => f.env === "STRIPE_PRICE_STUDIO")?.status, "wrong-amount");
});

test("a missing lookup key leaves the environment alone", () => {
  const env: Record<string, string | undefined> = { STRIPE_PRICE_BYOK: "price_whatever" };
  const findings = reconcilePrices([], env);
  assert.equal(env.STRIPE_PRICE_BYOK, "price_whatever");
  assert.ok(findings.every((f) => f.status === "missing"));
});

test("Stripe unreachable: logs loudly, changes nothing, does not throw", async () => {
  const env: Record<string, string | undefined> = { STRIPE_PRICE_BYOK: "price_pack" };
  const errors: string[] = [];
  const findings = await checkStripePrices({
    apiKey: "sk_test_x",
    env,
    fetchImpl: (async () => { throw new Error("offline"); }) as typeof fetch,
    log: { info: () => {}, error: (m: string) => errors.push(m) },
  });
  assert.deepEqual(findings, []);
  assert.equal(env.STRIPE_PRICE_BYOK, "price_pack");
  assert.match(errors[0] ?? "", /PRICE CHECK FAILED/);
});

test("asks Stripe for the three lookup keys and shouts about a correction", async () => {
  let asked = "";
  const errors: string[] = [];
  const env: Record<string, string | undefined> = { STRIPE_PRICE_BYOK: "price_pack", STRIPE_PRICE_STUDIO: "price_studio", STRIPE_PRICE_STUDIO_PACK: "price_pack" };
  await checkStripePrices({
    apiKey: "sk_test_x",
    env,
    fetchImpl: (async (url: string) => {
      asked = url;
      return new Response(JSON.stringify({ data: LIVE }), { status: 200 });
    }) as unknown as typeof fetch,
    log: { info: () => {}, error: (m: string) => errors.push(m) },
  });
  assert.match(decodeURIComponent(asked), /lookup_keys\[\]=demoriff_byok_yearly/);
  assert.equal(env.STRIPE_PRICE_BYOK, "price_byok");
  assert.equal(errors.length, 1);
  assert.match(errors[0], /STRIPE_PRICE_BYOK was price_pack/);
});
