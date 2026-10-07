import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { courses } from "@/lib/academy-content";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Eyebrow, Section, Card, Badge, IconTile } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = pageMetadata({
  title: "Demo Academy",
  description:
    "A free course on making product demos that convert — structure, recording craft, scaling a video operation and applying demo craft to the revenue motion.",
  path: "/academy",
});

export default function AcademyPage() {
  const lessonCount = courses.reduce((n, c) => n + c.lessons.length, 0);
  const minutes = courses.reduce((n, c) => n + c.lessons.reduce((m, l) => m + l.minutes, 0), 0);

  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-10 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="graduation">Demo Academy</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              A free course on demos
              <br className="hidden sm:block" /> that <span className="text-gradient">actually convert</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Four courses, {lessonCount} lessons, about {minutes} minutes of reading. Almost none
              of it is about DemoRiff — it is about the structural decisions that determine whether
              a demo works, whatever you make it with.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button href={`/academy/${courses[0].slug}/${courses[0].lessons[0].slug}`} size="md">
                Start the first lesson
                <Icon name="arrowRight" className="size-4" strokeWidth={2} />
              </Button>
              <Button href="/blog" variant="outline" size="md">Read the research</Button>
            </div>
          </div>
        </div>
      </section>

      <Section className="py-10 md:py-14">
        <div className="container-page">
          <div className="grid gap-4 lg:grid-cols-2">
            {courses.map((c, i) => (
              <Reveal key={c.slug} delay={(i % 2) * 70}>
                <Card className="flex h-full flex-col p-6 md:p-7">
                  <div className="flex items-start justify-between">
                    <IconTile name={c.icon} tone={(["iris", "cyan", "mint", "amber"] as const)[i % 4]} />
                    <Badge tone="neutral">{c.level}</Badge>
                  </div>
                  <h2 className="mt-5 text-[1.25rem] leading-snug">{c.title}</h2>
                  <p className="mt-3 text-[0.875rem] leading-relaxed text-fg-subtle">{c.summary}</p>

                  <div className="mt-5">
                    <p className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                      You will be able to
                    </p>
                    <ul className="mt-2.5 flex flex-col gap-1.5">
                      {c.outcomes.map((o) => (
                        <li key={o} className="flex items-start gap-2.5 text-[0.8125rem] text-fg-muted">
                          <Icon name="check" className="mt-0.5 size-3.5 shrink-0 text-mint-400" strokeWidth={2.4} />
                          {o}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <ol className="mt-6 flex flex-col divide-y divide-[var(--line)] border-t border-[var(--line)]">
                    {c.lessons.map((l, n) => (
                      <li key={l.slug}>
                        <Link
                          href={`/academy/${c.slug}/${l.slug}`}
                          className="group flex items-center gap-3 py-3 transition-colors"
                        >
                          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-ink-850 font-mono text-2xs text-fg-subtle">
                            {n + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[0.875rem] font-medium text-fg transition-colors group-hover:text-iris-300">
                              {l.title}
                            </span>
                            <span className="block truncate text-[0.75rem] text-fg-subtle">{l.summary}</span>
                          </span>
                          <span className="shrink-0 font-mono text-2xs text-fg-faint">{l.minutes}m</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
