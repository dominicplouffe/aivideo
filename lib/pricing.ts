import type { IconName } from "@/components/ui/Icon";
import { PLAN_CATALOGUE, formatOverage, type Plan as PlanId } from "@/lib/billing/plans";

/**
 * The pricing page's copy, on top of the plan catalogue.
 *
 * Every number here is read from `lib/billing/plans.ts`, which is also what
 * the product enforces. The page and the product cannot disagree about a
 * limit because they have one source for it; the words are the only thing
 * this file adds.
 */

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** "$99", "$20", "Free", "Custom". */
  price: string;
  /** "per month", "per month, billed $240 a year", "forever", "quoted". */
  priceNote: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  badge?: string;
  headline: string[];
  limits: { label: string; value: string }[];
}

const c = PLAN_CATALOGUE;
const minutes = (seconds: number) => `${seconds / 60}`;
const pack = c.studio.projectPack!;

export const plans: Plan[] = [
  {
    id: "free",
    name: c.free.name,
    tagline: "Judge the quality honestly, without a sales call.",
    price: "Free",
    priceNote: "forever, no card",
    cta: { label: "Start free", href: "/signup" },
    headline: [
      `${minutes(c.free.videoSecondsPerPeriod)} finished video minutes a month`,
      `${c.free.projects} projects`,
      "AI voices, captions and the Studio editor",
      `${c.free.ai.suggestionsPerPeriod} suggested cuts and ${c.free.ai.riffMessagesPerPeriod} Riff messages a month`,
      "Unlimited written guides",
    ],
    limits: [
      { label: "Finished minutes", value: `${minutes(c.free.videoSecondsPerPeriod)} / mo` },
      { label: "Projects", value: `${c.free.projects}` },
      { label: "Brand kits", value: `${c.free.features.brandKits}` },
    ],
  },
  {
    id: "byok",
    name: c.byok.name,
    tagline: "Your vendor accounts do the work; you pay us for the editor.",
    price: "$20",
    priceNote: `per month, billed $${c.byok.priceCents! / 100} for the year`,
    cta: { label: "Start on your own keys", href: "/signup?plan=byok" },
    headline: [
      "Unlimited projects",
      `${minutes(c.byok.videoSecondsPerPeriod).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} finished minutes a month`,
      "Unlimited Tighten, Cut to length and Riff",
      "Brand kits and voice cloning",
      "Your Deepgram, ElevenLabs and Anthropic keys, billed by them to you",
      "Twelve-month term",
    ],
    limits: [
      { label: "Finished minutes", value: `${minutes(c.byok.videoSecondsPerPeriod)} / mo` },
      { label: "Projects", value: "Unlimited" },
      { label: "Brand kits", value: "Unlimited" },
    ],
  },
  {
    id: "studio",
    name: c.studio.name,
    tagline: "Everything included, nothing to set up. Cancel any time.",
    price: `$${c.studio.priceCents! / 100}`,
    priceNote: `per month · +$${pack.priceCents / 100} per ${pack.size} more projects`,
    cta: { label: "Start Studio", href: "/signup?plan=studio" },
    highlight: true,
    badge: "Most popular",
    headline: [
      `${c.studio.projects} projects, more in packs of ${pack.size}`,
      `${minutes(c.studio.videoSecondsPerPeriod)} finished minutes a month, +${pack.extraSeconds / 60} per pack`,
      `${c.studio.ai.suggestionsPerPeriod} suggested cuts and ${c.studio.ai.riffMessagesPerPeriod} Riff messages a month`,
      "Brand kits and voice cloning",
      "Our vendor accounts do the work",
      `Overage at ${formatOverage("studio")}, or a hard stop you control`,
    ],
    limits: [
      { label: "Finished minutes", value: `${minutes(c.studio.videoSecondsPerPeriod)} / mo` },
      { label: "Projects", value: `${c.studio.projects} (+${pack.size} per pack)` },
      { label: "Brand kits", value: "Unlimited" },
    ],
  },
  {
    id: "enterprise",
    name: c.enterprise.name,
    tagline: "Procurement-ready, with your security team's signature.",
    price: "Custom",
    priceNote: "annual agreement, volume based",
    cta: { label: "Talk to sales", href: "/contact" },
    headline: [
      "Everything in Studio, at your volume",
      "SAML SSO, SCIM, audit log streaming",
      "Private rendering in your own cloud",
      "Custom DPA, security review, MSA",
      "Dedicated onboarding",
    ],
    limits: [
      { label: "Finished minutes", value: "By agreement" },
      { label: "Projects", value: "Unlimited" },
      { label: "Brand kits", value: "Unlimited" },
    ],
  },
];

export interface CompareRow {
  label: string;
  hint?: string;
  values: Record<PlanId, string | boolean>;
}

export interface CompareGroup {
  group: string;
  icon: IconName;
  rows: CompareRow[];
}

const T = true;
const F = false;
const all = (v: string | boolean): Record<PlanId, string | boolean> => ({ free: v, byok: v, studio: v, enterprise: v });

