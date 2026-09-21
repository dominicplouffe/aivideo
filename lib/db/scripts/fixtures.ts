/**
 * The seeded workspace, used to populate a database for demos and tests.
 *
 * Reachable from `npm run db:seed` and from tests. **Not** importable by
 * anything that renders: these names were what put "Meridian", "Renata" and
 * a 7.7k-view sparkline on the dashboard of accounts that had just been
 * created. If you are reaching for this module from a page or a component,
 * the answer you want is in `lib/data.ts`, and "there is nothing yet" is a
 * legitimate answer for it to give.
 */
import { seeded } from "../../utils";
import type { Member, Project, Segment, TranscriptWord } from "../../app-data";

export const workspace = {
  id: "ws_meridian",
  name: "Meridian",
  plan: "Team" as const,
  seats: { used: 7, total: 10 },
  minutes: { used: 164, total: 240 },
  guides: 312,
  region: "US",
};

export const currentUser: Member = {
  id: "usr_1",
  name: "Renata Alves",
  email: "renata@meridian.app",
  role: "Admin",
  lastActive: "now",
  hue: 268,
};

export const members: Member[] = [
  currentUser,
  { id: "usr_2", name: "Daniel Okafor", email: "daniel@meridian.app", role: "Owner", lastActive: "12m ago", hue: 192 },
  { id: "usr_3", name: "Priya Raman", email: "priya@meridian.app", role: "Admin", lastActive: "1h ago", hue: 320 },
  { id: "usr_4", name: "Mika Lindqvist", email: "mika@meridian.app", role: "Creator", lastActive: "3h ago", hue: 152 },
  { id: "usr_5", name: "Tom Aldridge", email: "tom@meridian.app", role: "Creator", lastActive: "yesterday", hue: 38 },
  { id: "usr_6", name: "Sofia Benali", email: "sofia@meridian.app", role: "Reviewer", lastActive: "2d ago", hue: 12 },
  { id: "usr_7", name: "Jonas Weber", email: "jonas@meridian.app", role: "Viewer", lastActive: "5d ago", hue: 220 },
];

export const collections = [
  "Product launches",
  "Help center",
  "Sales enablement",
  "Onboarding",
  "Release notes",
];

/* ---------------------------------------------------------- transcripts */

