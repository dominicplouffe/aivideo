import type { Block } from "./content-blocks";
import type { IconName } from "@/components/ui/Icon";

export interface Lesson {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  body: Block[];
}

export interface Course {
  slug: string;
  title: string;
  level: "Foundations" | "Intermediate" | "Advanced";
  icon: IconName;
  summary: string;
  outcomes: string[];
  lessons: Lesson[];
}

export const courses: Course[] = [
  {
    slug: "demo-fundamentals",
    title: "Demo fundamentals",
    level: "Foundations",
    icon: "play",
    summary:
      "The structural decisions that determine whether a product demo works, independent of the tool you make it with. Start here even if you never use DemoRiff.",
    outcomes: [
      "Structure a demo as an argument rather than a tour",
      "Write an opening that earns the next thirty seconds",
      "Choose a length based on funnel stage rather than folklore",
      "Know which moments deserve emphasis and which to cut",
    ],
    lessons: [
      {
        slug: "the-argument",
        title: "A demo is an argument",
        summary: "Why the tour format fails, and what to replace it with.",
        minutes: 7,
        body: [
          { t: "p", text: "Most product demos are organised around the product's structure: here is the dashboard, here is the settings page, here is the reporting module. That is a tour, and tours are what you give someone who has already decided to visit." },
          { t: "p", text: "A demo is given to someone who has not decided anything. It needs to make a case. Every case has the same three parts: a situation the viewer recognises as their own, a moment where the situation changes, and enough evidence that the change is real." },
          { t: "h2", text: "The recognisable situation" },
          { t: "p", text: "Open on something your viewer does today, shown concretely. Not “managing shipments is complex” — show the spreadsheet with forty tabs, or the eleven-step process, or the screen where they currently do this badly." },
          { t: "p", text: "The test is whether someone in your audience would watch the first eight seconds and think “that is my Tuesday.” If they would think “that is a generic stock scenario,” start again." },
          { t: "h2", text: "The moment it changes" },
          { t: "p", text: "There is one moment in every good demo where the viewer's posture changes. It is usually a single interaction — the click after which the painful thing is simply done. Find it before you record, and build everything around it." },
          { t: "callout", tone: "info", title: "Exercise", text: "Write down, in one sentence, the single interaction that is the turning point of your demo. If you cannot, you do not yet have a demo — you have a tour." },
          { t: "h2", text: "The evidence" },
          { t: "p", text: "After the turn, the viewer's question changes from “what is this” to “is this real.” That is where you show the edge case, the volume, the integration, the thing that proves it is not a prototype. Put it after the turn, never before." },
        ],
      },
      {
        slug: "the-first-eight-seconds",
        title: "The first eight seconds",
        summary: "The highest-leverage part of any demo, and how to write it.",
        minutes: 6,
        body: [
          { t: "p", text: "Eight-second retention correlates with completion at 0.71 across our dataset. Nothing else comes close. This lesson is about how to spend them." },
          { t: "h2", text: "What not to do" },
          { t: "ul", items: [
            "A logo animation. Nobody has ever stayed for a logo.",
            "“Hi, I'm Alex, and today I'm going to show you…” — you have spent four seconds on scheduling information.",
            "A problem statement in the abstract. Show the problem instead of describing it.",
            "An agenda slide. If the demo needs an agenda it is too long.",
          ]},
          { t: "h2", text: "What works" },
          { t: "p", text: "Open mid-action, on the product, at a moment that is legible without context. The strongest openings we see are a single fast sequence showing the outcome — the thing done, in three seconds — followed by “here is how that happened.”" },
          { t: "quote", text: "Start at the moment a film editor would start: after the setup, in the middle of the scene." },
          { t: "h2", text: "Writing the first line" },
          { t: "p", text: "The first spoken line should contain a specific noun from your viewer's world and a verb that implies change. “Pricing a multi-leg shipment takes our customers about forty minutes. Watch this.” is better than any amount of positioning language." },
        ],
      },
      {
        slug: "length-and-pacing",
        title: "Length, pacing and where to cut",
        summary: "How long a demo should be, and what to remove first.",
        minutes: 8,
        body: [
          { t: "p", text: "The thirty-second maximum is folklore. Our data puts the conversion sweet spot between ninety seconds and four minutes, which is substantially longer than most advice suggests." },
          { t: "h2", text: "Why very short demos underperform" },
          { t: "p", text: "They complete beautifully and convert poorly. A thirty-second demo can establish that something exists; it rarely establishes that it works. Viewers finish it with no objection answered and nothing to be convinced by." },
          { t: "h2", text: "Where the time goes in a bad demo" },
          { t: "table", head: ["Section", "Typical share", "Should be"], rows: [
            ["Intro and context", "22%", "8%"],
            ["Navigation and setup", "31%", "12%"],
            ["The actual capability", "28%", "55%"],
            ["Edge cases and proof", "9%", "20%"],
            ["Close and CTA", "10%", "5%"],
          ]},
          { t: "p", text: "Roughly half of a typical demo is spent getting to the point. That is the material to cut, and it is almost always cuttable — the viewer does not need to watch you navigate." },
          { t: "h2", text: "The cutting order" },
          { t: "ol", items: [
            "Everything before the first interesting frame.",
            "Navigation between screens that the viewer does not need to learn.",
            "Any sentence that describes what you are about to do rather than doing it.",
            "Repeated explanations of the same concept in different words.",
            "The summary at the end. Nobody needs a recap of a three-minute video.",
          ]},
        ],
      },
    ],
  },

  {
    slug: "recording-craft",
    title: "Recording craft",
    level: "Foundations",
    icon: "record",
    summary:
      "How to prepare, what to say, and how to record a take that edits well. Most of the quality of a finished demo is decided before you press record.",
    outcomes: [
      "Set up an environment that will not leak customer data",
      "Speak in a way that survives aggressive editing",
      "Record segments that can be reordered later",
      "Know when to re-take and when to keep going",
    ],
    lessons: [
      {
        slug: "environment",
        title: "Preparing the environment",
        summary: "Demo tenants, screen setup, and the things that ruin a take.",
        minutes: 7,
        body: [
          { t: "h2", text: "Build a demo tenant once" },
          { t: "p", text: "A seeded tenant in staging with realistic fictional data is the single highest-return investment in demo production. It costs a day and removes an entire category of problems permanently." },
          { t: "p", text: "Seed it with enough volume that it looks used — empty states are honest but unconvincing. A few thousand records generated by a script you can re-run weekly is usually enough." },
          { t: "h2", text: "Screen setup" },
          { t: "ul", items: [
            "Record at 1920×1080 or 2560×1440. Higher resolutions make your UI text small relative to the frame.",
            "Hide bookmarks, extensions, notifications and anything in the system tray.",
            "Close every other tab. Tab titles are legible and frequently embarrassing.",
            "Set your OS to do-not-disturb. A notification mid-take is a re-take.",
            "Use the default browser zoom. Zoomed-in UI limits how far the editor can push in later.",
          ]},
          { t: "callout", tone: "warn", title: "The most common leak", text: "The first two seconds, before you switch to the demo tenant. Start recording, wait three seconds, then begin. The editor will trim the head." },
        ],
      },
      {
        slug: "speaking",
        title: "Speaking for the edit",
        summary: "How to talk so the transcript cuts cleanly.",
        minutes: 6,
        body: [
          { t: "p", text: "You do not need to be polished. You do need to be structured, because structure is what editing cannot add." },
          { t: "h2", text: "Speak in complete sentences" },
          { t: "p", text: "Transcript-based editing cuts at sentence boundaries. If you speak in long chains of clauses joined by “and,” there are no clean cut points and every edit sounds abrupt. Short, complete sentences give the editor somewhere to cut." },
          { t: "h2", text: "Say the thing before you do the thing" },
          { t: "p", text: "“I'll click New shipment” then click, rather than clicking and then narrating over the result. It gives the editor the option to keep the narration and trim the dead time while the page loads." },
          { t: "h2", text: "Pause instead of restarting" },
          { t: "p", text: "When you fumble a sentence, stop, pause for two full seconds, and say the whole sentence again from the start. The pause is a marker the pipeline can find, and the clean second take will be used automatically." },
          { t: "callout", tone: "good", title: "Do not worry about", text: "Ums, ahs, verbal tics, false starts you corrected, or your accent. All of these are handled. Worry about structure and ordering, which are not." },
        ],
      },
      {
        slug: "segments",
        title: "Recording in segments",
        summary: "Why modular takes are worth the small extra effort.",
        minutes: 5,
        body: [
          { t: "p", text: "If you might ever need a variant of this demo — for a different audience, a different length, a different language — record it as segments rather than as one continuous performance." },
          { t: "h2", text: "What makes a good segment" },
          { t: "ul", items: [
            "Starts and ends at a stable screen state, so it can be reordered.",
            "Covers one idea, so it can be dropped without leaving a hole.",
            "Does not reference what came before it (“as we saw earlier” makes a segment non-portable).",
            "Is between fifteen and forty-five seconds of finished output.",
          ]},
          { t: "h2", text: "The practical method" },
          { t: "p", text: "Keep recording continuously, but pause for three seconds between segments and say nothing. Those gaps become segment boundaries automatically, and you have not had to manage eleven separate files." },
        ],
      },
    ],
  },

  {
    slug: "scaling-video-ops",
    title: "Scaling a video operation",
    level: "Intermediate",
    icon: "layers",
    summary:
      "Going from occasional videos to a hundred a quarter without the library becoming a mess. Governance, naming, staleness and the review process.",
    outcomes: [
      "Design a brand system that stops variance without stopping people",
      "Build a review process that does not become a bottleneck",
      "Track staleness so the library does not quietly become wrong",
      "Decide what to localize and when",
    ],
    lessons: [
      {
        slug: "governance",
        title: "Governance without gatekeeping",
        summary: "How to get consistency without becoming the approval queue.",
        minutes: 8,
        body: [
          { t: "p", text: "The instinct when video production opens up to a team is to add approval steps. That works until volume goes up, at which point the approver becomes the bottleneck and people route around them." },
          { t: "h2", text: "Constrain the decisions, not the people" },
          { t: "p", text: "Most brand inconsistency comes from a handful of decisions being made repeatedly by different people: logo placement, caption style, intro length, music, cursor treatment. Lock those in a brand kit and the variance disappears without anyone needing permission." },
          { t: "h2", text: "Approve by surface, not by asset" },
          { t: "p", text: "Require review for things that go on the marketing site or into a paid campaign. Do not require review for help-center content or sales leave-behinds. The risk profiles are entirely different and treating them the same guarantees the queue backs up." },
          { t: "table", head: ["Surface", "Review", "Rationale"], rows: [
            ["Homepage, pricing, campaigns", "Required", "High traffic, high cost to be wrong"],
            ["Feature and docs pages", "Spot check", "Moderate traffic, easy to fix"],
            ["Help center", "None", "Volume matters more than polish"],
            ["Sales leave-behinds", "None", "Reps own their own credibility"],
            ["Internal enablement", "None", "Audience will tell you if it is bad"],
          ]},
        ],
      },
      {
        slug: "staleness",
        title: "Managing staleness",
        summary: "A weekly ritual that keeps a large library honest.",
        minutes: 6,
        body: [
          { t: "p", text: "A library of two hundred videos will contain wrong ones. The question is whether you know which." },
          { t: "h2", text: "The weekly review" },
          { t: "p", text: "Thirty minutes, once a week: open the staleness dashboard, look at what the week's releases invalidated, and either approve a regeneration or mark it as acceptable. The discipline is that nothing sits in the stale state without a decision." },
          { t: "h2", text: "Tiering" },
          { t: "p", text: "Not everything deserves equal attention. Tier your library: tier one is anything on a page a prospect sees, tier two is help content, tier three is internal and archival. Tier one gets fixed within a week, tier two within a month, tier three when someone complains." },
          { t: "callout", tone: "info", title: "A useful metric", text: "Percentage of tier-one assets that are current. Most teams start around 55% and can get above 95% within a quarter simply by making staleness visible." },
        ],
      },
      {
        slug: "localization-strategy",
        title: "Deciding what to localize",
        summary: "Sequencing localization so it pays for itself.",
        minutes: 7,
        body: [
          { t: "p", text: "Because localization is cheap in this workflow, the temptation is to do all of it immediately. That is usually wrong, not because of cost but because of review capacity." },
          { t: "h2", text: "Review is the constraint" },
          { t: "p", text: "Generated translations are good. They are not good enough to publish customer-facing content without one native review pass, and review capacity is a real, finite resource — usually a regional colleague with a day job." },
          { t: "h2", text: "A sequencing that works" },
          { t: "ol", items: [
            "Start with the three assets a prospect sees first, in your top two non-English markets.",
            "Measure. If engagement in those markets moves, expand the asset set before expanding the language set.",
            "Add languages only where you have a named reviewer who has agreed to review.",
            "Localize help content last but exhaustively — it has the highest volume and the lowest review burden.",
          ]},
          { t: "callout", tone: "warn", title: "The failure mode", text: "Publishing eleven languages with no reviewer in nine of them. It looks like coverage and behaves like risk." },
        ],
      },
    ],
  },

  {
    slug: "demos-that-sell",
    title: "Demos that sell",
    level: "Advanced",
    icon: "target",
    summary:
      "Applying demo craft to the revenue motion: segment variants, buying-committee dynamics, and reading engagement data as intent.",
    outcomes: [
      "Build a segment variant strategy from one master recording",
      "Design leave-behinds that get forwarded internally",
      "Read engagement data as buying-committee signal",
      "Know which demo belongs at which funnel stage",
    ],
    lessons: [
      {
        slug: "variants",
        title: "Building segment variants",
        summary: "One master, seven audiences, no additional recording.",
        minutes: 8,
        body: [
          { t: "p", text: "Relevance in a demo comes from vocabulary, examples and ordering — all narration-layer decisions. The footage is the same. That is what makes variants nearly free." },
          { t: "h2", text: "Recording the master for variants" },
          { t: "ul", items: [
            "Capture the superset of screens any segment might need.",
            "Use neutral demo data so no segment's examples are baked into the frame.",
            "Narrate mechanically — describe, do not persuade. Persuasion is per-variant.",
            "Keep segments self-contained so ordering can change.",
          ]},
          { t: "h2", text: "Writing a variant" },
          { t: "p", text: "Take the master script and change three things: the opening (lead with what this segment cares about), the nouns (their words, not yours), and the examples (their scenario). Leave the mechanics alone." },
        ],
      },
      {
        slug: "buying-committee",
        title: "Designing for the buying committee",
        summary: "The person you demo to is rarely the person who decides.",
        minutes: 7,
        body: [
          { t: "p", text: "In B2B, a demo's job is frequently not to convince the viewer. It is to equip the viewer to convince four colleagues who will never be on a call with you." },
          { t: "h2", text: "Forwardability as a design goal" },
          { t: "p", text: "That changes what a good leave-behind looks like. It needs to be self-explanatory without you, short enough that a busy executive will open it, and structured so a specific section can be pointed to." },
          { t: "ul", items: [
            "Chapters, so the champion can say “watch from 1:20.”",
            "A written summary beneath, for the people who will not watch anything.",
            "An interactive version, which forwards at roughly twice the rate of video.",
            "No reference to the call it came from — it will be read by people who were not there.",
          ]},
          { t: "h2", text: "Reading the signal" },
          { t: "p", text: "New viewers at an account is the metric. One person watching repeatedly is interest; four different people watching once is a process." },
        ],
      },
      {
        slug: "funnel-mapping",
        title: "Mapping formats to funnel stages",
        summary: "Which asset belongs where, and why substituting them fails.",
        minutes: 6,
        body: [
          { t: "p", text: "Video and interactive demos are not substitutes. Video makes an argument to someone with no questions; an interactive demo answers questions someone already has." },
          { t: "table", head: ["Stage", "Primary asset", "Secondary"], rows: [
            ["Awareness", "90s video", "Social clips"],
            ["Consideration", "Interactive demo", "Feature videos"],
            ["Evaluation", "Segment-variant demo", "Written guides"],
            ["Internal selling", "Interactive leave-behind", "One-page summary"],
            ["Onboarding", "Video + guide", "Interactive walkthrough"],
            ["Support", "Written guide", "90s video answer"],
          ]},
          { t: "p", text: "The common mistake is putting an interactive demo on the homepage. Visitors there have no questions yet, so handing them control produces aimless clicking and a bounce." },
        ],
      },
    ],
  },
];

export function getCourse(slug: string) {
  return courses.find((c) => c.slug === slug);
}

export function getLesson(courseSlug: string, lessonSlug: string) {
  const course = getCourse(courseSlug);
  if (!course) return null;
  const index = course.lessons.findIndex((l) => l.slug === lessonSlug);
  if (index < 0) return null;
  return {
    course,
    lesson: course.lessons[index],
    prev: index > 0 ? course.lessons[index - 1] : null,
    next: index < course.lessons.length - 1 ? course.lessons[index + 1] : null,
    index,
  };
}
