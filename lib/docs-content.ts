import type { Block } from "./content-blocks";
import type { IconName } from "@/components/ui/Icon";

export interface DocPage {
  slug: string;
  title: string;
  summary: string;
  body: Block[];
}

export interface DocSection {
  title: string;
  icon: IconName;
  pages: DocPage[];
}

export const docSections: DocSection[] = [
  {
    title: "Getting started",
    icon: "rocket",
    pages: [
      {
        slug: "quickstart",
        title: "Quickstart",
        summary: "From nothing to a published demo in about eleven minutes.",
        body: [
          { t: "p", text: "This guide takes you from a new account to a published, branded demo video with a written guide alongside it. Budget about eleven minutes, most of which is you reading a script out loud once." },
          { t: "h2", text: "1. Install the recorder" },
          { t: "p", text: "The browser extension covers most product demos and needs no admin privileges. The desktop apps add full-desktop capture and system audio on Windows." },
          { t: "ul", items: [
            "Chrome / Edge extension — install from the Chrome Web Store",
            "macOS 13+ — download the universal binary",
            "Windows 11 — download the installer",
          ]},
          { t: "h2", text: "2. Prepare your environment" },
          { t: "p", text: "Record against a staging environment with a demo tenant if you have one. If you are recording production, set a workspace masking policy first — see Masking policies." },
          { t: "callout", tone: "warn", title: "Before you press record", text: "Hide bookmarks, close other tabs, set your OS to do-not-disturb, and use default browser zoom. Each of these prevents a common re-take." },
          { t: "h2", text: "3. Record" },
          { t: "p", text: "Press record, wait three seconds, then walk through the flow talking the way you would to a colleague. Do not script it. If you fumble, pause for two seconds and say the sentence again from the start — the pipeline will use the clean take." },
          { t: "h2", text: "4. Review the script" },
          { t: "p", text: "Your recording opens in the Studio with the transcript already tightened. Read it, fix anything that reads oddly, and delete anything you do not need. Deleting a sentence deletes the footage with it." },
          { t: "h2", text: "5. Choose a voice and a brand kit" },
          { t: "p", text: "Audition a few voices on your actual script rather than a sample. Apply a brand kit if your workspace has one; if not, the default is clean and neutral." },
          { t: "h2", text: "6. Render and publish" },
          { t: "p", text: "A three-minute cut typically renders in under ninety seconds. When it finishes you get a share page, an embed snippet, the written guide and — on Team and above — an interactive tour." },
          { t: "callout", tone: "good", title: "What to do next", text: "Queue translations while you are here. They do not consume video minutes and they run in parallel, so publishing six languages costs you one click and about two minutes of waiting." },
        ],
      },
      {
        slug: "concepts",
        title: "Core concepts",
        summary: "Recordings, projects, renders, assets and how they relate.",
        body: [
          { t: "p", text: "Understanding five objects will make everything else in DemoRiff predictable." },
          { t: "h2", text: "Recording" },
          { t: "p", text: "The immutable source: video frames, separate audio tracks, and the interaction event log. Recordings are never modified — everything downstream is derived." },
          { t: "h2", text: "Project" },
          { t: "p", text: "The editing surface over one or more recordings. A project holds the transcript, the edit decisions, the keyframes, the brand kit selection and the voice. Changing a project does not change its recordings." },
          { t: "h2", text: "Render" },
          { t: "p", text: "A specific output produced from a project at a point in time: a video file, an interactive tour, a written guide, a set of clips. Renders are versioned; publishing a new render at the same share URL replaces what viewers see without changing the URL." },
          { t: "h2", text: "Asset" },
          { t: "p", text: "A published render with a distribution surface — a share page, an embed, a help-center article. Assets have analytics; renders do not." },
          { t: "h2", text: "Locale" },
          { t: "p", text: "A derived variant of a project in another language. Locales track staleness against their source project and can be pinned at segment level to preserve manual corrections." },
          { t: "table", head: ["Object", "Mutable", "Billed"], rows: [
            ["Recording", "No", "No — source footage is free"],
            ["Project", "Yes", "No"],
            ["Render (video)", "No", "Yes — by finished minutes"],
            ["Render (guide / tour / clips)", "No", "No"],
            ["Locale", "Yes", "No"],
          ]},
        ],
      },
    ],
  },
  {
    title: "Recording",
    icon: "record",
    pages: [
      {
        slug: "masking-policies",
        title: "Masking policies",
        summary: "Keeping customer data out of your recordings, enforced rather than remembered.",
        body: [
          { t: "p", text: "A screen recording of your product is a recording of your customers. Masking policies remove sensitive values before frames are encoded, so they never reach storage." },
          { t: "h2", text: "Rule types" },
          { t: "ul", items: [
            "Detector — built-in patterns for emails, phone numbers, card numbers, API keys, JWTs and IBANs.",
            "Selector — any DOM element matching a CSS selector. Best for known regions like a customer list.",
            "Region — a fixed rectangle of the frame, in percentage coordinates. Use when the layout is stable.",
            "Pattern — your own regular expression, applied to on-screen text via OCR and to the transcript.",
          ]},
          { t: "h2", text: "Workspace enforcement" },
          { t: "p", text: "On Team and above, an admin can mark a policy as enforced. Enforced policies apply to every recording in the workspace and cannot be disabled by the person recording." },
          { t: "callout", tone: "warn", title: "Masking applies to derived assets too", text: "A value masked in the video is also removed from the transcript, the generated guide, the screenshots and the search index. If you only blur the frames yourself, the transcript will still contain it." },
          { t: "h2", text: "Example policy" },
          { t: "code", lang: "json", code: `{
  "name": "Production safeguards",
  "enforced": true,
  "rules": [
    { "type": "detector", "detectors": ["email", "card", "api_key", "jwt"] },
    { "type": "selector", "selector": "[data-customer-name]", "style": "blur" },
    { "type": "region", "rect": [0, 0.12, 0.18, 0.88], "style": "pixelate" },
    { "type": "pattern", "regex": "ACC-[0-9]{8}", "style": "redact" }
  ]
}` },
        ],
      },
      {
        slug: "importing",
        title: "Importing existing video",
        summary: "Bringing Loom, Zoom and file libraries into the pipeline.",
        body: [
          { t: "p", text: "Imported video runs through the same pipeline as native recordings, with one difference: it has no interaction metadata, so click moments are inferred rather than known." },
          { t: "h2", text: "Supported sources" },
          { t: "ul", items: [
            "Direct connectors: Loom, Zoom cloud, Google Drive, Dropbox, Box, YouTube, Vimeo, S3",
            "File upload: MP4, MOV, WEBM, MKV, AVI up to 12 GB and 4 hours",
            "Audio only: M4A, WAV, MP3 — produces a written guide and an audio-led video",
          ]},
          { t: "h2", text: "What inference can and cannot do" },
          { t: "table", head: ["Signal", "Native recording", "Imported video"], rows: [
            ["Which element was clicked", "Known exactly", "Inferred from cursor dynamics"],
            ["Element label for guide text", "From accessibility tree", "From OCR of the frame"],
            ["View changes / chapters", "From route events", "From frame differencing"],
            ["Typed input", "Captured as intent", "Not available"],
            ["Zoom framing accuracy", "Element bounds", "Approximate region"],
          ]},
          { t: "callout", tone: "info", title: "Inferred keyframes are flagged", text: "The Studio marks every keyframe that came from inference so you can check them. In practice most are correct and a few need nudging." },
        ],
      },
    ],
  },
  {
    title: "Studio",
    icon: "wand",
    pages: [
      {
        slug: "transcript-editing",
        title: "Transcript editing",
        summary: "How text edits map to frame operations.",
        body: [
          { t: "p", text: "The transcript is aligned to the video at word level. Editing text is editing video." },
          { t: "h2", text: "Operations" },
          { t: "table", head: ["You do", "The pipeline does"], rows: [
            ["Delete a sentence", "Removes the frame range, snapping cut points to the nearest breath"],
            ["Reorder a paragraph", "Moves the corresponding segment, re-timing everything after it"],
            ["Correct a word", "Re-synthesises that span in the current voice and splices it in"],
            ["Insert a new sentence", "Generates the audio and holds the last frame or inserts b-roll"],
            ["Mark a span as emphasis", "Adjusts delivery and optionally adds an on-screen callout"],
          ]},
          { t: "h2", text: "Cut-point snapping" },
          { t: "p", text: "Cuts are never placed exactly at a word boundary — that produces audible clicks. The pipeline finds the nearest low-energy point within 180ms and crossfades room tone across the join." },
          { t: "h2", text: "Keyboard shortcuts" },
          { t: "table", head: ["Shortcut", "Action"], rows: [
            ["⌘/Ctrl + K", "Command palette"],
            ["⌘/Ctrl + D", "Delete selection and its frames"],
            ["⌘/Ctrl + Z", "Undo (restores frames exactly)"],
            ["Space", "Play / pause from the caret"],
            ["⌘/Ctrl + J", "Insert a zoom keyframe at the caret"],
            ["⌘/Ctrl + Enter", "Ask Riff about the selection"],
          ]},
        ],
      },
      {
        slug: "zoom-keyframes",
        title: "Zoom and camera keyframes",
        summary: "Overriding automatic direction when you disagree with it.",
        body: [
          { t: "p", text: "Every automatic zoom is a real, editable object on the timeline. Nothing the pipeline decided is locked." },
          { t: "h2", text: "Keyframe properties" },
          { t: "ul", items: [
            "Scale — 1.0 to 3.5×, capped by source resolution to avoid visible softness",
            "Anchor — the point the frame composes around, as a percentage of the source",
            "In / out easing — push, settle, cut, or hold",
            "Hold duration — or bind it to a transcript span so it follows the narration",
          ]},
          { t: "h2", text: "Binding a zoom to narration" },
          { t: "p", text: "The most useful override: select a span of the transcript and bind a keyframe to it. The zoom now holds exactly as long as that sentence takes to say, in every language, even though each language takes a different amount of time." },
          { t: "callout", tone: "info", title: "Suppression rules", text: "If you add a keyframe within 1.2 seconds of another, the pipeline will merge them rather than producing a visible double-push. Force both by setting easing to cut." },
        ],
      },
    ],
  },
  {
    title: "Publishing",
    icon: "share",
    pages: [
      {
        slug: "share-pages",
        title: "Share pages and embeds",
        summary: "Hosting, access control and embedding.",
        body: [
          { t: "h2", text: "Access modes" },
          { t: "table", head: ["Mode", "Behaviour", "Analytics identity"], rows: [
            ["Public", "Anyone with the link", "Anonymous, or CRM cookie if present"],
            ["Email gate", "Requires an email before a chosen step", "Identified by email"],
            ["Password", "Shared password", "Anonymous"],
            ["Domain restricted", "Only addresses at listed domains", "Identified"],
            ["Personalized link", "Unique per recipient", "Identified, tracks forwards"],
          ]},
          { t: "h2", text: "Embedding" },
          { t: "code", lang: "html", code: `<!-- Async, 34 KB, no layout shift -->
<div data-demoriff="asset_9f21c8" data-aspect="16:9"></div>
<script src="https://embed.demoriff.com/v1.js" async></script>` },
          { t: "p", text: "The embed reserves its aspect ratio before load, so it never causes cumulative layout shift. It respects prefers-reduced-motion and does not autoplay with sound under any circumstances." },
          { t: "h2", text: "Custom domains" },
          { t: "p", text: "On Team and above, point a CNAME at share.demoriff.com and add the domain in workspace settings. Certificates are issued automatically." },
        ],
      },
      {
        slug: "billing",
        title: "Billing and usage",
        summary: "What consumes minutes and what does not.",
        body: [
          { t: "p", text: "DemoRiff meters one thing: minutes of finished, rendered video. Everything derived from a video you already rendered is free." },
          { t: "h2", text: "What consumes minutes" },
          { t: "table", head: ["Action", "Cost"], rows: [
            ["Publish a 3-minute video", "3 minutes"],
            ["Re-render it after an edit, same period", "0"],
            ["Re-render it in a later period", "3 minutes"],
            ["Generate its written guide", "0"],
            ["Generate its interactive tour", "0"],
            ["Generate 6 social clips", "0"],
            ["Localize into 34 languages", "0"],
            ["Record 40 minutes of source footage", "0"],
          ]},
          { t: "h2", text: "Running out" },
          { t: "p", text: "You are notified at 80% of your allowance. At 100%, existing assets keep serving and guides keep publishing; new video renders pause. You can top up at $1.20 per minute or change plan, and we prorate the difference." },
          { t: "callout", tone: "good", title: "Rollover", text: "On annual plans, unused minutes roll over for up to three months. Monthly plans reset each period." },
        ],
      },
    ],
  },
];

