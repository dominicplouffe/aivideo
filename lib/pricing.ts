import type { IconName } from "@/components/ui/Icon";

export interface Plan {
  id: "free" | "starter" | "team" | "scale" | "enterprise";
  name: string;
  tagline: string;
  monthly: number | null;
  annual: number | null;
  unit: string;
  seatNote: string;
  cta: { label: string; href: string };
  highlight?: boolean;
  badge?: string;
  headline: string[];
  limits: { label: string; value: string }[];
}

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Judge the quality honestly, without a sales call.",
    monthly: 0,
    annual: 0,
    unit: "forever",
    seatNote: "1 seat",
    cta: { label: "Start free", href: "/signup" },
    headline: [
      "10 AI video minutes / month",
      "Unlimited step-by-step guides",
      "Every AI feature unlocked",
      "1080p exports with a small DemoRiff mark",
      "3 share pages",
    ],
    limits: [
      { label: "AI video minutes", value: "10 / mo" },
      { label: "Written guides", value: "Unlimited" },
      { label: "Seats", value: "1" },
      { label: "Max export", value: "1080p" },
    ],
  },
  {
    id: "starter",
    name: "Starter",
    tagline: "For the founder or solo marketer shipping every week.",
    monthly: 39,
    annual: 32,
    unit: "per month",
    seatNote: "1 seat · add seats at $19",
    cta: { label: "Start 14-day trial", href: "/signup?plan=starter" },
    headline: [
      "60 AI video minutes / month",
      "No watermark, 4K exports",
      "260 studio voices + 1 voice clone",
      "Brand kit and custom share pages",
      "34-language localization",
    ],
    limits: [
      { label: "AI video minutes", value: "60 / mo" },
      { label: "Written guides", value: "Unlimited" },
      { label: "Seats", value: "1 (+$19 each)" },
      { label: "Max export", value: "4K" },
    ],
  },
  {
    id: "team",
    name: "Team",
    tagline: "The plan most product teams land on and stay on.",
    monthly: 129,
    annual: 105,
    unit: "per month",
    seatNote: "3 seats included · add seats at $29",
    cta: { label: "Start 14-day trial", href: "/signup?plan=team" },
    highlight: true,
    badge: "Most popular",
    headline: [
      "240 AI video minutes / month",
      "Interactive demos with branching",
      "AI presenters + 3 voice clones",
      "Shared brand kits, approvals, comments",
      "Engagement analytics and CTAs",
      "CRM + help-center integrations",
    ],
    limits: [
      { label: "AI video minutes", value: "240 / mo" },
      { label: "Written guides", value: "Unlimited" },
      { label: "Seats", value: "3 (+$29 each)" },
      { label: "Max export", value: "4K60" },
    ],
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "For GTM orgs running a real video operation.",
    monthly: 449,
    annual: 369,
    unit: "per month",
    seatNote: "10 seats included · add seats at $25",
    cta: { label: "Start 14-day trial", href: "/signup?plan=scale" },
    headline: [
      "900 AI video minutes / month",
      "Riff Agent — autonomous demo generation",
      "Unlimited voice clones + custom avatar",
      "Workspaces, roles and content governance",
      "API access and webhooks",
      "Regional processing (US / EU / AU)",
    ],
    limits: [
      { label: "AI video minutes", value: "900 / mo" },
      { label: "Written guides", value: "Unlimited" },
      { label: "Seats", value: "10 (+$25 each)" },
      { label: "Max export", value: "4K60 + ProRes" },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Procurement-ready, with your security team's signature.",
    monthly: null,
    annual: null,
    unit: "custom",
    seatNote: "Unlimited seats",
    cta: { label: "Talk to sales", href: "/contact" },
    headline: [
      "Unlimited video minutes",
      "SAML SSO, SCIM, audit log streaming",
      "Private rendering in your own cloud",
      "Custom DPA, security review, MSA",
      "Dedicated CSM and onboarding program",
      "99.9% uptime SLA",
    ],
    limits: [
      { label: "AI video minutes", value: "Unlimited" },
      { label: "Written guides", value: "Unlimited" },
      { label: "Seats", value: "Unlimited" },
      { label: "Max export", value: "ProRes / lossless" },
    ],
  },
];

export interface CompareRow {
  label: string;
  hint?: string;
  values: Record<Plan["id"], string | boolean>;
}

