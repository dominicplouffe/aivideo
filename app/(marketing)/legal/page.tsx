import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { legalDocs } from "@/lib/legal-content";
import { Section, SectionHeader, Card, Eyebrow } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";

export const metadata: Metadata = pageMetadata({
  title: "Legal",
  description:
    "Terms of Service, Privacy Policy, Data Processing Addendum, sub-processors and Acceptable Use Policy for DemoRiff.",
  path: "/legal",
});

/**
 * The legal index.
 *
 * Exists because people type `/legal` — it is the address a procurement team
 * guesses, and a 404 at that moment reads as a company with nothing to show
 * them. Each document leads with the date it changed, because "when was this
 * last updated" is the first question anybody reviewing one asks.
 */
export default function LegalIndexPage() {
  const sorted = [...legalDocs].sort((a, b) => (a.updated < b.updated ? 1 : -1));

  return (
    <>
      <section className="relative overflow-hidden hairline-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-40" />
        <div className="container-page relative py-16 md:py-24">
          <Eyebrow icon="shield">Legal</Eyebrow>
          <h1 className="mt-4 max-w-3xl text-balance text-[2rem] leading-[1.08] tracking-[-0.03em] md:text-[3rem]">
            The agreements, in full and in plain English
          </h1>
          <p className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-fg-subtle md:text-[1.0625rem]">
            Every document here carries a plain-English summary alongside the
            clause it explains. Not instead of it — a summary that replaces the
            terms is a summary nobody can rely on.
          </p>
        </div>
      </section>

      <Section className="py-12 md:py-16">
        <div className="container-page">
          <SectionHeader
            eyebrow="Documents"
            title="What you are agreeing to"
            description="Dated, versioned, and changed with notice. Enterprise customers are notified thirty days before a material change to the DPA or the sub-processor list."
          />

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {sorted.map((doc, i) => (
              <Reveal key={doc.slug} delay={(i % 2) * 70}>
                <Link href={`/legal/${doc.slug}`} className="group block h-full">
                  <Card className="flex h-full flex-col p-6 transition-colors group-hover:border-[var(--line-strong)] md:p-7">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="text-[1.125rem] leading-snug text-fg-strong transition-colors group-hover:text-iris-300">
                        {doc.title}
                      </h2>
                      <Icon
                        name="arrowUpRight"
                        className="mt-1 size-4 shrink-0 text-fg-faint transition-colors group-hover:text-iris-300"
                        strokeWidth={2}
                      />
                    </div>
                    <p className="mt-3 flex-1 text-[0.875rem] leading-relaxed text-fg-subtle">
                      {doc.summary}
                    </p>
                    <p className="mt-5 font-mono text-2xs text-fg-faint">
                      Updated{" "}
                      {new Date(doc.updated).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </Card>
                </Link>
              </Reveal>
            ))}
          </div>

          <p className="mt-8 text-[0.875rem] leading-relaxed text-fg-subtle">
            Questions about any of these go to{" "}
            <a href="mailto:legal@demoriff.com" className="text-iris-300 hover:text-iris-400">
              legal@demoriff.com
            </a>
            . Security questionnaires, penetration test summaries and the SOC 2
            report are on the{" "}
            <Link href="/security" className="text-iris-300 hover:text-iris-400">
              security page
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
