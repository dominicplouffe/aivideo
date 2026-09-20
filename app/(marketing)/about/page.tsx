import type { Metadata } from "next";
import { site } from "@/lib/site";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, SectionHeader, Card, Stat } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import { LogoWall } from "@/components/marketing/LogoWall";

export const metadata: Metadata = {
  title: "About",
  description:
    "DemoRiff builds the production layer for software companies. Why we started, what we believe about demos, and how we run the company.",
  alternates: { canonical: "/about" },
};

const beliefs = [
  {
    title: "A demo is an argument, not a feature list",
    body:
      "The best product demos have a thesis: here is the painful thing, here is the moment it stops being painful. Most demos are a tour of the navigation. We build tooling that makes the argument easier to construct than the tour.",
  },
  {
    title: "Production quality is a trust signal, unfairly",
    body:
      "A buyer who cannot evaluate your architecture will absolutely evaluate whether your demo looks like a real company made it. That is not fair, but it is true, and it means production quality should not be a function of budget.",
  },
  {
    title: "The second version is where the value is",
    body:
      "Anyone can make one good video. The expensive part is the one hundred and fortieth, and the re-record after the UI changes, and the eleven translations. We optimise for the boring middle of the library, not the hero asset.",
  },
  {
    title: "Automation should be legible",
    body:
      "Every decision the pipeline makes is exposed as an editable object. A tool that makes choices you cannot see or change is not a tool, it is a slot machine.",
  },
  {
    title: "Say where you are the wrong choice",
    body:
      "Our comparison pages open by naming the cases where the competitor wins. We would rather lose a deal we would have churned than win one we could not keep.",
  },
  {
    title: "Recordings are customer data",
    body:
      "A screen recording of your product is a recording of your customers. We treat it with the controls that implies: never used for training, masked before render, deletable with a certificate.",
  },
];

const timeline = [
  { year: "2024", title: "The wrong kind of Tuesday", body: "Our founders were running product marketing at a Series B company and spent a full week producing one four-minute launch video. The feature shipped on the Monday after it went live." },
  { year: "2024", title: "First version, one customer", body: "A crude tool that cut filler words and added zooms. The first customer used it to produce eleven videos in a week, which had previously been their annual output." },
  { year: "2025", title: "Documentation, by accident", body: "A customer asked whether the interaction data could produce a written guide. It could. Guides are now the most-used output on the platform and are unmetered on every plan." },
  { year: "2025", title: "Series A", body: "$22M to build the localization pipeline and the enterprise controls that security teams kept asking us for." },
  { year: "2026", title: "Riff Agent", body: "Autonomous demo generation from a changelog entry. Still gated behind human approval, and it always will be." },
  { year: "Today", title: "9,400 workspaces", body: "2.4 million demos produced, in 34 languages, by teams from two-person startups to companies with four thousand employees." },
];

const values = [
  { icon: "eye" as const, title: "Write it down", body: "Decisions live in documents, not in meetings. If it was not written, it did not happen." },
  { icon: "users" as const, title: "Ship to a person", body: "Every feature has a named customer who asked for it. We do not build for a persona." },
  { icon: "shield" as const, title: "Be honest in public", body: "Including about limitations, outages and the cases where a competitor is better." },
  { icon: "clock" as const, title: "Sustainable pace", body: "No heroics. A company that needs heroics has a planning problem, not a commitment problem." },
];

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-12 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-3xl">
            <Eyebrow icon="briefcase">About {site.name}</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              We are building the production layer
              <br className="hidden sm:block" /> for <span className="text-gradient">software companies</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Every software company needs to explain itself — to buyers, to users, to the person
              who just opened a support ticket. That explanation currently costs a week and an
              agency, so most of it never gets made. We think that is a tooling problem.
            </p>
          </div>

          <Reveal delay={120}>
            <dl className="mt-14 grid gap-8 border-t border-[var(--line)] pt-10 sm:grid-cols-2 lg:grid-cols-4">
              <Stat value="2.4M" label="Demos produced" sub="Across 9,400 workspaces" />
              <Stat value="72" label="People" sub="Across 14 countries" />
              <Stat value="$28M" label="Raised" sub="Seed and Series A" />
              <Stat value="2024" label="Founded" sub={site.hq} />
            </dl>
          </Reveal>
        </div>
      </section>

      <Section tone="raised">
        <div className="container-page">
          <SectionHeader
            eyebrow="What we believe"
            eyebrowIcon="brain"
            align="left"
            title="Six opinions that shaped the product"
            className="mb-12"
          />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {beliefs.map((b, i) => (
              <Reveal key={b.title} delay={(i % 3) * 70}>
                <Card className="flex h-full flex-col gap-3 p-6">
                  <span className="font-mono text-2xs text-iris-300">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="text-[1rem] leading-snug">{b.title}</h3>
                  <p className="text-[0.875rem] leading-relaxed text-fg-subtle">{b.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      <Section>
        <div className="container-page">
          <SectionHeader eyebrow="History" eyebrowIcon="clock" align="left" title="How we got here" className="mb-12" />
          <ol className="relative border-l border-[var(--line)] pl-8">
            {timeline.map((t, i) => (
              <Reveal key={t.title} delay={i * 60}>
                <li className="relative mb-10 last:mb-0">
                  <span className="absolute top-1.5 -left-[2.3rem] size-3 rounded-full border-2 border-ink-1000 bg-iris-500" />
                  <span className="font-mono text-2xs tracking-[0.14em] text-iris-300 uppercase">{t.year}</span>
                  <h3 className="mt-1.5 text-[1.0625rem]">{t.title}</h3>
                  <p className="mt-2 max-w-2xl text-[0.875rem] leading-relaxed text-fg-subtle">{t.body}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </Section>

      <Section tone="raised">
        <div className="container-page">
          <SectionHeader eyebrow="How we work" eyebrowIcon="users" title="Four things we hold each other to" className="mb-12" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => (
              <Reveal key={v.title} delay={i * 70}>
                <Card className="flex h-full flex-col gap-3 p-5">
                  <Icon name={v.icon} className="size-5 text-iris-400" strokeWidth={1.7} />
                  <h3 className="text-[0.9375rem] font-medium text-fg-strong">{v.title}</h3>
                  <p className="text-[0.8125rem] leading-relaxed text-fg-subtle">{v.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
          <div className="mt-14">
            <LogoWall label="Companies that trusted us early" marquee={false} />
          </div>
          <div className="mt-14 flex flex-col items-center gap-4 text-center">
            <h2 className="text-[1.25rem]">We are hiring across product, engineering and go-to-market</h2>
            <Button href="/careers" size="md">See open roles</Button>
          </div>
        </div>
      </Section>
    </>
  );
}
