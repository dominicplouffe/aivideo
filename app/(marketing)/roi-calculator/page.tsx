import type { Metadata } from "next";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";
import { Eyebrow, Section, SectionHeader, Card } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "ROI calculator",
  description:
    "Work out what your current video production actually costs — in agency invoices, internal hours and the videos you never made — and what changes with DemoRiff.",
  alternates: { canonical: "/roi-calculator" },
};

const assumptions = [
  "Agency cost per finished minute is taken from the midpoint of the $1,400–$3,000 range we see quoted in B2B SaaS.",
  "Internal production time counts scripting, recording, editing, revisions and publishing — not the meeting about whether to make it.",
  "The “videos you did not make” line is the gap between what your roadmap produced and what got covered. It is usually the largest number and the easiest to ignore.",
  "Localization cost assumes a per-video-per-language vendor quote, which is how this work is normally priced.",
  "DemoRiff cost uses list pricing on the plan whose included minutes cover your volume.",
];

export default function RoiPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-10 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="creditCard">ROI calculator</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              What your video pipeline
              <br className="hidden sm:block" /> <span className="text-gradient">actually costs</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Most teams underestimate this by an order of magnitude, because the biggest line is
              invisible: the videos the roadmap needed and nobody had time to make.
            </p>
          </div>
        </div>
      </section>

      <Section className="py-8 md:py-12">
        <div className="container-page">
          <RoiCalculator />
        </div>
      </Section>

      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <SectionHeader
                eyebrow="Method"
                eyebrowIcon="info"
                align="left"
                title="What is in these numbers"
              />
              <ul className="mt-6 flex flex-col gap-3">
                {assumptions.map((a) => (
                  <li key={a} className="flex items-start gap-2.5">
                    <Icon name="check" className="mt-0.5 size-4 shrink-0 text-mint-400" strokeWidth={2.2} />
                    <span className="text-[0.875rem] leading-relaxed text-fg-subtle">{a}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Card className="flex flex-col gap-4 p-7">
              <h2 className="text-[1.25rem] leading-snug">Want this run against your real numbers?</h2>
              <p className="text-[0.9375rem] leading-relaxed text-fg-muted">
                Send us your current roadmap volume, your production arrangement and the markets you
                sell into. We will send back a written model you can put in front of a CFO — with
                the assumptions itemised so they can argue with them.
              </p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <Button href="/contact?topic=roi" size="md">Request a model</Button>
                <Button href="/pricing" variant="outline" size="md">See pricing</Button>
              </div>
            </Card>
          </div>
        </div>
      </Section>
    </>
  );
}
