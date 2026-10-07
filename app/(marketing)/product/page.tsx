import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { productPages } from "@/lib/product-content";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Eyebrow, Section, SectionHeader, Card, IconTile } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import { OutputShowcase } from "@/components/marketing/OutputShowcase";
import { CapabilityBento } from "@/components/marketing/Sections";

export const metadata: Metadata = pageMetadata({
  title: "Product",
  description:
    "The full DemoRiff platform: interaction-aware screen recorder, transcript-based AI video studio, voices, presenters, brand system, interactive demos, documentation, localization and analytics.",
  path: "/product",
});

const stages = [
  { key: "Capture", slugs: ["recorder", "import"] },
  { key: "Produce", slugs: ["studio", "voice", "avatars", "brand", "agent"] },
  { key: "Publish", slugs: ["interactive", "docs", "localization", "analytics"] },
];

export default function ProductIndexPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-12 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="layers">The platform</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              One pipeline from a rough take
              <br className="hidden sm:block" /> to <span className="text-gradient">everything you ship</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Capture, produce, publish. Eleven capabilities that share one source of truth, so the
              video, the tour, the guide and the translations can never disagree with each other.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href="/signup" size="md">
                Start free
                <Icon name="arrowRight" className="size-4" strokeWidth={2} />
              </Button>
              <Button href="/pricing" variant="outline" size="md">See pricing</Button>
            </div>
          </div>
        </div>
      </section>

      {stages.map((stage, si) => (
        <Section key={stage.key} tone={si % 2 === 1 ? "raised" : "default"} className="py-14 md:py-18">
          <div className="container-page">
            <div className="mb-8 flex items-center gap-3">
              <span className="font-mono text-2xs tracking-[0.18em] text-iris-300 uppercase">
                {String(si + 1).padStart(2, "0")} · {stage.key}
              </span>
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {stage.slugs
                .map((s) => productPages.find((p) => p.slug === s))
                .filter((p): p is NonNullable<typeof p> => Boolean(p))
                .map((p, i) => (
                  <Reveal key={p.slug} delay={(i % 3) * 70}>
                    <Link href={`/product/${p.slug}`} className="group block h-full">
                      <Card interactive className="flex h-full flex-col gap-4 p-6">
                        <div className="flex items-start justify-between">
                          <IconTile name={p.icon} tone={(["iris", "cyan", "mint", "amber", "violet"] as const)[i % 5]} />
                          <Icon
                            name="arrowUpRight"
                            className="size-4 text-fg-faint opacity-0 transition-all group-hover:opacity-100"
                            strokeWidth={1.9}
                          />
                        </div>
                        <h2 className="text-[1.0625rem] leading-snug">{p.nav}</h2>
                        <p className="line-clamp-4 text-[0.875rem] leading-relaxed text-fg-subtle">{p.lede}</p>
                        <div className="mt-auto flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-4">
                          {p.stats.slice(0, 2).map((s) => (
                            <span key={s.label} className="rounded-lg bg-ink-850 px-2 py-1 text-2xs text-fg-muted">
                              <span className="font-medium text-iris-300">{s.value}</span> {s.label.toLowerCase()}
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
      ))}

      <Section className="py-16 md:py-20">
        <div className="container-wide">
          <SectionHeader
            eyebrow="One take, four assets"
            eyebrowIcon="layers"
            title="What comes out the other end"
            className="mb-12"
          />
          <OutputShowcase />
        </div>
      </Section>

      <Section tone="raised">
        <div className="container-wide">
          <SectionHeader
            eyebrow="Capabilities"
            eyebrowIcon="sparkles"
            title="The editing decisions, made for you"
            className="mb-12"
          />
          <CapabilityBento />
        </div>
      </Section>
    </>
  );
}
