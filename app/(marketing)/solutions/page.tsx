import type { Metadata } from "next";
import Link from "next/link";
import { solutionPages } from "@/lib/solutions-content";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Eyebrow, Section, Card, IconTile } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import { LogoWall } from "@/components/marketing/LogoWall";

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "DemoRiff for product marketing, sales engineering, customer education, support, founders and enterprise IT — with the workflows and numbers for each.",
  alternates: { canonical: "/solutions" },
};

export default function SolutionsIndexPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-12 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="users">Solutions</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              Six teams, six reasons,
              <br className="hidden sm:block" /> <span className="text-gradient">one recording</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Product marketing arrives for launch velocity. Support arrives for ticket deflection.
              Security arrives because three teams are already using tools nobody approved. Pick the
              one that sounds like your week.
            </p>
          </div>
        </div>
      </section>

      <Section className="py-12 md:py-16">
        <div className="container-page">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {solutionPages.map((s, i) => (
              <Reveal key={s.slug} delay={(i % 3) * 70}>
                <Link href={`/solutions/${s.slug}`} className="group block h-full">
                  <Card interactive className="flex h-full flex-col gap-4 p-6">
                    <div className="flex items-start justify-between">
                      <IconTile name={s.icon} tone={(["iris", "cyan", "mint", "amber", "violet", "rose"] as const)[i % 6]} />
                      <Icon
                        name="arrowUpRight"
                        className="size-4 text-fg-faint opacity-0 transition-all group-hover:opacity-100"
                        strokeWidth={1.9}
                      />
                    </div>
                    <div>
                      <h2 className="text-[1.0625rem] leading-snug">{s.nav}</h2>
                      <p className="mt-1 text-2xs text-fg-faint">{s.persona}</p>
                    </div>
                    <p className="line-clamp-4 text-[0.875rem] leading-relaxed text-fg-subtle">{s.lede}</p>
                    <div className="mt-auto flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-4">
                      {s.outcomes.slice(0, 2).map((o) => (
                        <span key={o.label} className="rounded-lg bg-ink-850 px-2 py-1 text-2xs text-fg-muted">
                          <span className="font-medium text-iris-300">{o.value}</span> {o.label.toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>

          <div className="mt-16">
            <LogoWall label="Running on DemoRiff" marquee={false} />
          </div>

          <div className="mt-14 flex flex-col items-center gap-4 rounded-2xl border border-[var(--line)] p-8 text-center">
            <h2 className="text-[1.25rem]">Not sure which one you are?</h2>
            <p className="max-w-lg text-[0.875rem] leading-relaxed text-fg-subtle">
              Twenty minutes with someone who has onboarded a few hundred teams. They will tell you
              honestly whether this is the right shape of tool for your problem.
            </p>
            <Button href="/contact" size="md" className="mt-2">Book a walkthrough</Button>
          </div>
        </div>
      </Section>
    </>
  );
}
