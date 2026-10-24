import type { IconName } from "@/components/ui/Icon";
import type { PreviewKey } from "@/components/marketing/Previews";

// Capability facts only. No outcome figure appears until a real customer's result is on file.
const capabilityFacts = [
  { value: "1", label: "Rough screen recording in" },
  { value: "Text", label: "Edit the video by editing its transcript" },
  { value: "MP4", label: "Rendered, with a share page and an embed" },
  { value: "$0", label: "To start: 10 video minutes a month, no card" },
];

export interface SolutionPage {
  slug: string;
  nav: string;
  persona: string;
  title: string;
  titleAccent: string;
  lede: string;
  heroPreview: PreviewKey;
  icon: IconName;
  pains: { title: string; body: string }[];
  plays: { title: string; body: string; icon: IconName; preview?: PreviewKey }[];
  outcomes: { value: string; label: string }[];
  workflow: { step: string; title: string; body: string }[];
  quoteSlug: string;
  faqs: { q: string; a: string }[];
}

export const solutionPages: SolutionPage[] = [
  {
    slug: "product-marketing",
    nav: "Product Marketing",
    persona: "For product marketing managers",
    title: "Launch assets in hours,",
    titleAccent: "not sprint cycles",
    lede:
      "You found out the feature ships Thursday. Design is booked, the agency needs two weeks, and the launch page needs a hero video that does not look like it was made in a hurry. This is the tool that makes Thursday possible.",
    heroPreview: "video",
    icon: "megaphone",
    pains: [
      {
        title: "The brief-to-asset loop is longer than the release cycle",
        body: "By the time the launch video is approved, engineering has shipped two more features. You are permanently producing content for a version of the product that no longer exists.",
      },
      {
        title: "Every asset needs a different format",
        body: "The landing page wants a hero video. Sales wants something to forward. The help center wants an article. Social wants nine-by-sixteen. That is four production jobs from one feature.",
      },
      {
        title: "Nobody can tell you if it worked",
        body: "You have a view count and a vague sense that the launch went fine. You cannot tell which thirty seconds convinced people or which sentence made them leave.",
      },
    ],
    plays: [
      {
        icon: "rocket",
        title: "Feature launch, same week",
        body:
          "Record the feature with the PM who built it while it is fresh. Publish the hero video, the interactive tour for the pricing page, the help article, and six social cuts — from that one session, before the launch post goes out.",
        preview: "video",
      },
      {
        icon: "globe",
        title: "Launch in every market at once",
        body:
          "Localization is part of the launch, not a follow-up project. Thirty-four languages, published together, so your EMEA and APAC teams are not launching three weeks behind the US.",
        preview: "localization",
      },
      {
        icon: "chart",
        title: "Prove the asset moved something",
        body:
          "Per-second retention against the transcript tells you which claim landed. CRM sync tells you which accounts watched. That is the difference between a launch report and a launch anecdote.",
        preview: "analytics",
      },
      {
        icon: "palette",
        title: "Keep the whole library on brand",
        body:
          "One kit, enforced. When the brand refreshes, every video in the library re-renders at its existing URLs — your embeds do not break and your pages do not need touching.",
        preview: "brand",
      },
    ],
    outcomes: capabilityFacts,
    workflow: [
      { step: "Mon", title: "Record with the PM", body: "Twenty minutes with whoever built it, while the details are fresh. No script, no shoot." },
      { step: "Mon", title: "Approve the script", body: "Read the tightened transcript, fix two sentences, pick the voice. Ten minutes." },
      { step: "Tue", title: "Assets generate", body: "Hero video, interactive tour, help article and social cuts render in parallel." },
      { step: "Tue", title: "Localize and publish", body: "Eleven languages queued, brand kit applied, embeds live on the launch page." },
    ],
    quoteSlug: "northwind",
    faqs: [
      {
        q: "We already have a video agency. Does this replace them?",
        a: "For product and feature content, usually yes — that work is high-volume, fast-turnaround and low-craft-ceiling, which is exactly where an agency is expensive and slow. Keep them for brand films and customer stories with real cinematography. Most teams we work with cut agency spend by around 90% without dropping the agency entirely.",
      },
      {
        q: "How do we keep quality consistent across a team of five?",
        a: "Lock a brand kit and set an approval step. Creators choose a kit and record; the system handles every other visual decision. In practice the variance between your best and worst producer drops dramatically, because the decisions that used to vary are no longer being made by hand.",
      },
    ],
  },

  {
    slug: "sales",
    nav: "Sales Engineering",
    persona: "For sales engineers and AEs",
    title: "A tailored demo for every deal,",
    titleAccent: "without living in a studio",
    lede:
      "The generic demo loses. The tailored demo wins and takes three hours to build, so it only happens for the top five deals. DemoRiff makes the tailored version cheap enough to do for all of them.",
    heroPreview: "interactive",
    icon: "target",
    pains: [
      {
        title: "You rebuild the same demo for every vertical",
        body: "The logistics version, the manufacturing version, the one that leads with compliance. Same product, same flow, three hours each, every time.",
      },
      {
        title: "Live demos die on the calendar",
        body: "Two of six stakeholders show up. The other four get a recording you made on the fly at the end of a long day, and it shows.",
      },
      {
        title: "You cannot see what happened after the call",
        body: "You sent the follow-up recording. Did the economic buyer watch it? Did they skip to pricing? You are guessing, and your forecast is built on the guess.",
      },
    ],
    plays: [
      {
        icon: "users",
        title: "One recording, every vertical",
        body:
          "Record the core flow once. Generate variants with different framing, terminology and examples per segment — the script changes, the footage does not, and each one still sounds like it was made for them.",
        preview: "transcript",
      },
      {
        icon: "mail",
        title: "Leave-behinds that get watched",
        body:
          "A branded share page with chapters, the written summary underneath, and a booking CTA. Personalized links tell you exactly who opened it and how far they got.",
        preview: "analytics",
      },
      {
        icon: "cursor",
        title: "Let them drive it themselves",
        body:
          "An interactive tour in the follow-up email gets forwarded internally far more than a video does, because the champion can send it to a colleague who will click rather than commit to five minutes.",
        preview: "interactive",
      },
      {
        icon: "briefcase",
        title: "Engagement in the CRM, automatically",
        body:
          "Watch depth, rewatch spikes and CTA clicks land on the opportunity timeline. Alert the rep when a target account watches the security section twice.",
      },
    ],
    outcomes: capabilityFacts,
    workflow: [
      { step: "01", title: "Record the master flow", body: "Your best SE records the definitive walkthrough once, properly." },
      { step: "02", title: "Generate segment variants", body: "Terminology, examples and framing adjusted per vertical from the same footage." },
      { step: "03", title: "Personalize per deal", body: "Swap the logo in frame, name the account in the intro, set the CTA to their calendar." },
      { step: "04", title: "Track and act", body: "Engagement syncs to the opportunity. Reps get alerted when buying committees engage." },
    ],
    quoteSlug: "cardinal",
    faqs: [
      {
        q: "Can we put a prospect's logo and name in the demo?",
        a: "Yes. Personalization tokens can swap the logo in frame, the company name in the narration, and the CTA destination — generated per link, so one master demo produces hundreds of personalized versions without you making them one at a time.",
      },
      {
        q: "Our product needs live data to be convincing. Does a recording work?",
        a: "For the first conversation, almost always — buyers at that stage want to understand the shape of the thing, not stress-test it. Interactive demos also accept typed input on fields you designate, which covers search and configuration flows convincingly. Save the live environment for the technical evaluation where it actually earns its cost.",
      },
    ],
  },

  {
    slug: "customer-education",
    nav: "Customer Education",
    persona: "For customer education and enablement",
    title: "An academy that keeps pace",
    titleAccent: "with your release notes",
    lede:
      "Every course you build starts decaying the day it publishes. The UI moves, the flow changes, and re-recording forty lessons is a quarter of work nobody has. So the academy quietly becomes wrong, and customers stop trusting it.",
    heroPreview: "guide",
    icon: "graduation",
    pains: [
      {
        title: "Content decay outpaces production",
        body: "You can record six lessons a month. The product changes twelve things a month. The gap only ever widens.",
      },
      {
        title: "Video and docs drift apart",
        body: "The video shows the old flow, the article shows the new one, and the customer trusts neither after they contradict each other once.",
      },
      {
        title: "Localization never happens",
        body: "Forty lessons in eight languages is three hundred and twenty assets. It is not that the team said no — it is that nobody could ever say yes.",
      },
    ],
    plays: [
      {
        icon: "doc",
        title: "Video and article from one take",
        body:
          "Every lesson produces both, generated together, so they can never contradict each other. Learners who prefer to read get the same content as learners who prefer to watch.",
        preview: "guide",
      },
      {
        icon: "refresh",
        title: "Fix a step, not a lesson",
        body:
          "When a screen changes, re-record that one step. The video, the article, the GIFs and every language rebuild around it. A UI refresh becomes an afternoon, not a quarter.",
      },
      {
        icon: "globe",
        title: "The whole curriculum, localized",
        body:
          "Course, lesson, article and captions in thirty-four languages, with staleness tracked per language so you know what needs re-approval after a change.",
        preview: "localization",
      },
      {
        icon: "chart",
        title: "See where learners actually get stuck",
        body:
          "Per-second retention across a course shows you the lesson everyone abandons and the exact step where they do it. That is a product insight as much as a content one.",
        preview: "analytics",
      },
    ],
    outcomes: capabilityFacts,
    workflow: [
      { step: "01", title: "Record the curriculum", body: "One session per lesson, narrated naturally by whoever knows the feature." },
      { step: "02", title: "Generate both formats", body: "Video lesson and written article produced together from the same source." },
      { step: "03", title: "Publish everywhere", body: "Hosted academy, your LMS, the help center, and in-product at the moment of need." },
      { step: "04", title: "Keep it honest", body: "Staleness flags on every asset the product change touched, with one-click rebuild." },
    ],
    quoteSlug: "tessera",
    faqs: [
      {
        q: "Does it work with our LMS?",
        a: "Yes — SCORM and xAPI packages export from any course, and videos can be served by direct link or embed. Teams using Docebo, Skilljar, Thought Industries and WorkRamp typically publish straight from DemoRiff into the LMS via the API.",
      },
      {
        q: "Can learners search inside the videos?",
        a: "Yes. Everything is transcribed and semantically indexed, so a search for “change a shipment after it has departed” finds the lesson and jumps to the timestamp where it is explained — not just the lesson title.",
      },
    ],
  },

  {
    slug: "support",
    nav: "Customer Support",
    persona: "For support leaders",
    title: "Answer it once,",
    titleAccent: "in video, forever",
    lede:
      "Forty percent of your ticket volume is the same eleven questions. Your agents answer them again every day, in slightly different words, in text, about a workflow that would take ninety seconds to show.",
    heroPreview: "guide",
    icon: "lifebuoy",
    pains: [
      {
        title: "The same tickets, forever",
        body: "Your macros are text. Text is a poor medium for explaining a sequence of clicks, which is why the follow-up question arrives ten minutes later.",
      },
      {
        title: "Help articles nobody trusts",
        body: "The screenshots are from two releases ago. Customers notice, stop reading, and open a ticket instead — which is exactly what the article was meant to prevent.",
      },
      {
        title: "Agents cannot make video",
        body: "A good video answer takes a good agent thirty minutes they do not have, so it happens for the escalation and never for the routine case.",
      },
    ],
    plays: [
      {
        icon: "record",
        title: "Agents record, the system polishes",
        body:
          "An agent records ninety seconds at their desk. It comes back branded, tightened, captioned and with a written version attached. Thirty minutes becomes three.",
        preview: "recorder",
      },
      {
        icon: "doc",
        title: "Rebuild the help center from recordings",
        body:
          "Every article gets current screenshots, a video at the top, and a step-by-step body — and re-renders when the flow changes instead of quietly going wrong.",
        preview: "guide",
      },
      {
        icon: "lifebuoy",
        title: "Serve the answer in the messenger",
        body:
          "Attach walkthroughs to Zendesk macros and Intercom answers so the deflection happens before the ticket is created, not after an agent has typed for six minutes.",
      },
      {
        icon: "globe",
        title: "Support every language you sell in",
        body:
          "Your German customers get German video answers without a German-speaking video producer. Thirty-four languages from the same source.",
        preview: "localization",
      },
    ],
    outcomes: capabilityFacts,
    workflow: [
      { step: "01", title: "Mine your top tickets", body: "Start with the eleven questions that make up forty percent of volume." },
      { step: "02", title: "Record the answers", body: "An agent who knows the answer records it once, naturally, at their desk." },
      { step: "03", title: "Publish into the flow", body: "Macros, help center, messenger and the in-product help widget." },
      { step: "04", title: "Watch deflection", body: "Track which answers close tickets and which ones generate a follow-up question." },
    ],
    quoteSlug: "brightline",
    faqs: [
      {
        q: "Will agents actually use it?",
        a: "The honest answer is: only if it is faster than typing. That is the bar we designed to. An agent hits record, talks for ninety seconds, and stops — no editing, no branding decisions, no export settings. Adoption in support teams tends to be higher than in marketing teams for exactly that reason.",
      },
      {
        q: "Can we keep customer data out of the recordings?",
        a: "Yes, and for support this is the critical feature. Workspace masking policies detect and blur emails, names, account numbers and payment details automatically, and admins can set rules agents cannot disable. Masking happens at capture, so the values never reach storage.",
      },
    ],
  },

  {
    slug: "founders",
    nav: "Founders & Seed Teams",
    persona: "For founders and early teams",
    title: "Look like a category leader",
    titleAccent: "before you hire one",
    lede:
      "Your product is good. Your demo is a fifteen-minute unlisted video where you say “um” a lot and apologise for the test data. Investors, early customers and your first hires are all judging the product through it.",
    heroPreview: "video",
    icon: "rocket",
    pains: [
      {
        title: "You are the marketing team",
        body: "And the sales team, and support. The demo video is competing for your attention with shipping the thing it demonstrates.",
      },
      {
        title: "Production quality signals company quality",
        body: "Unfairly, but reliably. A buyer who cannot evaluate your architecture will absolutely evaluate whether your demo looks like it came from a real company.",
      },
      {
        title: "You cannot afford to get it wrong twice",
        body: "Every re-record is a day you did not spend on the product, so the first version tends to be the only version — for much longer than it should be.",
      },
    ],
    plays: [
      {
        icon: "play",
        title: "A homepage demo that earns the fold",
        body:
          "Ninety seconds, directed, branded, captioned. The single asset that does the most work on a seed-stage site, produced in an afternoon instead of outsourced for four thousand dollars.",
        preview: "video",
      },
      {
        icon: "avatar",
        title: "Be on camera without being on camera",
        body:
          "Record the narration once and let a presenter carry it, or clone your voice so you can fix a line six weeks later without re-shooting your energy from a good day.",
        preview: "avatar",
      },
      {
        icon: "cursor",
        title: "Let investors and buyers self-serve",
        body:
          "An interactive tour on the site means a partner can understand the product at 11pm without booking time with you, which is when most of them actually look.",
        preview: "interactive",
      },
      {
        icon: "doc",
        title: "Documentation you did not have time to write",
        body:
          "Every recording also produces the help article. Your docs exist from day one, which makes your first ten customers dramatically cheaper to support.",
        preview: "guide",
      },
    ],
    outcomes: capabilityFacts,
    workflow: [
      { step: "01", title: "Record the pitch you already give", body: "The one you have given forty times on calls. You know it cold." },
      { step: "02", title: "Let it clean up the take", body: "Fillers gone, pacing fixed, zooms on the moments that matter." },
      { step: "03", title: "Apply a brand you can define in ten minutes", body: "Two colours, a logo and a font. It looks deliberate from the first video." },
      { step: "04", title: "Put it everywhere", body: "Homepage, pitch deck link, investor follow-up, first-customer onboarding." },
    ],
    quoteSlug: "foldr",
    faqs: [
      {
        q: "We have no brand yet. What happens?",
        a: "You get a clean, neutral default that looks intentional rather than absent — and when you do have a brand, one kit change re-renders everything you made before it. Plenty of teams start with the default and never notice the moment they outgrew it.",
      },
      {
        q: "Is the free plan genuinely usable?",
        a: "Ten rendered video minutes a month is one homepage demo and a couple of feature clips, with every AI feature unlocked and unlimited written guides. Exports carry a small mark. It is a real plan, not a teaser — several companies in our customer list shipped their first demo on it.",
      },
    ],
  },

  {
    slug: "enterprise",
    nav: "Enterprise & IT",
    persona: "For IT, security and procurement",
    title: "The AI video tool",
    titleAccent: "your security team approves",
    lede:
      "Most tools in this category were built for creators and retrofitted for companies. DemoRiff was built the other way round: zero training on customer data, regional processing, private rendering, SSO, SCIM, and an audit trail that satisfies a real review.",
    heroPreview: "recorder",
    icon: "shield",
    pains: [
      {
        title: "Recordings contain your customers",
        body: "A screen recording of your product is, by definition, a recording of real data. Most video tools treat that file the way they treat a holiday video.",
      },
      {
        title: "Shadow IT has already started",
        body: "Three teams are already using three different AI video tools on personal accounts, with your customer data in them, outside your DLP.",
      },
      {
        title: "Model training terms are usually vague",
        body: "“We may use your content to improve our services” is not a sentence your DPO will sign off on, and it is in most of these contracts.",
      },
    ],
    plays: [
      {
        icon: "brain",
        title: "Zero training, stated plainly",
        body:
          "Your media, transcripts and derived assets are never used to train any model — ours or a subprocessor's. It is in the DPA, not just the marketing page, and it applies on every plan including free.",
      },
      {
        icon: "globe",
        title: "Choose where the frames are processed",
        body:
          "Pin capture, processing and storage to the US, EU or Australia. On Enterprise, render inside your own cloud account so the media never leaves your perimeter.",
      },
      {
        icon: "key",
        title: "Identity that fits your stack",
        body:
          "SAML 2.0 and OIDC SSO, SCIM provisioning and deprovisioning, enforced domain capture so personal accounts get absorbed, and role-based access down to the workspace.",
      },
      {
        icon: "list",
        title: "An audit trail that answers questions",
        body:
          "Every view, export, share, permission change and masking rule, streamable to your SIEM. When someone asks who shared the demo containing a customer's name, there is an answer.",
      },
    ],
    outcomes: capabilityFacts,
    workflow: [
      { step: "01", title: "Security review", body: "SOC 2 report, pen test summary, architecture diagram and a completed CAIQ on request." },
      { step: "02", title: "Contracting", body: "Your MSA or ours, a DPA with SCCs, and a subprocessor list with change notification." },
      { step: "03", title: "Deployment", body: "SSO, SCIM, domain capture, masking policies and region pinning configured before rollout." },
      { step: "04", title: "Consolidation", body: "Absorb the shadow-IT accounts, migrate their libraries, and turn on the audit stream." },
    ],
    quoteSlug: "halcyon",
    faqs: [
      {
        q: "Which subprocessors touch our media?",
        a: "The current list is published at demoriff.com/legal/subprocessors with the function each one performs and the region it operates in. Material changes are notified thirty days in advance, and Enterprise customers can object. Models used for transcription, translation and synthesis run under zero-retention agreements.",
      },
      {
        q: "Can we run rendering inside our own cloud?",
        a: "Yes, on Enterprise. We deploy the render workers into your AWS, GCP or Azure account, so media is processed and stored entirely within your perimeter. The control plane stays with us; the frames never leave you.",
      },
      {
        q: "How do we get the three teams already using other tools onto this?",
        a: "Enforced domain capture converts existing personal accounts on your domain into managed ones at next login, and bulk import brings their libraries across with transcripts intact. Most consolidations take under a week of elapsed time, and the migration is the easiest part of the conversation.",
      },
    ],
  },
];

export function getSolutionPage(slug: string) {
  return solutionPages.find((s) => s.slug === slug);
}