export interface CompareGroup {
  group: string;
  icon: IconName;
  rows: CompareRow[];
}

const T = true;
const F = false;

export const compareGroups: CompareGroup[] = [
  {
    group: "Capture",
    icon: "record",
    rows: [
      { label: "Browser + desktop screen recorder", values: { free: T, starter: T, team: T, scale: T, enterprise: T } },
      { label: "Max capture resolution", values: { free: "1080p", starter: "4K", team: "4K60", scale: "4K60", enterprise: "4K60" } },
      { label: "Camera, mic and system audio tracks", values: { free: T, starter: T, team: T, scale: T, enterprise: T } },
      { label: "Import existing video (Loom, Zoom, MP4)", values: { free: "3 / mo", starter: T, team: T, scale: T, enterprise: T } },
      { label: "DOM capture for interactive demos", hint: "Required for click-through tours", values: { free: F, starter: F, team: T, scale: T, enterprise: T } },
      { label: "Riff Agent autonomous capture", values: { free: F, starter: F, team: F, scale: T, enterprise: T } },
    ],
  },
  {
    group: "AI production",
    icon: "wand",
    rows: [
      { label: "Transcript-based editing", values: { free: T, starter: T, team: T, scale: T, enterprise: T } },
      { label: "Auto zoom, pan and cursor smoothing", values: { free: T, starter: T, team: T, scale: T, enterprise: T } },
      { label: "Filler-word and silence removal", values: { free: T, starter: T, team: T, scale: T, enterprise: T } },
      { label: "Studio Sound audio restoration", values: { free: T, starter: T, team: T, scale: T, enterprise: T } },
      { label: "Script rewrite and tone control", values: { free: T, starter: T, team: T, scale: T, enterprise: T } },
      { label: "Studio voice library", values: { free: "260", starter: "260", team: "260", scale: "260", enterprise: "260" } },
      { label: "Voice cloning", values: { free: F, starter: "1", team: "3", scale: "Unlimited", enterprise: "Unlimited" } },
      { label: "AI presenters", values: { free: "Preview", starter: "180 stock", team: "180 stock", scale: "+ 1 custom", enterprise: "+ unlimited custom" } },
      { label: "AI b-roll generation", values: { free: F, starter: F, team: T, scale: T, enterprise: T } },
      { label: "Riff co-editor (chat to edit)", values: { free: "20 msgs", starter: T, team: T, scale: T, enterprise: T } },
    ],
  },
  {
    group: "Output",
    icon: "layers",
    rows: [
      { label: "AI video minutes per month", values: { free: "10", starter: "60", team: "240", scale: "900", enterprise: "Unlimited" } },
      { label: "Step-by-step written guides", values: { free: "Unlimited", starter: "Unlimited", team: "Unlimited", scale: "Unlimited", enterprise: "Unlimited" } },
      { label: "Interactive click-through demos", values: { free: F, starter: F, team: T, scale: T, enterprise: T } },
      { label: "Branching and multi-path tours", values: { free: F, starter: F, team: F, scale: T, enterprise: T } },
      { label: "Auto-generated social clips", values: { free: F, starter: T, team: T, scale: T, enterprise: T } },
      { label: "Export watermark", values: { free: "Yes", starter: "None", team: "None", scale: "None", enterprise: "None" } },
      { label: "Localization languages", values: { free: "3", starter: "34", team: "34", scale: "34", enterprise: "34" } },
      { label: "Lip-sync on translated video", values: { free: F, starter: T, team: T, scale: T, enterprise: T } },
    ],
  },
  {
    group: "Brand & collaboration",
    icon: "palette",
    rows: [
      { label: "Brand kits", values: { free: F, starter: "1", team: "5", scale: "Unlimited", enterprise: "Unlimited" } },
      { label: "Custom intro, outro and lower thirds", values: { free: F, starter: T, team: T, scale: T, enterprise: T } },
      { label: "Timestamped comments and review", values: { free: F, starter: F, team: T, scale: T, enterprise: T } },
      { label: "Approval workflows", values: { free: F, starter: F, team: F, scale: T, enterprise: T } },
      { label: "Shared asset library", values: { free: F, starter: F, team: T, scale: T, enterprise: T } },
      { label: "Workspaces and content governance", values: { free: F, starter: F, team: F, scale: T, enterprise: T } },
    ],
  },
  {
    group: "Distribution & data",
    icon: "chart",
    rows: [
      { label: "Hosted share pages", values: { free: "3", starter: "Unlimited", team: "Unlimited", scale: "Unlimited", enterprise: "Unlimited" } },
      { label: "Custom domain for share pages", values: { free: F, starter: F, team: T, scale: T, enterprise: T } },
      { label: "CTAs and lead capture", values: { free: F, starter: T, team: T, scale: T, enterprise: T } },
      { label: "Per-second engagement analytics", values: { free: "Basic", starter: "Basic", team: T, scale: T, enterprise: T } },
      { label: "Account-level viewer identification", values: { free: F, starter: F, team: T, scale: T, enterprise: T } },
      { label: "CRM sync (HubSpot, Salesforce)", values: { free: F, starter: F, team: T, scale: T, enterprise: T } },
      { label: "Public API and webhooks", values: { free: F, starter: F, team: F, scale: T, enterprise: T } },
    ],
  },
  {
    group: "Security & support",
    icon: "shield",
    rows: [
      { label: "Automatic sensitive-data masking", values: { free: T, starter: T, team: T, scale: T, enterprise: T } },
      { label: "Custom masking rules", values: { free: F, starter: F, team: T, scale: T, enterprise: T } },
      { label: "SAML SSO and SCIM provisioning", values: { free: F, starter: F, team: F, scale: "SSO only", enterprise: T } },
      { label: "Regional data processing", values: { free: F, starter: F, team: F, scale: "US / EU / AU", enterprise: "Any + BYOC" } },
      { label: "Audit log export and SIEM streaming", values: { free: F, starter: F, team: F, scale: "Export", enterprise: T } },
      { label: "Support", values: { free: "Community", starter: "Email", team: "Priority email", scale: "Slack channel", enterprise: "Dedicated CSM" } },
      { label: "Uptime SLA", values: { free: F, starter: F, team: F, scale: "99.5%", enterprise: "99.9%" } },
    ],
  },
];