function buildSegments(seed: string, spec: { title: string; action?: string; text: string; zoom?: [number, number, number] }[]): Segment[] {
  const rand = seeded(seed);
  let t = 0;
  const FILLERS = new Set(["um", "uh", "so", "like", "basically", "actually", "just", "yeah", "kind", "sort"]);

  return spec.map((s, i) => {
    const words: TranscriptWord[] = s.text.split(/\s+/).map((raw) => {
      const clean = raw.replace(/[^a-zA-Z']/g, "").toLowerCase();
      const d = 0.16 + clean.length * 0.045 + rand() * 0.07;
      const word: TranscriptWord = { w: raw, t, d };
      if (FILLERS.has(clean)) word.cut = true;
      if (/^[A-Z][a-z]+$/.test(raw.replace(/[^a-zA-Z]/g, "")) && raw.length > 3 && rand() > 0.82) word.em = true;
      t += d;
      return word;
    });
    t += 0.55; // inter-segment breath
    const start = words[0]?.t ?? 0;
    const end = t;
    return {
      id: `${seed}-seg-${i}`,
      title: s.title,
      start,
      end,
      words,
      action: s.action,
      zoom: s.zoom ? { scale: s.zoom[0], x: s.zoom[1], y: s.zoom[2] } : undefined,
    };
  });
}

const shipmentSpec = [
  {
    title: "Open the shipments workspace",
    action: "click → nav#shipments",
    text: "So um let me show you how shipment planning works in Meridian. You start here in the shipments workspace, which is basically the home for everything in transit right now.",
    zoom: [1.3, 8, 30] as [number, number, number],
  },
  {
    title: "Read the live board",
    action: "scroll → table",
    text: "Every row is a live shipment. The status column updates from carrier telemetry, so you are not waiting on someone to email you an exception at four in the afternoon.",
    zoom: [1.5, 45, 72] as [number, number, number],
  },
  {
    title: "Start a new shipment",
    action: "click → button#new-shipment",
    text: "Now watch this. You just click New shipment up here in the corner, and uh the booking panel opens with your most common lane already filled in.",
    zoom: [2.1, 76, 14] as [number, number, number],
  },
  {
    title: "Rate shopping",
    action: "input → origin, destination",
    text: "Type an origin and a destination. As soon as both are set, we price every carrier on that lane in parallel. That is nine carriers, live rates, about four hundred milliseconds.",
    zoom: [1.7, 52, 40] as [number, number, number],
  },
  {
    title: "Compare and commit",
    action: "click → row.carrier[2]",
    text: "You can sort by cost, by transit time, or by our reliability score, which is built from the last twelve months of actual on-time performance rather than what the carrier claims. Pick one, and the booking is confirmed.",
    zoom: [1.6, 48, 58] as [number, number, number],
  },
  {
    title: "Wrap up",
    text: "And that is it. The whole thing takes about forty seconds, against the forty minutes it used to take in a spreadsheet. Yeah, that is the feature.",
    zoom: [1.0, 50, 50] as [number, number, number],
  },
];

const onboardingSpec = [
  { title: "Create your workspace", action: "click → button#create-workspace", text: "Welcome to Meridian. The first thing you will do is create a workspace, which is where your team, your lanes and your carrier contracts all live.", zoom: [1.4, 50, 34] as [number, number, number] },
  { title: "Invite your team", action: "click → nav#members", text: "Add the people who will be booking and tracking. You can set roles now or leave everyone as a member and tighten it later.", zoom: [1.5, 30, 46] as [number, number, number] },
  { title: "Connect a carrier", action: "click → button#connect-carrier", text: "This is the step that actually matters. Connect at least one carrier account so rate shopping has something to shop. We support forty-one carriers out of the box.", zoom: [1.8, 62, 52] as [number, number, number] },
  { title: "Import your lanes", action: "upload → lanes.csv", text: "If you have an existing lane list, drop the spreadsheet here. We will map the columns for you and flag anything ambiguous rather than guessing.", zoom: [1.6, 48, 40] as [number, number, number] },
  { title: "Book your first shipment", action: "click → button#new-shipment", text: "And now you are ready. Book something small first so you can see the whole flow end to end before you move real volume.", zoom: [2.0, 76, 14] as [number, number, number] },
];

const analyticsSpec = [
  { title: "Open the analytics tab", action: "click → nav#analytics", text: "Right, so the analytics side. This is where you find out whether the lane changes you made last quarter actually did anything.", zoom: [1.3, 8, 52] as [number, number, number] },
  { title: "Set the comparison", action: "click → select#period", text: "Pick a period and a comparison period. Everything on this page recalculates against the comparison, so the numbers you see are always deltas rather than absolutes.", zoom: [1.6, 68, 22] as [number, number, number] },
  { title: "Read the cost curve", action: "hover → chart.cost", text: "The cost per kilo curve is the one most people care about. Hover any point and you get the carrier mix that produced it, which is usually the explanation.", zoom: [1.7, 50, 44] as [number, number, number] },
  { title: "Drill into an exception", action: "click → row.exception[0]", text: "Anything flagged in red has an exception attached. Click through and you get the telemetry timeline, the carrier communication and what it cost you.", zoom: [1.9, 44, 70] as [number, number, number] },
];

/* ---------------------------------------------------------- projects */

const now = new Date("2026-09-20T14:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000).toISOString();

export const projects: Project[] = [
  {
    id: "prj_4b91de",
    slug: "create-a-shipment",
    title: "Rate shopping — create a shipment",
    description: "The core booking flow, for the pricing page and the launch email.",
    status: "published",
    durationSec: 108,
    sourceDurationSec: 252,
    updatedAt: ago(3),
    createdAt: ago(28),
    owner: "usr_1",
    brandKit: "Meridian — Primary",
    voice: "Avery — Warm US",
    locales: ["en-US", "de-DE", "ja-JP", "pt-BR", "fr-FR", "es-ES"],
    outputs: ["video", "guide", "interactive", "clips"],
    views: 8412,
    completion: 0.71,
    ctaClicks: 1033,
    collection: "Product launches",
    segments: buildSegments("shipment", shipmentSpec),
  },
  {
    id: "prj_7c22ab",
    slug: "first-week-onboarding",
    title: "First-week onboarding walkthrough",
    description: "Five-step setup guide served in-product on first login.",
    status: "published",
    durationSec: 164,
    sourceDurationSec: 391,
    updatedAt: ago(26),
    createdAt: ago(190),
    owner: "usr_4",
    brandKit: "Meridian — Primary",
    voice: "Rhys — Crisp UK",
    locales: ["en-US", "de-DE", "fr-FR"],
    outputs: ["video", "guide", "interactive"],
    views: 21840,
    completion: 0.64,
    ctaClicks: 2790,
    collection: "Onboarding",
    segments: buildSegments("onboarding", onboardingSpec),
  },
  {
    id: "prj_9f01cc",
    slug: "analytics-deep-dive",
    title: "Analytics deep dive for ops leads",
    description: "Longer-form walkthrough for the evaluation stage of enterprise deals.",
    status: "ready",
    durationSec: 214,
    sourceDurationSec: 498,
    updatedAt: ago(9),
    createdAt: ago(52),
    owner: "usr_3",
    brandKit: "Meridian — Primary",
    voice: "Avery — Warm US",
    locales: ["en-US"],
    outputs: ["video", "guide"],
    views: 0,
    completion: 0,
    ctaClicks: 0,
    collection: "Sales enablement",
    segments: buildSegments("analytics", analyticsSpec),
  },
  {
    id: "prj_2d55ef",
    slug: "carrier-contract-import",
    title: "Importing carrier contracts",
    description: "Help centre article and video for the most common support question.",
    status: "stale",
    durationSec: 92,
    sourceDurationSec: 188,
    updatedAt: ago(74),
    createdAt: ago(1100),
    owner: "usr_5",
    brandKit: "Meridian — Primary",
    voice: "Noor — Bright AU",
    locales: ["en-US", "de-DE", "es-ES", "pt-BR"],
    outputs: ["video", "guide"],
    views: 4108,
    completion: 0.58,
    ctaClicks: 141,
    collection: "Help center",
    segments: buildSegments("carrier", onboardingSpec.slice(1, 4)),
  },
  {
    id: "prj_51aa30",
    slug: "exception-handling",
    title: "Handling a shipment exception",
    description: "Support video answer, attached to three Zendesk macros.",
    status: "processing",
    durationSec: 0,
    sourceDurationSec: 214,
    updatedAt: ago(0.3),
    createdAt: ago(0.4),
    owner: "usr_5",
    brandKit: "Meridian — Primary",
    voice: "Avery — Warm US",
    locales: [],
    outputs: [],
    views: 0,
    completion: 0,
    ctaClicks: 0,
    collection: "Help center",
    segments: buildSegments("exception", analyticsSpec.slice(2)),
  },
  {
    id: "prj_88b7c1",
    slug: "q4-release-notes",
    title: "Q4 release — what shipped",
    description: "Monthly release recap for the changelog and the customer newsletter.",
    status: "draft",
    durationSec: 0,
    sourceDurationSec: 143,
    updatedAt: ago(1.2),
    createdAt: ago(1.4),
    owner: "usr_1",
    brandKit: "Meridian — Primary",
    voice: "Avery — Warm US",
    locales: [],
    outputs: [],
    views: 0,
    completion: 0,
    ctaClicks: 0,
    collection: "Release notes",
    segments: buildSegments("release", shipmentSpec.slice(0, 3)),
  },
  {
    id: "prj_33cd09",
    slug: "multi-leg-pricing",
    title: "Multi-leg pricing explained",
    description: "Feature explainer for the pricing page, cut for social too.",
    status: "published",
    durationSec: 76,
    sourceDurationSec: 162,
    updatedAt: ago(140),
    createdAt: ago(300),
    owner: "usr_3",
    brandKit: "Meridian — Primary",
    voice: "Avery — Warm US",
    locales: ["en-US", "de-DE", "ja-JP"],
    outputs: ["video", "guide", "clips"],
    views: 12904,
    completion: 0.77,
    ctaClicks: 1844,
    collection: "Product launches",
    segments: buildSegments("multileg", shipmentSpec.slice(2, 5)),
  },
  {
    id: "prj_60ee74",
    slug: "sso-setup-admin",
    title: "Setting up SSO for your org",
    description: "Admin documentation, generated silently with no narration.",
    status: "published",
    durationSec: 0,
    sourceDurationSec: 96,
    updatedAt: ago(320),
    createdAt: ago(340),
    owner: "usr_5",
    brandKit: "Meridian — Primary",
    voice: "—",
    locales: ["en-US", "de-DE"],
    outputs: ["guide"],
    views: 2361,
    completion: 0,
    ctaClicks: 0,
    collection: "Help center",
    segments: buildSegments("sso", onboardingSpec.slice(0, 3)),
  },
];

export function getProject(id: string) {
  return projects.find((p) => p.id === id || p.slug === id);
}

/* ---------------------------------------------------------- voices / avatars */

export interface Voice {
  id: string;
  name: string;
  descriptor: string;
  accent: string;
  languages: number;
  kind: "studio" | "clone";
  consented?: string;
  favourite?: boolean;
}

export const voices: Voice[] = [
  { id: "avery-warm-us", name: "Avery", descriptor: "Warm, unhurried narration", accent: "US", languages: 34, kind: "studio", favourite: true },
  { id: "rhys-crisp-uk", name: "Rhys", descriptor: "Crisp, technical, precise", accent: "UK", languages: 34, kind: "studio", favourite: true },
  { id: "noor-bright-au", name: "Noor", descriptor: "Bright, upbeat, product-led", accent: "AU", languages: 34, kind: "studio" },
  { id: "kai-calm-us", name: "Kai", descriptor: "Calm, low register, documentary", accent: "US", languages: 34, kind: "studio" },
  { id: "ines-clear-es", name: "Inés", descriptor: "Clear, neutral, instructional", accent: "ES", languages: 34, kind: "studio" },
  { id: "haruto-even-jp", name: "Haruto", descriptor: "Even, measured, formal", accent: "JP", languages: 34, kind: "studio" },
  { id: "lena-direct-de", name: "Lena", descriptor: "Direct, confident, concise", accent: "DE", languages: 34, kind: "studio" },
  { id: "amara-warm-ng", name: "Amara", descriptor: "Warm, expressive, engaging", accent: "NG", languages: 34, kind: "studio" },
  { id: "clone-renata", name: "Renata (you)", descriptor: "Cloned from a 4:12 sample", accent: "BR", languages: 34, kind: "clone", consented: "2026-03-04", favourite: true },
  { id: "clone-daniel", name: "Daniel Okafor", descriptor: "Cloned from a 0:38 sample", accent: "UK", languages: 34, kind: "clone", consented: "2026-05-19" },
];

export interface Avatar {
  id: string;
  name: string;
  descriptor: string;
  setting: string;
  kind: "stock" | "custom";
  gradient: string;
}

export const avatars: Avatar[] = [
  { id: "av_maya", name: "Maya", descriptor: "Explainer, mid-30s", setting: "Neutral studio", kind: "stock", gradient: "linear-gradient(150deg,#8B7355,#131826)" },
  { id: "av_theo", name: "Theo", descriptor: "Technical, late-20s", setting: "Office", kind: "stock", gradient: "linear-gradient(150deg,#4A5568,#131826)" },
  { id: "av_ines", name: "Inés", descriptor: "Warm, 40s", setting: "Home office", kind: "stock", gradient: "linear-gradient(150deg,#6B4A5C,#131826)" },
  { id: "av_jun", name: "Jun", descriptor: "Precise, 30s", setting: "Studio", kind: "stock", gradient: "linear-gradient(150deg,#3A5A4A,#131826)" },
  { id: "av_ada", name: "Ada", descriptor: "Authoritative, 50s", setting: "Boardroom", kind: "stock", gradient: "linear-gradient(150deg,#5C4A6B,#131826)" },
  { id: "av_sam", name: "Sam", descriptor: "Casual, 20s", setting: "Co-working", kind: "stock", gradient: "linear-gradient(150deg,#7A5A3A,#131826)" },
  { id: "av_renata", name: "Renata (you)", descriptor: "Trained 2026-04-02", setting: "Your office", kind: "custom", gradient: "linear-gradient(150deg,#6E56F8,#131826)" },
];

/* ---------------------------------------------------------- brand kits */

export interface BrandKit {
  id: string;
  name: string;
  locked: boolean;
  usedBy: number;
  colors: string[];
  font: string;
  intro: string;
  outro: string;
  cursor: string;
  music: string;
  captionStyle: string;
}

export const brandKits: BrandKit[] = [
  {
    id: "kit_meridian_primary",
    name: "Meridian — Primary",
    locked: true,
    usedBy: 248,
    colors: ["#6E56F8", "#22D3EE", "#0B0D14", "#F5F7FF", "#34D399"],
    font: "Inter",
    intro: "2.0s logo sting",
    outro: "Book a demo card, 3.0s",
    cursor: "Iris glow, 1.6×",
    music: "Ambient — Low, −26 dB",
    captionStyle: "Inter Semibold, 34px, drop shadow",
  },
  {
    id: "kit_meridian_support",
    name: "Meridian — Help center",
    locked: false,
    usedBy: 94,
    colors: ["#22D3EE", "#6E56F8", "#0B0D14", "#F5F7FF", "#F5B84E"],
    font: "Inter",
    intro: "None",
    outro: "Contact support card, 2.0s",
    cursor: "Neutral, 1.4×",
    music: "None",
    captionStyle: "Inter Medium, 30px, solid plate",
  },
  {
    id: "kit_meridian_social",
    name: "Meridian — Social",
    locked: false,
    usedBy: 61,
    colors: ["#A855F7", "#F5B84E", "#04050A", "#FFFFFF", "#22D3EE"],
    font: "Inter Tight",
    intro: "0.6s hard cut wipe",
    outro: "Handle card, 1.5s",
    cursor: "Bold, 2.0×",
    music: "Upbeat — Mid, −18 dB",
    captionStyle: "Inter Tight Bold, 48px, word-by-word",
  },
];

/* ---------------------------------------------------------- languages */

export interface LocaleRow {
  code: string;
  label: string;
  status: "published" | "rendering" | "stale" | "queued" | "none";
  reviewer?: string;
  pinned?: boolean;
  progress?: number;
}

export const localeMatrix: LocaleRow[] = [
  { code: "en-US", label: "English (US)", status: "published", reviewer: "Source" },
  { code: "de-DE", label: "German", status: "published", reviewer: "Jonas Weber", pinned: true },
  { code: "ja-JP", label: "Japanese", status: "rendering", progress: 0.68 },
  { code: "pt-BR", label: "Portuguese (BR)", status: "published", reviewer: "Renata Alves" },
  { code: "fr-FR", label: "French", status: "stale" },
  { code: "es-ES", label: "Spanish", status: "published", reviewer: "Inés Cabrera" },
  { code: "ko-KR", label: "Korean", status: "queued" },
  { code: "it-IT", label: "Italian", status: "queued" },
  { code: "nl-NL", label: "Dutch", status: "none" },
  { code: "pl-PL", label: "Polish", status: "none" },
  { code: "sv-SE", label: "Swedish", status: "none" },
  { code: "ar-SA", label: "Arabic", status: "none" },
];

/* ---------------------------------------------------------- activity */

export interface ActivityItem {
  id: string;
  who: string;
  what: string;
  target: string;
  when: string;
  kind: "publish" | "edit" | "comment" | "render" | "translate" | "invite";
}

export const activity: ActivityItem[] = [
  { id: "a1", who: "Priya Raman", what: "published", target: "Analytics deep dive for ops leads", when: ago(1.1), kind: "publish" },
  { id: "a2", who: "Riff Agent", what: "rendered 6 locales for", target: "Rate shopping — create a shipment", when: ago(3.2), kind: "translate" },
  { id: "a3", who: "Tom Aldridge", what: "commented at 1:04 on", target: "Handling a shipment exception", when: ago(4.6), kind: "comment" },
  { id: "a4", who: "Mika Lindqvist", what: "re-recorded step 3 of", target: "First-week onboarding walkthrough", when: ago(26), kind: "edit" },
  { id: "a5", who: "Renata Alves", what: "applied Meridian — Social to", target: "Multi-leg pricing explained", when: ago(31), kind: "edit" },
  { id: "a6", who: "Daniel Okafor", what: "invited", target: "jonas@meridian.app", when: ago(48), kind: "invite" },
  { id: "a7", who: "System", what: "flagged as stale after a UI change", target: "Importing carrier contracts", when: ago(74), kind: "render" },
];

/* ---------------------------------------------------------- analytics */

export function retentionCurve(seed: string, points = 40): number[] {
  const rand = seeded(seed);
  const cliffAt = Math.floor(points * (0.2 + rand() * 0.2));
  let v = 1;
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const decay = 0.006 + rand() * 0.012;
    v -= decay;
    if (i === cliffAt) v -= 0.14;
    if (i === Math.floor(points * 0.72)) v -= 0.06;
    out.push(Math.max(0.16, v));
  }
  return out;
}

export function viewsSeries(seed: string, days = 30): number[] {
  const rand = seeded(seed);
  let base = 180 + rand() * 120;
  return Array.from({ length: days }, (_, i) => {
    base += (rand() - 0.45) * 42;
    const weekend = i % 7 === 5 || i % 7 === 6 ? 0.55 : 1;
    return Math.max(24, Math.round(base * weekend));
  });
}

export const topAccounts = [
  { domain: "cardinal.com", viewers: 9, maxDepth: 0.94, stage: "Evaluation" },
  { domain: "northwind.io", viewers: 6, maxDepth: 0.88, stage: "Negotiation" },
  { domain: "halcyon.security", viewers: 5, maxDepth: 0.72, stage: "Discovery" },
  { domain: "tessera.dev", viewers: 4, maxDepth: 1.0, stage: "Closed won" },
  { domain: "arcwell.health", viewers: 3, maxDepth: 0.41, stage: "Discovery" },
];

export const trafficSources = [
  { source: "Pricing page embed", views: 3182, completion: 0.78 },
  { source: "Direct share link", views: 2410, completion: 0.69 },
  { source: "Help center", views: 1544, completion: 0.61 },
  { source: "Launch email", views: 861, completion: 0.74 },
  { source: "LinkedIn", views: 415, completion: 0.32 },
];
