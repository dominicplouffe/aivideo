import type { IconName } from "@/components/ui/Icon";

/* =========================================================
   Customers — fictional companies used across the site.
   ========================================================= */

export interface Customer {
  name: string;
  slug: string;
  industry: string;
  wordmarkWeight?: number;
  letterSpacing?: string;
}

export const customers: Customer[] = [
  { name: "Northwind", slug: "northwind", industry: "Revenue intelligence" },
  { name: "LUMEN", slug: "lumen", industry: "Observability", letterSpacing: "0.22em" },
  { name: "Cardinal", slug: "cardinal", industry: "Fintech infrastructure" },
  { name: "Foldr", slug: "foldr", industry: "Document AI" },
  { name: "Arcwell", slug: "arcwell", industry: "Healthcare ops" },
  { name: "Tessera", slug: "tessera", industry: "Data warehouse" },
  { name: "Halcyon", slug: "halcyon", industry: "Security posture" },
  { name: "Brightline", slug: "brightline", industry: "Field service" },
  { name: "Meridian", slug: "meridian", industry: "Logistics" },
  { name: "Petra", slug: "petra", industry: "Developer tools" },
  { name: "Volta", slug: "volta", industry: "Energy analytics" },
  { name: "Kestrel", slug: "kestrel", industry: "HR platform" },
];

/* =========================================================
   Headline metrics
   ========================================================= */

export const heroMetrics = [
  { value: "11 min", label: "Median time from record to published demo" },
  { value: "94%", label: "Drop in external video production spend" },
  { value: "3.2×", label: "Lift in trial-to-paid on demo-led pages" },
];

export const proofMetrics = [
  { value: "2.4M", label: "Demos produced", sub: "Across 9,400 workspaces" },
  { value: "34", label: "Languages", sub: "Lip-synced, not just subtitled" },
  { value: "11 min", label: "Median turnaround", sub: "Raw recording to publish" },
  { value: "99.98%", label: "Render success", sub: "Trailing 90 days" },
];

/* =========================================================
   Pipeline steps
   ========================================================= */

export interface PipelineStep {
  key: string;
  index: string;
  title: string;
  kicker: string;
  body: string;
  bullets: string[];
  icon: IconName;
}

export const pipeline: PipelineStep[] = [
  {
    key: "record",
    index: "01",
    title: "Record the flow you already know",
    kicker: "Capture",
    body:
      "Open the recorder, click through your product, talk like a human. Stumble. Say “um.” Take the wrong turn and double back. DemoRiff captures 4K frames plus every click, keystroke, scroll and window change as structured intent data — the signal an editor would have to reconstruct by hand.",
    bullets: [
      "4K / 60fps capture with per-click intent metadata",
      "Camera bubble, system audio and mic on separate tracks",
      "Or import an existing Loom, Zoom, Gong call or MP4",
      "Chrome, Edge, macOS and Windows desktop apps",
    ],
    icon: "record",
  },
  {
    key: "riff",
    index: "02",
    title: "Let it riff on the raw take",
    kicker: "Produce",
    body:
      "The pipeline transcribes, finds the narrative beats, and rebuilds the take as a directed piece: dead air removed, cursor paths smoothed, zooms keyframed to the moments that matter, a clean voice laid over your script. You review it as text — because editing a sentence is faster than scrubbing a timeline.",
    bullets: [
      "Filler words, silences and wrong turns cut automatically",
      "Motion-tracked zoom and pan keyframed to each click",
      "Script rewritten for clarity — your words, tightened",
      "Studio voice, cloned voice, or your own audio cleaned up",
    ],
    icon: "wand",
  },
  {
    key: "ship",
    index: "03",
    title: "Ship every format from one take",
    kicker: "Publish",
    body:
      "The same recording becomes a landing-page hero video, a clickable interactive tour, a written step-by-step guide with annotated screenshots, and a set of vertical social cuts. Publish to a branded page, embed it, or push it into your help center — and watch how far people actually get.",
    bullets: [
      "Branded share pages with CTAs and lead capture",
      "Interactive click-through demos with hotspots and branching",
      "Step-by-step articles with auto-annotated screenshots",
      "Per-second engagement analytics and drop-off heatmaps",
    ],
    icon: "rocket",
  },
];

/* =========================================================
   Output formats
   ========================================================= */

export interface OutputFormat {
  key: string;
  label: string;
  title: string;
  body: string;
  icon: IconName;
  stats: { value: string; label: string }[];
  href: string;
}

