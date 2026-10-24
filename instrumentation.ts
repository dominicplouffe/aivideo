/**
 * Runs once when the server starts, before it takes requests.
 *
 * Checks the Stripe price ids against the prices' lookup keys, so a wrong
 * `STRIPE_PRICE_*` value is corrected and shouted about at boot rather than
 * discovered on a customer's card. See lib/billing/price-check.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!apiKey) return;
  const { checkStripePrices } = await import("./lib/billing/price-check");
  await checkStripePrices({ apiKey });
}