export const pricingFaqs = [
  {
    q: "What counts as an AI video minute?",
    a: "One minute of finished, rendered output — not source footage. If you record twelve minutes and publish a three-minute cut, that is three minutes. Re-rendering the same video after an edit does not charge you again within the same billing period, and generating the written guide, interactive demo or social clips from that video costs nothing extra.",
  },
  {
    q: "Are translations billed separately?",
    a: "No. This is where most tools in this category get expensive. A localized version of a video you already produced does not consume new video minutes, on any paid plan. Translate a three-minute demo into all thirty-four languages and your usage is still three minutes.",
  },
  {
    q: "What happens if I run out of minutes mid-month?",
    a: "Nothing breaks. Your existing videos keep serving and your guides keep publishing. You can either top up at $1.20 per minute or move to the next plan, and we prorate the difference against the days remaining. We will never silently overage-bill you — you get a notice at 80% and a hard stop you control.",
  },
  {
    q: "Can I change plans or add seats mid-cycle?",
    a: "Yes, in the billing screen, without talking to anyone. Upgrades take effect immediately with a prorated charge; downgrades take effect at the end of the current period so you do not lose minutes you already paid for. Seats can be added and removed at any time.",
  },
  {
    q: "Do unused minutes roll over?",
    a: "On annual plans, unused minutes roll over for up to three months, which covers the normal rhythm of a launch-heavy quarter followed by a quiet one. Monthly plans reset each period.",
  },
  {
    q: "Is there a discount for startups or non-profits?",
    a: "Yes. Companies under ten people with less than $2M raised get Team at Starter pricing for their first year. Registered non-profits and accredited educational institutions get 50% off any plan. Both are a single email to sales with proof — no deck, no call.",
  },
  {
    q: "What does the 14-day trial include?",
    a: "The full Team plan: every AI feature, 4K exports without a watermark, interactive demos, analytics, and 60 video minutes to spend however you like. No credit card. If you do nothing at the end, you drop to Free rather than being charged.",
  },
  {
    q: "How does Enterprise pricing work?",
    a: "It is based on seats and annual video volume, not per-feature gating — everything in Scale is included by definition. Most Enterprise agreements land between $30k and $120k annually. We can work with your procurement process, sign your MSA, complete security questionnaires, and invoice against a PO.",
  },
];
