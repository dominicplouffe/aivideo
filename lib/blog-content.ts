import type { Block } from "./content-blocks";

export interface Post {
  slug: string;
  title: string;
  dek: string;
  category: "Craft" | "Strategy" | "Engineering" | "Research" | "Product";
  author: { name: string; role: string };
  date: string;
  readMinutes: number;
  featured?: boolean;
  body: Block[];
}

export const posts: Post[] = [
  {
    slug: "anatomy-of-a-demo-that-converts",
    title: "The anatomy of a product demo that actually converts",
    dek: "We analysed retention curves across 41,000 published demos. The videos that convert share five structural properties, and almost none of them are about production quality.",
    category: "Research",
    author: { name: "Priya Raman", role: "Head of Content" },
    date: "2026-09-02",
    readMinutes: 11,
    featured: true,
    body: [
      { t: "p", text: "We have per-second retention data on 41,000 demos published through DemoRiff, covering roughly 94 million views. That is an unusual dataset: most video analytics stop at completion rate, and almost nobody can correlate watch behaviour with what was being said at that exact second. Because our videos carry an aligned transcript, we can." },
      { t: "p", text: "What follows is what the curves say. Some of it confirms what good demo-makers already know. Some of it contradicts advice that gets repeated constantly." },

      { t: "h2", text: "1. The first eight seconds decide almost everything" },
      { t: "p", text: "Across the whole corpus, the correlation between eight-second retention and completion rate is 0.71. Nothing else we measured comes close. A demo that holds 90% of viewers at the eight-second mark completes at a median of 61%. One that holds 60% completes at a median of 19%." },
      { t: "p", text: "This is not a surprising finding in itself. What is surprising is how many demos spend those eight seconds on things that could not possibly earn them: a logo animation, a presenter introducing themselves, a summary of what the video will cover." },
      { t: "callout", tone: "warn", title: "The single most common mistake", text: "In our sample, 38% of demos had not shown the product by the eight-second mark. Their median completion rate was 22%, against 54% for demos that had." },
      { t: "p", text: "The demos that hold attention open on the product doing the thing. Not the problem statement, not the company, not the agenda — the interface, mid-action, at the moment something useful happens." },

      { t: "h2", text: "2. Outcome before mechanism, always" },
      { t: "p", text: "The second-strongest predictor is structural: whether the demo shows the result before explaining how to get it." },
      { t: "p", text: "The instinct when demonstrating software is to walk through it in the order a user would perform it. Open the thing, configure the thing, run the thing, see the result. That is the order of operations, and it is almost always the wrong order for a demo, because it front-loads all the setup — which is the least interesting and most effortful-looking part — before the viewer has any reason to care." },
      { t: "p", text: "Demos that show the outcome first and then explain the path to it retain 31% better through the middle third. The pattern is: here is the finished thing, it took four clicks, here are the four clicks." },
      { t: "quote", text: "Nobody has ever been convinced by a configuration screen. They have been convinced by what the configuration screen produces.", cite: "From our internal demo review checklist" },

      { t: "h2", text: "3. Length matters far less than people assume" },
      { t: "p", text: "The received wisdom is that demos must be short. Our data is more specific than that: length correlates with completion rate, obviously, but it barely correlates at all with the metric that matters, which is whether the viewer takes the next action." },
      { t: "table", head: ["Duration", "Median completion", "CTA click rate"], rows: [
        ["Under 60s", "78%", "6.1%"],
        ["60–120s", "64%", "11.8%"],
        ["2–4 min", "49%", "13.2%"],
        ["4–8 min", "34%", "12.4%"],
        ["Over 8 min", "19%", "7.9%"],
      ]},
      { t: "p", text: "The sweet spot for conversion is between ninety seconds and four minutes — considerably longer than the thirty-second maximum that circulates as best practice. Very short demos complete beautifully and convert poorly, because there was never enough substance to move anyone. The failure mode above eight minutes is real, but it is a failure of editing rather than of length: long demos in our data are almost always long because nothing was cut, not because there was that much to say." },

      { t: "h2", text: "4. Rewatch spikes are more informative than drop-offs" },
      { t: "p", text: "Everybody looks at where viewers leave. Almost nobody looks at where they go back, and the rewatch signal is more actionable." },
      { t: "p", text: "A drop-off tells you the viewer stopped caring, which could mean a hundred things. A rewatch spike tells you something specific: the viewer cared enough to go back, and did not understand it the first time. That is a precise instruction to re-explain a specific sentence." },
      { t: "p", text: "In our data, the single most common rewatch trigger is a price or a number stated once, quickly, without being shown on screen. The second most common is an acronym used before it is defined." },

      { t: "h2", text: "5. The narrator's confidence is measurable and it matters" },
      { t: "p", text: "This one surprised us. We can measure hesitation density in the source audio — filler words, restarts, mid-sentence corrections — before any editing is applied. Demos whose source recording had high hesitation density convert worse even after the fillers are removed." },
      { t: "p", text: "The effect persists through editing, which means it is not the ums themselves. Our best hypothesis is that hesitation is a proxy for the speaker not having a clear mental model of what they are explaining — and that lack of clarity survives into the sentence structure, the ordering and the emphasis, none of which editing fixes." },
      { t: "callout", tone: "good", title: "The practical implication", text: "Record with the person who built it, or with someone who has explained it out loud at least ten times. Do not record with whoever is free. Editing can fix delivery; it cannot fix not knowing the argument." },

      { t: "h2", text: "What this means for how you make demos" },
      { t: "steps", items: [
        { title: "Open on the product, mid-action", text: "No logo, no agenda, no introduction. The first frame should be your interface doing something." },
        { title: "Show the outcome in the first fifteen seconds", text: "Then go back and explain how. The setup is only interesting once the payoff is established." },
        { title: "Aim for 90 seconds to 4 minutes", text: "Long enough to be substantive, short enough that cutting is still disciplined." },
        { title: "Put every number on screen", text: "If you say it, show it. This single change eliminates most rewatch spikes." },
        { title: "Record with someone who knows it cold", text: "Hesitation is a signal about the argument, not about the speaker's camera skills." },
      ]},
      { t: "p", text: "None of these are production-quality changes. The tooling matters — it is much easier to cut ruthlessly when cutting means deleting a sentence — but the structure is the thing that moves the number, and structure is free." },
    ],
  },

  {
    slug: "video-documentation-drift",
    title: "Your help center is lying, and everybody knows it",
    dek: "Documentation drift is the silent tax on every software company. Here is how to measure it, and why the fix is structural rather than editorial.",
    category: "Strategy",
    author: { name: "Mika Lindqvist", role: "Customer Education" },
    date: "2026-08-19",
    readMinutes: 9,
    body: [
      { t: "p", text: "Pick a random article from your help center. Open your product beside it. Follow the steps exactly as written." },
      { t: "p", text: "In our experience of doing this with customers, roughly one article in three fails within the first four steps. A button has moved, a label has changed, a screen has an extra confirmation dialog that was not there when the article was written. Nothing is catastrophically wrong. It is just slightly, consistently untrue." },
      { t: "h2", text: "Drift is a rate, not an event" },
      { t: "p", text: "Documentation does not become wrong all at once. It decays at a rate that is a function of two things: how fast your product changes, and how expensive it is to update a document." },
      { t: "p", text: "Most teams try to solve this on the first term — freeze the UI, batch the changes, coordinate release notes with the docs team. This never works for long, because shipping less is a bad solution to any problem." },
      { t: "p", text: "The second term is the one you can actually move. If updating an article costs forty minutes of a technical writer's time, you will update the ones that generate tickets and leave the rest. If it costs ninety seconds, you will update everything." },
      { t: "callout", tone: "info", title: "A number worth calculating", text: "Take the number of customer-visible changes you shipped last quarter, multiply by the number of articles each one touched, and multiply by your cost to update an article. That is your drift debt. Most teams have never computed it." },
      { t: "h2", text: "Screenshots are the expensive part" },
      { t: "p", text: "Text is cheap to update. A writer can fix a sentence in seconds. Screenshots are what make documentation expensive, because updating one means opening the product, reproducing the state, capturing the frame, cropping it, annotating it, redacting anything sensitive and re-uploading." },
      { t: "p", text: "This is why so many help centers have accurate text sitting above an out-of-date image — the writer updated what was cheap and skipped what was not. Customers notice this immediately, and it is worse than having no screenshot at all, because it actively misleads." },
      { t: "h2", text: "The structural fix" },
      { t: "p", text: "The fix is to stop treating documentation as a document and start treating it as a derived artifact. If the article is generated from a recording of the flow, then updating the article means re-recording the flow — which takes ninety seconds and produces correct text, correct screenshots and correct annotations simultaneously." },
      { t: "p", text: "This is a different mental model than most documentation tooling assumes. It means your source of truth is a capture, not a page. It means diffs happen at the level of the flow rather than the paragraph. And it means the video and the article cannot contradict each other, because they came from the same take." },
      { t: "h2", text: "What changes when the cost drops" },
      { t: "ul", items: [
        "You document the edge cases, because documenting them is no longer a project.",
        "You localize, because localization is a derived operation rather than a vendor engagement.",
        "You update after every release rather than every quarter.",
        "Support stops writing shadow documentation in macros because the real documentation is current.",
        "Product starts reading the analytics on your guides, because they turn out to be a good signal about which parts of the product are confusing.",
      ]},
      { t: "p", text: "That last one is the underrated effect. When documentation is current, the places where people get stuck reading it are a reliable map of the places where they get stuck using the product. Stale documentation cannot tell you that, because you can never separate confusion about the product from confusion caused by the document being wrong." },
    ],
  },

  {
    slug: "how-auto-zoom-works",
    title: "How automatic zoom actually works (and why most implementations feel wrong)",
    dek: "A technical walkthrough of framing a zoom on intent rather than on coordinates, and the easing decisions that separate a camera operator from a slideshow.",
    category: "Engineering",
    author: { name: "Tom Aldridge", role: "Engineering" },
    date: "2026-08-05",
    readMinutes: 13,
    body: [
      { t: "p", text: "Automatic zoom is the feature people notice first and the one that most often feels subtly wrong. This post is about why." },
      { t: "h2", text: "The naive implementation" },
      { t: "p", text: "The obvious approach: detect clicks, and for each click, scale the frame around the cursor position for some fixed duration." },
      { t: "p", text: "This produces output that is technically correct and viscerally unpleasant. Three reasons." },
      { t: "ol", items: [
        "The cursor is not the subject. When you click a button, the interesting region is the button and what it affects — not the twelve pixels under the pointer.",
        "Fixed duration ignores what happens next. A click that opens a modal needs the zoom to hold; a click that navigates needs it to release immediately.",
        "Linear scaling reads as mechanical. Real camera movement has acceleration and settle.",
      ]},
      { t: "h2", text: "Framing on intent" },
      { t: "p", text: "Our recorder captures the DOM element that was interacted with, along with its bounding box, role and accessible name. That changes the framing problem from “zoom toward a point” to “compose a shot containing this element and its consequences.”" },
      { t: "p", text: "Concretely, for each interaction we compute a target rectangle from the union of: the interacted element's bounds, any element that changed within 400ms of the interaction, and a padding margin proportional to the element's size. Then we fit that rectangle into the output frame with a maximum scale cap." },
      { t: "code", lang: "typescript", code: `function targetRect(event: InteractionEvent, mutations: Mutation[]): Rect {
  const consequences = mutations
    .filter((m) => m.at - event.at < 400 && m.at >= event.at)
    .map((m) => m.bounds);

  const union = consequences.reduce(unionRect, event.element.bounds);

  // Padding scales with the element so a small button does not get a
  // claustrophobic frame and a large panel does not float in dead space.
  const pad = clamp(Math.sqrt(area(event.element.bounds)) * 0.85, 24, 160);

  return inflate(union, pad);
}` },
      { t: "p", text: "The mutation window is the part that matters most. It is what makes the zoom frame a dropdown that opens below the button, rather than framing the button and leaving the dropdown off-screen — which is the single most common failure in naive implementations." },
      { t: "h2", text: "Hold duration from consequence, not from a constant" },
      { t: "p", text: "How long a zoom holds should be a function of how long the thing it is framing remains interesting. We derive it from three signals: how long until the next interaction, whether the framed region is still mutating, and whether the narration is still talking about it." },
      { t: "p", text: "That last signal is available because we have an aligned transcript. If the narration says “and here the rate appears” at 0:34 and continues describing it until 0:41, the zoom holds until 0:41 regardless of whether the user clicked something else at 0:36." },
      { t: "callout", tone: "info", title: "Why this matters more than it sounds", text: "Zoom timing driven by clicks alone produces video that fights the narration. Zoom timing driven by narration produces video that illustrates it. The difference is the whole thing." },
      { t: "h2", text: "Easing, and why most tools get it wrong" },
      { t: "p", text: "A camera operator pushing in does not move at constant velocity. There is acceleration at the start, a longer coast, and a settle at the end that overshoots very slightly and returns." },
      { t: "p", text: "Most implementations use ease-in-out, which is symmetric and reads as mechanical. We use an asymmetric curve with a fast start, a long tail and a tiny overshoot — closer to a critically damped spring than to a cubic bezier." },
      { t: "code", lang: "typescript", code: `// Asymmetric push: quick departure, long settle, 1.5% overshoot.
const push = (t: number) => {
  const e = 1 - Math.pow(1 - t, 3.2);          // fast out
  const overshoot = Math.sin(t * Math.PI) * 0.015;
  return e + overshoot * (1 - t);              // decays to zero at t=1
};` },
      { t: "p", text: "The overshoot is 1.5%. It is invisible frame by frame and unmistakable in motion. Remove it and viewers describe the result as “fine”; include it and they describe it as “professional,” without being able to say why." },
      { t: "h2", text: "Knowing when not to zoom" },
      { t: "p", text: "The hardest part is restraint. A demo that zooms on every click is exhausting. We suppress zooms when: the previous zoom ended less than 1.2 seconds ago, the target rectangle is more than 70% of the frame, the interaction is part of a rapid sequence the viewer does not need to follow individually, or the narration is describing something general rather than something specific." },
      { t: "p", text: "In practice this cuts the number of zooms by about 60% from the naive count, and every user study we have run prefers the reduced version." },
    ],
  },

  {
    slug: "sales-demo-personalization",
    title: "Personalized demos, without a personalization team",
    dek: "Why one master recording and seven generated variants beats seven separately recorded demos — and how to structure the master so the variants work.",
    category: "Strategy",
    author: { name: "Daniel Okafor", role: "Go-to-market" },
    date: "2026-07-22",
    readMinutes: 8,
    body: [
      { t: "p", text: "Every sales org eventually discovers that a tailored demo outperforms a generic one, and then discovers that tailoring is expensive enough that it only happens for the biggest deals. This post is about breaking that trade-off." },
      { t: "h2", text: "What “tailored” actually means" },
      { t: "p", text: "When a buyer says a demo felt relevant, they are almost never responding to the footage. They are responding to three things: the vocabulary used, the examples chosen, and the order in which capabilities were shown." },
      { t: "p", text: "All three are narration-layer decisions. The screens are identical. This is the structural insight that makes generated variants possible: you do not need seven recordings, you need one recording and seven scripts." },
      { t: "h2", text: "Structuring the master recording" },
      { t: "p", text: "For variant generation to work, the master has to be recorded with some discipline." },
      { t: "steps", items: [
        { title: "Record the superset, not the story", text: "Capture every screen any segment might need, in a logical order. The story gets constructed later by choosing and ordering segments." },
        { title: "Keep segments self-contained", text: "Each logical step should start and end at a stable screen state, so segments can be reordered without visual discontinuity." },
        { title: "Avoid segment-specific data in frame", text: "Use neutral demo data. Segment-specific examples belong in the narration, where they are cheap to change." },
        { title: "Narrate mechanically on the master", text: "Describe what is happening without framing or persuasion. The persuasive layer is written per variant." },
      ]},
      { t: "h2", text: "What varies per segment" },
      { t: "table", head: ["Layer", "Varies?", "Why"], rows: [
        ["Footage", "No", "The product is the same regardless of who is watching"],
        ["Segment order", "Yes", "Lead with what this buyer cares about most"],
        ["Vocabulary", "Yes", "A marketplace says payouts; a lender says disbursements"],
        ["Examples", "Yes", "Named in narration and callouts, not in the UI"],
        ["Length", "Yes", "Technical buyers tolerate more; executives do not"],
        ["CTA", "Yes", "Different next step per stage and persona"],
      ]},
      { t: "h2", text: "The per-deal layer" },
      { t: "p", text: "Beyond segment variants, there is a second layer of personalization that is almost free: per-deal tokens. The prospect's logo composited into the frame, their company named in the opening line, the CTA pointing at the specific rep's calendar." },
      { t: "p", text: "The honest assessment is that this is a modest effect on its own — buyers are not naive about templated personalization. What it does reliably is signal effort, which changes how the recipient reads everything else in the email." },
      { t: "callout", tone: "warn", title: "One thing to avoid", text: "Do not personalize the product data in frame to look like the prospect's account. It reads as deceptive the moment anyone notices, and someone always notices. Personalize the framing, not the evidence." },
      { t: "h2", text: "Measuring whether it worked" },
      { t: "p", text: "The metric that matters is not watch rate on the demo you sent. It is whether it got forwarded. A demo that one champion watches is a demo that did nothing; a demo that gets opened by three new people at the same account is a deal progressing." },
      { t: "p", text: "Track new-viewer events per account, not view counts per link. It is a substantially better leading indicator than anything else we have found." },
    ],
  },

  {
    slug: "why-we-dont-meter-documentation",
    title: "Why we don't meter documentation",
    dek: "A product decision that costs us money and we would make again. Metering docs creates exactly the wrong incentive.",
    category: "Product",
    author: { name: "Sofia Benali", role: "Product" },
    date: "2026-07-08",
    readMinutes: 5,
    body: [
      { t: "p", text: "Written guides are unlimited on every DemoRiff plan, including the free one. People ask us fairly often whether that is a mistake." },
      { t: "h2", text: "The argument for metering" },
      { t: "p", text: "It is not a bad argument. Generating a guide costs us something — transcription, screenshot extraction, annotation, storage, serving. Multiply by unlimited usage and the number stops being trivially small. Every competitor in this category meters something here." },
      { t: "h2", text: "The argument against" },
      { t: "p", text: "Metering creates a decision. Every time someone considers documenting something, they now have to evaluate whether this particular process is worth spending a unit on." },
      { t: "p", text: "The problem is that the documentation most worth having is exactly the documentation that loses that evaluation. Nobody hesitates to document the primary onboarding flow. What does not get written is the obscure edge case that affects four percent of customers, the workaround for the known bug, the thing that only comes up when someone is migrating from a competitor." },
      { t: "quote", text: "The marginal article is almost always worth more to the customer than it costs us to generate. Pricing that discourages the marginal article is pricing against the product's own purpose." },
      { t: "h2", text: "The second-order effect" },
      { t: "p", text: "There is a business argument too, and it is not altruistic. Teams whose documentation is complete have lower support costs, better activation and better retention — with us as well as with their own customers. A customer whose help center is comprehensive is a customer who stays." },
      { t: "p", text: "Metering video makes sense because rendering is genuinely expensive and the cost scales with output length in a way customers can reason about. Metering documentation does not, so we do not." },
      { t: "callout", tone: "good", title: "What this means in practice", text: "Record a silent walkthrough of anything, any number of times, on any plan, and publish the resulting article. No credits, no quota, no upgrade prompt." },
    ],
  },

  {
    slug: "localization-is-an-operations-problem",
    title: "Localization is an operations problem, not a translation problem",
    dek: "Producing one localized video is easy. Keeping eleven of them current through a year of product changes is where every team gives up.",
    category: "Strategy",
    author: { name: "Renata Alves", role: "Content" },
    date: "2026-06-24",
    readMinutes: 7,
    body: [
      { t: "p", text: "Ask any team why their video content is English-only and you will hear a cost answer. It is usually not the real answer." },
      { t: "p", text: "The real answer becomes visible about four months in. The team localized eight videos, felt good about it, and then shipped a product change that invalidated six of them. Updating six videos in eleven languages is sixty-six jobs. Nobody does sixty-six jobs. So the localized library quietly becomes a liability — worse than not having it, because customers in those markets are now being shown something wrong in their own language." },
      { t: "h2", text: "The three states of a localized asset" },
      { t: "p", text: "Any localized asset is in one of three states, and most tooling can only distinguish two of them." },
      { t: "ul", items: [
        "Current — matches the source, which matches the product.",
        "Stale — the source changed and this language has not been regenerated.",
        "Diverged — someone made a manual correction in this language that would be lost by regenerating.",
      ]},
      { t: "p", text: "The third state is where localization operations actually break. A native reviewer fixes an awkward phrase in German. Three weeks later the source changes, everything regenerates, and their fix is gone. It happens twice and the reviewer stops reviewing." },
      { t: "h2", text: "Pinning" },
      { t: "p", text: "The fix is to make divergence a first-class state rather than an accident. A language can be pinned at the segment level: this paragraph has been humanly corrected, regenerate everything around it but leave this alone." },
      { t: "p", text: "That turns a regeneration from a destructive operation into a merge, which is what makes it safe to run automatically." },
      { t: "h2", text: "Staleness as a dashboard, not a discovery" },
      { t: "p", text: "The second requirement is that staleness is visible without anyone going looking for it. When the source changes, every derived language should immediately be marked, with a diff of what changed and an estimate of which segments are affected." },
      { t: "p", text: "Teams that have this treat localization as a weekly review — here are the eleven things that went stale, approve the regeneration. Teams that do not have it treat localization as a quarterly project, which means for most of the quarter their localized content is wrong." },
      { t: "callout", tone: "info", title: "The billing dimension", text: "This is also why we do not charge video minutes for localized versions. If regenerating eleven languages costs eleven times a video, teams will not regenerate, and the library goes stale. Pricing has to agree with the workflow you want people to have." },
    ],
  },

  {
    slug: "recording-products-with-real-customer-data",
    title: "Recording your product when the screen is full of customer data",
    dek: "A practical guide to demo environments, masking policies and the things that get accidentally published.",
    category: "Craft",
    author: { name: "Tom Aldridge", role: "Security" },
    date: "2026-06-10",
    readMinutes: 9,
    body: [
      { t: "p", text: "Every B2B software company eventually publishes a video containing something it should not have. A customer name in a list view. An email address in a test account. An API key visible in a settings screen for eleven frames." },
      { t: "p", text: "It is rarely negligence. It is that the person recording is concentrating on the demo, and the sensitive thing was in their peripheral vision for two seconds." },
      { t: "h2", text: "Three approaches, in order of preference" },
      { t: "h3", text: "1. A seeded demo tenant" },
      { t: "p", text: "The best option by a wide margin: a dedicated tenant in staging, populated with fictional data that looks realistic. It costs a day to build and eliminates the problem structurally." },
      { t: "p", text: "The usual objection is that the demo tenant never has enough data to look real. That is a seeding problem, not an argument against the approach. Generate a few thousand plausible records once and maintain them with a script that runs weekly." },
      { t: "h3", text: "2. Production with enforced masking" },
      { t: "p", text: "Sometimes production is unavoidable — the feature only works with real volume, or the staging environment is three releases behind. In that case the masking has to be enforced at the workspace level rather than left to the person recording." },
      { t: "p", text: "The distinction matters enormously. A masking feature that the recorder has to remember to turn on will be forgotten. A workspace policy that applies automatically and cannot be disabled will not." },
      { t: "h3", text: "3. Post-hoc redaction" },
      { t: "p", text: "The worst option, because it means the sensitive value was written to storage before it was removed. If your threat model includes your own vendor's storage, post-hoc redaction does not solve it." },
      { t: "callout", tone: "warn", title: "The thing people forget", text: "Blur the video and you have blurred the video. The transcript, the generated guide, the screenshots and the search index may all still contain the value. Redaction has to apply to every derived artifact, not just the frames." },
      { t: "h2", text: "What to mask" },
      { t: "p", text: "Start with the obvious: email addresses, phone numbers, card numbers, API keys, bearer tokens, account identifiers, physical addresses. Then add the ones specific to you — customer names in a list, internal ticket references, anything that identifies which of your customers this is." },
      { t: "p", text: "A pattern worth adopting: mark whole regions as always-blurred rather than relying on value detection. If the left panel of your app always contains a customer list, mask the region. Detection catches known patterns; region masking catches the ones you did not anticipate." },
      { t: "h2", text: "Publishing checks" },
      { t: "ul", items: [
        "Review the generated guide's screenshots separately from the video — they are cropped differently and may reveal what the video did not.",
        "Search the transcript for @ and for digit sequences of 13+ characters before publishing.",
        "Check the first and last two seconds specifically; that is where recording starts before the demo tenant is loaded.",
        "If a video is public, assume it will be indexed, archived and downloaded. Retraction is not a control.",
      ]},
    ],
  },

  {
    slug: "interactive-demos-vs-video",
    title: "When to use an interactive demo and when to use a video",
    dek: "They are not substitutes. Different funnel stages, different viewer intent, and a straightforward rule for choosing.",
    category: "Craft",
    author: { name: "Priya Raman", role: "Head of Content" },
    date: "2026-05-27",
    readMinutes: 6,
    body: [
      { t: "p", text: "Interactive demos engage roughly six times better than video embeds on the same page. That statistic gets quoted a lot, usually as an argument that video is obsolete. It is not, and the comparison is misleading because the two formats answer different questions." },
      { t: "h2", text: "The distinction that actually matters" },
      { t: "p", text: "Video answers “what is this and why should I care.” It is a directed argument — you control the order, the emphasis and the pace, which is exactly what you want when the viewer does not yet know enough to have their own questions." },
      { t: "p", text: "An interactive demo answers “can it do the specific thing I need.” It gives control to a viewer who already has a question and wants to check something. Handing that control to someone with no questions yet produces a viewer clicking aimlessly through screens they cannot contextualise." },
      { t: "h2", text: "A simple rule" },
      { t: "table", head: ["Viewer state", "Format", "Why"], rows: [
        ["Has never heard of you", "Video", "They need an argument, not a sandbox"],
        ["Evaluating against alternatives", "Interactive", "They have specific things to verify"],
        ["Champion selling internally", "Interactive", "Forwards better; colleagues self-serve"],
        ["Onboarding a new user", "Both", "Video for the why, interactive for the how"],
        ["Support, mid-problem", "Video + guide", "They want the answer, not exploration"],
      ]},
      { t: "h2", text: "The placement heuristic" },
      { t: "p", text: "Homepage: video. Pricing page: interactive. Feature pages: interactive with a video above it. Sales follow-up: interactive, because it gets forwarded. Help center: video with the written guide beneath." },
      { t: "p", text: "The reason to produce both from one recording is not that you cannot choose. It is that the same content genuinely needs to exist in multiple forms, and producing them separately guarantees they will drift apart." },
      { t: "callout", tone: "good", title: "The most underrated format", text: "The written guide. It has the lowest engagement metrics and the highest forward rate to people who are not going to watch anything. Half of every buying committee will never press play." },
    ],
  },
];

export function getPost(slug: string) {
  return posts.find((p) => p.slug === slug);
}

export const categories = Array.from(new Set(posts.map((p) => p.category)));
