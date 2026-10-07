import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, SectionHeader, Card } from "@/components/ui/Primitives";

export const metadata: Metadata = pageMetadata({
  title: "Press kit",
  description:
    "Logos, brand assets, company facts and media contacts for DemoRiff.",
  path: "/press",
});

const facts = [
  { label: "Founded", value: "2024" },
  { label: "Headquarters", value: site.hq },
  { label: "Employees", value: "72 across 14 countries" },
  { label: "Funding", value: "$28M — Seed and Series A" },
  { label: "Workspaces", value: "9,400" },
  { label: "Demos produced", value: "2.4 million" },
  { label: "Languages supported", value: "34" },
  { label: "Certifications", value: "SOC 2 Type II, ISO 27001" },
];

const boilerplate =
  "DemoRiff is the production layer for software companies. It turns a single raw screen recording into a directed demo video, an interactive click-through tour, a step-by-step written guide and a set of social clips — on brand, in thirty-four languages, in minutes rather than weeks. Founded in 2024 and headquartered in San Francisco, DemoRiff is used by more than 9,400 product, marketing, sales and support teams worldwide.";

const colors = [
  { name: "Iris", hex: "#6E56F8" },
  { name: "Violet", hex: "#A855F7" },
  { name: "Cyan", hex: "#22D3EE" },
  { name: "Ink", hex: "#04050A" },
  { name: "Paper", hex: "#EEF0F6" },
];

export default function PressPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-12 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="megaphone">Press kit</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              Everything a journalist
              <br className="hidden sm:block" /> might <span className="text-gradient">need</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Logos, colours, company facts and a boilerplate you can paste. For interviews,
              briefings or anything not covered here, email press@demoriff.com.
            </p>
          </div>
        </div>
      </section>

      <Section className="py-10 md:py-14">
        <div className="container-page">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:gap-10">
            <Card className="p-7">
              <SectionHeader align="left" title="The mark" className="mb-6" />
              <div className="grid grid-cols-2 gap-4">
                <div className="flex aspect-square items-center justify-center rounded-xl bg-ink-1000">
                  <LogoMark className="size-16" gradientId="press-a" />
                </div>
                <div className="flex aspect-square items-center justify-center rounded-xl bg-white">
                  <LogoMark className="size-16" gradientId="press-b" />
                </div>
              </div>
              <p className="mt-4 text-[0.8125rem] leading-relaxed text-fg-subtle">
                Three bars whose silhouette reads both as an audio waveform and as a play triangle.
                Do not stretch it, recolour it, or place it on a background that reduces contrast
                below 3:1. Keep clear space equal to the width of the smallest bar on all sides.
              </p>
              <Button href="/icon.svg" variant="outline" size="sm" className="mt-5">
                <Icon name="download" className="size-4" strokeWidth={1.9} />
                Download SVG
              </Button>
            </Card>

            <Card className="p-7">
              <SectionHeader align="left" title="Colour" className="mb-6" />
              <div className="space-y-2">
                {colors.map((c) => (
                  <div key={c.name} className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3">
                    <span className="size-9 rounded-lg border border-white/8" style={{ background: c.hex }} />
                    <span className="flex-1 text-[0.875rem] text-fg">{c.name}</span>
                    <span className="font-mono text-[0.75rem] text-fg-subtle">{c.hex}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[0.8125rem] leading-relaxed text-fg-subtle">
                The brand gradient runs Iris → Violet → Cyan at 120°. Use it for emphasis, never for
                body text.
              </p>
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr] lg:gap-10">
            <Card className="p-7">
              <SectionHeader align="left" title="Company facts" className="mb-6" />
              <dl className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {facts.map((f) => (
                  <div key={f.label} className="flex justify-between gap-4 py-3">
                    <dt className="text-[0.8125rem] text-fg-subtle">{f.label}</dt>
                    <dd className="text-right text-[0.8125rem] text-fg">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <Card className="p-7">
              <SectionHeader align="left" title="Boilerplate" className="mb-6" />
              <p className="rounded-xl border border-[var(--line)] bg-ink-900 p-4 text-[0.875rem] leading-relaxed text-fg-muted">
                {boilerplate}
              </p>
              <p className="mt-4 text-[0.8125rem] text-fg-subtle">
                Name styling: <span className="text-fg">DemoRiff</span>, one word, capital D and
                capital R. Not Demoriff, not Demo Riff, not DEMORIFF.
              </p>
              <Button href="mailto:press@demoriff.com" size="sm" className="mt-5">
                press@demoriff.com
              </Button>
            </Card>
          </div>
        </div>
      </Section>
    </>
  );
}
