import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { releases } from "@/lib/changelog-content";
import { Icon } from "@/components/ui/Icon";
import { Eyebrow, Section, Badge, type BadgeTone } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = pageMetadata({
  title: "Changelog",
  description:
    "Everything we shipped, every release. New features, improvements and fixes across the DemoRiff platform.",
  path: "/changelog",
});

const tagTone: Record<string, BadgeTone> = {
  Major: "iris",
  Feature: "cyan",
  Improvement: "mint",
  Fix: "neutral",
};

const kindMeta = {
  new: { label: "New", cls: "text-iris-300", icon: "plus" as const },
  improved: { label: "Improved", cls: "text-cyan-300", icon: "trending" as const },
  fixed: { label: "Fixed", cls: "text-mint-400", icon: "check" as const },
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function ChangelogPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-10 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="lightning">Changelog</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              Everything we shipped
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Monthly releases, written by the people who built them. Fixes included, because a
              changelog that only lists features is marketing.
            </p>
            <form className="mt-8 flex w-full max-w-sm gap-2" action="/changelog">
              <input
                type="email"
                required
                placeholder="you@company.com"
                aria-label="Email address"
                className="h-11 flex-1 rounded-xl border border-[var(--line)] bg-ink-900 px-4 text-[0.875rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
              />
              <Button type="submit" size="md">Get releases</Button>
            </form>
          </div>
        </div>
      </section>

      <Section className="py-8 md:py-12">
        <div className="container-page">
          <div className="relative border-l border-[var(--line)] pl-8 md:pl-10">
            {releases.map((r, i) => (
              <Reveal key={r.version} delay={Math.min(i, 3) * 60}>
                <article className="relative mb-14 last:mb-0">
                  <span className="absolute top-2 -left-[2.3rem] size-3 rounded-full border-2 border-ink-1000 bg-iris-500 md:-left-[2.8rem]" />
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-[0.875rem] text-fg-strong">{r.version}</span>
                    <Badge tone={tagTone[r.tag]}>{r.tag}</Badge>
                    <span className="text-2xs text-fg-faint">{fmt(r.date)}</span>
                  </div>
                  <h2 className="mt-3 text-[1.375rem] leading-tight md:text-[1.625rem]">{r.title}</h2>
                  <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">{r.summary}</p>

                  <ul className="mt-6 flex flex-col gap-2.5 rounded-2xl border border-[var(--line)] p-5">
                    {r.items.map((it) => {
                      const m = kindMeta[it.kind];
                      return (
                        <li key={it.text} className="flex items-start gap-3">
                          <span
                            className={cn(
                              "mt-0.5 inline-flex w-[4.5rem] shrink-0 items-center gap-1 font-mono text-2xs",
                              m.cls,
                            )}
                          >
                            <Icon name={m.icon} className="size-3" strokeWidth={2.4} />
                            {m.label}
                          </span>
                          <span className="text-[0.875rem] leading-relaxed text-fg-muted">{it.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
