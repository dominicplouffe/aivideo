import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * Paid-search landing page. Copy: /workspace/content/google-landing.md with
 * Compliance's word-for-word edits (24 Oct 2026). No site navigation; every
 * button goes to /record-once/start. The one video is the "See a real one"
 * example (#example), shown as DemoRiff rendered it, words from
 * /workspace/compliance/record-once-example-review.md section 2 (word for word).
 */
export const metadata: Metadata = {
  title: { absolute: "Record your product once · DemoRiff" },
  description:
    "Record your screen roughly. DemoRiff cuts the dead air, adds captions, renders a 1080p video in your voice and writes a step-by-step guide.",
  robots: { index: false, follow: false },
  keywords: [],
  openGraph: { title: "Record your product once · DemoRiff", description: "A demo video and a written guide from one rough recording." },
  twitter: { title: "Record your product once · DemoRiff", description: "A demo video and a written guide from one rough recording." },
};

const START = "/record-once/start";
const STUDIO = "/record-once/start?plan=studio";
const BYOK = "/record-once/start?plan=byok";

const faq: { q: string; a: string }[] = [
  {
    q: "Is the voice in the video mine?",
    a: "Yes. DemoRiff edits the audio you recorded: it cuts the pauses and any passage you remove, and the voice stays yours.",
  },
  {
    q: "Will it take out my ums?",
    a: "It tries to. On our one scripted test take, read by a synthetic voice, the latest version removed all 12 ums and uhs and all 4 false starts; earlier versions left some in. We have not yet measured it on real voices, so treat it as a help, not a guarantee, and check the transcript before you share.",
  },
  {
    q: "What do I need to record?",
    a: "A browser, or a screen recording you already have. Talk through the steps as you click. A rough take is fine.",
  },
  {
    q: "Does it make clickable product tours, social clips or translated versions?",
    a: "Not yet. Today DemoRiff makes the demo video and the written guide. If you need a clickable tour now, it is not the right tool yet.",
  },
  {
    q: "Can it blur passwords or customer data on screen?",
    a: "Not in uploads or in-app recordings yet. Record with a demo account or test data.",
  },
  {
    q: "What counts as a finished minute?",
    a: "One minute of rendered video, not the footage you recorded. Record twelve minutes, export a three-minute cut, and that is three minutes. Re-rendering a project this month costs no extra minutes unless the new cut is longer.",
  },
  {
    q: "Can I cancel Studio?",
    a: "Yes, from the billing page, any time. Studio ends when the paid month does, and your workspace drops to Free with its recordings and history kept.",
  },
  {
    q: "Why is Bring your own keys billed yearly?",
    a: "It is priced as a year: $240 for a twelve-month term with unlimited projects. It renews yearly and can be cancelled from the billing page once the first year is up. Studio has no term at all.",
  },
  {
    q: "Do I need a sales call?",
    a: "No. Sign up, and pay by card through Stripe if you choose a paid plan.",
  },
  {
    q: "Who uses DemoRiff?",
    a: "DemoRiff is new. We have no customer case studies to show yet, which is why the free plan exists: judge it on your own recording.",
  },
];

const plans: { name: string; price: string; lines: string[]; cta: string; href: string; primary?: boolean }[] = [
  {
    name: "Free",
    price: "$0",
    lines: ["10 finished video minutes a month", "3 projects", "Unlimited written guides", "No card needed"],
    cta: "Try it free",
    href: START,
  },
  {
    name: "Studio",
    price: "$99 a month",
    lines: [
      "Billed monthly. Cancel any time.",
      "10 projects and 150 finished minutes a month",
      "Need more? Add 10 projects and 75 minutes for $49 a month",
      "Past your minutes: $1.20 a minute, or a hard stop you control",
      "We run the AI vendors; nothing to set up",
    ],
    cta: "Start Studio",
    href: STUDIO,
    primary: true,
  },
  {
    name: "Bring your own keys",
    price: "$20 a month, billed $240 a year",
    lines: [
      "Unlimited projects and 1,000 finished minutes a month",
      "You add your own Deepgram, ElevenLabs and Anthropic keys, and those vendors bill you directly",
      "A 12-month term, paid up front. It renews yearly and can be cancelled from the billing page once the first year is up.",
    ],
    cta: "Start on your own keys",
    href: BYOK,
  },
];

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`mx-auto w-full max-w-5xl px-5 py-14 md:px-10 md:py-20 ${className}`}>{children}</section>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] text-fg-strong md:text-[2.125rem]">{children}</h2>;
}

