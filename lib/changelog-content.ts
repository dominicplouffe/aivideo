export interface Release {
  version: string;
  date: string;
  title: string;
  summary: string;
  tag: "Major" | "Feature" | "Improvement" | "Fix";
  items: { kind: "new" | "improved" | "fixed"; text: string }[];
}

export const releases: Release[] = [
  {
    version: "2026.9",
    date: "2026-09-16",
    title: "Riff Agent, generally available",
    tag: "Major",
    summary:
      "Autonomous demo generation leaves beta. Describe the demo, or connect it to your release process, and the agent scripts it, records it against your staging environment and returns a finished cut for review.",
    items: [
      { kind: "new", text: "Riff Agent generally available on Scale and Enterprise, with Linear and GitHub release triggers." },
      { kind: "new", text: "Environment allowlists and scoped, rotatable credentials for agent sessions." },
      { kind: "new", text: "Agent run audit log: brief, every action taken, output, approver and timestamp." },
      { kind: "improved", text: "Agent outline approval now supports inline editing before recording starts." },
      { kind: "improved", text: "Self-correcting navigation handles slow-loading interfaces roughly 3× more reliably." },
      { kind: "fixed", text: "Agent sessions no longer stall when a target element is behind a lazy-loaded boundary." },
    ],
  },
  {
    version: "2026.8",
    date: "2026-08-28",
    title: "Branching interactive demos and mobile reconstruction",
    tag: "Feature",
    summary:
      "Interactive tours can now fork by persona, capture leads mid-flow, and reconstruct responsively down to 360px.",
    items: [
      { kind: "new", text: "Branching forks with per-path analytics and a visual path editor." },
      { kind: "new", text: "Inline lead capture with CRM field mapping to HubSpot and Salesforce." },
      { kind: "new", text: "Responsive DOM reconstruction for viewports down to 360px wide." },
      { kind: "improved", text: "Tour runtime reduced from 51 KB to 34 KB and moved fully async." },
      { kind: "improved", text: "Server-rendered tour text is now indexed by search engines within 48 hours." },
      { kind: "fixed", text: "Spotlight positions no longer drift on pages with sticky headers." },
    ],
  },
  {
    version: "2026.7",
    date: "2026-07-30",
    title: "Localization pinning and staleness tracking",
    tag: "Feature",
    summary:
      "Manual corrections in a language are now preserved across regeneration, and every locale shows its staleness against the source.",
    items: [
      { kind: "new", text: "Segment-level pinning preserves human corrections when the source changes." },
      { kind: "new", text: "Per-locale staleness dashboard with a diff of what changed upstream." },
      { kind: "new", text: "Bulk regeneration with one approval across an entire collection." },
      { kind: "improved", text: "Lip-sync quality on Japanese, Korean and Arabic materially improved." },
      { kind: "improved", text: "Localization throughput up 40%; 34 languages now complete in about 70 minutes." },
      { kind: "fixed", text: "Right-to-left caption alignment corrected for mixed-script sentences." },
    ],
  },
  {
    version: "2026.6",
    date: "2026-06-25",
    title: "Private rendering in your own cloud",
    tag: "Major",
    summary:
      "Enterprise customers can now deploy render workers into their own AWS, GCP or Azure account. Media never leaves your perimeter.",
    items: [
      { kind: "new", text: "Bring-your-own-cloud rendering for AWS, GCP and Azure with Terraform modules." },
      { kind: "new", text: "Audit log streaming to Splunk, Datadog, S3 and generic webhook sinks." },
      { kind: "new", text: "SCIM 2.0 provisioning, deprovisioning and group sync." },
      { kind: "improved", text: "Regional pinning now covers transcription and synthesis, not just storage." },
      { kind: "improved", text: "Enforced masking policies can no longer be bypassed by the desktop app." },
    ],
  },
  {
    version: "2026.5",
    date: "2026-05-21",
    title: "Studio rebuild: faster timeline, bound keyframes",
    tag: "Improvement",
    summary:
      "The Studio timeline was rewritten on a new renderer. Scrubbing a two-hour project is now smooth on a four-year-old laptop.",
    items: [
      { kind: "improved", text: "Timeline renderer rewritten; scrub latency reduced by 82% on long projects." },
      { kind: "new", text: "Keyframes can be bound to a transcript span so they re-time with every language." },
      { kind: "new", text: "Command palette (⌘K) across the whole Studio." },
      { kind: "improved", text: "Undo now restores frames exactly rather than re-deriving them." },
      { kind: "fixed", text: "Caption timing drift on projects longer than 40 minutes." },
      { kind: "fixed", text: "Voice preview occasionally played the previous selection." },
    ],
  },
  {
    version: "2026.4",
    date: "2026-04-16",
    title: "Voice cloning in every language",
    tag: "Feature",
    summary:
      "Your cloned voice now speaks all thirty-four supported languages while keeping your timbre.",
    items: [
      { kind: "new", text: "Cross-lingual voice cloning — your voice, any supported language." },
      { kind: "new", text: "Workspace pronunciation dictionary shared across every project and voice." },
      { kind: "new", text: "Per-span delivery direction: pace, emphasis, pitch and pause." },
      { kind: "improved", text: "Clone quality from a 30-second sample now matches the previous 4-minute tier." },
      { kind: "improved", text: "Consent records are now surfaced in workspace settings for every clone." },
    ],
  },
  {
    version: "2026.3",
    date: "2026-03-19",
    title: "Guides get a real editor",
    tag: "Feature",
    summary:
      "Generated step-by-step articles now open in a block editor with callouts, tables, tabs and per-step re-capture.",
    items: [
      { kind: "new", text: "Block editor for guides with callouts, tables, code blocks and tabs." },
      { kind: "new", text: "Re-capture a single step without re-recording the whole article." },
      { kind: "new", text: "Two-way sync with Zendesk, Intercom, HelpScout, Notion and Confluence." },
      { kind: "new", text: "Hosted help center on your own custom domain." },
      { kind: "improved", text: "Animated GIF generation for motion-dependent steps, under 2 MB each." },
    ],
  },
  {
    version: "2026.2",
    date: "2026-02-12",
    title: "Automatic sensitive-data masking",
    tag: "Major",
    summary:
      "Emails, names, card numbers, API keys and JWTs are now detected in-frame and masked before encoding.",
    items: [
      { kind: "new", text: "Built-in detectors for email, phone, card, IBAN, API key and JWT patterns." },
      { kind: "new", text: "Selector, region and regex masking rules." },
      { kind: "new", text: "Workspace-enforced policies that creators cannot disable." },
      { kind: "improved", text: "Masking now applies to transcripts, guides, screenshots and the search index." },
      { kind: "fixed", text: "Redaction no longer missed values that appeared for fewer than four frames." },
    ],
  },
];
