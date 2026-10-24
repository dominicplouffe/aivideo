import Link from "next/link";
import type { Metadata } from "next";
import { jsonLd, pageMetadata, siteStructuredData } from "@/lib/seo";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  Eyebrow,
  Section,
  SectionHeader,
  Stat,
  TextLink,
  Card,
} from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import { HeroCanvas } from "@/components/marketing/HeroCanvas";
import { LogoWall } from "@/components/marketing/LogoWall";
import { Pipeline } from "@/components/marketing/Pipeline";
import { OutputShowcase } from "@/components/marketing/OutputShowcase";
import { FaqList } from "@/components/marketing/Faq";
import {
  CapabilityBento,
  TestimonialGrid,
  SecurityStrip,
  LanguageCloud,
  IntegrationsStrip,
  ValueRow,
} from "@/components/marketing/Sections";
import { heroMetrics, proofMetrics, homeFaqs } from "@/lib/marketing-data";
import { site } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: `${site.name} — ${site.tagline}`,
  description: site.description,
  path: "/",
  absoluteTitle: true,
});

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(siteStructuredData())} />
      {/* ================================================= HERO */}
      <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-[0.55]" />
        <div
          aria-hidden
          className="pointer-events-none absolute top-[-18rem] left-1/2 size-[46rem] -translate-x-1/2 rounded-full opacity-45"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--color-iris-500) 40%, transparent), transparent 62%)",
            filter: "blur(70px)",
          }}
        />

        <div className="container-page relative">
          <div className="mx-auto max-w-4xl text-center">
            <Reveal>
              <Link
                href="/product/brand"
                className="group inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-[color-mix(in_oklab,var(--color-fg)_5%,transparent)] py-1 pr-3 pl-1 transition-colors hover:border-iris-500/50"
              >
                <span className="rounded-full bg-[linear-gradient(135deg,var(--color-iris-500),var(--color-violet-500))] px-2.5 py-0.5 text-2xs font-semibold text-white">
                  New
                </span>
                <span className="text-[0.8125rem] text-fg-muted">
                  Brand kits: your fonts, logo, intro and outro on every export
                </span>
                <Icon
                  name="chevronRight"
                  className="size-3.5 text-fg-faint transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2.2}
                />
              </Link>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="mt-7 text-[2.5rem] leading-[1.06] tracking-[-0.035em] md:text-[3.5rem] lg:text-[4rem]">
                Your product deserves
                <br className="hidden sm:block" /> better than a{" "}
                <span className="text-gradient">screen recording</span>.
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mx-auto mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-fg-muted md:text-[1.1875rem]">
                Record the flow you already know by heart — ums, wrong turns and all. DemoRiff
                returns a directed demo video, a clickable product tour, a written walkthrough and a
                set of social cuts. On your brand. In 34 languages. Before your coffee goes cold.
              </p>
            </Reveal>

            <Reveal delay={180}>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button href="/signup" size="lg" className="w-full sm:w-auto">
                  Start free — no card
                  <Icon name="arrowRight" className="size-4" strokeWidth={2} />
                </Button>
                <Button href="/product/studio" variant="outline" size="lg" className="w-full sm:w-auto">
                  <Icon name="play" className="size-3.5" />
                  Watch a 90-second demo
                </Button>
              </div>
            </Reveal>

            <Reveal delay={240}>
              <p className="mt-5 text-[0.8125rem] text-fg-faint">
                10 free video minutes · unlimited guides · every AI feature unlocked
              </p>
            </Reveal>
          </div>

          <Reveal delay={300}>
            <div className="mt-16 md:mt-20">
              <HeroCanvas />
            </div>
          </Reveal>

          <Reveal delay={120}>
            <dl className="mx-auto mt-14 grid max-w-4xl gap-8 border-t border-[var(--line)] pt-10 sm:grid-cols-3">
              {heroMetrics.map((m) => (
                <div key={m.label} className="text-center">
                  <dt className="text-[2rem] leading-none font-semibold tracking-[-0.03em] text-gradient">
                    {m.value}
                  </dt>
                  <dd className="mx-auto mt-2.5 max-w-[15rem] text-[0.8125rem] leading-snug text-fg-subtle">
                    {m.label}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* ================================================= LOGOS */}
      <section className="pb-20 md:pb-24">
        <div className="container-wide">
          <LogoWall />
        </div>
      </section>

      {/* ================================================= THE COST */}
      <Section tone="raised">
        <div className="container-page">
          <SectionHeader
            eyebrow="The status quo"
            eyebrowIcon="alert"
            align="left"
            title={
              <>
                Every good demo currently costs you
                <br className="hidden md:block" /> two weeks and a favour.
              </>
            }
            description="Product marketing waits on design. Design waits on the feature. Sales records their own and it looks like it. The help center screenshots are from two releases ago. Everyone knows. Nobody has the hours."
          />

          <div className="mt-14">
            <ValueRow
              icon="clock"
              title="Time to first cut"
              before="9–14 days across a brief, a shoot, two rounds of notes and a render queue."
              after="Eleven minutes, and most of that is you reading the script out loud once."
            />
            <ValueRow
              icon="creditCard"
              title="Cost per finished minute"
              before="$1,400–$3,000 to an agency, or a week of an in-house editor's capacity."
              after="Included. Teams ship 140 videos a quarter on a plan that costs less than one agency invoice."
            />
            <ValueRow
              icon="refresh"
              title="Keeping it current"
              before="The UI changed. The video is now wrong. Re-shooting costs the same as the first time, so it stays wrong."
              after="Re-record the changed step. Everything downstream — video, tour, guide, all languages — rebuilds."
            />
            <ValueRow
              icon="globe"
              title="Going multilingual"
              before="A localisation vendor, six weeks, and a spreadsheet of subtitle timings nobody wants to own."
              after="One click. Thirty-four languages, lip-synced, with the written guide localised to match."
            />
            <ValueRow
              icon="chart"
              title="Knowing if it worked"
              before="A view count. Maybe. If someone remembers to check the YouTube tab."
              after="Per-second retention, hotspot clicks, CTA conversion and which accounts watched — in your CRM."
            />
          </div>
        </div>
      </Section>

      {/* ================================================= PIPELINE */}
      <Section id="how-it-works">
        <div className="container-wide">
          <SectionHeader
            eyebrow="How it works"
            eyebrowIcon="layers"
            title="Record once. Riff on it. Ship everything."
            description="Three steps, one source of truth. Change the recording and every downstream asset rebuilds itself — in every language you publish."
            className="mb-14"
          />
          <Pipeline />
        </div>
      </Section>

      {/* ================================================= OUTPUTS */}
      <Section tone="raised">
        <div className="container-wide">
          <SectionHeader
            eyebrow="One take, four assets"
            eyebrowIcon="layers"
            title="The same recording, in every format your funnel needs"
            description="Most teams buy a video tool, a demo tool and a documentation tool, then spend their week keeping the three of them in sync. DemoRiff generates all of it from one source — so they can never drift apart."
            className="mb-14"
          />
          <OutputShowcase />
        </div>
      </Section>

      {/* ================================================= CAPABILITIES */}
      <Section>
        <div className="container-wide">
          <SectionHeader
            eyebrow="Capabilities"
            eyebrowIcon="sparkles"
            title="The editing decisions, made for you"
            description="Not filters and templates — the actual craft choices a senior video editor makes, applied automatically and overridable everywhere."
            className="mb-14"
          />
          <CapabilityBento />
          <div className="mt-10 flex justify-center">
            <TextLink href="/product/studio">See everything in the Studio</TextLink>
          </div>
        </div>
      </Section>

      {/* ================================================= LOCALIZATION */}
      <Section tone="raised">
        <div className="container-page">
          <SectionHeader
            eyebrow="Localization"
            eyebrowIcon="globe"
            title="Sell in thirty-four languages without a localisation vendor"
            description="A full re-voice — not a subtitle track. Mouth movement is matched to the new audio, on-screen text is swapped, the written guide is translated, and the whole set publishes together."
            className="mb-12"
          />
          <Reveal>
            <LanguageCloud />
          </Reveal>
          <Reveal delay={120}>
            <div className="mt-12 flex justify-center">
              <TextLink href="/product/localization">How localization works</TextLink>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ================================================= PROOF */}
      <Section>
        <div className="container-wide">
          <SectionHeader
            eyebrow="Customers"
            eyebrowIcon="quote"
            title="Teams that stopped waiting on a video queue"
            className="mb-14"
          />
          <TestimonialGrid limit={3} />

          <Reveal>
            <dl className="mt-16 grid gap-10 border-t border-[var(--line)] pt-12 sm:grid-cols-2 lg:grid-cols-4">
              {proofMetrics.map((m) => (
                <Stat key={m.label} value={m.value} label={m.label} sub={m.sub} />
              ))}
            </dl>
          </Reveal>

          <div className="mt-12 flex justify-center">
            <TextLink href="/customers">Read the customer stories</TextLink>
          </div>
        </div>
      </Section>

      {/* ================================================= SECURITY */}
      <Section tone="raised">
        <div className="container-page">
          <SectionHeader
            eyebrow="Trust"
            eyebrowIcon="shield"
            title="Built for products with real customer data on screen"
            description="Your recordings contain your customers. We treat them that way: never used for training, encrypted end to end, masked before render, and deletable with a signed certificate."
            className="mb-12"
          />
          <SecurityStrip />
          <div className="mt-10 flex justify-center">
            <TextLink href="/security">Visit the trust center</TextLink>
          </div>
        </div>
      </Section>

      {/* ================================================= INTEGRATIONS */}
      <Section>
        <div className="container-page">
          <SectionHeader
            eyebrow="Integrations"
            eyebrowIcon="puzzle"
            title="It plugs into the stack you already run"
            description="Publish to your help center, sync engagement to your CRM, trigger a re-render from CI, and let Slack tell the team it is ready."
            className="mb-12"
          />
          <IntegrationsStrip limit={12} />
          <div className="mt-10 flex justify-center">
            <TextLink href="/integrations">Browse all 42 integrations</TextLink>
          </div>
        </div>
      </Section>

      {/* ================================================= PRICING TEASER */}
      <Section tone="raised">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
            <div>
              <Eyebrow icon="creditCard">Pricing</Eyebrow>
              <h2 className="mt-4 text-[1.75rem] leading-tight md:text-[2.5rem]">
                Priced like software,
                <br className="hidden md:block" /> not like a production house.
              </h2>
              <p className="mt-4 text-[0.9375rem] leading-relaxed text-fg-muted">
                Flat monthly plans with every AI feature unlocked from the first paid tier. No
                per-video credits that expire, no charging you again to translate what you already
                made, and unlimited written guides on every plan including free.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button href="/pricing" size="md">See plans</Button>
                <Button href="/roi-calculator" variant="outline" size="md">
                  Calculate your ROI
                </Button>
              </div>
            </div>

            <Reveal delay={100}>
              <Card className="p-7">
                <ul className="flex flex-col gap-4">
                  {[
                    "Unlimited step-by-step guides on every plan — including free",
                    "Every AI feature on the first paid tier, not the third",
                    "Translation included, not billed per language per video",
                    "Unlimited viewers and share pages, forever",
                    "Seats you can add mid-cycle without a sales call",
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-3">
                      <Icon name="check" className="mt-0.5 size-4 shrink-0 text-mint-400" strokeWidth={2.4} />
                      <span className="text-[0.9375rem] leading-relaxed text-fg">{line}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </Reveal>
          </div>
        </div>
      </Section>

      {/* ================================================= FAQ */}
      <Section>
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[22rem_1fr] lg:gap-20">
            <div>
              <SectionHeader
                eyebrow="Questions"
                eyebrowIcon="info"
                align="left"
                title="The things people ask before they sign up"
              />
              <p className="mt-6 text-[0.875rem] leading-relaxed text-fg-subtle">
                Still deciding? Talk to someone who has onboarded a few hundred teams.
              </p>
              <Button href="/contact" variant="outline" size="sm" className="mt-4">
                Book 20 minutes
              </Button>
            </div>
            <FaqList items={homeFaqs} />
          </div>
        </div>
      </Section>
    </>
  );
}
