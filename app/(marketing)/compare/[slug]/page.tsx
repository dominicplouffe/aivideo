import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { comparePages, getComparePage, type CompareRowData } from "@/lib/compare-content";
import { FaqList } from "@/components/marketing/Faq";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, SectionHeader, Card, IconTile, Badge } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import { LogoWall } from "@/components/marketing/LogoWall";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return comparePages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getComparePage(slug);
  if (!page) return {};
  return {
    title: `DemoRiff vs. ${page.competitor}`,
    description: page.lede.slice(0, 300),
    alternates: { canonical: `/compare/${page.slug}` },
  };
}

function Cell({ value, ours }: { value: CompareRowData["us"] | CompareRowData["them"]; ours?: boolean }) {
  if (value === true)
    return <Icon name="check" className={cn("mx-auto size-4", ours ? "text-mint-400" : "text-fg-muted")} strokeWidth={2.4} />;
  if (value === false) return <span className="text-fg-faint">—</span>;
  return <span className={cn("text-[0.75rem]", ours ? "text-fg" : "text-fg-subtle")}>{value}</span>;
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getComparePage(slug);
  if (!page) notFound();

  const others = comparePages.filter((c) => c.slug !== page.slug);

  return (
    <>
      {/* hero */}
      <section className="relative overflow-hidden pt-14 pb-14 md:pt-20">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-2xs text-fg-faint">
            <Link href="/" className="transition-colors hover:text-fg-muted">Home</Link>
            <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
            <Link href="/compare" className="transition-colors hover:text-fg-muted">Compare</Link>
            <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
            <span className="text-fg-muted">{page.competitor}</span>
          </nav>

          <div className="max-w-3xl">
            <Reveal><Eyebrow icon="layers">{page.category}</Eyebrow></Reveal>
            <Reveal delay={60}>
              <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
                {page.headline}
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">{page.lede}</p>
            </Reveal>
          </div>

          {/* the honest bit */}
          <Reveal delay={180}>
            <div className="mt-10 max-w-3xl rounded-2xl border border-amber-500/28 bg-amber-500/[0.06] p-5">
              <div className="flex items-start gap-3">
                <Icon name="info" className="mt-0.5 size-[1.125rem] shrink-0 text-amber-400" strokeWidth={1.8} />
                <div>
                  <p className="text-[0.875rem] font-medium text-fg-strong">
                    Where {page.competitor} is the better choice
                  </p>
                  <p className="mt-1.5 text-[0.875rem] leading-relaxed text-fg-muted">{page.theyWin}</p>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={220}>
            <p className="mt-8 max-w-3xl text-[0.9375rem] leading-relaxed text-fg-subtle">
              {page.positioning}
            </p>
          </Reveal>

          <Reveal delay={260}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/signup" size="md">
                Try DemoRiff free
                <Icon name="arrowRight" className="size-4" strokeWidth={2} />
              </Button>
              <Button href="/contact" variant="outline" size="md">Get a side-by-side walkthrough</Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* differences */}
      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <SectionHeader
            eyebrow="The real differences"
            eyebrowIcon="target"
            align="left"
            title={`Four things DemoRiff does that ${page.competitor} does not`}
            className="mb-10"
          />
          <div className="grid gap-4 md:grid-cols-2">
            {page.differences.map((d, i) => (
              <Reveal key={d.title} delay={(i % 2) * 80}>
                <Card className="flex h-full flex-col gap-4 p-6">
                  <IconTile name={d.icon} tone={(["iris", "cyan", "mint", "violet"] as const)[i % 4]} />
                  <h3 className="text-[1.0625rem] leading-snug">{d.title}</h3>
                  <p className="text-[0.875rem] leading-relaxed text-fg-subtle">{d.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      {/* matrix */}
      <Section className="py-16 md:py-20">
        <div className="container-page">
          <SectionHeader
            eyebrow="Feature by feature"
            eyebrowIcon="list"
            title={`DemoRiff vs. ${page.competitor}`}
            description="Compiled from public documentation and pricing pages. If something here is out of date, tell us and we will correct it."
            className="mb-10"
          />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse">
              <thead>
                <tr>
                  <th className="w-[46%] border-b border-[var(--line)] px-4 py-3 text-left">
                    <span className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">Capability</span>
                  </th>
                  <th className="w-[27%] border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--color-iris-500)_8%,transparent)] px-4 py-3 text-center">
                    <span className="text-[0.875rem] font-semibold text-fg-strong">{site.name}</span>
                  </th>
                  <th className="w-[27%] border-b border-[var(--line)] px-4 py-3 text-center">
                    <span className="text-[0.875rem] font-semibold text-fg-muted">{page.competitor}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.matrix.map((group) => (
                  <>
                    <tr key={group.group}>
                      <td colSpan={3} className="px-4 pt-8 pb-2">
                        <span className="text-[0.875rem] font-semibold text-fg-strong">{group.group}</span>
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.label}>
                        <td className="border-b border-[var(--line)] px-4 py-3">
                          <span className="text-[0.8125rem] text-fg-muted">{row.label}</span>
                          {row.note ? (
                            <span className="mt-0.5 block text-2xs text-fg-faint">{row.note}</span>
                          ) : null}
                        </td>
                        <td className="border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--color-iris-500)_5%,transparent)] px-4 py-3 text-center">
                          <Cell value={row.us} ours />
                        </td>
                        <td className="border-b border-[var(--line)] px-4 py-3 text-center">
                          <Cell value={row.them} />
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-ink-900 p-5">
            <Icon name="refresh" className="mt-0.5 size-[1.125rem] shrink-0 text-iris-400" strokeWidth={1.8} />
            <div>
              <p className="text-[0.875rem] font-medium text-fg-strong">Switching from {page.competitor}</p>
              <p className="mt-1.5 text-[0.875rem] leading-relaxed text-fg-subtle">{page.switchNote}</p>
            </div>
          </div>
        </div>
      </Section>

      {/* faq */}
      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <div className="grid gap-12 lg:grid-cols-[20rem_1fr] lg:gap-16">
            <SectionHeader eyebrow="Questions" eyebrowIcon="info" align="left" title="What people ask us" />
            <FaqList items={page.faqs} />
          </div>
        </div>
      </Section>

      {/* other comparisons */}
      <Section className="py-16 md:py-20">
        <div className="container-page">
          <SectionHeader eyebrow="Also comparing" eyebrowIcon="layers" title="Other tools in this evaluation" className="mb-10" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((o, i) => (
              <Reveal key={o.slug} delay={(i % 3) * 70}>
                <Link href={`/compare/${o.slug}`} className="group block h-full">
                  <Card interactive className="flex h-full flex-col gap-3 p-5">
                    <Badge tone="neutral">{o.category}</Badge>
                    <h3 className="text-[1rem] font-medium text-fg-strong">DemoRiff vs. {o.competitor}</h3>
                    <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-fg-subtle">{o.headline}</p>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[0.8125rem] font-medium text-iris-300">
                      Read comparison
                      <Icon name="arrowRight" className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
                    </span>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>
          <div className="mt-16">
            <LogoWall label="Teams that made the switch" marquee={false} />
          </div>
        </div>
      </Section>
    </>
  );
}