export const outputs: OutputFormat[] = [
  {
    key: "video",
    label: "Demo video",
    title: "A cut that looks like you hired a studio",
    body:
      "Directed zooms, clean transitions, background polish, captions burned or soft, music bedded under a voice that never clips. Export 4K, 1080p, square or vertical — all from the same edit decision list.",
    icon: "play",
    stats: [
      { value: "4K60", label: "Max export" },
      { value: "9 ratios", label: "One click" },
      { value: "< 90s", label: "Typical render" },
    ],
    href: "/product/studio",
  },
  {
    key: "interactive",
    label: "Interactive demo",
    title: "A tour people click instead of watch",
    body:
      "The recorder captured your DOM, not just pixels. That becomes a real click-through demo with hotspots, tooltips, branching paths and forms — indexable, embeddable, and 6× more engaging than a video on a pricing page.",
    icon: "cursor",
    stats: [
      { value: "6.1×", label: "vs. video engagement" },
      { value: "0 code", label: "To embed" },
      { value: "Branching", label: "Multi-path flows" },
    ],
    href: "/product/interactive",
  },
  {
    key: "guide",
    label: "Step-by-step guide",
    title: "The article your help center has been missing",
    body:
      "Every click becomes a numbered step with an annotated screenshot, a written instruction and an animated GIF. Edit it like a doc, publish it to your knowledge base, or export to Notion, Confluence, Zendesk or Markdown.",
    icon: "doc",
    stats: [
      { value: "Auto", label: "Screenshots + blur" },
      { value: "8 targets", label: "Export destinations" },
      { value: "Unmetered", label: "On every plan" },
    ],
    href: "/product/docs",
  },
  {
    key: "clips",
    label: "Social clips",
    title: "Twelve posts from one recording",
    body:
      "The model finds the self-contained moments, reframes them vertically with subject tracking, adds animated captions in your brand type, and hands you a scheduling-ready set for LinkedIn, X, Reels and Shorts.",
    icon: "scissors",
    stats: [
      { value: "12", label: "Clips per hour of source" },
      { value: "Auto-reframe", label: "Subject tracked" },
      { value: "Brand type", label: "On every caption" },
    ],
    href: "/product/studio",
  },
];

/* =========================================================
   Capability bento
   ========================================================= */

export interface Capability {
  title: string;
  body: string;
  icon: IconName;
  tone: "iris" | "cyan" | "mint" | "amber" | "rose" | "violet";
  href: string;
  span?: string;
}

export const capabilities: Capability[] = [
  {
    title: "Edit video by editing text",
    body:
      "Delete a sentence, the footage goes with it. Reorder a paragraph, the cut follows. Type a correction and the voice re-reads it in your clone — no re-record, no lip-sync tell.",
    icon: "doc",
    tone: "iris",
    href: "/product/studio",
    span: "lg:col-span-2",
  },
  {
    title: "Zooms that land on the click",
    body:
      "Motion-tracked zoom and pan, keyframed to every meaningful interaction, eased so it never feels mechanical. Override any of it on the timeline.",
    icon: "zoom",
    tone: "cyan",
    href: "/product/studio",
  },
  {
    title: "260 voices, or a clone of yours",
    body:
      "Thirty seconds of reference audio gives you a voice that handles your product nouns, your pacing and your accent. Consent-gated and revocable.",
    icon: "mic",
    tone: "violet",
    href: "/product/voice",
  },
  {
    title: "Presenters without a studio",
    body:
      "Pick from 180 licensed presenters or train one on yourself. Picture-in-picture, full-frame intro, or a talking head that hands off to the screen.",
    icon: "avatar",
    tone: "amber",
    href: "/product/avatars",
  },
  {
    title: "34 languages, lip-synced",
    body:
      "Not subtitles — a full re-voice with mouth movement matched to the new audio, on-screen text swapped, and a localized guide to match.",
    icon: "globe",
    tone: "mint",
    href: "/product/localization",
    span: "lg:col-span-2",
  },
  {
    title: "One brand kit, every frame",
    body:
      "Logo, palette, type, lower-thirds, intro, outro, cursor style, music bed. Set it once; every video your team exports obeys it.",
    icon: "palette",
    tone: "rose",
    href: "/product/brand",
  },
  {
    title: "Studio Sound on any mic",
    body:
      "Room reverb, HVAC hum and laptop fan removed. Levels matched across speakers. Sounds like a treated booth, recorded at your kitchen table.",
    icon: "volume",
    tone: "cyan",
    href: "/product/studio",
  },
  {
    title: "Secrets blurred before render",
    body:
      "API keys, customer names, emails and card numbers are detected in-frame and masked automatically. Add your own patterns for anything else.",
    icon: "shield",
    tone: "mint",
    href: "/security",
  },
  {
    title: "Know exactly where they drop",
    body:
      "Per-second retention, hotspot click-through, CTA conversion, and which accounts watched what — synced back to your CRM.",
    icon: "chart",
    tone: "iris",
    href: "/product/analytics",
    span: "lg:col-span-2",
  },
];

