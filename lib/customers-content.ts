export interface CaseStudy {
  slug: string;
  company: string;
  industry: string;
  size: string;
  region: string;
  headline: string;
  summary: string;
  useCases: string[];
  heroQuote: { quote: string; name: string; role: string };
  results: { value: string; label: string; detail: string }[];
  sections: { heading: string; body: string[] }[];
  pullQuote?: { quote: string; name: string; role: string };
  stack: string[];
  featured?: boolean;
}

export const caseStudies: CaseStudy[] = [
  {
    slug: "northwind",
    company: "Northwind",
    industry: "Revenue intelligence",
    size: "340 employees",
    region: "North America",
    featured: true,
    headline: "How Northwind replaced a two-week agency cycle with a Tuesday afternoon",
    summary:
      "Northwind's product marketing team was shipping nine launch videos a year against a roadmap that shipped forty features. Within a quarter of adopting DemoRiff they were shipping a video, an interactive tour and a help article for every release — with the same three people.",
    useCases: ["Feature launches", "Interactive demos", "Localization", "Help center"],
    heroQuote: {
      quote:
        "We used to budget two weeks and eleven thousand dollars for a launch video. Our last three launches were recorded on a Tuesday and live on Wednesday. The agency invoice line item is gone.",
      name: "Priya Raman",
      role: "VP Product Marketing",
    },
    results: [
      { value: "14 days → 1", label: "Launch video turnaround", detail: "Median elapsed time from feature-complete to published asset" },
      { value: "$412k", label: "Annual production spend removed", detail: "External agency and freelance editor budget, reallocated" },
      { value: "9 → 140", label: "Videos shipped per year", detail: "With the same three-person product marketing team" },
      { value: "+3.2×", label: "Trial-to-paid on demo-led pages", detail: "Pages with an interactive tour vs. the previous static pages" },
    ],
    sections: [
      {
        heading: "The problem was arithmetic, not ambition",
        body: [
          "Northwind ships roughly forty customer-visible features a year. Their product marketing team is three people. A launch video, produced properly through their agency, took between nine and fourteen elapsed days and cost around eleven thousand dollars once revisions were counted.",
          "The arithmetic did not work, so a triage process emerged: the two or three largest releases each quarter got a video, and everything else got a changelog entry and a screenshot. Sales filled the gap by recording their own walkthroughs, which were useful but looked exactly like what they were.",
          "“The worst part was that the features that most needed explaining were rarely the biggest ones,” says Priya Raman, who runs the team. “The genuinely differentiated thing we shipped might be a workflow change that takes ninety seconds to show and is almost impossible to describe in a paragraph.”",
        ],
      },
      {
        heading: "Recording with the person who built it",
        body: [
          "The workflow Northwind settled on is deliberately simple. When a feature reaches feature-complete on staging, the product marketer books twenty minutes with the PM who owns it and records them walking through it — no script, no rehearsal, no slides.",
          "That recording produces four assets. The directed video goes on the launch page and into the release email. The interactive tour is embedded on the relevant pricing-page section. The written guide is pushed to Zendesk. Six vertical clips go to the social queue.",
          "“The PM interview format turned out to matter more than we expected,” Raman says. “The explanation is better when it comes from the person who made the decisions, and they will say things in a twenty-minute conversation that would never survive a brief.”",
        ],
      },
      {
        heading: "Localization stopped being a separate project",
        body: [
          "Northwind sells into eleven markets and had historically localized the website and nothing else. Video localization had been quoted at roughly four thousand dollars per video per language, which made it permanently a next-quarter problem.",
          "Every launch asset is now published in six languages on day one, with a further five added for markets where the regional team requests them. The regional teams review the translations rather than commissioning them.",
          "The effect on the EMEA pipeline was measurable within two quarters: demo requests originating from non-English pages rose by 58%, from a base that the team describes as “embarrassingly low.”",
        ],
      },
      {
        heading: "What they would tell someone evaluating",
        body: [
          "“Do not start with your most important video,” Raman advises. “Start with the four features you never had time to cover, because those are the ones where anything is better than nothing, and you will learn the workflow with no pressure.”",
          "“The second thing is to lock the brand kit early. We spent a week letting everyone make their own choices and the library looked like it. Once it was locked, the variance between our best and worst producer basically disappeared.”",
        ],
      },
    ],
    pullQuote: {
      quote:
        "The features that most needed explaining were rarely the biggest ones. Now they all get explained.",
      name: "Priya Raman",
      role: "VP Product Marketing, Northwind",
    },
    stack: ["Zendesk", "HubSpot", "Webflow", "Slack", "Linear"],
  },

  {
    slug: "cardinal",
    company: "Cardinal",
    industry: "Fintech infrastructure",
    size: "1,100 employees",
    region: "Global",
    featured: true,
    headline: "Cardinal gave twelve hours a week back to every solutions engineer",
    summary:
      "Cardinal's sales engineering org was rebuilding the same core demo for seven verticals, over and over. Now one master recording generates the variants, and personalized leave-behinds tell reps exactly who in the buying committee engaged.",
    useCases: ["Sales demos", "Personalization", "CRM engagement", "Leave-behinds"],
    heroQuote: {
      quote:
        "Our solutions engineers were spending a third of their week rebuilding the same demo for different verticals. Now they record once and the variants generate themselves. We gave the team back twelve hours each.",
      name: "Daniel Okafor",
      role: "Director of Sales Engineering",
    },
    results: [
      { value: "12 hrs/wk", label: "Returned per solutions engineer", detail: "Across a team of 18, measured by internal time tracking" },
      { value: "+38%", label: "Follow-up engagement", detail: "Watch-through rate on leave-behinds vs. ad-hoc recordings" },
      { value: "2.1×", label: "Internal forward rate", detail: "Interactive tours forwarded within buying committees vs. video" },
      { value: "−9 days", label: "Median cycle time", detail: "On deals where a personalized demo was sent within 24 hours" },
    ],
    sections: [
      {
        heading: "Seven verticals, one product, endless rebuilds",
        body: [
          "Cardinal sells payment infrastructure into seven fairly distinct verticals. The product is the same; the framing is not. A marketplace cares about split payouts, a lender cares about underwriting hooks, a platform cares about onboarding friction.",
          "Each of those framings meant a different demo — different sample data, different order of operations, different emphasis. Cardinal's eighteen solutions engineers were each maintaining their own versions, which meant eighteen slightly different explanations of the same product were in front of customers at any moment.",
          "“It was not a quality problem, it was a consistency and a time problem,” says Daniel Okafor. “Every SE was a good demo-giver. They were just each spending a third of their week being a video editor, badly.”",
        ],
      },
      {
        heading: "One master, many variants",
        body: [
          "Cardinal's most experienced SE recorded a definitive forty-minute walkthrough of the core flow. From that single source, the team generated seven vertical variants: same footage, different narration emphasis, different terminology, different examples called out by the callouts.",
          "Each variant takes minutes to produce rather than hours, and critically, when the product changes, the master is re-recorded once and all seven rebuild.",
          "Personalization goes one layer further. Per-deal links swap the prospect's logo into the frame, name the account in the opening line, and point the closing CTA at the specific rep's calendar.",
        ],
      },
      {
        heading: "Finding out who actually watched",
        body: [
          "The change Okafor describes as most consequential was not production speed but visibility. Cardinal's leave-behinds are personalized links, so engagement resolves to a person and an account, and flows into Salesforce as timeline events.",
          "Reps are alerted when someone from a target account watches past 60%, and when a new person from that account opens a link they were forwarded — which turns out to be the single most reliable signal that a deal is progressing internally.",
          "“Before, a follow-up recording went into a void,” Okafor says. “Now when the CFO we have never spoken to watches the pricing section twice, we know, and the next call is a completely different conversation.”",
        ],
      },
    ],
    pullQuote: {
      quote:
        "When the CFO we have never spoken to watches the pricing section twice, we know. The next call is a completely different conversation.",
      name: "Daniel Okafor",
      role: "Director of Sales Engineering, Cardinal",
    },
    stack: ["Salesforce", "Slack", "Gong", "Okta"],
  },

  {
    slug: "tessera",
    company: "Tessera",
    industry: "Data warehouse",
    size: "620 employees",
    region: "North America, EMEA",
    headline: "Tessera cut onboarding tickets in half by publishing docs and video together",
    summary:
      "Tessera's customer education team could record six lessons a month against a product that changed twelve things a month. Generating video and documentation from one capture closed the gap — and halved onboarding ticket volume in two quarters.",
    useCases: ["Customer education", "Help center", "Localization", "Analytics"],
    heroQuote: {
      quote:
        "The written guides are the sleeper feature. Every video we publish also becomes a help article, in six languages, with screenshots that are always current. Support ticket volume on onboarding fell by half.",
      name: "Mika Lindqvist",
      role: "Head of Customer Education",
    },
    results: [
      { value: "−51%", label: "Onboarding support tickets", detail: "Two quarters after the academy relaunch" },
      { value: "4×", label: "Lessons published per quarter", detail: "Same two-person education team" },
      { value: "+29%", label: "Course completion rate", detail: "After restructuring based on retention data" },
      { value: "6", label: "Languages by default", detail: "Previously English only" },
    ],
    sections: [
      {
        heading: "The academy was quietly becoming wrong",
        body: [
          "Tessera had a well-regarded customer academy: forty-one lessons covering everything from first connection to advanced modelling. It had been built over eighteen months by a two-person team, and by the time the last lesson was published the first eleven were describing an interface that no longer existed.",
          "“Content decay is the whole problem in customer education and nobody talks about it,” says Mika Lindqvist. “Everyone benchmarks how many lessons you have. Nobody benchmarks how many of them are still true.”",
          "The written documentation was maintained separately, by a different team, which meant the video and the article would periodically contradict each other — the fastest way to lose a customer's trust in both.",
        ],
      },
      {
        heading: "One capture, both formats, permanently in sync",
        body: [
          "Tessera rebuilt the academy so that every lesson is a single recording producing both a video and a written article. Because they are derived from the same source, they cannot disagree.",
          "When the product changes, the team re-records only the affected step. The video, the article, the animated GIFs and all six language versions rebuild around it. A UI refresh that would previously have been triaged into next quarter is now an afternoon.",
          "The team also discovered a use they had not anticipated: retention data across the course turned out to be a product signal. A lesson that everyone abandons at the same step is usually pointing at a genuinely confusing part of the product.",
        ],
      },
      {
        heading: "Support saw it first",
        body: [
          "The ticket impact was not gradual. Within six weeks of publishing the rebuilt onboarding track, tickets tagged as onboarding questions fell by roughly a third; by the end of the second quarter they were down 51%.",
          "Lindqvist attributes most of it to two things: the guides being genuinely current, and the same content existing in both formats. “Half our customers were never going to watch a video. We had been serving them a transcript and calling it documentation.”",
        ],
      },
    ],
    stack: ["Zendesk", "Skilljar", "Confluence", "Amplitude"],
  },

  {
    slug: "foldr",
    company: "Foldr",
    industry: "Document AI",
    size: "9 employees",
    region: "EMEA",
    headline: "Foldr raised a $4.2M seed on a demo made by a non-technical founder",
    summary:
      "Foldr had no marketing team, no budget for production, and a founder who describes herself as bad on camera. The homepage demo they built in an afternoon became the asset that carried their fundraise.",
    useCases: ["Homepage demo", "Fundraising", "Documentation", "Interactive tour"],
    heroQuote: {
      quote:
        "I am a non-technical founder who sounds, on camera, like a non-technical founder. DemoRiff made my product look like it came out of a company with a marketing department. We closed our seed on that demo.",
      name: "Sofia Benali",
      role: "Co-founder & CEO",
    },
    results: [
      { value: "$4.2M", label: "Seed round closed", detail: "Led by a fund that first saw the product through the demo" },
      { value: "1 day", label: "From nothing to homepage video", detail: "Including brand kit setup" },
      { value: "$0", label: "External production spend", detail: "Built on the free plan, then Starter" },
      { value: "41%", label: "Homepage visitors who watch", detail: "Median watch-through of 63%" },
    ],
    sections: [
      {
        heading: "The demo was doing the selling whether they liked it or not",
        body: [
          "Foldr's first homepage had a fifteen-minute unlisted video in which Sofia Benali walks through the product, apologises twice for the test data, and says “um” approximately once every nine seconds. It was, by her own description, “the single worst representation of eighteen months of work.”",
          "It was also the main thing investors and early customers watched before deciding whether to take a call.",
          "“At seed stage you are asking people to believe a story about a company that does not exist yet,” Benali says. “Everything they can see is evidence. If the demo looks like it was made in a hurry, that is evidence.”",
        ],
      },
      {
        heading: "An afternoon, and a brand defined in ten minutes",
        body: [
          "Benali re-recorded the walkthrough in one take, talking exactly the way she does on customer calls. The cut came back at four minutes, with the hesitations removed and the pacing fixed. She replaced her own audio with a studio voice for the first version, then later cloned her own so the narration stayed hers.",
          "The brand kit took ten minutes: two colours, a logo, a typeface. “I had been putting off the branding conversation for a year because it felt like a thing you needed a designer for. It turns out that for video you need four decisions, and making them badly is still better than making them eleven different ways.”",
          "The interactive tour went on the site alongside the video, which Benali credits with a specific behaviour: “Investors look at 11pm. They are not going to book a call to understand what you do. They will click through a tour.”",
        ],
      },
      {
        heading: "Documentation they never had time to write",
        body: [
          "The unexpected benefit was the written guides. Every recording also produced a help article, which meant Foldr had documentation from the day they had their first customer — something Benali says saved them from “the support hole every seed company falls into around customer eight.”",
        ],
      },
    ],
    pullQuote: {
      quote:
        "At seed stage, everything they can see is evidence. If the demo looks like it was made in a hurry, that is evidence.",
      name: "Sofia Benali",
      role: "Co-founder & CEO, Foldr",
    },
    stack: ["Notion", "Webflow", "Intercom"],
  },

  {
    slug: "halcyon",
    company: "Halcyon",
    industry: "Security posture management",
    size: "480 employees",
    region: "Global",
    headline: "Halcyon's security team approved an AI video tool in seven days",
    summary:
      "A company that sells security software has an unusually sceptical internal security team. Halcyon consolidated three shadow-IT video tools onto DemoRiff after a review that took a week rather than a quarter.",
    useCases: ["Enterprise governance", "Shadow IT consolidation", "Regional processing", "Audit"],
    heroQuote: {
      quote:
        "Security signed off in a week. Private rendering in our own VPC, no training on our frames, SOC 2 report on request. That is not a sentence I get to write about most AI vendors.",
      name: "Tom Aldridge",
      role: "Staff Security Engineer",
    },
    results: [
      { value: "7 days", label: "Security review to approval", detail: "Against a 6-week median for AI vendors" },
      { value: "3 → 1", label: "Video tools consolidated", detail: "Two shadow-IT tools absorbed via domain capture" },
      { value: "100%", label: "Recordings with masking policy applied", detail: "Enforced at workspace level, not optional" },
      { value: "0", label: "Frames leaving their perimeter", detail: "Private rendering in their own AWS account" },
    ],
    sections: [
      {
        heading: "Three tools nobody had approved",
        body: [
          "Halcyon's security team found what most security teams find when they look: marketing was using one AI video tool, customer education another, and a regional sales team a third — all on personal accounts, all containing recordings of a product that displays customer security findings on screen.",
          "“The recordings were the problem, not the tools,” says Tom Aldridge. “A screen recording of our product is a recording of a customer's vulnerabilities. That file belongs under the same controls as the data itself, and it was sitting in three consumer SaaS accounts.”",
        ],
      },
      {
        heading: "What the review actually asked",
        body: [
          "Halcyon's review focused on four things: whether customer content could enter a training set, where frames are processed and stored, whether masking could be enforced rather than encouraged, and whether there was an audit trail that answered “who shared what.”",
          "“The zero-training commitment being in the DPA rather than a blog post was the thing that moved fastest internally,” Aldridge says. “Most vendors have a marketing page that says one thing and a contract that says ‘to improve our services.’”",
          "Halcyon deployed render workers into their own AWS account, so media is processed and stored entirely within their perimeter, with only the control plane hosted by DemoRiff.",
        ],
      },
      {
        heading: "Consolidation was the easy part",
        body: [
          "Enforced domain capture converted the existing personal accounts into managed workspace accounts at next login. Bulk import brought their libraries across with transcripts intact. The whole migration took four days of elapsed time and no coordination meetings.",
          "Workspace masking policies now apply to every recording automatically — emails, customer names, finding identifiers and API keys are masked before frames are encoded, and the people recording cannot turn it off.",
        ],
      },
    ],
    pullQuote: {
      quote:
        "A screen recording of our product is a recording of a customer's vulnerabilities. That file belongs under the same controls as the data.",
      name: "Tom Aldridge",
      role: "Staff Security Engineer, Halcyon",
    },
    stack: ["Okta", "Splunk", "AWS", "Confluence"],
  },

  {
    slug: "meridian",
    company: "Meridian",
    industry: "Logistics",
    size: "2,400 employees",
    region: "Global",
    headline: "Meridian shipped 140 product videos in a quarter with a team of two",
    summary:
      "A rebrand that would have obsoleted an entire video library instead took one afternoon — and set the pace for a content operation that now outproduces the agency it replaced by an order of magnitude.",
    useCases: ["Content operations", "Rebrand", "Bulk re-render", "Social clips"],
    heroQuote: {
      quote:
        "We shipped 140 product videos last quarter with a team of two. The year before, with an agency, we shipped nine.",
      name: "Renata Alves",
      role: "Content Lead",
    },
    results: [
      { value: "9 → 140", label: "Videos per quarter", detail: "Team of two, no external production" },
      { value: "1 afternoon", label: "To re-brand 248 videos", detail: "Bulk re-render, republished at existing URLs" },
      { value: "0", label: "Broken embeds after rebrand", detail: "URLs preserved across the re-render" },
      { value: "12", label: "Social clips per source hour", detail: "Auto-generated, scheduling-ready" },
    ],
    sections: [
      {
        heading: "The rebrand that should have been a catastrophe",
        body: [
          "Meridian rebranded eight months into using DemoRiff. Their library was 248 videos embedded across the marketing site, the help center, sixteen partner portals and several hundred sales emails.",
          "Under the previous arrangement this would have been a straightforward disaster: the entire library would have been quietly wrong, and re-producing it would have cost more than the rebrand itself.",
          "Instead, Renata Alves updated the brand kit, reviewed the flagged videos, and queued a bulk re-render. Everything republished at its existing URLs overnight. No page was edited, no embed broke, and no partner was emailed about updating a link.",
        ],
      },
      {
        heading: "Volume changed what content could be",
        body: [
          "The more durable change was what became worth making. At nine videos a year, every video had to justify itself against a large opportunity cost, which meant only the biggest features got covered.",
          "At a hundred and forty, the calculation inverts. Meridian now produces a video for every release, a walkthrough for every significant support question, and a vertical clip set for every customer-facing announcement.",
          "“We stopped asking whether a video was worth making,” Alves says. “That question was costing us more than the videos were.”",
        ],
      },
    ],
    stack: ["Slack", "HubSpot", "WordPress", "Zapier", "YouTube"],
  },
];

export function getCaseStudy(slug: string) {
  return caseStudies.find((c) => c.slug === slug);
}
