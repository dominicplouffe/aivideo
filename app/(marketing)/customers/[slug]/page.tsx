import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { caseStudies, getCaseStudy } from "@/lib/customers-content";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Section, SectionHeader, Card, Badge } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";

export function generateStaticParams() {
  return caseStudies.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = getCaseStudy(slug);
  if (!c) return {};
  return {
    title: `${c.company} customer story`,
    description: c.summary.slice(0, 300),
    alternates: { canonical: `/customers/${c.slug}` },
  };
}

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getCaseStudy(slug);
  if (!c) notFound();

  const others = caseStudies.filter((x) => x.slug !== c.slug).slice(0, 3);

  return (
    <>
      <section className="relative overflow-hidden pt-14 pb-12 md:pt-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-35" />
        <div className="container-page relative">
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-2xs text-fg-faint">
            <Link href="/" className="transition-colors hover:text-fg-muted">Home</Link>
            <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
            <Link href="/customers" className="transition-colors hover:text-fg-muted">Customers</Link>
            <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
            <span className="text-fg-muted">{c.company}</span>
          </nav>

          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[1.25rem] font-semibold tracking-[-0.03em] text-fg-strong">{c.company}</span>
              <Badge tone="neutral">{c.industry}</Badge>
              <Badge tone="neutral">{c.size}</Badge>
              <Badge tone="neutral">{c.region}</Badge>
            </div>
            <h1 className="mt-6 text-[2rem] leading-[1.1] tracking-[-0.035em] md:text-[2.75rem]">
              {c.headline}
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">{c.summary}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {c.useCases.map((u) => (
                <Badge key={u} tone="iris">{u}</Badge>
              ))}
            </div>
          </div>

          <Reveal delay={120}>
            <dl className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
              {c.results.map((r) => (
                <div key={r.label} className="bg-ink-950 p-5">
                  <dt className="text-[1.5rem] leading-none font-semibold tracking-[-0.03em] text-gradient">
                    {r.value}
                  </dt>
                  <dd className="mt-2">
                    <span className="block text-[0.8125rem] font-medium text-fg">{r.label}</span>
                    <span className="mt-1 block text-[0.6875rem] leading-snug text-fg-faint">{r.detail}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* body */}
      <Section className="py-12 md:py-16">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[1fr_16rem] lg:gap-16">
            <article className="max-w-2xl">
              <blockquote className="mb-12 rounded-2xl border border-[var(--line)] bg-ink-900 p-6">
                <Icon name="quote" className="size-6 text-iris-500/45" />
                <p className="mt-4 text-[1.0625rem] leading-relaxed text-fg">“{c.heroQuote.quote}”</p>
                <footer className="mt-4 flex items-center gap-3 border-t border-[var(--line)] pt-4">
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-iris-600),var(--color-cyan-500))] text-[0.75rem] font-semibold text-white">
                    {c.heroQuote.name.split(" ").map((p) => p[0]).join("")}
                  </span>
                  <span>
                    <span className="block text-[0.875rem] font-medium text-fg-strong">{c.heroQuote.name}</span>
                    <span className="block text-[0.75rem] text-fg-subtle">{c.heroQuote.role}, {c.company}</span>
                  </span>
                </footer>
              </blockquote>

              {c.sections.map((s, i) => (
                <Reveal key={s.heading} delay={40}>
                  <section className="mb-12">
                    <h2 className="text-[1.375rem] leading-tight md:text-[1.625rem]">{s.heading}</h2>
                    {s.body.map((p, n) => (
                      <p key={n} className="mt-4 text-[0.9375rem] leading-[1.75] text-fg-muted">
                        {p}
                      </p>
                    ))}
                    {c.pullQuote && i === 1 ? (
                      <div className="my-10 border-l-2 border-iris-500 pl-6">
                        <p className="text-[1.25rem] leading-snug text-fg-strong">
                          “{c.pullQuote.quote}”
                        </p>
                        <p className="mt-3 text-[0.8125rem] text-fg-subtle">
                          {c.pullQuote.name} · {c.pullQuote.role}
                        </p>
                      </div>
                    ) : null}
                  </section>
                </Reveal>
              ))}
            </article>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <Card className="p-5">
                <p className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">At a glance</p>
                <dl className="mt-4 space-y-3 text-[0.8125rem]">
                  <div>
                    <dt className="text-fg-faint">Industry</dt>
                    <dd className="mt-0.5 text-fg">{c.industry}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-faint">Size</dt>
                    <dd className="mt-0.5 text-fg">{c.size}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-faint">Region</dt>
                    <dd className="mt-0.5 text-fg">{c.region}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-faint">Integrated with</dt>
                    <dd className="mt-1.5 flex flex-wrap gap-1.5">
                      {c.stack.map((s) => (
                        <span key={s} className="rounded-md border border-[var(--line)] px-1.5 py-0.5 text-2xs text-fg-muted">
                          {s}
                        </span>
                      ))}
                    </dd>
                  </div>
                </dl>
                <Button href="/signup" size="sm" className="mt-5 w-full">Start free</Button>
                <Button href="/contact" variant="outline" size="sm" className="mt-2 w-full">Talk to sales</Button>
              </Card>
            </aside>
          </div>
        </div>
      </Section>

      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <SectionHeader eyebrow="More stories" eyebrowIcon="quote" title="Other teams, other problems" className="mb-10" />
          <div className="grid gap-4 md:grid-cols-3">
            {others.map((o, i) => (
              <Reveal key={o.slug} delay={i * 70}>
                <Link href={`/customers/${o.slug}`} className="group block h-full">
                  <Card interactive className="flex h-full flex-col gap-3 p-5">
                    <span className="text-[1rem] font-semibold tracking-[-0.02em] text-fg-strong">{o.company}</span>
                    <p className="text-2xs text-fg-faint">{o.industry}</p>
                    <p className="text-[0.875rem] leading-snug text-fg-muted">{o.headline}</p>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[0.8125rem] font-medium text-iris-300">
                      Read
                      <Icon name="arrowRight" className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
                    </span>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
