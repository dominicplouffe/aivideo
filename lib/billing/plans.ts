/**
 * The plan catalogue.
 *
 * Limits are in **seconds**, everywhere, including the ones a marketing page
 * renders as minutes. A plan stored as "40 minutes" and consumed in seconds
 * needs a conversion at every boundary, and every conversion is a chance to
 * round — always, in practice, in the seller's favour. Store the smaller
 * unit and divide once, at the edge, for display.
 *
 * Prices are in **cents**, for the same reason in a different currency.
 */

export const PLANS = ["free", "starter", "team", "scale", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanDefinition {
  id: Plan;
  name: string;
  /** Monthly price in cents. Enterprise is quoted, not listed. */
  priceCents: number | null;
  seats: number | null;
  videoSecondsPerPeriod: number;
  /** Cents per second beyond the included allowance. */
  overageCentsPerSecond: number | null;
  locales: number | null;
  features: {
    voiceCloning: boolean;
    interactiveDemos: boolean;
    brandKits: number | null;
    sso: boolean;
    scim: boolean;
    auditExport: boolean;
    customDomain: boolean;
  };
}

const MINUTE = 60;

export const PLAN_CATALOGUE: Record<Plan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceCents: 0,
    seats: 1,
    videoSecondsPerPeriod: 10 * MINUTE,
    // No overage on free: a plan with no card on file cannot run up a bill.
    overageCentsPerSecond: null,
    locales: 1,
    features: {
      voiceCloning: false, interactiveDemos: false, brandKits: 1,
      sso: false, scim: false, auditExport: false, customDomain: false,
    },
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceCents: 3_900,
    seats: 3,
    videoSecondsPerPeriod: 120 * MINUTE,
    overageCentsPerSecond: 2,
    locales: 5,
    features: {
      voiceCloning: false, interactiveDemos: true, brandKits: 3,
      sso: false, scim: false, auditExport: false, customDomain: false,
    },
  },
  team: {
    id: "team",
    name: "Team",
    priceCents: 14_900,
    seats: 10,
    videoSecondsPerPeriod: 480 * MINUTE,
    overageCentsPerSecond: 2,
    locales: 20,
    features: {
      voiceCloning: true, interactiveDemos: true, brandKits: 10,
      sso: false, scim: false, auditExport: true, customDomain: true,
    },
  },
  scale: {
    id: "scale",
    name: "Scale",
    priceCents: 49_900,
    seats: 40,
    videoSecondsPerPeriod: 2_000 * MINUTE,
    overageCentsPerSecond: 1,
    locales: null,
    features: {
      voiceCloning: true, interactiveDemos: true, brandKits: null,
      sso: true, scim: true, auditExport: true, customDomain: true,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceCents: null,
    seats: null,
    videoSecondsPerPeriod: 10_000 * MINUTE,
    overageCentsPerSecond: null,
    locales: null,
    features: {
      voiceCloning: true, interactiveDemos: true, brandKits: null,
      sso: true, scim: true, auditExport: true, customDomain: true,
    },
  },
};

export function planFor(plan: Plan): PlanDefinition {
  return PLAN_CATALOGUE[plan];
}

/**
 * Proration for a mid-period plan change.
 *
 * Computed on **whole days remaining**, counting the day of the change as
 * still belonging to the old plan. Proration by the second looks precise and
 * produces an invoice line nobody can check; by the day, a customer can do
 * the arithmetic themselves, which is the only version of "transparent
 * billing" that means anything.
 *
 * A downgrade returns a negative amount — a credit. It is never charged as a
 * refund automatically, because refunding to a card that has since been
 * replaced fails silently; it is applied to the next invoice.
 */
export function prorate(input: {
  from: Plan;
  to: Plan;
  periodStartsAt: Date;
  periodDays?: number;
  at: Date;
}): { chargeCents: number; daysRemaining: number; daysInPeriod: number } {
  const daysInPeriod = input.periodDays ?? 30;
  const dayMs = 24 * 60 * 60 * 1000;

  const elapsedDays = Math.floor((input.at.getTime() - input.periodStartsAt.getTime()) / dayMs);
  const daysRemaining = Math.max(0, Math.min(daysInPeriod, daysInPeriod - elapsedDays - 1));

  const fromPrice = PLAN_CATALOGUE[input.from].priceCents;
  const toPrice = PLAN_CATALOGUE[input.to].priceCents;

  // A quoted plan has no list price to prorate against. Enterprise moves
  // are handled on the contract, not by this function guessing.
  if (fromPrice === null || toPrice === null) {
    return { chargeCents: 0, daysRemaining, daysInPeriod };
  }

  const dailyDifference = (toPrice - fromPrice) / daysInPeriod;
  // Rounded toward zero, so a rounding error is never a charge the customer
  // did not incur.
  const chargeCents = Math.trunc(dailyDifference * daysRemaining);

  return { chargeCents, daysRemaining, daysInPeriod };
}
