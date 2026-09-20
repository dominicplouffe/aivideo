import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { legalDocs, getLegalDoc } from "@/lib/legal-content";
import { Prose } from "@/components/marketing/Prose";
import { Icon } from "@/components/ui/Icon";
import { Section, Card } from "@/components/ui/Primitives";
import { cn, slugify } from "@/lib/utils";

export function generateStaticParams() {
  return legalDocs.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const d = getLegalDoc(slug);
  if (!d) return {};
  return { title: d.title, description: d.summary, alternates: { canonical: `/legal/${slug}` } };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getLegalDoc(slug);
  if (!doc) notFound();

  const headings = doc.body.filter((b) => b.t === "h2") as { t: "h2"; text: string }[];

  return (
    <Section className="py-10 md:py-14">
      <div className="container-page">
        <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-2xs text-fg-faint">
          <Link href="/" className="transition-colors hover:text-fg-muted">Home</Link>
          <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
          <span className="text-fg-muted">Legal</span>
        </nav>

        <div className="grid gap-12 lg:grid-cols-[1fr_15rem] lg:gap-16">
          <article className="min-w-0">
            <h1 className="text-[1.875rem] leading-[1.12] tracking-[-0.03em] md:text-[2.25rem]">{doc.title}</h1>
            <p className="mt-3 max-w-2xl text-[1rem] leading-relaxed text-fg-muted">{doc.summary}</p>
            <p className="mt-3 font-mono text-2xs text-fg-faint">
              Last updated{" "}
              {new Date(doc.updated).toLocaleDateString("en-US", {
                month: "long", day: "numeric", year: "numeric",
              })}
            </p>
            <div className="mt-10 border-t border-[var(--line)] pt-10">
              <Prose blocks={doc.body} />
            </div>
          </article>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">Legal documents</p>
            <ul className="mt-3 flex flex-col gap-0.5 border-l border-[var(--line)]">
              {legalDocs.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/legal/${d.slug}`}
                    className={cn(
                      "-ml-px block border-l-2 py-1.5 pl-4 text-[0.8125rem] transition-colors",
                      d.slug === doc.slug
                        ? "border-iris-500 text-fg-strong"
                        : "border-transparent text-fg-subtle hover:border-[var(--line-strong)] hover:text-fg",
                    )}
                  >
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>

            {headings.length ? (
              <>
                <p className="mt-8 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                  On this page
                </p>
                <ul className="mt-3 flex flex-col gap-2 border-l border-[var(--line)] pl-4">
                  {headings.map((h) => (
                    <li key={h.text}>
                      <a
                        href={`#${slugify(h.text)}`}
                        className="text-[0.75rem] leading-snug text-fg-subtle transition-colors hover:text-fg"
                      >
                        {h.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <Card className="mt-8 p-5">
              <p className="text-[0.875rem] font-medium text-fg-strong">Need something signed?</p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-subtle">
                MSAs, BAAs, custom DPAs and security questionnaires — legal@demoriff.com.
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </Section>
  );
}