export default function RecordOncePage() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-center px-5 py-6 md:px-10">
        <span className="inline-flex items-center">
          <Wordmark />
        </span>
      </header>

      <main className="flex-1">
        {/* 1. Hero */}
        <Section className="pt-8 md:pt-14">
          <h1 className="max-w-3xl text-[2.25rem] leading-[1.08] font-semibold tracking-[-0.035em] text-fg-strong md:text-[3.25rem]">
            Record your product once. Get a demo video and a written guide back.
          </h1>
          <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-fg-muted">
            Record your screen as roughly as you like, or upload a take you already have. DemoRiff cuts the dead air,
            adds captions and renders a 1080p video in the voice you recorded. From the same recording it writes a
            step-by-step guide with screenshots.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href={STUDIO} size="lg">
              Start Studio: $99/month
              <Icon name="arrowRight" className="size-4" strokeWidth={2} />
            </Button>
            <Button href={START} size="lg" variant="outline">
              Try it free first
            </Button>
          </div>
          <p className="mt-4 text-[0.875rem] text-fg-subtle">
            Free plan: 10 finished video minutes a month, no card. Studio is billed monthly; cancel any time.
          </p>
        </Section>

        {/* 2. Our own rough take */}
        <Section className="border-t border-[var(--line)]">
          <H2>One rough take in. One demo video and one guide out.</H2>
          <p className="mt-5 max-w-3xl text-[1rem] leading-relaxed text-fg-muted">
            We tested it on one rough take of our own: a 78-second walk through our pricing and sign-up pages, read by
            a synthetic voice from a script with 12 &ldquo;ums&rdquo; and &ldquo;uhs&rdquo;, 4 false starts and long
            pauses written in. DemoRiff returned a 33.5-second captioned video at 1080p and a 5-step written guide with
            a screenshot for each step.
          </p>
          <p className="mt-4 max-w-3xl text-[0.875rem] text-fg-subtle">
            Our own scripted test, not a customer&rsquo;s recording. Your result depends on your recording.
          </p>
        </Section>

        {/* 2b. A real example, as DemoRiff rendered it */}
        <Section className="scroll-mt-6 border-t border-[var(--line)]">
          <div id="example" className="scroll-mt-6" />
          <H2>See a real one</H2>
          <p className="mt-5 max-w-3xl text-[1rem] leading-relaxed text-fg-muted">
            One 14-minute screen recording of a reporting tool went in. DemoRiff turned it into this 3-minute 1080p
            video, with captions burned in and the dead air cut.
          </p>
          <video
            className="mt-8 aspect-video w-full rounded-2xl border border-[var(--line)] bg-black"
            controls
            playsInline
            preload="none"
            poster="/examples/record-once-example.jpg"
            width={1920}
            height={1080}
          >
            <source src="/examples/record-once-example.mp4" type="video/mp4" />
          </video>
          <p className="mt-4 max-w-3xl text-[1rem] leading-relaxed text-fg-muted">
            This example uses DemoRiff&apos;s optional AI narration: a stock AI voice reads a tidied version of what the
            speaker said. Without that option, DemoRiff keeps the voice you recorded.
          </p>
          <p className="mt-3 max-w-3xl text-[0.875rem] text-fg-subtle">
            Made with an earlier version of DemoRiff on 7 Oct 2026. Its title card and corner logo come from a brand
            setting that new accounts can&apos;t set up yet. Your result depends on your recording.
          </p>
          <div className="mt-6">
            <Button href={START} size="lg" variant="outline">
              Try it free
            </Button>
          </div>
        </Section>

        {/* 3. What you get */}
        <Section className="border-t border-[var(--line)]">
          <H2>What you get from one recording</H2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                t: "A demo video in your own voice.",
                d: "Captions burned in, dead air cut, rendered at 1080p. DemoRiff edits the audio you recorded, so the voice in the video is yours.",
              },
              {
                t: "A written step-by-step guide.",
                d: "Each step gets a heading, what you said, and a screenshot. Guides are unlimited on every plan, including Free.",
              },
              {
                t: "An editor that works in words.",
                d: "Change the video by editing its transcript: cut a passage or split a scene, then render again. Re-rendering a project this month costs no extra minutes unless the new cut is longer.",
              },
            ].map((x, i) => (
              <li key={x.t} className="rounded-2xl border border-[var(--line)] bg-ink-950 p-6">
                <span className="font-mono text-2xs text-fg-faint">0{i + 1}</span>
                <p className="mt-3 text-[1rem] font-semibold text-fg-strong">{x.t}</p>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">{x.d}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* 4. How it works */}
        <Section className="border-t border-[var(--line)]">
          <H2>Three steps, no timeline</H2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              {
                t: "Record or upload.",
                d: "Record in the browser, or upload a screen recording you already have. Talk as you click. You do not need a second take.",
              },
              {
                t: "DemoRiff edits.",
                d: "It transcribes what you said, cuts the dead air, breaks the walk into steps, adds captions and renders the video and the guide.",
              },
              { t: "Fix it in words.", d: "Read the transcript, cut what you do not want, render again." },
            ].map((x, i) => (
              <li key={x.t}>
                <span className="inline-flex size-8 items-center justify-center rounded-full border border-[var(--line-strong)] text-[0.8125rem] text-fg">
                  {i + 1}
                </span>
                <p className="mt-3 text-[1rem] font-semibold text-fg-strong">{x.t}</p>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">{x.d}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* 5. Who it is for */}
        <Section className="border-t border-[var(--line)]">
          <p className="max-w-3xl text-[1.125rem] leading-relaxed text-fg-muted">
            If your last product demo took a weekend in a video editor, or you have a launch, a sales email or a help
            page that needs a demo this week, start here. DemoRiff is new and made for small software teams who would
            rather record once than edit for hours.
          </p>
        </Section>

        {/* 6. Pricing */}
        <Section className="border-t border-[var(--line)]">
          <H2>Plain prices, in USD. Not priced per seat.</H2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`flex flex-col rounded-2xl border bg-ink-950 p-6 ${p.primary ? "border-iris-500/50" : "border-[var(--line)]"}`}
              >
                <p className="text-[1rem] font-semibold text-fg-strong">{p.name}</p>
                <p className="mt-2 text-[1.375rem] leading-tight font-semibold tracking-[-0.02em] text-fg-strong">{p.price}</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {p.lines.map((l) => (
                    <li key={l} className="flex gap-2.5 text-[0.875rem] leading-relaxed text-fg-muted">
                      <Icon name="check" className="mt-1 size-3.5 shrink-0 text-mint-400" strokeWidth={2.6} />
                      {l}
                    </li>
                  ))}
                </ul>
                <Button href={p.href} className="mt-6 w-full" variant={p.primary ? "primary" : "outline"}>
                  {p.cta}
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-[0.875rem] leading-relaxed text-fg-subtle">
            A finished minute is a minute of rendered video, not the footage you record. Written guides and viewers are
            unlimited on every plan.
          </p>
          <p className="mt-2 max-w-3xl text-[0.875rem] leading-relaxed text-fg-subtle">
            You pay by card through Stripe. Checkout and your receipt name dplouffe Analytics, the company that bills
            for DemoRiff.
          </p>
        </Section>

        {/* 7. FAQ */}
        <Section className="border-t border-[var(--line)]">
          <H2>Questions</H2>
          <dl className="mt-8 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {faq.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="text-[1rem] font-semibold text-fg-strong">{f.q}</dt>
                <dd className="mt-2 max-w-3xl text-[0.9375rem] leading-relaxed text-fg-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* 8. Closing */}
        <Section className="border-t border-[var(--line)] text-center">
          <H2>Your next demo is one rough take away.</H2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button href={STUDIO} size="lg">
              Start Studio: $99/month
              <Icon name="arrowRight" className="size-4" strokeWidth={2} />
            </Button>
            <Button href={START} size="lg" variant="outline">
              Try it free first
            </Button>
          </div>
        </Section>
      </main>

      {/* 9. Footer */}
      <footer className="border-t border-[var(--line)] py-8 text-center text-[0.8125rem] text-fg-subtle">
        DemoRiff · <Link href="/legal/terms" className="hover:text-fg">Terms</Link> ·{" "}
        <Link href="/legal/privacy" className="hover:text-fg">Privacy</Link>
      </footer>
    </>
  );
}
