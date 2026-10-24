import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { caseStudies } from "@/lib/customers-content";
import { proofMetrics } from "@/lib/marketing-data";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, SectionHeader, Card, Badge, Stat } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import { LogoWall } from "@/components/marketing/LogoWall";
import { TestimonialGrid } from "@/components/marketing/Sections";

export const metadata: Metadata = pageMetadata({
  title: "Customer stories",
  description:
    "How product marketing, sales engineering, customer education and security teams replaced their video production pipeline with DemoRiff — with the numbers.",
  path: "/customers",
});

export default function CustomersPage() {
  const [featured, ...rest] = caseStudies;

  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-12 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-wide relative">
          <div className="max-w-2xl">
            <Eyebrow icon="quote">Customer stories</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              Teams that stopped waiting
              <br className="hidden sm:block" /> on a <span className="text-gradient">video queue</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Six companies, six different reasons for adopting, and the numbers they tracked
              afterwards. Every figure here came from the customer, not from us.
            </p>
          </div>

          <Reveal delay={120}>
            <dl className="mt-14 grid gap-8 border-t border-[var(--line)] pt-10 sm:grid-cols-2 lg:grid-cols-4">
              {proofMetrics.map((m) => (
                <Stat key={m.label} value={m.value} label={m.label} sub={m.sub} />
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* featured */}
      <Section className="py-12 md:py-16">
        <div className="container-wide">
          <Reveal>
            <Link href={`/customers/${featured.slug}`} className="group block">
              <Card interactive className="overflow-hidden p-0">
                <div className="grid lg:grid-cols-[1.25fr_1fr]">
                  <div className="p-8 md:p-10">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="iris">Featured</Badge>
                      <Badge tone="neutral">{featured.industry}</Badge>
                      <Badge tone="neutral">{featured.size}</Badge>
                    </div>
                    <h2 className="mt-5 text-[1.5rem] leading-tight md:text-[1.875rem]">
                      {featured.headline}
                    </h2>
                    <p className="mt-4 text-[0.9375rem] leading-relaxed text-fg-muted">{featured.summary}</p>
                    <blockquote className="mt-6 border-l-2 border-iris-500/50 pl-4 text-[0.9375rem] leading-relaxed text-fg italic">
                      “{featured.heroQuote.quote}”
                      <footer className="mt-2 text-[0.8125rem] text-fg-subtle not-italic">
                        {featured.heroQuote.name}, {featured.heroQuote.role}
                      </footer>
                    </blockquote>
                    <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-iris-300">
                      Read the full story
                      <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-[var(--line)] lg:border-l lg:border-[var(--line)]">
                    {featured.results.map((r) => (
                      <div key={r.label} className="flex flex-col justify-center bg-ink-950 p-6">
                        <span className="text-[1.5rem] leading-none font-semibold tracking-[-0.03em] text-gradient">
                          {r.value}
                        </span>
                        <span className="mt-2 text-[0.8125rem] font-medium text-fg">{r.label}</span>
                        <span className="mt-1 text-[0.6875rem] leading-snug text-fg-faint">{r.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </Link>
          </Reveal>
        </div>
      </Section>

      {/* grid */}
      <Section className="py-8 md:py-12">
        <div className="container-wide">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((c, i) => (
              <Reveal key={c.slug} delay={(i % 3) * 70}>
                <Link href={`/customers/${c.slug}`} className="group block h-full">
                  <Card interactive className="flex h-full flex-col gap-4 p-6">
                    <div className="flex items-center justify-between">
                      <span className="text-[1.0625rem] font-semibold tracking-[-0.02em] text-fg-strong">
                        {c.company}
                      </span>
                      <Icon
                        name="arrowUpRight"
                        className="size-4 text-fg-faint opacity-0 transition-all group-hover:opacity-100"
                        strokeWidth={1.9}
                      />
                    </div>
                    <p className="text-2xs text-fg-faint">
                      {c.industry} · {c.size}
                    </p>
                    <h3 className="text-[1rem] leading-snug">{c.headline}</h3>
                    <div className="mt-auto flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-4">
                      {c.results.slice(0, 2).map((r) => (
                        <span key={r.label} className="rounded-lg bg-ink-850 px-2 py-1 text-2xs text-fg-muted">
                          <span className="font-medium text-iris-300">{r.value}</span> {r.label.toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      <Section tone="raised">
        <div className="container-wide">
          <SectionHeader eyebrow="In their words" eyebrowIcon="quote" title="More from the field" className="mb-12" />
          <TestimonialGrid limit={6} />
          <div className="mt-16">
            <LogoWall label="Trusted by" marquee={false} />
          </div>
          <div className="mt-14 flex flex-col items-center gap-4 text-center">
            <h2 className="text-[1.25rem]">Want to be in here?</h2>
            <p className="max-w-lg text-[0.875rem] leading-relaxed text-fg-subtle">
              We write these with you, publish nothing you have not approved, and never invent a
              number. If your team has a result worth writing up, we would like to hear it.
            </p>
            <Button href="/contact" variant="outline" size="md" className="mt-2">
              Tell us your story
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