export const compareGroups: CompareGroup[] = [
  {
    group: "Capture and edit",
    icon: "record",
    rows: [
      { label: "Browser screen recorder, pause and resume", values: all(T) },
      { label: "Import an existing recording", values: all(T) },
      { label: "Transcript editing: cut words, split scenes, correct spellings", values: all(T) },
      { label: "Filler-word removal and glossary", values: all(T) },
      { label: "Copy a project, undo, history", values: all(T) },
    ],
  },
  {
    group: "AI production",
    icon: "wand",
    rows: [
      { label: "Finished video minutes per month", values: { free: minutes(c.free.videoSecondsPerPeriod), byok: minutes(c.byok.videoSecondsPerPeriod), studio: `${minutes(c.studio.videoSecondsPerPeriod)} +${pack.extraSeconds / 60}/pack`, enterprise: "By agreement" } },
      { label: "AI voice narration, fitted to your footage", values: all(T) },
      { label: "Tighten and Cut to length", hint: "Suggested cuts you preview, apply and undo", values: { free: `${c.free.ai.suggestionsPerPeriod} / mo`, byok: "Unlimited", studio: `${c.studio.ai.suggestionsPerPeriod} / mo`, enterprise: "Unlimited" } },
      { label: "Riff co-editor", values: { free: `${c.free.ai.riffMessagesPerPeriod} msgs / mo`, byok: "Unlimited", studio: `${c.studio.ai.riffMessagesPerPeriod} / mo`, enterprise: "Unlimited" } },
      { label: "Voice cloning", values: { free: F, byok: T, studio: T, enterprise: T } },
      { label: "Whose vendor accounts do the work", values: { free: "Ours", byok: "Yours", studio: "Ours", enterprise: "Ours or yours" } },
    ],
  },
  {
    group: "Output and brand",
    icon: "palette",
    rows: [
      { label: "Projects", values: { free: `${c.free.projects}`, byok: "Unlimited", studio: `${c.studio.projects} +${pack.size}/pack`, enterprise: "Unlimited" } },
      { label: "Brand kits: logo, colours, typeface, intro and outro cards", values: { free: `${c.free.features.brandKits}`, byok: "Unlimited", studio: "Unlimited", enterprise: "Unlimited" } },
      { label: "Step-by-step written guides", values: all("Unlimited") },
      { label: "Hosted share pages", values: all(T) },
      { label: "Custom domain for share pages", values: { free: F, byok: T, studio: T, enterprise: T } },
    ],
  },
  {
    group: "Billing",
    icon: "creditCard",
    rows: [
      { label: "Term", values: { free: "None", byok: "12 months, billed yearly", studio: "Monthly, cancel any time", enterprise: "Annual" } },
      { label: "Past the minutes", values: { free: "Rendering pauses", byok: formatOverage("byok")!, studio: `${formatOverage("studio")} or hard stop`, enterprise: "By agreement" } },
      { label: "Re-render a project you already rendered this month", values: all("Free") },
    ],
  },
  {
    group: "Security and support",
    icon: "shield",
    rows: [
      { label: "Automatic sensitive-data masking", values: all(T) },
      { label: "SAML SSO and SCIM provisioning", values: { free: F, byok: F, studio: F, enterprise: T } },
      { label: "Audit log export", values: { free: F, byok: F, studio: T, enterprise: T } },
      { label: "Support", values: { free: "Community", byok: "Email", studio: "Priority email", enterprise: "Dedicated" } },
    ],
  },
];

export const pricingFaqs = [
  {
    q: "What counts as a finished video minute?",
    a: "One minute of rendered output, not source footage. Record twelve minutes and export a three-minute cut, and that is three minutes. A project counts once a month, for its longest render, so re-rendering after fixing a word costs nothing. Written guides, previews in the Studio and narration previews are never minutes.",
  },
  {
    q: "What does Bring your own keys mean?",
    a: "You add your own API keys for Deepgram (transcription), ElevenLabs (voices) and Anthropic (Riff, suggested cuts, the agent) in Settings, and those vendors bill you directly for what you use. We charge $20 a month for the editor, the rendering and the hosting, billed as $240 for a twelve-month term. At today's vendor prices a narrated minute costs about ten cents of ElevenLabs and well under a cent of Deepgram; a suggested cut is a few cents of Claude.",
  },
  {
    q: "Why the twelve-month term on Bring your own keys?",
    a: "Because it is priced as a year: $240 is what makes unlimited projects and unlimited AI actions workable at that price. It renews yearly and can be cancelled from the billing page once the first year is up. Studio has no term at all.",
  },
  {
    q: "How do Studio packs work?",
    a: `Studio includes ${c.studio.projects} projects and ${minutes(c.studio.videoSecondsPerPeriod)} minutes. Each pack adds ${pack.size} projects and ${pack.extraSeconds / 60} minutes for $${pack.priceCents / 100} a month. Add or remove packs on the billing page at any time; Stripe prorates the difference. You cannot drop below the number of projects you have without deleting some first.`,
  },
  {
    q: "What happens if I run out of minutes mid-month?",
    a: `Nothing you already made is affected. On Studio, rendering keeps going and the extra is billed at ${formatOverage("studio")}, unless you turn on the hard stop, in which case rendering pauses until the period resets. On Free, rendering pauses; re-rendering a project you already rendered this month still works. You are told at 80%.`,
  },
  {
    q: "What do the AI caps on Studio mean?",
    a: `Fair use, not a meter. ${c.studio.ai.suggestionsPerPeriod} Tighten or Cut-to-length runs and ${c.studio.ai.riffMessagesPerPeriod} Riff messages a month is far more than editing ten projects takes. If you hit them, tell us; that is a conversation, not a lockout.`,
  },
  {
    q: "Can I change plans?",
    a: "Yes, from the billing page. Free to Studio or Bring your own keys takes effect at once. Cancelling Studio ends it when the paid month does, and the workspace drops to Free with all of its recordings and history intact.",
  },
  {
    q: "How does Enterprise pricing work?",
    a: "By seats and annual volume rather than feature gating; everything in Studio is included. We can run rendering inside your own cloud, sign your MSA, complete security questionnaires and invoice against a PO.",
  },
];