/* =========================================================
   Testimonials
   ========================================================= */

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  slug: string;
  metric?: { value: string; label: string };
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "We used to budget two weeks and eleven thousand dollars for a launch video. Our last three launches were recorded on a Tuesday and live on Wednesday. The agency invoice line item is gone.",
    name: "Priya Raman",
    role: "VP Product Marketing",
    company: "Northwind",
    slug: "northwind",
    metric: { value: "14 days → 1", label: "Launch video turnaround" },
  },
  {
    quote:
      "Our solutions engineers were spending a third of their week rebuilding the same demo for different verticals. Now they record once and the variants generate themselves. We gave the team back twelve hours each.",
    name: "Daniel Okafor",
    role: "Director of Sales Engineering",
    company: "Cardinal",
    slug: "cardinal",
    metric: { value: "12 hrs/wk", label: "Returned per engineer" },
  },
  {
    quote:
      "The written guides are the sleeper feature. Every video we publish also becomes a help article, in six languages, with screenshots that are always current. Support ticket volume on onboarding fell by half.",
    name: "Mika Lindqvist",
    role: "Head of Customer Education",
    company: "Tessera",
    slug: "tessera",
    metric: { value: "−51%", label: "Onboarding tickets" },
  },
  {
    quote:
      "I am a non-technical founder who sounds, on camera, like a non-technical founder. DemoRiff made my product look like it came out of a company with a marketing department. We closed our seed on that demo.",
    name: "Sofia Benali",
    role: "Co-founder & CEO",
    company: "Foldr",
    slug: "foldr",
    metric: { value: "$4.2M", label: "Seed closed" },
  },
  {
    quote:
      "Security signed off in a week. Private rendering in our own VPC, no training on our frames, SOC 2 report on request. That is not a sentence I get to write about most AI vendors.",
    name: "Tom Aldridge",
    role: "Staff Security Engineer",
    company: "Halcyon",
    slug: "halcyon",
    metric: { value: "7 days", label: "To security approval" },
  },
  {
    quote:
      "We shipped 140 product videos last quarter with a team of two. The year before, with an agency, we shipped nine.",
    name: "Renata Alves",
    role: "Content Lead",
    company: "Meridian",
    slug: "meridian",
    metric: { value: "9 → 140", label: "Videos per quarter" },
  },
];

/* =========================================================
   Languages
   ========================================================= */

export const languages = [
  "English (US)", "English (UK)", "English (AU)", "Spanish", "Spanish (LatAm)",
  "French", "French (CA)", "German", "Portuguese (BR)", "Portuguese (PT)",
  "Italian", "Dutch", "Polish", "Swedish", "Norwegian", "Danish", "Finnish",
  "Czech", "Romanian", "Greek", "Turkish", "Russian", "Ukrainian", "Arabic",
  "Hebrew", "Hindi", "Bengali", "Tamil", "Japanese", "Korean",
  "Chinese (Simplified)", "Chinese (Traditional)", "Indonesian", "Vietnamese",
];

/* =========================================================
   Integrations
   ========================================================= */

export interface Integration {
  name: string;
  category: string;
  blurb: string;
  icon: IconName;
}

export const integrations: Integration[] = [
  { name: "Slack", category: "Collaboration", blurb: "Post every new cut to a channel and collect timestamped feedback.", icon: "megaphone" },
  { name: "Notion", category: "Docs", blurb: "Push generated guides into a Notion database, kept in sync.", icon: "doc" },
  { name: "Confluence", category: "Docs", blurb: "Publish step-by-step articles into spaces with your page template.", icon: "book" },
  { name: "Zendesk", category: "Support", blurb: "Attach a video answer to macros and help-center articles.", icon: "lifebuoy" },
  { name: "Intercom", category: "Support", blurb: "Serve walkthroughs inside the messenger at the moment of confusion.", icon: "mail" },
  { name: "HubSpot", category: "CRM", blurb: "Sync viewer engagement to contact timelines and workflows.", icon: "users" },
  { name: "Salesforce", category: "CRM", blurb: "Attach demo watch data to opportunities and score intent.", icon: "briefcase" },
  { name: "Webflow", category: "Web", blurb: "Drop a share embed into any Webflow page with one paste.", icon: "frame" },
  { name: "WordPress", category: "Web", blurb: "Official plugin for embedding demos and guides.", icon: "grid" },
  { name: "Figma", category: "Design", blurb: "Pull brand tokens and frames straight into your brand kit.", icon: "palette" },
  { name: "GitHub", category: "Engineering", blurb: "Trigger a re-render when a release tag lands.", icon: "code" },
  { name: "Linear", category: "Engineering", blurb: "Turn a shipped issue into a feature-release video automatically.", icon: "layers" },
  { name: "Segment", category: "Data", blurb: "Stream engagement events into your warehouse.", icon: "chart" },
  { name: "Amplitude", category: "Data", blurb: "Correlate demo watch depth with product activation.", icon: "trending" },
  { name: "Zapier", category: "Automation", blurb: "8,000 apps, no code, triggered on render complete.", icon: "bolt" },
  { name: "Okta", category: "Security", blurb: "SAML SSO and SCIM provisioning for the whole workspace.", icon: "lock" },
  { name: "Google Drive", category: "Storage", blurb: "Archive masters and exports to a shared drive.", icon: "folder" },
  { name: "YouTube", category: "Distribution", blurb: "Publish with chapters, description and localized tracks attached.", icon: "play" },
];

