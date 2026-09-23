/**
 * The plan catalogue.
 *
 * Three plans and a quote. Free is for judging the product; Bring your own
 * keys is for a person who pays the AI vendors directly and pays us for the
 * editor; Studio is the plan where we carry the vendor bills, so it is the
 * one with a project count and a minute allowance sized to what those bills
 * can bear.
 *
 * Limits are in **seconds**, everywhere, including the ones a marketing page
 * renders as minutes. A plan stored as "40 minutes" and consumed in seconds
 * needs a conversion at every boundary, and every conversion is a chance to
 * round — always, in practice, in the seller's favour. Store the smaller
 * unit and divide once, at the edge, for display.
 *
 * Prices are in **cents**, for the same reason in a different currency.
 *
 * Why these numbers (checked September 2026): ElevenLabs bills $0.10 per
 * thousand characters, about nine cents per narrated minute per reading,
 * and a chapter is re-read a few times while it is edited; Deepgram Nova-3
 * is under a cent per minute of footage; a Tighten on a seven-minute script
 * is roughly ten cents of Claude. A Studio workspace using every one of its
 * 150 minutes with narration costs us well under half its price.
 */

export const PLANS = ["free", "byok", "studio", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

/** Plans that existed before this catalogue. Rows still carrying them read as Studio. */
export const LEGACY_PLANS = ["starter", "team", "scale"] as const;

export type BillingTerm = "none" | "monthly" | "annual" | "quoted";

export interface PlanDefinition {
  id: Plan;
  name: string;
  /** Per term: the monthly price for Studio, the yearly price for BYOK. Enterprise is quoted. */
  priceCents: number | null;
  term: BillingTerm;
  /** Months a subscription runs before it can be cancelled. */
  minimumMonths: number;
  seats: number | null;
  /** Projects that may exist at once. Null is unlimited. */
  projects: number | null;
  /** More projects, bought in packs. Null when the plan does not sell them. */
  projectPack: { size: number; priceCents: number; extraSeconds: number } | null;
  videoSecondsPerPeriod: number;
  /** Cents per second beyond the included allowance. Null means rendering stops instead. */
  overageCentsPerSecond: number | null;
  ai: {
    /** Tighten and Cut to a length, per period. Null is unlimited. */
    suggestionsPerPeriod: number | null;
    /** Riff messages, per period. Null is unlimited. */
    riffMessagesPerPeriod: number | null;
    /** Whether the person's own vendor keys are used instead of ours. */
    ownKeys: boolean;
  };
  features: {
    aiVoiceExport: boolean;
    agent: boolean;
    brandKits: number | null;
    voiceCloning: boolean;
    interactiveDemos: boolean;
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
    term: "none",
    minimumMonths: 0,
    seats: 1,
    projects: 3,
    projectPack: null,
    videoSecondsPerPeriod: 10 * MINUTE,
    // No overage on free: a plan with no card on file cannot run up a bill.
    overageCentsPerSecond: null,
    ai: { suggestionsPerPeriod: 3, riffMessagesPerPeriod: 20, ownKeys: false },
    features: {
      aiVoiceExport: true, agent: false, brandKits: 1, voiceCloning: false, interactiveDemos: false,
      sso: false, scim: false, auditExport: false, customDomain: false,
    },
  },
  byok: {
    id: "byok",
    name: "Bring your own keys",
    // $20 a month, paid for the year: the twelve-month term is the price.
    priceCents: 24_000,
    term: "annual",
    minimumMonths: 12,
    seats: 3,
    projects: null,
    projectPack: null,
    // A ceiling nobody honest reaches; the vendors are theirs, the render
    // compute and storage are ours.
    videoSecondsPerPeriod: 1_000 * MINUTE,
    overageCentsPerSecond: 1,
    ai: { suggestionsPerPeriod: null, riffMessagesPerPeriod: null, ownKeys: true },
    features: {
      aiVoiceExport: true, agent: true, brandKits: null, voiceCloning: true, interactiveDemos: true,
      sso: false, scim: false, auditExport: false, customDomain: true,
    },
  },
  studio: {
    id: "studio",
    name: "Studio",
    priceCents: 9_900,
    term: "monthly",
    minimumMonths: 0,
    seats: 3,
    projects: 10,
    projectPack: { size: 10, priceCents: 4_900, extraSeconds: 75 * MINUTE },
    videoSecondsPerPeriod: 150 * MINUTE,
    // $1 a minute, in cents per second. Fair use on the AI actions, not a
    // meter: the caps below are far above what editing ten projects takes.
    overageCentsPerSecond: 2,
    ai: { suggestionsPerPeriod: 100, riffMessagesPerPeriod: 300, ownKeys: false },
    features: {
      aiVoiceExport: true, agent: true, brandKits: null, voiceCloning: true, interactiveDemos: true,
      sso: false, scim: false, auditExport: true, customDomain: true,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceCents: null,
    term: "quoted",
    minimumMonths: 12,
    seats: null,
    projects: null,
    projectPack: null,
    videoSecondsPerPeriod: 10_000 * MINUTE,
    overageCentsPerSecond: null,
    ai: { suggestionsPerPeriod: null, riffMessagesPerPeriod: null, ownKeys: false },
    features: {
      aiVoiceExport: true, agent: true, brandKits: null, voiceCloning: true, interactiveDemos: true,
      sso: true, scim: true, auditExport: true, customDomain: true,
    },
  },
};

export function planFor(plan: Plan): PlanDefinition {
  return PLAN_CATALOGUE[plan];
}

/** A stored plan value, including the ones that predate this catalogue, as a plan. */
export function normalizePlan(raw: string): Plan {
  if ((PLANS as readonly string[]).includes(raw)) return raw as Plan;
  if ((LEGACY_PLANS as readonly string[]).includes(raw)) return "studio";
  return "free";
}

/** The projects a workspace may have at once, given its plan and packs. Null is unlimited. */
export function projectLimit(plan: Plan, packs: number): number | null {
  const definition = planFor(plan);
  if (definition.projects === null) return null;
  return definition.projects + (definition.projectPack ? packs * definition.projectPack.size : 0);
}

/** The included seconds a period, given its plan and packs. */
export function includedSeconds(plan: Plan, packs: number): number {
  const definition = planFor(plan);
  return definition.videoSecondsPerPeriod + (definition.projectPack ? packs * definition.projectPack.extraSeconds : 0);
}

/** The price a term, given its plan and packs, in cents. Null for a quote. */
export function priceCents(plan: Plan, packs: number): number | null {
  const definition = planFor(plan);
  if (definition.priceCents === null) return null;
  return definition.priceCents + (definition.projectPack ? packs * definition.projectPack.priceCents : 0);
}

/** "$1.20 a minute", from a rate in cents per second. Null when the plan stops instead. */
export function formatOverage(plan: Plan): string | null {
  const rate = planFor(plan).overageCentsPerSecond;
  if (rate === null) return null;
  return `$${((rate * 60) / 100).toFixed(2)} a minute`;
}

/** "$99/mo", "$240/yr", "Free", "Quoted". */
export function formatPrice(plan: Plan, packs = 0): string {
  const definition = planFor(plan);
  const cents = priceCents(plan, packs);
  if (cents === null) return "Quoted";
  if (cents === 0) return "Free";
  const dollars = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  return `$${dollars}${definition.term === "annual" ? "/yr" : definition.term === "monthly" ? "/mo" : ""}`;
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
 *
 * Only monthly plans prorate against each other by list price. A move to or
 * from an annual or quoted plan is handled by Stripe's own proration on the
 * subscription, or on the contract.
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

  const from = PLAN_CATALOGUE[input.from];
  const to = PLAN_CATALOGUE[input.to];
  const monthlyPrice = (p: PlanDefinition) => (p.term === "monthly" || p.term === "none" ? p.priceCents : null);
  const fromPrice = monthlyPrice(from);
  const toPrice = monthlyPrice(to);

  if (fromPrice === null || toPrice === null) {
    return { chargeCents: 0, daysRemaining, daysInPeriod };
  }

  const dailyDifference = (toPrice - fromPrice) / daysInPeriod;
  // Rounded toward zero, so a rounding error is never a charge the customer
  // did not incur.
  const chargeCents = Math.trunc(dailyDifference * daysRemaining);

  return { chargeCents, daysRemaining, daysInPeriod };
}
