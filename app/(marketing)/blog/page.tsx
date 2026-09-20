import type { Metadata } from "next";
import Link from "next/link";
import { posts } from "@/lib/blog-content";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Eyebrow, Section, Card, Badge } from "@/components/ui/Primitives";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = {
  title: "The Riff",
  description:
    "Field notes on product demos, documentation, localization and the craft of explaining software — from the team building DemoRiff.",
  alternates: { canonical: "/blog" },
};

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default function BlogIndexPage() {
  const featured = posts.find((p) => p.featured) ?? posts[0];
  const rest = posts.filter((p) => p.slug !== featured.slug);

  return (
    <>
      <section className="relative overflow-hidden pt-16 pb-10 md:pt-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative">
          <div className="max-w-2xl">
            <Eyebrow icon="book">The Riff</Eyebrow>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] tracking-[-0.035em] md:text-[3rem]">
              Field notes on explaining
              <br className="hidden sm:block" /> <span className="text-gradient">software well</span>
            </h1>
            <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">
              Research from 94 million demo views, engineering write-ups from the pipeline, and
              practical craft advice for anyone whose job involves making a product make sense.
            </p>
          </div>
        </div>
      </section>

      <Section className="py-8 md:py-12">
        <div className="container-page">
          <Reveal>
            <Link href={`/blog/${featured.slug}`} className="group block">
              <Card interactive className="p-8 md:p-10">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Badge tone="iris">{featured.category}</Badge>
                  <span className="text-2xs text-fg-faint">{fmt(featured.date)}</span>
                  <span className="text-2xs text-fg-faint">· {featured.readMinutes} min read</span>
                </div>
                <h2 className="mt-5 max-w-3xl text-[1.625rem] leading-tight md:text-[2.125rem]">
                  {featured.title}
                </h2>
                <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">
                  {featured.dek}
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <span className="inline-flex size-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-iris-600),var(--color-cyan-500))] text-2xs font-semibold text-white">
                    {featured.author.name.split(" ").map((p) => p[0]).join("")}
                  </span>
                  <span className="text-[0.8125rem] text-fg-subtle">
                    {featured.author.name} · {featured.author.role}
                  </span>
                  <Icon
                    name="arrowRight"
                    className="ml-auto size-4 text-iris-300 transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2}
                  />
                </div>
              </Card>
            </Link>
          </Reveal>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((p, i) => (
              <Reveal key={p.slug} delay={(i % 3) * 70}>
                <Link href={`/blog/${p.slug}`} className="group block h-full">
                  <Card interactive className="flex h-full flex-col gap-3.5 p-6">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{p.category}</Badge>
                      <span className="text-2xs text-fg-faint">{p.readMinutes} min</span>
                    </div>
                    <h2 className="text-[1.0625rem] leading-snug">{p.title}</h2>
                    <p className="line-clamp-3 text-[0.875rem] leading-relaxed text-fg-subtle">{p.dek}</p>
                    <div className="mt-auto flex items-center justify-between border-t border-[var(--line)] pt-4">
                      <span className="text-2xs text-fg-faint">
                        {p.author.name} · {fmt(p.date)}
                      </span>
                      <Icon
                        name="arrowRight"
                        className="size-3.5 text-fg-faint transition-transform group-hover:translate-x-0.5"
                        strokeWidth={2}
                      />
                    </div>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>

          <div className="mt-14 flex flex-col items-center gap-4 rounded-2xl border border-[var(--line)] p-8 text-center">
            <h2 className="text-[1.25rem]">One considered email, every other Tuesday</h2>
            <p className="max-w-lg text-[0.875rem] leading-relaxed text-fg-subtle">
              No product announcements, no drip sequence. Research, craft notes and the occasional
              uncomfortable finding from the data.
            </p>
            <form className="mt-2 flex w-full max-w-sm gap-2" action="/blog">
              <input
                type="email"
                required
                placeholder="you@company.com"
                aria-label="Email address"
                className="h-11 flex-1 rounded-xl border border-[var(--line)] bg-ink-900 px-4 text-[0.875rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
              />
              <Button type="submit" size="md">Subscribe</Button>
            </form>
          </div>
        </div>
      </Section>
    </>
  );
}
