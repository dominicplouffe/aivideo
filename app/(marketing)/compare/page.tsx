import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { comparePages } from "@/lib/compare-content";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, SectionHeader, Card, Badge } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = pageMetadata({
  title: "Compare DemoRiff",
  description:
    "Honest, detailed comparisons between DemoRiff and Trupeer, Descript, Creatify, Loom, Arcade and Scribe — including where each competitor is the better choice.",
  path: "/compare",
});

export default function CompareIndexPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-12 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="layers">Comparisons</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              How DemoRiff compares,
              <br className="hidden sm:block" /> including where it{" "}
              <span className="text-gradient">loses</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Every comparison here opens by naming the cases where the other tool is the better
              buy. We would rather you choose correctly than churn in four months, and a comparison
              page where the author wins every row is not a comparison.
            </p>
          </div>
        </div>
      </section>

      <Section className="py-12 md:py-16">
        <div className="container-page">
          <div className="grid gap-4 md:grid-cols-2">
            {comparePages.map((c, i) => (
              <Reveal key={c.slug} delay={(i % 2) * 70}>
                <Link href={`/compare/${c.slug}`} className="group block h-full">
                  <Card interactive className="flex h-full flex-col gap-4 p-6">
                    <div className="flex items-center justify-between">
                      <Badge tone="neutral">{c.category}</Badge>
                      <Icon
                        name="arrowUpRight"
                        className="size-4 text-fg-faint opacity-0 transition-all group-hover:opacity-100"
                        strokeWidth={1.9}
                      />
                    </div>
                    <h2 className="text-[1.25rem] leading-snug">DemoRiff vs. {c.competitor}</h2>
                    <p className="text-[0.875rem] leading-relaxed text-fg-subtle">{c.headline}</p>
                    <p className="mt-auto flex items-start gap-2 border-t border-[var(--line)] pt-4 text-[0.8125rem] leading-relaxed text-fg-faint">
                      <Icon name="info" className="mt-0.5 size-3.5 shrink-0 text-amber-400" strokeWidth={1.9} />
                      <span className="line-clamp-2">{c.theyWin}</span>
                    </p>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>

          <div className="mt-14 flex flex-col items-center gap-4 rounded-2xl border border-[var(--line)] p-8 text-center">
            <h2 className="text-[1.25rem]">Evaluating something not listed here?</h2>
            <p className="max-w-lg text-[0.875rem] leading-relaxed text-fg-subtle">
              Tell us which tools are on your shortlist and we will send an honest written
              comparison — including the cases where we would tell you to buy the other one.
            </p>
            <Button href="/contact" size="md" className="mt-2">Ask for a comparison</Button>
          </div>
        </div>
      </Section>
    </>
  );
}
