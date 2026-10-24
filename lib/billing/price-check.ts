/**
 * Checks, at server start, that the Stripe price ids in the environment are
 * the prices the pricing page sells.
 *
 * The only DemoRiff checkout ever created on the live account was a BYOK
 * purchase whose line item was the $49/month project pack: the deployed
 * `STRIPE_PRICE_BYOK` held the wrong id, so a buyer of a $240/year plan
 * would have been charged $49 a month. Nothing caught it, because an env id
 * is opaque and every price on the account is "valid".
 *
 * So each plan's price is looked up by its Stripe lookup key, and its amount
 * and interval are checked against the catalogue. When the environment
 * disagrees with the lookup key, the lookup key wins and the mismatch is
 * logged loudly; the override goes into `process.env` so checkout and the
 * webhook (which maps price ids back to plans) agree with each other. When
 * Stripe cannot be reached, the environment is left as it is and that is
 * logged too — the site stays up either way.
 */

export interface ExpectedPrice {
  env: "STRIPE_PRICE_BYOK" | "STRIPE_PRICE_STUDIO" | "STRIPE_PRICE_STUDIO_PACK";
  lookupKey: string;
  unitAmount: number;
  interval: "month" | "year";
}

export const EXPECTED_PRICES: ExpectedPrice[] = [
  { env: "STRIPE_PRICE_BYOK", lookupKey: "demoriff_byok_yearly", unitAmount: 24_000, interval: "year" },
  { env: "STRIPE_PRICE_STUDIO", lookupKey: "demoriff_studio_monthly", unitAmount: 9_900, interval: "month" },
  { env: "STRIPE_PRICE_STUDIO_PACK", lookupKey: "demoriff_studio_pack_monthly", unitAmount: 4_900, interval: "month" },
];

export interface StripePriceLite {
  id: string;
  lookup_key?: string | null;
  unit_amount?: number | null;
  currency?: string;
  active?: boolean;
  recurring?: { interval?: string } | null;
}

export type PriceFinding =
  | { env: string; status: "ok"; priceId: string }
  | { env: string; status: "corrected"; from: string | null; to: string }
  | { env: string; status: "missing"; lookupKey: string }
  | { env: string; status: "wrong-amount"; priceId: string; detail: string };

function describe(price: StripePriceLite): string {
  const amount = typeof price.unit_amount === "number" ? `$${(price.unit_amount / 100).toFixed(2)}` : "?";
  return `${amount} ${price.currency ?? "?"}/${price.recurring?.interval ?? "one-time"}`;
}

/**
 * Pure: given the prices Stripe returned for the lookup keys, decide what
 * each env var should hold, and write the corrections into `env`.
 */
export function reconcilePrices(
  prices: StripePriceLite[],
  env: Record<string, string | undefined>,
): PriceFinding[] {
  const findings: PriceFinding[] = [];
  for (const expected of EXPECTED_PRICES) {
    const price = prices.find((p) => p.lookup_key === expected.lookupKey && p.active !== false);
    if (!price) {
      findings.push({ env: expected.env, status: "missing", lookupKey: expected.lookupKey });
      continue;
    }
    if (
      price.unit_amount !== expected.unitAmount ||
      (price.currency ?? "").toLowerCase() !== "usd" ||
      price.recurring?.interval !== expected.interval
    ) {
      findings.push({
        env: expected.env,
        status: "wrong-amount",
        priceId: price.id,
        detail: `lookup key ${expected.lookupKey} is ${describe(price)}, expected $${(expected.unitAmount / 100).toFixed(2)} usd/${expected.interval}`,
      });
      continue;
    }
    const current = env[expected.env]?.trim() || null;
    if (current === price.id) {
      findings.push({ env: expected.env, status: "ok", priceId: price.id });
    } else {
      env[expected.env] = price.id;
      findings.push({ env: expected.env, status: "corrected", from: current, to: price.id });
    }
  }
  return findings;
}

/** Reads the lookup keys from Stripe, reconciles, and logs. Never throws. */
export async function checkStripePrices(options: {
  apiKey: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  log?: Pick<Console, "info" | "error">;
}): Promise<PriceFinding[]> {
  const env = options.env ?? process.env;
  const log = options.log ?? console;
  const fetchImpl = options.fetchImpl ?? fetch;
  const query = new URLSearchParams();
  for (const expected of EXPECTED_PRICES) query.append("lookup_keys[]", expected.lookupKey);
  query.set("limit", "10");

  let prices: StripePriceLite[];
  try {
    const response = await fetchImpl(`https://api.stripe.com/v1/prices?${query.toString()}`, {
      headers: { Authorization: `Bearer ${options.apiKey}`, "Stripe-Version": "2025-08-27.basil" },
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => ({}))) as { data?: StripePriceLite[]; error?: { message?: string } };
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.error?.message ?? "unknown error"}`);
    prices = body.data ?? [];
  } catch (error) {
    log.error(
      `[billing] !!! PRICE CHECK FAILED: could not read Stripe prices by lookup key (${String(error)}). ` +
        "Using STRIPE_PRICE_* from the environment unchecked.",
    );
    return [];
  }

  const findings = reconcilePrices(prices, env);
  for (const finding of findings) {
    if (finding.status === "ok") {
      log.info(`[billing] ${finding.env} ok (${finding.priceId})`);
    } else if (finding.status === "corrected") {
      log.error(
        `[billing] !!! ${finding.env} was ${finding.from ?? "unset"}, which is not the price the site sells. ` +
          `Using ${finding.to} from its Stripe lookup key instead. Fix the deployment's environment.`,
      );
    } else if (finding.status === "missing") {
      log.error(
        `[billing] !!! No active Stripe price has lookup key ${finding.lookupKey}; ${finding.env} is unchecked.`,
      );
    } else {
      log.error(`[billing] !!! ${finding.env}: ${finding.detail}. Left as configured; checkout for this plan may charge the wrong amount.`);
    }
  }
  return findings;
}
