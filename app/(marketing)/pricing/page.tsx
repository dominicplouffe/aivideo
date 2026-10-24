import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Section, SectionHeader, Eyebrow, Card, TextLink } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { PricingPlans, ComparisonTable, MinuteExplainer } from "@/components/marketing/PricingTable";
import { FaqList } from "@/components/marketing/Faq";
import { LogoWall } from "@/components/marketing/LogoWall";
import { TestimonialGrid } from "@/components/marketing/Sections";
import { pricingFaqs } from "@/lib/pricing";

export const metadata: Metadata = pageMetadata({
  title: "Pricing",
  description:
    "Flat monthly plans with every AI feature unlocked from the first paid tier. Unlimited written guides on every plan. Translations are never billed twice. Start free, no credit card.",
  path: "/pricing",
});

const guarantees = [
  {
    icon: "check" as const,
    title: "Every AI feature on the first paid tier",
    body: "Voice cloning, localization, Studio Sound, auto-zoom and the co-editor are not reserved for an enterprise call.",
  },
  {
    icon: "refresh" as const,
    title: "Translations are never re-billed",
    body: "Localize the same video into all thirty-four languages and your usage does not move.",
  },
  {
    icon: "doc" as const,
    title: "Written guides are unmetered",
    body: "Unlimited step-by-step articles on every plan, including Free. We do not meter documentation.",
  },
  {
    icon: "eye" as const,
    title: "Unlimited viewers, forever",
    body: "Share pages and embeds have no view caps. Your traffic is not a billing event.",
  },
  {
    icon: "creditCard" as const,
    title: "No surprise overages",
    body: "Notice at 80%, a hard stop you control, and top-ups you opt into. We will not quietly bill you.",
  },
  {
    icon: "lock" as const,
    title: "Your data stays yours",
    body: "Never used for model training on any plan, free included. Export or delete everything on demand.",
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-14 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-wide relative">
          <div className="mx-auto max-w-2xl text-center">
            <Reveal>
              <Eyebrow icon="creditCard">Pricing</Eyebrow>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3.25rem]">
                Priced like software,
                <br className="hidden sm:block" /> not like a{" "}
                <span className="text-gradient">production house</span>.
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-fg-muted">
                One flat plan replaces an editor, a localisation vendor, a demo tool and a
                documentation tool. Start free and judge the output before anyone asks you for a
                credit card.
              </p>
            </Reveal>
          </div>

          <Reveal delay={180}>
            <div className="mt-14">
              <PricingPlans />
            </div>
          </Reveal>
        </div>
      </section>

      {/* guarantees */}
      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <SectionHeader
            eyebrow="How we bill"
            eyebrowIcon="shield"
            title="Six commitments about the invoice"
            description="Category pricing is full of asterisks — credits that expire, languages billed per video, viewer caps. Here is what we will not do."
            className="mb-12"
          />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {guarantees.map((g, i) => (
              <Reveal key={g.title} delay={(i % 3) * 70}>
                <Card className="flex h-full gap-3.5 p-5">
                  <Icon name={g.icon} className="mt-0.5 size-[1.125rem] shrink-0 text-mint-400" strokeWidth={1.8} />
                  <div>
                    <p className="text-[0.9375rem] font-medium text-fg-strong">{g.title}</p>
                    <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-subtle">{g.body}</p>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* minute explainer */}
      <Section className="py-16 md:py-20">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-[22rem_1fr] lg:gap-16">
            <div>
              <SectionHeader
                eyebrow="Usage"
                eyebrowIcon="clock"
                align="left"
                title="What one video actually costs you"
              />
              <p className="mt-5 text-[0.875rem] leading-relaxed text-fg-subtle">
                A minute is a minute of finished, published video. Everything derived from it — the
                guide, the tour, the clips, every translation — is included. Here is a realistic
                week, priced.
              </p>
              <TextLink href="/docs/billing" className="mt-5">
                Read the billing docs
              </TextLink>
            </div>
            <Reveal>
              <MinuteExplainer />
            </Reveal>
          </div>
        </div>
      </Section>

      {/* comparison */}
      <Section tone="raised" id="compare">
        <div className="container-wide">
          <SectionHeader
            eyebrow="Full comparison"
            eyebrowIcon="list"
            title="Every line, on every plan"
            description="No hidden tiers, no “contact us for details.” If a capability exists, it is in this table."
            className="mb-12"
          />
          <ComparisonTable />
        </div>
      </Section>

      {/* faq */}
      <Section tone="raised">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[22rem_1fr] lg:gap-20">
            <div>
              <SectionHeader
                eyebrow="Billing questions"
                eyebrowIcon="info"
                align="left"
                title="Before you put it on a card"
              />
              <p className="mt-6 text-[0.875rem] leading-relaxed text-fg-subtle">
                Need a quote, a security review, a PO, or an MSA signed? Sales can turn all four
                around inside a week.
              </p>
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row lg:flex-col">
                <Button href="/contact" size="sm">Talk to sales</Button>
                <Button href="/security" variant="outline" size="sm">Visit trust center</Button>
              </div>
            </div>
            <FaqList items={pricingFaqs} />
          </div>
        </div>
      </Section>
    </>
  );
}
