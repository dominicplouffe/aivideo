import type { IconName } from "@/components/ui/Icon";

export interface CompareRowData {
  label: string;
  us: string | true | false;
  them: string | true | false;
  note?: string;
}

export interface ComparePage {
  slug: string;
  competitor: string;
  category: string;
  /** Honest summary of who the competitor genuinely serves better. */
  theyWin: string;
  headline: string;
  lede: string;
  positioning: string;
  differences: { title: string; body: string; icon: IconName }[];
  matrix: { group: string; rows: CompareRowData[] }[];
  switchNote: string;
  faqs: { q: string; a: string }[];
}

export const comparePages: ComparePage[] = [
  {
    slug: "trupeer",
    competitor: "Trupeer",
    category: "AI screen recording → video + docs",
    theyWin:
      "Trupeer is a genuinely good tool in the same category, and if all you need is a screen recording turned into a narrated video plus a written guide, it will do that well and cheaply.",
    headline: "Same starting point. More places to take it.",
    lede:
      "Trupeer and DemoRiff both start from a screen recording and both produce a polished video plus documentation. The difference shows up after that first output: what else the recording can become, how much control you get over the edit, and what happens when your library reaches two hundred videos.",
    positioning:
      "If you are comparing these two, you have already decided that recording-to-video is the right workflow. The question is whether you also need interactive demos, a real editing surface underneath the automation, and the governance to run this across a team rather than a person.",
    differences: [
      {
        icon: "cursor",
        title: "Interactive demos from the same recording",
        body:
          "DemoRiff captures the DOM during recording, so the same take also becomes a clickable product tour you can embed on a pricing page. Trupeer produces video and documentation; an interactive tour means buying a second tool and recording the flow again.",
      },
      {
        icon: "layers",
        title: "A real timeline under the automation",
        body:
          "Both tools automate the edit. DemoRiff exposes every automated decision as an editable object — zoom keyframes, cut points, callouts, b-roll — so when the automation gets something wrong you fix it in place rather than re-recording.",
      },
      {
        icon: "sparkles",
        title: "Autonomous generation on the high plans",
        body:
          "Riff Agent reads your changelog, drives your staging environment, records the flow and returns a finished cut for review. It is the difference between a faster editor and not needing to record at all for routine release content.",
      },
      {
        icon: "shield",
        title: "Built for a security review",
        body:
          "Regional processing, private rendering in your own cloud, SCIM, audit-log streaming and workspace-enforced masking policies. Relevant when the recordings contain customer data and your DPO has opinions.",
      },
    ],
    matrix: [
      {
        group: "Production",
        rows: [
          { label: "Screen recording with AI editing", us: true, them: true },
          { label: "Automatic zoom on interactions", us: true, them: true },
          { label: "AI voiceover and voice cloning", us: "260 voices, unlimited clones", them: "100+ voices, clones on higher tiers" },
          { label: "AI presenters", us: "180 stock + custom", them: "Available" },
          { label: "Editable timeline beneath the automation", us: true, them: false, note: "Edits are largely re-run rather than adjusted" },
          { label: "Chat-driven co-editor", us: true, them: false },
          { label: "Autonomous demo generation", us: "Riff Agent (Scale+)", them: false },
        ],
      },
      {
        group: "Output formats",
        rows: [
          { label: "Polished demo video", us: true, them: true },
          { label: "Step-by-step written guide", us: "Unlimited, all plans", them: "Unlimited" },
          { label: "Interactive click-through demo", us: true, them: false },
          { label: "Auto-generated social clips", us: true, them: false },
          { label: "Localization", us: "34 languages, never re-billed", them: "65+ languages" },
        ],
      },
      {
        group: "Scale & governance",
        rows: [
          { label: "Brand kit", us: "Unlimited kits, lockable", them: "Brand kit on paid tiers" },
          { label: "Approval workflows", us: true, them: false },
          { label: "SAML SSO", us: true, them: "Enterprise" },
          { label: "SCIM provisioning", us: true, them: false },
          { label: "Regional data processing", us: "US / EU / AU", them: false },
          { label: "Private rendering in your cloud", us: "Enterprise", them: false },
          { label: "Audit log streaming", us: true, them: false },
        ],
      },
    ],
    switchNote:
      "Bulk import brings your existing Trupeer library across with transcripts intact, and the migration team will do it for you on Team and above.",
    faqs: [
      {
        q: "Is DemoRiff more expensive?",
        a: "Differently. Our Bring-your-own-keys plan is $20 a month for unlimited projects if you hold your own vendor accounts, which no tool in this category offers; Studio is $99 a month for ten projects with everything included. If you genuinely only need video plus docs for one person, the honest answer is that either tool will serve you and you should pick on the output quality you prefer.",
      },
      {
        q: "Can I try both on the same recording?",
        a: "Yes, and we would encourage it. Record one flow, run it through both, and compare the cut, the voice and the guide. Our free plan gives you ten rendered minutes with every feature unlocked specifically so this comparison is possible without a sales call.",
      },
    ],
  },

  {
    slug: "descript",
    competitor: "Descript",
    category: "Text-based video and podcast editing",
    theyWin:
      "Descript is an excellent general-purpose editor and the best tool in this comparison for podcasts, interviews, multi-person recordings and long-form content. If your primary output is a podcast or a talking-head show, use Descript.",
    headline: "Descript edits any video. DemoRiff produces product demos.",
    lede:
      "Both tools let you edit video by editing a transcript — Descript invented the idea and does it exceptionally well across every kind of content. DemoRiff applies it to one job: turning a product screen recording into the set of assets a software company needs.",
    positioning:
      "The distinction is specialisation. Descript is a workshop with excellent tools; you still make the editing decisions. DemoRiff is a production line for one product category, and it makes those decisions for you because it knows what a product demo is supposed to look like.",
    differences: [
      {
        icon: "cursor",
        title: "It knows what you clicked",
        body:
          "DemoRiff's recorder captures interaction data alongside pixels, so zooms frame the actual button and the written guide can name it. Descript sees a video file, which means zooms are manual and documentation is not part of the output.",
      },
      {
        icon: "layers",
        title: "Four assets, not one",
        body:
          "The same recording produces a video, an interactive click-through demo, a step-by-step article with annotated screenshots, and vertical social cuts. Descript produces an excellent video and clips from it.",
      },
      {
        icon: "globe",
        title: "Localization that is not billed twice",
        body:
          "Thirty-four languages with lip-sync, and translated versions never consume additional video minutes. Descript's translation is capable but consumes AI credits per use, which changes the maths at eleven languages.",
      },
      {
        icon: "shield",
        title: "Redaction designed for customer data",
        body:
          "Automatic in-frame masking of emails, names, keys and card numbers, with workspace policies that creators cannot disable. A general editor has no reason to build this; a product-demo tool has no excuse not to.",
      },
    ],
    matrix: [
      {
        group: "Editing",
        rows: [
          { label: "Transcript-based editing", us: true, them: true },
          { label: "Multitrack timeline", us: true, them: "More powerful for complex edits" },
          { label: "Filler-word removal", us: true, them: true },
          { label: "Studio-grade audio restoration", us: true, them: "Studio Sound" },
          { label: "Voice cloning", us: "Unlimited on Scale", them: "Overdub" },
          { label: "Eye-contact correction", us: true, them: true },
          { label: "Multi-person podcast editing", us: "Supported", them: "Best in class" },
        ],
      },
      {
        group: "Product-demo specific",
        rows: [
          { label: "Interaction-aware screen recorder", us: true, them: false },
          { label: "Automatic zoom keyframed to clicks", us: true, them: false, note: "Manual in Descript" },
          { label: "Step-by-step guide generation", us: true, them: false },
          { label: "Interactive click-through demo", us: true, them: false },
          { label: "Automatic sensitive-data masking", us: true, them: false },
          { label: "Brand kit enforced across a team", us: true, them: "Templates" },
        ],
      },
      {
        group: "Distribution",
        rows: [
          { label: "Hosted share pages with CTAs", us: true, them: "Basic sharing" },
          { label: "Per-second retention analytics", us: true, them: false },
          { label: "CRM engagement sync", us: true, them: false },
          { label: "Embeddable interactive demos", us: true, them: false },
        ],
      },
    ],
    switchNote:
      "Plenty of teams run both: Descript for the podcast and the webinar edit, DemoRiff for the product library. Import works in both directions.",
    faqs: [
      {
        q: "We already pay for Descript. Do we need both?",
        a: "It depends on what you produce. If product demos, help content and launch videos are a meaningful share of your output, the specialisation pays for itself quickly — mostly in the documentation and interactive demos you get for free from recordings you were making anyway. If you mainly make podcasts and long-form video, stay with Descript.",
      },
      {
        q: "Is DemoRiff's editor as powerful?",
        a: "For general video editing, no, and we are not trying to be. Descript has more compositing control, better multi-person workflows and a deeper effects stack. DemoRiff is deeper in exactly one place: understanding software interfaces well enough to edit a demo without being told how.",
      },
    ],
  },

  {
    slug: "creatify",
    competitor: "Creatify",
    category: "AI avatar ad generation",
    theyWin:
      "Creatify is built for performance marketing — UGC-style ad creative, batch variant generation from a product URL, and avatars that look native to a social feed. For a DTC brand testing fifty ad variants a week, it is the right tool and DemoRiff is not.",
    headline: "Creatify makes ads. DemoRiff makes demos.",
    lede:
      "Both tools use AI avatars and generated voice. The similarity ends there. Creatify optimises for volume of short-form ad creative; DemoRiff optimises for explaining software accurately to someone deciding whether to buy it.",
    positioning:
      "If your job is to find a winning creative among fifty variants, Creatify's batch mode and URL-to-video pipeline are purpose-built for it. If your job is to make a buyer understand a multi-step workflow inside your product, a talking avatar over stock footage is the wrong shape of asset entirely.",
    differences: [
      {
        icon: "record",
        title: "It starts from your product, not a product page",
        body:
          "Creatify scrapes a URL and generates an ad. DemoRiff records your actual interface and builds the demo around what happens in it. For software, the interface is the story and a scraped landing page cannot show it.",
      },
      {
        icon: "doc",
        title: "Documentation comes out the other end",
        body:
          "Every recording also produces a written walkthrough with annotated screenshots. Ad tools have no reason to produce documentation; software companies need it more than they need another variant.",
      },
      {
        icon: "cursor",
        title: "Interactive demos for the consideration stage",
        body:
          "A B2B software buyer wants to click around before booking a call. An interactive tour serves that; a fifteen-second avatar ad does not, and neither does a video.",
      },
      {
        icon: "chart",
        title: "Analytics aimed at pipeline, not ROAS",
        body:
          "Per-second retention against the transcript, account-level viewer identification, and CRM sync. Creatify's analytics are designed for ad performance, which is a different question.",
      },
    ],
    matrix: [
      {
        group: "Generation",
        rows: [
          { label: "AI avatars", us: "180 licensed + custom", them: "1,500+ avatars" },
          { label: "AI voices", us: "260, tuned for narration", them: "140+, tuned for ad reads" },
          { label: "URL-to-video ad generation", us: false, them: true, note: "Creatify's core strength" },
          { label: "Batch ad variant generation", us: false, them: true },
          { label: "Screen recording of your product", us: true, them: false },
          { label: "Interaction-aware auto-editing", us: true, them: false },
        ],
      },
      {
        group: "Output",
        rows: [
          { label: "Short-form social ad creative", us: "Clips from demos", them: "Purpose-built" },
          { label: "Long-form product demo", us: true, them: false },
          { label: "Step-by-step documentation", us: true, them: false },
          { label: "Interactive product tour", us: true, them: false },
          { label: "Help-center publishing", us: true, them: false },
        ],
      },
      {
        group: "Fit",
        rows: [
          { label: "Best for DTC performance marketing", us: false, them: true },
          { label: "Best for B2B software demos", us: true, them: false },
          { label: "Best for customer education", us: true, them: false },
          { label: "Best for ad creative volume testing", us: false, them: true },
        ],
      },
    ],
    switchNote:
      "These tools do not really compete. Several of our customers use Creatify for paid social and DemoRiff for everything on the product side.",
    faqs: [
      {
        q: "Can DemoRiff make social ads?",
        a: "It generates vertical clips from your demos with animated captions and subject-tracked reframing, which works well for organic social and retargeting where authenticity beats polish. For cold-traffic ad creative at volume, a purpose-built ad tool will serve you better and we will tell you so.",
      },
    ],
  },

  {
    slug: "loom",
    competitor: "Loom",
    category: "Async video messaging",
    theyWin:
      "Loom is the best tool in the world for sending a colleague a two-minute video instead of writing four paragraphs. Nothing here suggests you should stop using it for that.",
    headline: "Loom is for messages. DemoRiff is for publishing.",
    lede:
      "The question is not which is better — it is which job you are doing. A Loom is a message: fast, disposable, internal, and perfect at being exactly that. A demo on your pricing page is a published asset that will be watched ten thousand times by people deciding whether to trust you.",
    positioning:
      "Most teams arrive here because a Loom ended up somewhere customer-facing and it showed. The fix is not to make Looms better; it is to route the customer-facing ones through a production step.",
    differences: [
      {
        icon: "wand",
        title: "Production, not just capture",
        body:
          "Loom gives you the take. DemoRiff directs it: fillers cut, pacing tightened, zooms keyframed to clicks, voice cleaned or replaced, brand applied. The difference between a recording and a video.",
      },
      {
        icon: "doc",
        title: "The written version, automatically",
        body:
          "Every recording also produces a step-by-step article with annotated screenshots. Loom produces a transcript, which is not the same thing as documentation.",
      },
      {
        icon: "globe",
        title: "Every market, not just English",
        body:
          "Thirty-four languages with matched lip movement and localized guides. Loom offers captions and translated captions, which is a different promise.",
      },
      {
        icon: "palette",
        title: "It looks like your company made it",
        body:
          "Enforced brand kits mean every video from every person carries the same intro, type, cursor and outro. Consistency is most of what separates in-house video from professional video.",
      },
    ],
    matrix: [
      {
        group: "Capture and share",
        rows: [
          { label: "Fast screen + camera recording", us: true, them: "Best in class for speed" },
          { label: "Instant share link", us: true, them: true },
          { label: "Viewer comments and reactions", us: true, them: true },
          { label: "Internal async messaging workflow", us: "Supported", them: "Purpose-built" },
        ],
      },
      {
        group: "Production",
        rows: [
          { label: "Automatic filler and silence removal", us: true, them: "Basic" },
          { label: "Zoom keyframed to interactions", us: true, them: false },
          { label: "AI voiceover replacing your audio", us: true, them: false },
          { label: "AI presenters", us: true, them: false },
          { label: "Enforced brand kit", us: true, them: "Basic branding" },
          { label: "Audio restoration", us: true, them: false },
        ],
      },
      {
        group: "Publishing",
        rows: [
          { label: "Step-by-step guide generation", us: true, them: false },
          { label: "Interactive click-through demo", us: true, them: false },
          { label: "Localization with lip-sync", us: "34 languages", them: "Translated captions" },
          { label: "Per-second retention analytics", us: true, them: "View analytics" },
          { label: "CRM engagement sync", us: true, them: "Limited" },
          { label: "Automatic sensitive-data masking", us: true, them: false },
        ],
      },
    ],
    switchNote:
      "Import your Loom library in bulk — transcripts and titles come across, and the whole archive becomes searchable and re-brandable.",
    faqs: [
      {
        q: "Should we replace Loom entirely?",
        a: "No, and we would not recommend it. Keep Loom for internal async messages where speed is the entire point. Route the customer-facing recordings — demos, help content, launch videos, sales leave-behinds — through DemoRiff. Most of our customers run both, and the boundary is simply whether a customer will see it.",
      },
      {
        q: "Can we bring our old Looms across?",
        a: "Yes, in bulk via the Loom connector. They land transcribed, indexed and searchable, and you can re-cut and re-brand any of them without re-recording. Teams routinely bring two years of archive across in an afternoon.",
      },
    ],
  },

  {
    slug: "arcade",
    competitor: "Arcade",
    category: "Interactive demo software",
    theyWin:
      "Arcade is fast, well-designed and produces excellent interactive demos with very little effort. If an embedded click-through demo is the only asset you need, it is a strong, focused choice.",
    headline: "Arcade makes the tour. DemoRiff makes the tour, the video and the guide.",
    lede:
      "Interactive demos are one of four things a product recording should produce. Arcade does that one thing well. DemoRiff treats the recording as a source and generates the interactive tour alongside a directed video, a written walkthrough and social cuts — all from the same capture, all staying in sync.",
    positioning:
      "The practical question is how many recordings you want to make. With a single-format tool, the video team records separately from the docs team, who record separately from whoever owns the interactive demo — and three months later those three assets describe three different versions of your product.",
    differences: [
      {
        icon: "layers",
        title: "One capture, four assets that cannot drift",
        body:
          "Because the video, tour and guide are derived from the same recording, updating the recording updates all of them. Separate tools mean separate updates, and in practice that means two of the three go stale.",
      },
      {
        icon: "play",
        title: "A real video, not a video-ish demo",
        body:
          "Arcade's video output is a capable secondary feature. DemoRiff's video pipeline is the primary one: directed zooms, studio voice, presenters, music, captions and 4K render.",
      },
      {
        icon: "doc",
        title: "Documentation as a first-class output",
        body:
          "Step-by-step articles with annotated screenshots, published to your help center and localized. Interactive-demo tools do not produce this, and support teams need it badly.",
      },
      {
        icon: "globe",
        title: "Localization across every format",
        body:
          "Tour tooltips, video narration, captions and the written guide all localize together into thirty-four languages, without being re-billed per language.",
      },
    ],
    matrix: [
      {
        group: "Interactive demos",
        rows: [
          { label: "Screenshot-based demos", us: true, them: true },
          { label: "HTML / DOM-based demos", us: true, them: true },
          { label: "Branching multi-path tours", us: true, them: true },
          { label: "Inline lead capture", us: true, them: true },
          { label: "Per-step analytics", us: true, them: true },
        ],
      },
      {
        group: "Other formats from the same recording",
        rows: [
          { label: "Directed 4K demo video", us: true, them: "Basic video export" },
          { label: "AI presenters", us: true, them: false },
          { label: "Voice cloning", us: true, them: "AI narration" },
          { label: "Step-by-step written guide", us: true, them: false },
          { label: "Vertical social clips", us: true, them: false },
          { label: "Help-center publishing", us: true, them: false },
        ],
      },
      {
        group: "Enterprise",
        rows: [
          { label: "SAML SSO", us: true, them: true },
          { label: "SCIM provisioning", us: true, them: "Enterprise" },
          { label: "Regional processing", us: "US / EU / AU", them: false },
          { label: "Private rendering in your cloud", us: "Enterprise", them: false },
          { label: "Audit log streaming", us: true, them: false },
        ],
      },
    ],
    switchNote:
      "Existing Arcade demos can be rebuilt from a fresh recording in minutes, and the resulting tour is generated alongside the video and guide rather than instead of them.",
    faqs: [
      {
        q: "Is your interactive demo as good as Arcade's?",
        a: "On the core experience — capture, hotspots, tooltips, branching, embedding, analytics — they are closely comparable, and Arcade's editor is very good. Where we differ is that the tour is one output of a pipeline rather than the whole product, so it is accompanied by a video and a guide built from the same source.",
      },
    ],
  },

  {
    slug: "scribe",
    competitor: "Scribe",
    category: "Step-by-step process documentation",
    theyWin:
      "Scribe is excellent at what it does: capture a process, get a clean written guide with screenshots, share it. For internal SOPs and process documentation where video would be overkill, it is efficient and well-liked.",
    headline: "Scribe writes the guide. DemoRiff writes it and films it.",
    lede:
      "Written guides are half the answer. Some people scan, some people watch, and most B2B buying committees contain both. DemoRiff generates the same step-by-step article Scribe would — and a directed video and an interactive tour from the identical capture.",
    positioning:
      "If your need is purely internal process documentation, Scribe is a reasonable and inexpensive answer. If any of that content is customer-facing, the written guide alone leaves the most persuasive format on the table.",
    differences: [
      {
        icon: "play",
        title: "Video from the same capture",
        body:
          "A directed, branded, narrated video generated alongside the article. Not a slideshow of screenshots — an actual cut with zooms, voice and pacing.",
      },
      {
        icon: "cursor",
        title: "An interactive version for the website",
        body:
          "The same recording becomes a clickable tour you can embed on a pricing page. A static guide cannot do that job.",
      },
      {
        icon: "globe",
        title: "Localization across all formats",
        body:
          "Guides, video narration and tour tooltips localize together into thirty-four languages, with staleness tracked per language.",
      },
      {
        icon: "palette",
        title: "Brand control worth having",
        body:
          "Guides inherit a real brand system — type, colour, callout style, screenshot treatment — so they look like your documentation rather than a tool's export.",
      },
    ],
    matrix: [
      {
        group: "Documentation",
        rows: [
          { label: "Automatic step capture with screenshots", us: true, them: true },
          { label: "Editable steps and annotations", us: true, them: true },
          { label: "Sensitive-data redaction", us: "Automatic + custom rules", them: "Manual + auto-redact" },
          { label: "Combine guides into longer documents", us: true, them: "Pages" },
          { label: "Animated GIFs per step", us: true, them: false },
          { label: "Export to Markdown / HTML / PDF", us: true, them: true },
        ],
      },
      {
        group: "Beyond documentation",
        rows: [
          { label: "Directed video from the same capture", us: true, them: false },
          { label: "AI voiceover", us: true, them: false },
          { label: "Interactive click-through demo", us: true, them: false },
          { label: "Social clips", us: true, them: false },
          { label: "Per-second engagement analytics", us: true, them: "View counts" },
        ],
      },
      {
        group: "Publishing",
        rows: [
          { label: "Help-center integrations", us: "Zendesk, Intercom, HelpScout, Notion, Confluence", them: "Notion, Confluence, embed" },
          { label: "Hosted help center on your domain", us: true, them: false },
          { label: "Localization", us: "34 languages", them: "Limited" },
        ],
      },
    ],
    switchNote:
      "Guides created in Scribe can be imported as Markdown, and re-recording the flow once gives you the video and interactive versions alongside it.",
    faqs: [
      {
        q: "We only need internal SOPs. Is DemoRiff overkill?",
        a: "Possibly, and we would rather say so than sell you something. If nothing you document is customer-facing and nobody has asked for video, Scribe is cheaper and sufficient. The calculation changes the moment a guide needs to go on your help center, in a language you do not speak, with a video at the top.",
      },
    ],
  },
];

export function getComparePage(slug: string) {
  return comparePages.find((c) => c.slug === slug);
}
