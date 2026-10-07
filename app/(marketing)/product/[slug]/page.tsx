import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { productPages, getProductPage } from "@/lib/product-content";
import { Preview } from "@/components/marketing/Previews";
import { FaqList } from "@/components/marketing/Faq";
import { LogoWall } from "@/components/marketing/LogoWall";
import { TestimonialCard } from "@/components/marketing/Sections";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, SectionHeader, Card, IconTile } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import { testimonials } from "@/lib/marketing-data";

export function generateStaticParams() {
  return productPages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getProductPage(slug);
  if (!page) return {};
  return pageMetadata({
    title: page.nav,
    description: page.lede.slice(0, 300),
    path: `/product/${page.slug}`,
  });
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getProductPage(slug);
  if (!page) notFound();

  const related = page.related
    .map((s) => getProductPage(s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const quote = testimonials[productPages.indexOf(page) % testimonials.length];

  return (
    <>
      {/* ---------------------------------------------- hero */}
      <section className="relative overflow-hidden pt-14 pb-16 md:pt-20 md:pb-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div
          aria-hidden
          className="pointer-events-none absolute top-[-16rem] left-1/2 size-[40rem] -translate-x-1/2 rounded-full opacity-35"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--color-iris-500) 40%, transparent), transparent 62%)",
            filter: "blur(70px)",
          }}
        />
        <div className="container-wide relative">
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-2xs text-fg-faint">
            <Link href="/" className="transition-colors hover:text-fg-muted">Home</Link>
            <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
            <span className="text-fg-subtle">Product</span>
            <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
            <span className="text-fg-muted">{page.nav}</span>
          </nav>

          <div className="grid gap-12 lg:grid-cols-[minmax(0,32rem)_1fr] lg:items-center lg:gap-16">
            <div>
              <Reveal>
                <Eyebrow icon={page.icon}>{page.eyebrow}</Eyebrow>
              </Reveal>
              <Reveal delay={60}>
                <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
                  {page.title}{" "}
                  <span className="text-gradient">{page.titleAccent}</span>
                </h1>
              </Reveal>
              <Reveal delay={120}>
                <p className="mt-5 text-[1rem] leading-relaxed text-fg-muted md:text-[1.0625rem]">
                  {page.lede}
                </p>
              </Reveal>
              <Reveal delay={180}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button href="/signup" size="md">
                    Start free
                    <Icon name="arrowRight" className="size-4" strokeWidth={2} />
                  </Button>
                  <Button href="/contact" variant="outline" size="md">
                    Talk to sales
                  </Button>
                </div>
              </Reveal>
            </div>

            <Reveal delay={200}>
              <Preview name={page.heroPreview} />
            </Reveal>
          </div>

          <Reveal delay={120}>
            <dl className="mt-16 grid gap-6 border-t border-[var(--line)] pt-10 sm:grid-cols-2 lg:grid-cols-4">
              {page.stats.map((s) => (
                <div key={s.label}>
                  <dt className="text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-gradient">
                    {s.value}
                  </dt>
                  <dd className="mt-2 text-[0.8125rem] leading-snug text-fg-subtle">{s.label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------- intro trio */}
      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <div className="grid gap-6 md:grid-cols-3">
            {page.intro.map((b, i) => (
              <Reveal key={b.title} delay={i * 80}>
                <Card className="flex h-full flex-col gap-4 p-6">
                  <IconTile name={b.icon} tone={(["iris", "cyan", "mint"] as const)[i % 3]} />
                  <h3 className="text-[1.0625rem] leading-snug">{b.title}</h3>
                  <p className="text-[0.875rem] leading-relaxed text-fg-subtle">{b.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------- deep features */}
      <Section className="py-4 md:py-8">
        <div className="container-wide">
          {page.deep.map((f, i) => (
            <div
              key={f.title}
              className={cn(
                "grid items-center gap-10 border-b border-[var(--line)] py-16 last:border-0 md:py-20 lg:gap-16",
                f.preview ? "lg:grid-cols-2" : "lg:grid-cols-[minmax(0,34rem)_1fr]",
              )}
            >
              <Reveal className={cn(i % 2 === 1 && f.preview && "lg:order-2")}>
                <div>
                  <span className="font-mono text-2xs tracking-[0.16em] text-iris-300 uppercase">
                    {f.eyebrow}
                  </span>
                  <h2 className="mt-3 text-[1.5rem] leading-tight md:text-[1.875rem]">{f.title}</h2>
                  <p className="mt-4 text-[0.9375rem] leading-relaxed text-fg-muted">{f.body}</p>
                  {f.bullets ? (
                    <ul className="mt-6 flex flex-col gap-2.5">
                      {f.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2.5">
                          <Icon name="check" className="mt-0.5 size-4 shrink-0 text-mint-400" strokeWidth={2.3} />
                          <span className="text-[0.875rem] leading-relaxed text-fg-muted">{b}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {f.note ? (
                    <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-[var(--line)] bg-ink-900 px-4 py-3 text-[0.8125rem] leading-relaxed text-fg-subtle">
                      <Icon name="info" className="mt-0.5 size-4 shrink-0 text-amber-400" strokeWidth={1.8} />
                      {f.note}
                    </p>
                  ) : null}
                </div>
              </Reveal>

              {f.preview ? (
                <Reveal delay={100} className={cn(i % 2 === 1 && "lg:order-1")}>
                  <Preview name={f.preview} />
                </Reveal>
              ) : (
                <Reveal delay={100}>
                  <div className="dot-bg h-full min-h-[16rem] rounded-2xl border border-[var(--line)]" />
                </Reveal>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------- specs + quote */}
      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-[1fr_22rem] lg:gap-16">
            <div>
              <SectionHeader
                eyebrow="Specifications"
                eyebrowIcon="list"
                align="left"
                title="The technical detail"
                className="mb-8"
              />
              <dl className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {page.specs.map((s) => (
                  <div key={s.label} className="grid gap-1 py-4 sm:grid-cols-[13rem_1fr] sm:gap-6">
                    <dt className="text-[0.8125rem] font-medium text-fg">{s.label}</dt>
                    <dd className="text-[0.8125rem] leading-relaxed text-fg-subtle">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <Reveal delay={100}>
              <TestimonialCard t={quote} />
            </Reveal>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------- faq */}
      <Section className="py-16 md:py-20">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[20rem_1fr] lg:gap-16">
            <SectionHeader
              eyebrow="Questions"
              eyebrowIcon="info"
              align="left"
              title={`About ${page.nav.toLowerCase()}`}
            />
            <FaqList items={page.faqs} />
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------- related */}
      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <SectionHeader
            eyebrow="Keep exploring"
            eyebrowIcon="layers"
            title="Pairs well with"
            className="mb-10"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r, i) => (
              <Reveal key={r.slug} delay={i * 70}>
                <Link href={`/product/${r.slug}`} className="group block h-full">
                  <Card interactive className="flex h-full flex-col gap-3.5 p-5">
                    <IconTile name={r.icon} tone="iris" />
                    <div>
                      <h3 className="text-[0.9375rem] font-medium text-fg-strong">{r.nav}</h3>
                      <p className="mt-1.5 line-clamp-3 text-[0.8125rem] leading-relaxed text-fg-subtle">
                        {r.lede}
                      </p>
                    </div>
                    <span className="mt-auto inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-iris-300">
                      Learn more
                      <Icon
                        name="arrowRight"
                        className="size-3.5 transition-transform group-hover:translate-x-0.5"
                        strokeWidth={2}
                      />
                    </span>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>

          <div className="mt-16">
            <LogoWall label="In production at" marquee={false} />
          </div>
        </div>
      </Section>
    </>
  );
}