export const apiReference = {
  intro: [
    { t: "p", text: "The DemoRiff API is a REST interface over the whole pipeline: upload a recording, create a project, render outputs, manage locales and read analytics. Everything the app does, the API can do." },
    { t: "h2", text: "Base URL and authentication" },
    { t: "p", text: "All requests go to https://api.demoriff.com and authenticate with a workspace API key as a bearer token. Keys are created in workspace settings, scoped to a role, and rotatable without downtime." },
    { t: "code", lang: "bash", code: `curl https://api.demoriff.com/v1/projects \\
  -H "Authorization: Bearer $DEMORIFF_API_KEY"` },
    { t: "h2", text: "Rate limits" },
    { t: "p", text: "1,000 requests per minute per workspace for read operations, 60 per minute for render creation. Limits are returned in X-RateLimit-* headers. Render jobs queue rather than fail when you exceed concurrency." },
    { t: "h2", text: "Idempotency" },
    { t: "p", text: "Pass an Idempotency-Key header on any POST. Replaying the same key within 24 hours returns the original response rather than creating a duplicate render." },
  ] as Block[],
  endpoints: [
    {
      method: "POST",
      path: "/v1/recordings",
      summary: "Create a recording and get a resumable upload URL.",
      body: `{
  "filename": "shipment-walkthrough.mp4",
  "bytes": 482103448,
  "source": "upload",
  "masking_policy": "pol_production_safeguards"
}`,
      response: `{
  "id": "rec_8f2c1a",
  "status": "awaiting_upload",
  "upload_url": "https://uploads.demoriff.com/…",
  "expires_at": "2026-09-20T18:00:00Z"
}`,
    },
    {
      method: "POST",
      path: "/v1/projects",
      summary: "Create an editable project from one or more recordings.",
      body: `{
  "recording_ids": ["rec_8f2c1a"],
  "name": "Create a shipment",
  "brand_kit": "kit_meridian_primary",
  "voice": "avery-warm-us",
  "auto_edit": true
}`,
      response: `{
  "id": "prj_4b91de",
  "status": "processing",
  "transcript_ready_at": null,
  "estimated_seconds": 44
}`,
    },
    {
      method: "POST",
      path: "/v1/renders",
      summary: "Render one or more outputs from a project.",
      body: `{
  "project_id": "prj_4b91de",
  "outputs": ["video", "guide", "interactive", "clips"],
  "video": { "resolution": "2160p", "fps": 60, "aspect": ["16:9", "9:16"] },
  "locales": ["en-US", "de-DE", "ja-JP"],
  "webhook_url": "https://hooks.meridian.app/demoriff"
}`,
      response: `{
  "id": "ren_c17a02",
  "status": "queued",
  "minutes_billed": 1.8,
  "outputs": { "video": "pending", "guide": "pending",
               "interactive": "pending", "clips": "pending" }
}`,
    },
    {
      method: "GET",
      path: "/v1/assets/{id}/analytics",
      summary: "Per-second retention, hotspot clicks and identified viewers.",
      body: null,
      response: `{
  "asset_id": "ast_9f21c8",
  "period": { "from": "2026-08-01", "to": "2026-09-01" },
  "views": 8412,
  "completion_rate": 0.71,
  "retention": [1.0, 0.98, 0.96, 0.95, 0.93, 0.90, …],
  "cta": { "impressions": 5960, "clicks": 1033, "rate": 0.173 },
  "accounts": [{ "domain": "cardinal.com", "viewers": 4, "max_depth": 0.94 }]
}`,
    },
    {
      method: "POST",
      path: "/v1/locales",
      summary: "Create or refresh a localized variant. Never consumes video minutes.",
      body: `{
  "project_id": "prj_4b91de",
  "locales": ["fr-FR", "es-ES", "pt-BR"],
  "lip_sync": true,
  "preserve_pinned": true
}`,
      response: `{
  "created": ["loc_fr_1a", "loc_es_2b", "loc_pt_3c"],
  "status": "queued",
  "minutes_billed": 0
}`,
    },
  ],
  webhooks: [
    { event: "recording.processed", when: "Transcription and interaction analysis complete." },
    { event: "project.ready", when: "Auto-edit finished; the transcript is editable." },
    { event: "render.completed", when: "One or more outputs finished. Payload carries signed URLs." },
    { event: "render.failed", when: "A render failed. Payload carries a machine-readable reason." },
    { event: "locale.stale", when: "A source project changed, invalidating this locale." },
    { event: "asset.threshold", when: "A viewer crossed a watch-depth threshold you configured." },
    { event: "usage.warning", when: "Workspace reached 80% of its monthly video minutes." },
  ],
};

export function getDocPage(slug: string) {
  for (const section of docSections) {
    const page = section.pages.find((p) => p.slug === slug);
    if (page) return { section, page };
  }
  return null;
}

export const allDocPages = docSections.flatMap((s) => s.pages);