/* =========================================================
   FAQ
   ========================================================= */

export interface Faq {
  q: string;
  a: string;
}

export const homeFaqs: Faq[] = [
  {
    q: "Do I need to be good on camera, or write a script first?",
    a: "No. The workflow is designed around a first take. Talk through the flow the way you would explain it to a colleague — including the ums, the pauses and the wrong turns. DemoRiff transcribes what you said, rewrites it for clarity while keeping your voice and your terminology, and you approve the script as text before anything renders. Most people never record twice.",
  },
  {
    q: "Is this a screen recorder, a video editor, or a documentation tool?",
    a: "It is one pipeline that produces all three. The recorder captures pixels and interaction data together; the studio turns that into a directed video you edit as a transcript; and the same source generates an interactive click-through demo and a written step-by-step guide. Teams usually arrive for one of the three and end up replacing all three tools.",
  },
  {
    q: "How good is the AI voice, really?",
    a: "Good enough that we default to it. You get 260 licensed studio voices, or you can clone your own from thirty seconds of reference audio. The model is tuned for product narration specifically, so it handles interface nouns, acronyms and product names without the mispronunciations that give generic TTS away. You can also keep your original audio and just run Studio Sound over it.",
  },
  {
    q: "What happens to my recordings? Do you train on them?",
    a: "No. Your media, transcripts and derived assets are never used to train any model, ours or a vendor's. Everything is encrypted at rest with AES-256 and in transit with TLS 1.3, scoped to your workspace, and deletable on demand with a signed certificate. Business and Enterprise plans can pin processing to US, EU or AU regions, and Enterprise can run rendering inside their own cloud account.",
  },
  {
    q: "Can it handle a product that is behind a login with real customer data?",
    a: "Yes, and this is where most teams get stuck with generic editors. DemoRiff detects sensitive content in-frame — emails, names, API keys, card numbers, account identifiers — and masks it before render. You can add your own regex and DOM-selector rules, and mark whole regions as always-blurred so nobody has to remember.",
  },
  {
    q: "How long does a video actually take?",
    a: "Median time from finishing a recording to a published, branded video is eleven minutes, and most of that is you reading the script. A five-minute source recording typically renders in under ninety seconds. Localizing into a new language takes about two minutes per language and runs in parallel.",
  },
  {
    q: "What if I already have a library of Looms and Zoom calls?",
    a: "Import them. DemoRiff re-cuts existing footage with the same pipeline — it can infer click moments from cursor motion when interaction data is not present. Teams routinely bring in two years of accumulated recordings and rebuild them into a coherent, branded library in an afternoon.",
  },
  {
    q: "Is there a free plan, and what is actually limited?",
    a: "Yes — ten AI video minutes a month, unlimited step-by-step guides, and every AI feature unlocked so you can judge the quality honestly. Free exports carry a small DemoRiff mark. There is no credit card, no sales call, and no feature held hostage behind a demo request.",
  },
];

/* =========================================================
   Security highlights
   ========================================================= */

export const securityHighlights = [
  { title: "SOC 2 Type II", body: "Audited annually. Report available under NDA from the trust center.", icon: "shield" as IconName },
  { title: "GDPR & CCPA", body: "DPA, SCCs and a published subprocessor list with change notifications.", icon: "lock" as IconName },
  { title: "Zero model training", body: "Your frames, audio and transcripts never enter a training set.", icon: "brain" as IconName },
  { title: "Regional processing", body: "Pin rendering and storage to US, EU or AU. BYO-cloud on Enterprise.", icon: "globe" as IconName },
  { title: "SSO & SCIM", body: "SAML 2.0, OIDC, directory sync, and enforced domain capture.", icon: "key" as IconName },
  { title: "Audit trail", body: "Every view, export, share and permission change, streamable to your SIEM.", icon: "list" as IconName },
];
