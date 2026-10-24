import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { solutionPages, getSolutionPage } from "@/lib/solutions-content";
import { Preview } from "@/components/marketing/Previews";
import { FaqList } from "@/components/marketing/Faq";
import { TestimonialCard } from "@/components/marketing/Sections";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, SectionHeader, Card, IconTile } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import { testimonials } from "@/lib/marketing-data";

export function generateStaticParams() {
  return solutionPages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getSolutionPage(slug);
  if (!page) return {};
  return pageMetadata({
    title: `${page.nav} — DemoRiff for ${page.nav.toLowerCase()}`,
    description: page.lede.slice(0, 300),
    path: `/solutions/${page.slug}`,
  });
}

export default async function SolutionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getSolutionPage(slug);
  if (!page) notFound();

  const quote =
    testimonials.find((t) => t.slug === page.quoteSlug) ?? testimonials[0];
  const others = solutionPages.filter((s) => s.slug !== page.slug);

  return (
    <>
      {/* hero */}
      <section className="relative overflow-hidden pt-14 pb-16 md:pt-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-wide relative">
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-2xs text-fg-faint">
            <Link href="/" className="transition-colors hover:text-fg-muted">Home</Link>
            <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
            <span className="text-fg-subtle">Solutions</span>
            <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
            <span className="text-fg-muted">{page.nav}</span>
          </nav>

          <div className="grid gap-12 lg:grid-cols-[minmax(0,32rem)_1fr] lg:items-center lg:gap-16">
            <div>
              <Reveal><Eyebrow icon={page.icon}>{page.persona}</Eyebrow></Reveal>
              <Reveal delay={60}>
                <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
                  {page.title} <span className="text-gradient">{page.titleAccent}</span>
                </h1>
              </Reveal>
              <Reveal delay={120}>
                <p className="mt-5 text-[1rem] leading-relaxed text-fg-muted md:text-[1.0625rem]">{page.lede}</p>
              </Reveal>
              <Reveal delay={180}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button href="/signup" size="md">
                    Start free
                    <Icon name="arrowRight" className="size-4" strokeWidth={2} />
                  </Button>
                  <Button href="/contact" variant="outline" size="md">Book a walkthrough</Button>
                </div>
              </Reveal>
            </div>
            <Reveal delay={200}><Preview name={page.heroPreview} /></Reveal>
          </div>
        </div>
      </section>

      {/* pains */}
      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <SectionHeader
            eyebrow="What you are dealing with"
            eyebrowIcon="alert"
            align="left"
            title="The part nobody puts in the job description"
            className="mb-10"
          />
          <div className="grid gap-4 md:grid-cols-3">
            {page.pains.map((p, i) => (
              <Reveal key={p.title} delay={i * 80}>
                <Card className="flex h-full flex-col gap-3 p-6">
                  <span className="font-mono text-2xs text-rose-400">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="text-[1rem] leading-snug">{p.title}</h3>
                  <p className="text-[0.875rem] leading-relaxed text-fg-subtle">{p.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* plays */}
      <Section className="py-4 md:py-8">
        <div className="container-wide">
          <SectionHeader
            eyebrow="The plays"
            eyebrowIcon="target"
            title="How teams like yours actually use it"
            className="mt-12 mb-4"
          />
          {page.plays.map((p, i) => (
            <div
              key={p.title}
              className={cn(
                "grid items-center gap-10 border-b border-[var(--line)] py-14 last:border-0 md:py-16 lg:gap-16",
                p.preview ? "lg:grid-cols-2" : "lg:grid-cols-[minmax(0,34rem)_1fr]",
              )}
            >
              <Reveal className={cn(i % 2 === 1 && p.preview && "lg:order-2")}>
                <div>
                  <IconTile name={p.icon} tone={(["iris", "cyan", "mint", "amber"] as const)[i % 4]} />
                  <h3 className="mt-5 text-[1.375rem] leading-tight md:text-[1.75rem]">{p.title}</h3>
                  <p className="mt-4 text-[0.9375rem] leading-relaxed text-fg-muted">{p.body}</p>
                </div>
              </Reveal>
              {p.preview ? (
                <Reveal delay={100} className={cn(i % 2 === 1 && "lg:order-1")}>
                  <Preview name={p.preview} />
                </Reveal>
              ) : (
                <Reveal delay={100}>
                  <div className="dot-bg h-full min-h-[14rem] rounded-2xl border border-[var(--line)]" />
                </Reveal>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* workflow */}
      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <SectionHeader
            eyebrow="The workflow"
            eyebrowIcon="layers"
            title="What a week looks like"
            className="mb-12"
          />
          <ol className="grid gap-4 md:grid-cols-4">
            {page.workflow.map((w, i) => (
              <Reveal key={w.title} delay={i * 80}>
                <li className="relative flex h-full flex-col gap-3 rounded-2xl border border-[var(--line)] p-5">
                  <span className="inline-flex w-fit items-center rounded-md bg-iris-500/14 px-2 py-0.5 font-mono text-2xs text-iris-300">
                    {w.step}
                  </span>
                  <h3 className="text-[0.9375rem] font-medium text-fg-strong">{w.title}</h3>
                  <p className="text-[0.8125rem] leading-relaxed text-fg-subtle">{w.body}</p>
                  {i < page.workflow.length - 1 ? (
                    <Icon
                      name="chevronRight"
                      className="absolute top-1/2 -right-3.5 hidden size-4 -translate-y-1/2 text-fg-faint md:block"
                      strokeWidth={2}
                    />
                  ) : null}
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </Section>

      {/* outcomes + quote */}
      <Section className="py-16 md:py-20">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[1fr_22rem] lg:gap-16">
            <div>
              <SectionHeader
                eyebrow="From one recording"
                eyebrowIcon="trending"
                align="left"
                title="What you get"
                className="mb-10"
              />
              <dl className="grid gap-8 sm:grid-cols-2">
                {page.outcomes.map((o) => (
                  <div key={o.label}>
                    <dt className="text-[2rem] leading-none font-semibold tracking-[-0.03em] text-gradient">
                      {o.value}
                    </dt>
                    <dd className="mt-2.5 text-[0.875rem] leading-snug text-fg-subtle">{o.label}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {quote ? <Reveal delay={100}><TestimonialCard t={quote} /></Reveal> : null}
          </div>
        </div>
      </Section>

      {/* faq */}
      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[20rem_1fr] lg:gap-16">
            <SectionHeader eyebrow="Questions" eyebrowIcon="info" align="left" title="Common objections" />
            <FaqList items={page.faqs} />
          </div>
        </div>
      </Section>

      {/* other solutions */}
      <Section className="py-16 md:py-20">
        <div className="container-page">
          <SectionHeader eyebrow="Other teams" eyebrowIcon="users" title="DemoRiff for the rest of the org" className="mb-10" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((o, i) => (
              <Reveal key={o.slug} delay={(i % 3) * 70}>
                <Link href={`/solutions/${o.slug}`} className="group block h-full">
                  <Card interactive className="flex h-full flex-col gap-3 p-5">
                    <IconTile name={o.icon} tone="iris" />
                    <h3 className="text-[0.9375rem] font-medium text-fg-strong">{o.nav}</h3>
                    <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-fg-subtle">{o.lede}</p>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[0.8125rem] font-medium text-iris-300">
                      Explore
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
