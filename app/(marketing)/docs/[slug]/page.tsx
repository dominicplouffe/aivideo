import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { allDocPages, getDocPage } from "@/lib/docs-content";
import { Prose } from "@/components/marketing/Prose";
import { Badge } from "@/components/ui/Primitives";

export function generateStaticParams() {
  return allDocPages.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = getDocPage(slug);
  if (!found) return {};
  return pageMetadata({
    title: found.page.title,
    description: found.page.summary,
    path: `/docs/${slug}`,
  });
}

export default async function DocDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = getDocPage(slug);
  if (!found) notFound();

  return (
    <article>
      <Badge tone="neutral">{found.section.title}</Badge>
      <h1 className="mt-4 text-[1.875rem] leading-[1.12] tracking-[-0.03em] md:text-[2.25rem]">
        {found.page.title}
      </h1>
      <p className="mt-3 max-w-2xl text-[1rem] leading-relaxed text-fg-muted">{found.page.summary}</p>
      <div className="mt-10 border-t border-[var(--line)] pt-10">
        <Prose blocks={found.page.body} />
      </div>
    </article>
  );
}
