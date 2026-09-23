import type { IconName } from "@/components/ui/Icon";
import type { PreviewKey } from "@/components/marketing/Previews";

export interface DeepFeature {
  eyebrow: string;
  title: string;
  body: string;
  bullets?: string[];
  preview?: PreviewKey;
  note?: string;
}

export interface ProductPage {
  slug: string;
  nav: string;
  eyebrow: string;
  title: string;
  titleAccent: string;
  lede: string;
  heroPreview: PreviewKey;
  icon: IconName;
  stats: { value: string; label: string }[];
  intro: { title: string; body: string; icon: IconName }[];
  deep: DeepFeature[];
  specs: { label: string; value: string }[];
  faqs: { q: string; a: string }[];
  related: string[];
}

export const productPages: ProductPage[] = [
  /* ============================================================ STUDIO */
  {
    slug: "studio",
    nav: "AI Video Studio",
    eyebrow: "AI Video Studio",
    title: "Edit video the way you edit",
    titleAccent: "a document",
    lede:
      "Timelines were designed for film, where the footage is precious and the edit is the art. A product demo is neither. DemoRiff gives you a transcript instead: delete a sentence and the footage goes with it, reorder a paragraph and the cut follows, fix a word and the voice re-reads it.",
    heroPreview: "transcript",
    icon: "wand",
    stats: [
      { value: "11 min", label: "Median record-to-publish" },
      { value: "−31%", label: "Typical word count reduction" },
      { value: "< 90s", label: "Render for a 3-minute cut" },
      { value: "0", label: "Timeline skills required" },
    ],
    intro: [
      {
        icon: "doc",
        title: "Text is the timeline",
        body: "Every word maps to a frame range. Strike a sentence and the video loses exactly those frames, with the cut point placed on the nearest breath so it never sounds spliced.",
      },
      {
        icon: "zoom",
        title: "Direction, not filters",
        body: "Zooms land on clicks. Pans follow the cursor. Cuts fall on sentence boundaries. These are the choices an editor makes, applied automatically and overridable everywhere.",
      },
      {
        icon: "sparkles",
        title: "A co-editor that takes notes",
        body: "“Tighten the intro,” “make it sound less salesy,” “add a callout when the rate appears.” Riff applies the change and shows you the diff before it commits.",
      },
    ],
    deep: [
      {
        eyebrow: "Transcript editing",
        title: "Delete the sentence, not the frames",
        body:
          "The moment your recording lands, it is aligned word-by-word against the video. Editing becomes reading. Select a rambling paragraph and press delete — the pipeline finds the nearest clean cut points, crossfades the room tone so the join is inaudible, and reflows every downstream asset. Change your mind and undo restores the frames exactly.",
        bullets: [
          "Word-level alignment with sub-frame accuracy",
          "Automatic cut-point snapping to breaths and sentence ends",
          "Room-tone crossfade so joins are inaudible",
          "Full version history — every edit is reversible",
        ],
        preview: "transcript",
      },
      {
        eyebrow: "Automatic direction",
        title: "Zooms keyframed to the moments that matter",
        body:
          "The recorder captured which element you clicked, not just where the cursor was. That means the zoom can frame the button rather than the pixel — and stay framed while a panel animates open. Easing is tuned to feel like a camera operator rather than a slideshow transition, and every keyframe is a draggable object on the timeline if you disagree.",
        bullets: [
          "Element-aware framing, not coordinate-based",
          "Motion-tracked pan that follows animated UI",
          "Cursor smoothing with configurable weight and size",
          "Per-keyframe override of scale, easing and hold duration",
        ],
        preview: "video",
      },
      {
        eyebrow: "Audio",
        title: "Studio Sound turns a laptop mic into a booth",
        body:
          "Room reverb, HVAC hum, keyboard clatter and laptop fan are separated from your voice and removed, then the result is EQ'd and levelled to broadcast loudness. If you would rather not use your own audio at all, swap in one of 260 studio voices or your own clone — the script stays, the delivery changes.",
        bullets: [
          "De-reverb, de-noise, de-click and de-ess",
          "Loudness normalised to −16 LUFS for web, −14 for social",
          "Multi-speaker levelling across separate tracks",
          "One-click swap between recorded audio and synthetic voice",
        ],
        preview: "voice",
      },
      {
        eyebrow: "Riff co-editor",
        title: "Say what you want changed",
        body:
          "Riff sits beside the transcript and takes direction in plain language. It can rewrite for a different audience, cut to a target duration, add callouts where a concept is introduced, generate b-roll for an abstract idea, or produce three alternative intros for you to pick between. Every action is shown as a reviewable diff, and nothing is applied until you accept it.",
        bullets: [
          "“Cut this to 90 seconds without losing the pricing part”",
          "“Rewrite for a technical buyer, drop the adjectives”",
          "“Add a callout the first time we say rate shopping”",
          "“Give me three intros and let me choose”",
        ],
        preview: "agent",
      },
    ],
    specs: [
      { label: "Max export", value: "3840×2160 at 60fps, H.264 / H.265 / ProRes 422" },
      { label: "Aspect ratios", value: "16:9, 9:16, 1:1, 4:5, 21:9 and custom, auto-reframed" },
      { label: "Caption formats", value: "Burned-in, SRT, VTT, and styled soft captions" },
      { label: "Audio", value: "48kHz stereo, −16 LUFS web / −14 LUFS social" },
      { label: "Max source length", value: "4 hours per recording, 12 GB per file" },
      { label: "Render time", value: "Typically 0.4× realtime; 3-minute cut in under 90 seconds" },
    ],
    faqs: [
      {
        q: "Can I still use a normal timeline if I want to?",
        a: "Yes. The transcript is the primary surface, but a full timeline sits underneath it with video, audio, caption, overlay and music tracks. Anything the AI decided is a real, editable object there — zoom keyframes, cut points, callouts, b-roll placements — so you are never stuck with a choice you disagree with.",
      },
      {
        q: "What happens if I edit the script after translating?",
        a: "Translations are derived, not duplicated. Change the source script and every language shows as out of date with a one-click re-render. You can also pin a language so a manually corrected translation is never overwritten.",
      },
      {
        q: "Does it work with a recording that has two people talking?",
        a: "Yes. Speakers are separated into their own tracks, labelled, and levelled independently. You can cut one speaker's tangent without touching the other, and assign different voices or leave one person's original audio intact.",
      },
    ],
    related: ["voice", "avatars", "brand", "recorder"],
  },

  /* ============================================================ RECORDER */
  {
    slug: "recorder",
    nav: "Screen Studio Recorder",
    eyebrow: "Screen Studio Recorder",
    title: "A recorder that captures",
    titleAccent: "what you meant",
    lede:
      "Every other screen recorder gives you pixels. DemoRiff records the pixels and the intent behind them — which element you clicked, what you typed, when a modal opened, where a page navigated. That structured record is why the edit can be automatic instead of approximate.",
    heroPreview: "recorder",
    icon: "record",
    stats: [
      { value: "4K60", label: "Maximum capture" },
      { value: "4 tracks", label: "Screen, camera, mic, system" },
      { value: "< 3%", label: "CPU overhead while recording" },
      { value: "0 setup", label: "Runs in the browser" },
    ],
    intro: [
      {
        icon: "cursor",
        title: "Interaction data, not guesswork",
        body: "Clicks are bound to DOM elements and accessibility labels. The pipeline knows you pressed “New shipment”, so the zoom frames the button and the guide writes the step correctly.",
      },
      {
        icon: "layers",
        title: "Separate tracks, always",
        body: "Screen, camera, microphone and system audio are recorded independently, so you can drop the camera, mute the app, or replace your voice later without re-recording.",
      },
      {
        icon: "shield",
        title: "Redaction at capture time",
        body: "Sensitive fields can be masked as they are recorded, not after. What never enters the file cannot leak from it.",
      },
    ],
    deep: [
      {
        eyebrow: "Capture",
        title: "Record in a tab, a window, or the whole desktop",
        body:
          "The browser extension records any tab at up to 4K without installing anything on a locked-down machine. The desktop apps for macOS and Windows add full-desktop capture, hardware encoding, system audio on Windows, and offline recording that uploads when you reconnect. Both produce identical downstream results.",
        bullets: [
          "Chrome and Edge extension — no install privileges required",
          "macOS and Windows desktop apps with hardware encoding",
          "Offline recording with resumable background upload",
          "Pause, resume, and re-take a single step without starting over",
        ],
        preview: "recorder",
      },
      {
        eyebrow: "Intent tracking",
        title: "The metadata that makes automatic editing possible",
        body:
          "Alongside the video, the recorder writes a structured event log: element clicked with its selector and accessible name, text typed (redacted by policy), scroll position, route change, modal open and close, network idle. That log is what lets the pipeline frame a zoom on the right element, split the recording into logical steps, and write a guide that says “Click New shipment” rather than “Click at 1420, 84”.",
        bullets: [
          "Element selector, role and accessible name per interaction",
          "Route and view changes as chapter boundaries",
          "Typed input captured as intent, with values redacted by default",
          "Exportable as JSON for your own tooling",
        ],
        note: "Intent tracking requires the browser extension or desktop app. Imported video falls back to cursor-motion inference, which is good but not exact.",
      },
      {
        eyebrow: "Privacy",
        title: "Blur it before it is ever written to disk",
        body:
          "Point at a field and mark it always-masked, or write a rule — any element matching a selector, any text matching a pattern, any region of the frame. Built-in detectors already cover emails, phone numbers, card numbers, API keys, JWTs and common customer-name fields. On Enterprise, masking policies are set centrally and cannot be disabled by the person recording.",
        bullets: [
          "Element, region, regex and detector-based masking",
          "Masked at capture time, so raw values never persist",
          "Workspace-wide policies that individuals cannot override",
          "Audit record of every masking rule applied to every recording",
        ],
      },
      {
        eyebrow: "Camera",
        title: "A presence that does not fight the product",
        body:
          "Camera is recorded as its own track with background removal, so you can place it as a circle, a rounded rectangle, a full-frame intro, or nothing at all — and change your mind after the fact. Eye-line correction keeps you looking at the viewer while you read the script off a second monitor.",
        bullets: [
          "Background removal without a green screen",
          "Eye-contact correction, including with glasses",
          "Auto-hide when the cursor enters the camera region",
          "Replaceable with an AI presenter later, same track",
        ],
        preview: "avatar",
      },
    ],
    specs: [
      { label: "Resolution", value: "Up to 3840×2160 at 60fps (4K on paid plans)" },
      { label: "Capture targets", value: "Browser tab, application window, full desktop, multi-display" },
      { label: "Audio", value: "Microphone and system audio as separate 48kHz tracks" },
      { label: "Platforms", value: "Chrome, Edge, macOS 13+, Windows 11" },
      { label: "Max length", value: "4 hours continuous, resumable" },
      { label: "Storage", value: "Encrypted at rest, region-pinned on Scale and Enterprise" },
    ],
    faqs: [
      {
        q: "Do I need to install anything?",
        a: "No. The browser extension covers most product demos and needs no admin rights. The desktop apps exist for full-desktop capture, system audio on Windows, and recording native applications, but everything downstream works identically either way.",
      },
      {
        q: "Will it record my production environment safely?",
        a: "That is what the masking policies are for. Most teams record against staging with a seeded demo tenant, but when production is unavoidable, workspace-level masking rules apply automatically and cannot be turned off by the person recording. Values are masked before the frame is encoded, so they are never written to storage.",
      },
      {
        q: "What if I make a mistake halfway through a long recording?",
        a: "Pause, say “let me take that again”, and continue. The pipeline detects retakes and keeps the later attempt. You can also mark a step for re-recording afterwards and splice in a fresh capture of just that step — everything downstream rebuilds.",
      },
    ],
    related: ["studio", "import", "interactive", "docs"],
  },

  /* ============================================================ IMPORT */
  {
    slug: "import",
    nav: "Import & Re-cut",
    eyebrow: "Import & Re-cut",
    title: "Two years of Looms,",
    titleAccent: "rebuilt in an afternoon",
    lede:
      "You already have the recordings. They are scattered across Loom, Zoom cloud, Google Drive and someone's desktop, they are twenty minutes long, they have the wrong logo, and nobody can find them. Import them and run the same pipeline over the lot.",
    heroPreview: "import",
    icon: "upload",
    stats: [
      { value: "12 GB", label: "Max file size" },
      { value: "8 sources", label: "Direct connectors" },
      { value: "Bulk", label: "Import a whole library at once" },
      { value: "Same", label: "Pipeline as native recordings" },
    ],
    intro: [
      {
        icon: "refresh",
        title: "Re-cut, don't re-record",
        body: "An eighteen-minute all-hands segment becomes a three-minute feature video, with the rambling removed and the branding applied.",
      },
      {
        icon: "folder",
        title: "Bring the whole library",
        body: "Bulk import from Loom, Zoom, Drive or a folder of files. Everything lands in one searchable library with transcripts.",
      },
      {
        icon: "search",
        title: "Suddenly findable",
        body: "Every imported video is transcribed and semantically indexed, so “the part where we explain rate shopping” actually finds it.",
      },
    ],
    deep: [
      {
        eyebrow: "Sources",
        title: "Paste a link or drop a folder",
        body:
          "Connect Loom, Zoom cloud recordings, Google Drive, Dropbox, Box, YouTube, Vimeo or an S3 bucket and pull an entire library across in one operation. Or drag a folder of MP4s onto the page. Transcription, chaptering and indexing happen on ingest, so the library is useful before you have edited anything.",
        bullets: [
          "Direct connectors for Loom, Zoom, Drive, Dropbox, Box, YouTube, Vimeo, S3",
          "Bulk import with folder structure preserved as collections",
          "MP4, MOV, WEBM, MKV, AVI up to 12 GB per file",
          "Resumable uploads that survive a closed laptop",
        ],
        preview: "import",
      },
      {
        eyebrow: "Inference",
        title: "Editing decisions from footage that has no metadata",
        body:
          "Native recordings carry interaction data. Imported footage does not — so the pipeline infers it. Cursor trajectory, dwell and acceleration identify click moments. Frame differencing identifies view changes. OCR reads on-screen labels so the guide can name the button you pressed. It is not quite as exact as native capture, and the studio shows you which keyframes were inferred so you can check them.",
        bullets: [
          "Click inference from cursor dynamics",
          "View-change detection via frame differencing",
          "On-screen text recognition for step naming",
          "Inferred keyframes flagged distinctly for review",
        ],
      },
      {
        eyebrow: "Batch",
        title: "Re-brand a hundred videos at once",
        body:
          "Select a collection, apply a brand kit, and queue. Every video is re-cut with the new intro, outro, lower thirds, cursor style and music bed, re-rendered, and republished at the same URLs so nothing you have already embedded breaks. Useful after a rebrand, a pricing change, or the day you finally stop using the old logo.",
        bullets: [
          "Apply a brand kit across an entire collection",
          "Republish in place — existing embeds keep working",
          "Bulk translate a collection into new markets",
          "Queue runs off-peak with email notification on completion",
        ],
      },
    ],
    specs: [
      { label: "Formats", value: "MP4, MOV, WEBM, MKV, AVI, plus M4A / WAV / MP3 for audio-only" },
      { label: "Max file", value: "12 GB per file, 4 hours duration" },
      { label: "Connectors", value: "Loom, Zoom, Google Drive, Dropbox, Box, YouTube, Vimeo, S3" },
      { label: "Bulk limit", value: "500 files per import operation" },
      { label: "Transcription", value: "Automatic on ingest, 34 languages, speaker-separated" },
    ],
    faqs: [
      {
        q: "Will imported video look as good as a native recording?",
        a: "The polish is the same — branding, voice, captions, pacing. What differs is zoom precision: native capture knows which element you clicked, while imported footage infers it from cursor behaviour. In practice that means occasionally nudging a keyframe. Resolution is also capped by the source; we can upscale, but we cannot invent detail that was never recorded.",
      },
      {
        q: "Can I import a recording that has no narration?",
        a: "Yes, and this is a common path. Silent screen captures get a script written from the interaction sequence, which you then edit, and a studio voice reads it. Teams use this to turn QA recordings and bug reproductions into proper walkthroughs.",
      },
    ],
    related: ["recorder", "studio", "docs", "localization"],
  },

  /* ============================================================ VOICE */
  {
    slug: "voice",
    nav: "Voices & Cloning",
    eyebrow: "Voices & Cloning",
    title: "A voice that knows how to say",
    titleAccent: "your product's name",
    lede:
      "Generic text-to-speech gives itself away on the nouns — your product name, your acronyms, the interface labels. DemoRiff's narration model is tuned specifically for software walkthroughs, and it learns your vocabulary from your own content.",
    heroPreview: "voice",
    icon: "mic",
    stats: [
      { value: "260", label: "Studio voices" },
      { value: "34", label: "Languages" },
      { value: "30s", label: "To clone your own" },
      { value: "< 8s", label: "To re-read a corrected line" },
    ],
    intro: [
      {
        icon: "brain",
        title: "Tuned for product narration",
        body: "Trained on instructional speech, so it emphasises the verb, pauses before the click, and does not read a UI label like a sentence.",
      },
      {
        icon: "book",
        title: "It learns your lexicon",
        body: "Add product names, acronyms and pronunciations once. Every voice, in every language, respects them from then on.",
      },
      {
        icon: "lock",
        title: "Cloning with consent",
        body: "A voice clone requires a spoken consent phrase from the person being cloned, and can be revoked by them at any time.",
      },
    ],
    deep: [
      {
        eyebrow: "Library",
        title: "Two hundred and sixty voices, auditioned on your own script",
        body:
          "Browse by language, accent, age, warmth and pace — then hear each candidate read your actual script, not a generic sample. That matters: a voice that sounds great on “the quick brown fox” can fall apart on “configure the SAML assertion mapping.” Shortlist three, put them side by side, and pick.",
        bullets: [
          "Filter by language, accent, timbre, pace and register",
          "Audition on your real script, not a canned sample",
          "A/B two voices on the same line, instantly",
          "Save a house voice per brand kit so the team stays consistent",
        ],
        preview: "voice",
      },
      {
        eyebrow: "Cloning",
        title: "Your voice, from thirty seconds",
        body:
          "Read a short consent passage and the model builds a clone that carries your accent, pace and cadence. It handles your product vocabulary because it was built against your transcripts. From then on you can fix a line by typing it — no re-recording, no matching your energy from three weeks ago, no audible seam where the correction starts.",
        bullets: [
          "30 seconds of reference audio, 4 minutes for the high-fidelity model",
          "Spoken consent phrase required and stored with the voice",
          "Revocable by the voice owner at any time, retroactively",
          "Clone speaks all 34 languages in your own timbre",
        ],
      },
      {
        eyebrow: "Direction",
        title: "Tell it how to read the line",
        body:
          "Select any span of the script and direct it: slower here, emphasise this word, pause before the click, sound genuinely pleased rather than performatively pleased. Pronunciation overrides are per-word and per-workspace, so once someone teaches it how to say your company name, nobody has to teach it again.",
        bullets: [
          "Per-span pace, emphasis, pitch and pause control",
          "Phonetic overrides with IPA or a spoken example",
          "Workspace pronunciation dictionary, shared across every project",
          "Automatic timing so narration still lands on the right frame",
        ],
      },
    ],
    specs: [
      { label: "Voice library", value: "260 licensed voices across 34 languages" },
      { label: "Clone quality", value: "Standard from 30s, high-fidelity from 4 minutes" },
      { label: "Output", value: "48kHz, 24-bit, −16 LUFS normalised" },
      { label: "Latency", value: "Under 8 seconds to re-render a corrected line" },
      { label: "Consent", value: "Spoken phrase required; revocable, with audit record" },
      { label: "Licensing", value: "Commercial use included on all paid plans, worldwide, in perpetuity" },
    ],
    faqs: [
      {
        q: "Can someone clone my voice without permission?",
        a: "No. Creating a clone requires reading a consent phrase that includes the date and the workspace name, and that recording is stored alongside the voice. Workspace admins can see every clone and who consented to it. The person cloned can revoke at any time, which disables the voice for future renders immediately.",
      },
      {
        q: "How do I stop it mispronouncing our product name?",
        a: "Add it to the workspace pronunciation dictionary once — either with IPA or by recording yourself saying it. Every voice, in every language, uses it from then on, including voices added later.",
      },
      {
        q: "Can I keep my own recorded audio instead?",
        a: "Yes, and plenty of people do. Studio Sound cleans it up, levels it and removes fillers without replacing your delivery. You can also mix: keep your voice for the main narration and use a synthetic voice for the intro and outro so they stay consistent across a whole series.",
      },
    ],
    related: ["studio", "localization", "avatars", "brand"],
  },

  /* ============================================================ AVATARS */
  {
    slug: "avatars",
    nav: "AI Presenters",
    eyebrow: "AI Presenters",
    title: "A presenter on screen,",
    titleAccent: "no studio required",
    lede:
      "Some demos need a face. Not because the product is unclear, but because a person on screen holds attention for longer and makes an unfamiliar product feel like it came from somewhere real. Booking that shoot is the expensive part. This is not.",
    heroPreview: "avatar",
    icon: "avatar",
    stats: [
      { value: "180", label: "Licensed presenters" },
      { value: "34", label: "Languages, lip-synced" },
      { value: "6 min", label: "Footage to train your own" },
      { value: "+41%", label: "Median completion vs. no presenter" },
    ],
    intro: [
      {
        icon: "users",
        title: "Cast rather than shoot",
        body: "180 presenters across ages, regions and registers, each licensed for commercial use with no per-video fee.",
      },
      {
        icon: "frame",
        title: "Four ways to appear",
        body: "Circle bubble, rounded card, full-frame intro, or a presenter who hands off to the screen and returns for the close.",
      },
      {
        icon: "shield",
        title: "Consent-gated custom avatars",
        body: "Train a presenter on yourself or a colleague with recorded consent, an audit record, and revocation on demand.",
      },
    ],
    deep: [
      {
        eyebrow: "Stock presenters",
        title: "Cast a presenter the way you would cast an actor",
        body:
          "Filter by language, apparent age, register and setting, then preview each candidate delivering your own opening line. Every presenter is licensed for unlimited commercial use — no per-video royalty, no “ask before you run paid media”, no clause that stops you using them in a market you expand into next year.",
        bullets: [
          "Filter by language, region, register, wardrobe and setting",
          "Preview on your actual script before committing",
          "Unlimited commercial use worldwide, included in your plan",
          "Consistent presenter across a whole video series",
        ],
        preview: "avatar",
      },
      {
        eyebrow: "Custom avatars",
        title: "Train a presenter on your founder, once",
        body:
          "Six minutes of guided footage — a few sentences, a few expressions, a couple of gestures — produces a presenter that looks and moves like the real person, and speaks every language in their own voice clone. Useful when the founder is the story and the founder does not want to re-record the pitch for each of eleven markets.",
        bullets: [
          "Six minutes of guided capture, shot on a laptop",
          "Pairs with a voice clone for a complete likeness",
          "Speaks all 34 languages with matched lip movement",
          "Recorded consent, audit trail, and revocation by the subject",
        ],
      },
      {
        eyebrow: "Composition",
        title: "Present without covering the thing you are presenting",
        body:
          "The presenter is aware of the frame. When a zoom moves to the top-right, the bubble slides to the bottom-left. When a modal opens under the presenter, it shrinks. When the narration is describing something specific on screen, it can fade out entirely and return for the conclusion. You can override all of it with a keyframe.",
        bullets: [
          "Collision-aware placement against zoom regions and UI",
          "Automatic fade-out during detailed on-screen explanation",
          "Full-frame intro and outro with a screen-share handoff",
          "Per-scene manual placement when you want control",
        ],
      },
    ],
    specs: [
      { label: "Stock library", value: "180 presenters, commercially licensed worldwide" },
      { label: "Custom training", value: "6 minutes guided capture; model ready in ~2 hours" },
      { label: "Languages", value: "34, with lip movement matched to the target audio" },
      { label: "Resolution", value: "Up to 4K, alpha channel available for compositing" },
      { label: "Consent", value: "Recorded consent required; revocable with audit trail" },
    ],
    faqs: [
      {
        q: "Will it look uncanny?",
        a: "Be honest with yourself about the use case. For a thirty-second intro and a fifteen-second close around a screen recording, presenters read as natural to nearly everyone. For eight unbroken minutes of a talking head, some viewers will notice. We design for the first case and tell you plainly that the second is harder.",
      },
      {
        q: "Do I need a presenter at all?",
        a: "Often not. A tight voiceover over a well-directed screen recording converts extremely well and is faster to produce. Presenters help most on top-of-funnel content, founder-led narrative, and localized markets where a local-language presenter builds trust you cannot get from a voice alone.",
      },
      {
        q: "Can a colleague revoke their avatar after they leave?",
        a: "Yes. Revocation is a right of the person, not the workspace. Revoking disables the avatar for all future renders immediately and flags existing videos that use it so you can re-render them with a stock presenter.",
      },
    ],
    related: ["voice", "studio", "localization", "brand"],
  },

  /* ============================================================ BRAND */
  {
    slug: "brand",
    nav: "Brand System",
    eyebrow: "Brand System",
    title: "Set the brand once.",
    titleAccent: "Every frame obeys.",
    lede:
      "The reason in-house video looks in-house is not the camera. It is that eleven people each made their own decisions about the logo placement, the caption font, the intro length and the music. A brand kit removes those decisions from the workflow entirely.",
    heroPreview: "brand",
    icon: "palette",
    stats: [
      { value: "1", label: "Place to change the logo" },
      { value: "248", label: "Videos updated by one edit" },
      { value: "12", label: "Controlled design tokens" },
      { value: "Locked", label: "Or open, per workspace" },
    ],
    intro: [
      {
        icon: "palette",
        title: "Tokens, not templates",
        body: "Colour, type, logo, cursor, motion, music and CTA are defined as values — so they apply to any video, not just the ones that used a particular template.",
      },
      {
        icon: "lock",
        title: "Enforced when it matters",
        body: "Admins can lock a kit so nobody exports off-brand, or leave it as a default that individual creators can adapt.",
      },
      {
        icon: "refresh",
        title: "Retroactive",
        body: "Change a token and every video that uses the kit is flagged for re-render. Approve, and your whole library updates.",
      },
    ],
    deep: [
      {
        eyebrow: "The kit",
        title: "Twelve tokens that decide how everything looks",
        body:
          "Primary and accent colour, background, caption typeface and weight, logo and its safe area, intro sting, outro card, lower-third style, cursor appearance, transition character, music bed and level, and the default call to action. Import them from a Figma file, a brand guidelines PDF, or just your website — the extractor reads all three.",
        bullets: [
          "Import from Figma, a URL, or a brand PDF",
          "Multiple kits per workspace for sub-brands and campaigns",
          "Per-kit default voice, presenter and language set",
          "Preview any kit against any existing video before applying",
        ],
        preview: "brand",
      },
      {
        eyebrow: "Governance",
        title: "Make off-brand output impossible, not merely discouraged",
        body:
          "On Scale and Enterprise, a kit can be locked: creators choose which kit to use, and nothing else. Exports that would violate it are blocked with an explanation rather than silently corrected. Approval workflows can require a brand owner's sign-off before anything publishes externally, with the review happening on a timestamped, commentable preview.",
        bullets: [
          "Locked kits that individual creators cannot override",
          "Required approval before external publishing",
          "Timestamped comments and resolve-tracking on review",
          "Full audit of who changed which token, and when",
        ],
      },
      {
        eyebrow: "Propagation",
        title: "One rebrand, one afternoon",
        body:
          "When the logo changes, you change it once. Every video built on that kit is marked stale, and a bulk re-render republishes all of them at their existing URLs — so the embed on your pricing page updates without anyone touching the pricing page. The same mechanism handles a pricing change mentioned in narration, or a renamed feature.",
        bullets: [
          "Stale detection across the whole library",
          "Bulk re-render and republish in place, URLs preserved",
          "Scheduled off-peak processing for large libraries",
          "Rollback to any previous kit version",
        ],
      },
    ],
    specs: [
      { label: "Kits per workspace", value: "1 on Free, unlimited on every paid plan" },
      { label: "Import sources", value: "Figma file, website URL, brand guidelines PDF, manual" },
      { label: "Fonts", value: "Upload your licensed font files, or choose from 900 web fonts" },
      { label: "Music", value: "Royalty-free library included, or upload your own licensed beds" },
      { label: "Enforcement", value: "Advisory, default, or locked — set per kit by an admin" },
    ],
    faqs: [
      {
        q: "Can different teams have different kits?",
        a: "Yes. Kits belong to workspaces, and a workspace can be a team, a region, a product line or a sub-brand. A person who belongs to several sees only the kits they are entitled to, and admins decide which is the default for each.",
      },
      {
        q: "What about fonts we have licensed but cannot redistribute?",
        a: "Upload the files to your workspace. They are used for rendering only, never served to viewers, and never exposed for download. If your licence has restrictions, note them on the kit so the next person sees them.",
      },
    ],
    related: ["studio", "analytics", "docs", "interactive"],
  },

  /* ============================================================ INTERACTIVE */
  {
    slug: "interactive",
    nav: "Interactive Demos",
    eyebrow: "Interactive Demos",
    title: "A tour they click",
    titleAccent: "instead of watch",
    lede:
      "Video is passive, and on a pricing page passive is expensive. An interactive demo lets a buyer drive — skipping what they understand, dwelling on what they do not, and reaching the part that matters to them without waiting through ninety seconds of setup.",
    heroPreview: "interactive",
    icon: "cursor",
    stats: [
      { value: "6.1×", label: "Engagement vs. a video embed" },
      { value: "+38%", label: "Median demo-request lift" },
      { value: "0", label: "Lines of code to embed" },
      { value: "Indexable", label: "Real DOM, crawlable by search" },
    ],
    intro: [
      {
        icon: "layers",
        title: "The same recording",
        body: "Because the recorder captured the DOM, the interactive demo is generated from the take you already made. No second build, no sandbox to maintain.",
      },
      {
        icon: "target",
        title: "Branching by persona",
        body: "Let the viewer pick their role at step one and route them down a path that shows the three things their role cares about.",
      },
      {
        icon: "chart",
        title: "Intent you can act on",
        body: "You learn not just that someone watched, but which path they took, where they stopped, and what they clicked twice.",
      },
    ],
    deep: [
      {
        eyebrow: "Generation",
        title: "Generated from the recording, not rebuilt by hand",
        body:
          "Competing tools ask you to clone your app into a sandbox, then maintain that clone forever. DemoRiff captures the real DOM during your normal recording and reconstructs it as an interactive surface — real text, real layout, editable. Change a label, redact a customer name, swap a number, all without touching your application.",
        bullets: [
          "Captured from a normal recording session, not a separate build",
          "Editable text and values — fix a typo without re-recording",
          "Responsive reconstruction that works on mobile viewports",
          "Automatic redaction of detected customer data",
        ],
        preview: "interactive",
      },
      {
        eyebrow: "Authoring",
        title: "Hotspots, tooltips, forms and forks",
        body:
          "Each step gets a spotlight, a tooltip you write, and a required action. Insert a form to capture a lead mid-tour, a fork that asks what the viewer wants to see, or a checkpoint that unlocks the next section. Steps can be reordered by dragging, and the written guide regenerates to match.",
        bullets: [
          "Spotlight, tooltip, cursor hint and required-click per step",
          "Branching forks with per-path analytics",
          "Inline lead capture with CRM field mapping",
          "Chapters, skip-ahead and a persistent progress rail",
        ],
      },
      {
        eyebrow: "Distribution",
        title: "Embed it anywhere, including inside your product",
        body:
          "One script tag, or an iframe, or a share link. Demos render server-side so search engines index the text, which is a meaningful SEO advantage over a video. Inside your own product, the same demo can run as an onboarding overlay triggered on first login.",
        bullets: [
          "Script tag, iframe, share link, or in-product overlay",
          "Server-rendered text that search engines can index",
          "Custom domain support for share pages",
          "Gated variants that require an email before step three",
        ],
      },
    ],
    specs: [
      { label: "Capture", value: "DOM snapshot per step, with computed styles and assets inlined" },
      { label: "Steps", value: "Up to 120 per demo, with unlimited branches" },
      { label: "Embed", value: "Script tag, iframe, or direct link; 6 KB runtime, async" },
      { label: "Responsive", value: "Reconstructed layouts down to 360px wide" },
      { label: "Analytics", value: "Per-step, per-branch, per-hotspot, plus CRM sync" },
    ],
    faqs: [
      {
        q: "How is this different from a sandbox demo environment?",
        a: "A sandbox is a running copy of your application that someone has to keep alive, seeded and in sync with production. An interactive demo is a reconstruction of a recording — it cannot drift, cannot break when a deploy goes out, and costs nothing to run. The trade-off is that it follows a path rather than allowing arbitrary exploration, which for a marketing-site demo is usually what you want.",
      },
      {
        q: "Can viewers type into it?",
        a: "Yes, on inputs you mark as interactive. The demo accepts the input and advances, which makes flows like search or configuration feel real without connecting to anything.",
      },
      {
        q: "Does it work on mobile?",
        a: "Yes. The captured DOM is reconstructed responsively, and steps can carry a mobile-specific spotlight position. Roughly a third of demo views in our data are on a phone, usually forwarded from a colleague.",
      },
    ],
    related: ["recorder", "analytics", "docs", "studio"],
  },

  /* ============================================================ DOCS */
  {
    slug: "docs",
    nav: "Docs & Guides",
    eyebrow: "Docs & Guides",
    title: "The written guide,",
    titleAccent: "generated with the video",
    lede:
      "Half your audience will never press play. They want to scan, find step seven, and get on with their day. Every DemoRiff recording also produces a written walkthrough with annotated screenshots — created at the same moment, so it can never fall out of date with the video.",
    heroPreview: "guide",
    icon: "doc",
    stats: [
      { value: "Unlimited", label: "On every plan, including free" },
      { value: "8", label: "Export destinations" },
      { value: "−51%", label: "Typical onboarding ticket drop" },
      { value: "34", label: "Languages, in one pass" },
    ],
    intro: [
      {
        icon: "record",
        title: "From the same take",
        body: "Each captured interaction becomes a numbered step with a cropped, annotated screenshot and a written instruction.",
      },
      {
        icon: "refresh",
        title: "Never stale",
        body: "Re-record a changed step and the article updates with it — in every language you publish.",
      },
      {
        icon: "external",
        title: "Publishes where you already work",
        body: "Zendesk, Intercom, Notion, Confluence, HelpScout, Markdown, HTML or the hosted help center.",
      },
    ],
    deep: [
      {
        eyebrow: "Generation",
        title: "Steps written from what you actually did",
        body:
          "Because the recorder knows which element you clicked and what the element was called, the guide says “Click New shipment in the top-right corner” rather than describing a coordinate. Screenshots are cropped to the relevant region, annotated with a numbered marker and a highlight, and blurred wherever sensitive data was detected. Animated GIFs are generated for steps where motion carries the meaning.",
        bullets: [
          "Element-accurate step text, not coordinate descriptions",
          "Auto-cropped screenshots with numbered annotations",
          "Animated GIFs for steps where motion matters",
          "Sensitive values blurred automatically",
        ],
        preview: "guide",
      },
      {
        eyebrow: "Editing",
        title: "A real editor, not a locked export",
        body:
          "The generated article opens in a block editor. Rewrite a step, merge two that should be one, add a callout about a gotcha, insert a table of prerequisites, drop in a note about the enterprise variant. Screenshots can be re-cropped, re-annotated, or replaced with a fresh capture of just that step.",
        bullets: [
          "Block editor with callouts, tables, code blocks and tabs",
          "Merge, split and reorder steps with screenshots following",
          "Re-capture a single step without re-recording the article",
          "Reusable snippets for prerequisites and disclaimers",
        ],
      },
      {
        eyebrow: "Publishing",
        title: "Where your customers already look for answers",
        body:
          "Push to Zendesk, Intercom, HelpScout, Notion or Confluence with your own page template applied and a two-way sync that keeps them current. Or host it on a DemoRiff help center on your own domain, with search, categories and the video embedded at the top. Export to Markdown or HTML if you would rather own the pipeline.",
        bullets: [
          "Two-way sync with Zendesk, Intercom, HelpScout, Notion, Confluence",
          "Hosted help center on your custom domain",
          "Markdown, MDX and HTML export with assets bundled",
          "Video, interactive demo and article on a single page",
        ],
      },
    ],
    specs: [
      { label: "Metering", value: "Unlimited on every plan, including Free" },
      { label: "Screenshot format", value: "PNG and WebP, 2× density, auto-cropped" },
      { label: "Motion", value: "Animated GIF or WebP per step, under 2 MB" },
      { label: "Export", value: "Markdown, MDX, HTML, PDF, DOCX, Zendesk, Intercom, Notion, Confluence" },
      { label: "Localization", value: "34 languages, with screenshots retaken from localized UI where available" },
    ],
    faqs: [
      {
        q: "Are guides really unlimited, even on the free plan?",
        a: "Yes. We meter rendered video because rendering costs us money. Generating a written guide costs us very little, and metering documentation is a bad incentive — it pushes teams to write fewer guides, which makes their product harder to use. So we do not.",
      },
      {
        q: "Can it write the guide without a voiceover?",
        a: "Yes. A silent screen recording produces a complete article, because the steps come from your interactions rather than your narration. Many teams record silently specifically for documentation and add narration only for the ones that become videos.",
      },
      {
        q: "What if our help center is something you do not integrate with?",
        a: "Export to Markdown or HTML with assets bundled, or use the API to push articles wherever you like. The generated structure is plain and predictable, which makes it easy to transform.",
      },
    ],
    related: ["recorder", "localization", "interactive", "analytics"],
  },

  /* ============================================================ LOCALIZATION */
  {
    slug: "localization",
    nav: "Localization",
    eyebrow: "Localization",
    title: "Thirty-four markets,",
    titleAccent: "one afternoon",
    lede:
      "Most teams localize the website and stop, because localizing video means a vendor, a spreadsheet of subtitle timings, and six weeks. DemoRiff re-voices the video, matches the mouth movement, swaps the on-screen text and translates the written guide — as one operation.",
    heroPreview: "localization",
    icon: "globe",
    stats: [
      { value: "34", label: "Languages" },
      { value: "~2 min", label: "Per language, in parallel" },
      { value: "$0", label: "Extra video minutes charged" },
      { value: "Lip-synced", label: "Not subtitled" },
    ],
    intro: [
      {
        icon: "mic",
        title: "Re-voiced, not captioned",
        body: "A full audio replacement in the target language, in a native voice — or your own clone speaking a language you do not.",
      },
      {
        icon: "avatar",
        title: "Mouth movement matched",
        body: "Where a presenter or camera is on screen, lip movement is re-synced to the new audio so it does not read as dubbed.",
      },
      {
        icon: "doc",
        title: "The whole asset set",
        body: "Video, captions, on-screen text, interactive tooltips and the written guide all localize together.",
      },
    ],
    deep: [
      {
        eyebrow: "Translation",
        title: "Translated for meaning, with your terms protected",
        body:
          "Product names, feature names and interface labels are pinned so they are never translated — nothing undermines a localized demo faster than a translated button that does not exist in the localized product. Everything else is translated for meaning and re-timed, because a sentence that takes four seconds in English may take six in German, and the narration still has to land on the right frame.",
        bullets: [
          "Glossary of protected terms, shared across the workspace",
          "Meaning-first translation with product context",
          "Automatic re-timing so narration still matches the action",
          "Per-language human review and approval before publishing",
        ],
        preview: "localization",
      },
      {
        eyebrow: "On-screen",
        title: "The interface in the video, in their language",
        body:
          "If your product is already localized, point DemoRiff at the localized environment and it will retake the screenshots and re-record the flow against it. If it is not, on-screen text overlays can be translated in place so the viewer at least reads their own language in the callouts, captions and tooltips.",
        bullets: [
          "Re-capture against your localized environment where available",
          "In-place overlay translation for callouts and captions",
          "Right-to-left layout support for Arabic and Hebrew",
          "Locale-correct number, date and currency formatting",
        ],
      },
      {
        eyebrow: "Operations",
        title: "Keeping eleven languages current is the actual problem",
        body:
          "Producing one localized video is easy. Keeping eleven of them current through three months of product changes is where teams give up. Because translations are derived from the source, changing the source marks every language stale, shows you exactly which ones, and re-renders them all on approval — with human-corrected languages pinned so your reviewer's work is never overwritten.",
        bullets: [
          "Staleness tracking per language against the source",
          "Bulk re-render with one approval",
          "Pin a language to preserve manual corrections",
          "Per-market analytics so you know which languages earn their keep",
        ],
      },
    ],
    specs: [
      { label: "Languages", value: "34, including 5 English and 2 Spanish / Portuguese / Chinese variants" },
      { label: "Lip-sync", value: "Applied to presenter and camera tracks; screen-only video needs none" },
      { label: "Throughput", value: "Roughly 2 minutes per language, processed in parallel" },
      { label: "Billing", value: "Localized versions never consume additional video minutes" },
      { label: "RTL", value: "Full right-to-left support for Arabic and Hebrew" },
    ],
    faqs: [
      {
        q: "Is the translation good enough to publish without review?",
        a: "For most product walkthroughs, yes — the vocabulary is constrained and your product terms are pinned. We still recommend one native review pass per language for anything customer-facing, and the workflow is built for it: reviewers get a side-by-side view, can correct inline, and their corrections are preserved when the source changes.",
      },
      {
        q: "Why does localization not cost extra minutes?",
        a: "Because charging again for a video you already paid to produce is how this category gets expensive, and it results in teams localizing two languages instead of eleven. We would rather you publish everywhere and stay on the plan.",
      },
      {
        q: "Can my voice clone speak a language I do not?",
        a: "Yes. The clone carries your timbre into all thirty-four languages. Whether that is the right choice is a judgement call — in some markets a native presenter builds more trust than a founder with a foreign accent. Both options are one dropdown apart.",
      },
    ],
    related: ["voice", "avatars", "docs", "analytics"],
  },

  /* ============================================================ ANALYTICS */
  {
    slug: "analytics",
    nav: "Hosting & Analytics",
    eyebrow: "Hosting & Analytics",
    title: "Find the exact second",
    titleAccent: "they stopped caring",
    lede:
      "A view count tells you nothing you can act on. Per-second retention tells you the intro is forty seconds too long, that everyone leaves when the configuration screen appears, and that the people who reach minute two convert at four times the rate of those who do not.",
    heroPreview: "analytics",
    icon: "chart",
    stats: [
      { value: "Per-second", label: "Retention resolution" },
      { value: "Account-level", label: "Viewer identification" },
      { value: "2-way", label: "CRM sync" },
      { value: "Unlimited", label: "Views, on every plan" },
    ],
    intro: [
      {
        icon: "trending",
        title: "Retention, not views",
        body: "A curve per video, per language, per traffic source — with drop-offs called out and explained.",
      },
      {
        icon: "briefcase",
        title: "Who, not just how many",
        body: "Identify viewers by account through your CRM or a gated share page, and see which opportunities engaged.",
      },
      {
        icon: "sparkles",
        title: "Suggestions, not just charts",
        body: "The model reads the curve against the transcript and tells you which sentence lost them.",
      },
    ],
    deep: [
      {
        eyebrow: "Engagement",
        title: "A retention curve you can actually read",
        body:
          "Every second of every view is recorded: watched, rewatched, skipped, abandoned. Rewatch spikes are as informative as drop-offs — they usually mean something was unclear rather than interesting. The curve is overlaid on the transcript, so a cliff at 0:34 is immediately attributable to the sentence being spoken at 0:34.",
        bullets: [
          "Per-second watched, rewatched and abandoned",
          "Curve overlaid on the transcript and the timeline",
          "Segment by source, country, device, language and campaign",
          "Compare two versions of a video head to head",
        ],
        preview: "analytics",
      },
      {
        eyebrow: "Revenue",
        title: "Connect watching to pipeline",
        body:
          "Share pages can identify viewers through a CRM cookie, a gated email, or a personalized link sent by a rep. That identity flows into HubSpot or Salesforce as timeline events and scoreable properties, so “watched 80% of the security demo” becomes something your scoring model and your sequences can act on.",
        bullets: [
          "Account identification via CRM cookie, gate, or personalized link",
          "Timeline events and custom properties in HubSpot and Salesforce",
          "Alerts when a target account watches past a threshold",
          "Attribution of demo engagement to opportunity stage movement",
        ],
      },
      {
        eyebrow: "Distribution",
        title: "Share pages built to convert, not just to host",
        body:
          "Every video gets a hosted page on your own domain with your brand kit applied, a chapter list, the written guide beneath, a transcript for search engines, and a call to action that can be a booking link, a form, a trial signup, or a next video. Pages can be public, password protected, email gated, or restricted to a domain.",
        bullets: [
          "Custom domain, brand kit, chapters and searchable transcript",
          "CTA as booking link, form, trial start, or next video",
          "Public, password, email-gate or domain-restricted access",
          "Embeds with a 6 KB async runtime and no layout shift",
        ],
      },
    ],
    specs: [
      { label: "Retention resolution", value: "1 second, retained for 24 months" },
      { label: "Identification", value: "CRM cookie, email gate, personalized link, or SSO on in-product demos" },
      { label: "Destinations", value: "HubSpot, Salesforce, Segment, Amplitude, Mixpanel, webhooks" },
      { label: "Privacy", value: "Cookieless mode available; GDPR consent-aware; IP truncation" },
      { label: "Export", value: "CSV, API, and scheduled warehouse sync" },
    ],
    faqs: [
      {
        q: "Do you set cookies on my visitors?",
        a: "Only if you want us to. There is a cookieless mode that still produces accurate aggregate retention using a session identifier that is not persisted. Identification features obviously require either a cookie or an explicit email, and both respect your consent management platform.",
      },
      {
        q: "What is the single most useful number here?",
        a: "Completion rate segmented by traffic source. It tells you whether the video matches the expectation set by whatever brought the viewer there. A demo that completes at 70% from your pricing page and 20% from a paid social ad does not have a video problem — it has an ad problem.",
      },
    ],
    related: ["interactive", "brand", "docs", "studio"],
  },

  /* ============================================================ AGENT */
  {
    slug: "agent",
    nav: "Riff Agent",
    eyebrow: "Riff Agent",
    title: "Describe the demo.",
    titleAccent: "Get the demo.",
    lede:
      "Riff Agent reads your changelog, writes the script, drives your staging environment to record the flow, cuts it, voices it, brands it, and hands you a finished video to review. You approve or you redirect. Available on Scale and Enterprise.",
    heroPreview: "agent",
    icon: "sparkles",
    stats: [
      { value: "~9 min", label: "Prompt to reviewable cut" },
      { value: "Every release", label: "Triggered from CI" },
      { value: "Human", label: "Approval always required" },
      { value: "Scale+", label: "Plan availability" },
    ],
    intro: [
      {
        icon: "brain",
        title: "It reads your context",
        body: "Changelog, Linear issue, PR description, existing docs and your previous videos — so the script sounds like your team wrote it.",
      },
      {
        icon: "cursor",
        title: "It drives your app",
        body: "Against a staging environment and a demo tenant you designate, with credentials scoped to exactly that.",
      },
      {
        icon: "shield",
        title: "It never publishes alone",
        body: "The agent produces drafts. A person approves before anything reaches a customer. That is not configurable.",
      },
    ],
    deep: [
      {
        eyebrow: "Briefing",
        title: "One sentence, or a whole release",
        body:
          "Ask for a specific demo in plain language, or connect it to your release process and let it propose one for every shipped feature. It drafts an outline first — the beats, the angle, the target length and audience — and waits for your nod before recording anything. Most teams spend two minutes on the outline and nothing on the rest.",
        bullets: [
          "Natural-language brief, or triggered by a Linear or GitHub event",
          "Outline proposed for approval before any recording happens",
          "Audience, length, tone and brand kit specified up front",
          "Reuses your glossary, brand kit, voice and presenter",
        ],
        preview: "agent",
      },
      {
        eyebrow: "Execution",
        title: "Driving a real application, carefully",
        body:
          "You designate a staging URL and a demo tenant, and provide scoped credentials that the agent uses in an isolated browser. It navigates, waits for the interface to settle, retries when something is slow, and records the whole session with the same interaction metadata as a human recording. It will not touch anything outside the environment you designated.",
        bullets: [
          "Isolated browser session with scoped, rotatable credentials",
          "Environment allowlist — staging only unless you say otherwise",
          "Self-correcting navigation with retry on slow interfaces",
          "Full session recording and action log for audit",
        ],
      },
      {
        eyebrow: "Control",
        title: "A draft, and a person who decides",
        body:
          "Output lands in your review queue as a normal project: transcript editable, keyframes adjustable, everything overridable. Redirect it in a sentence and it re-cuts. Nothing the agent produces can publish to a customer-facing surface without a human approval, and every agent run is logged with the brief, the actions taken and the approver.",
        bullets: [
          "Lands in the review queue, never live",
          "Redirect in plain language and it re-cuts",
          "Human approval mandatory for external publishing",
          "Full audit: brief, actions, output, approver, timestamp",
        ],
      },
    ],
    specs: [
      { label: "Availability", value: "Scale and Enterprise plans" },
      { label: "Triggers", value: "Manual brief, Linear issue state, GitHub release, API call, schedule" },
      { label: "Environments", value: "Explicit allowlist; staging by default" },
      { label: "Credentials", value: "Scoped, encrypted, rotatable; never reused outside the allowlist" },
      { label: "Typical run", value: "Around 9 minutes from approved outline to reviewable cut" },
    ],
    faqs: [
      {
        q: "Will it record against production?",
        a: "Only if you explicitly allowlist a production URL, and we would advise against it. The default configuration permits staging environments only. Whatever you allow, the agent uses credentials you scope and can rotate, in an isolated session, with every action logged.",
      },
      {
        q: "What if the demo it records is wrong?",
        a: "Tell it what is wrong in a sentence and it re-cuts, often without re-recording. If the flow itself was wrong, it re-records that segment. Because output always lands in review rather than going live, a wrong draft costs you a minute of reading, not a retraction.",
      },
      {
        q: "Does it replace the person who makes demos?",
        a: "It replaces the part of their job that is mechanical — the third variant for a different vertical, the re-record after a UI change, the fourteen release videos nobody had time for. The judgement about what is worth making, and whether the result is good, stays with a person. We designed the approval gate to be non-optional for that reason.",
      },
    ],
    related: ["studio", "recorder", "analytics", "brand"],
  },
];

export function getProductPage(slug: string) {
  return productPages.find((p) => p.slug === slug);
}
