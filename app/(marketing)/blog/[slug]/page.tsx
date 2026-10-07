import type { Metadata } from "next";
import { articleStructuredData, jsonLd, pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { posts, getPost } from "@/lib/blog-content";
import { Prose } from "@/components/marketing/Prose";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Section, Card, Badge } from "@/components/ui/Primitives";
import { slugify } from "@/lib/utils";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = getPost(slug);
  if (!p) return {};
  return pageMetadata({
    title: p.title,
    description: p.dek,
    path: `/blog/${p.slug}`,
    openGraph: { type: "article", publishedTime: p.date, authors: [p.author.name] },
  });
}

const fmt = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const headings = post.body.filter((b) => b.t === "h2") as { t: "h2"; text: string }[];
  const more = posts.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(articleStructuredData(post))} />
      <article>
        <header className="relative overflow-hidden pt-14 pb-10 md:pt-20">
          <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg mask-fade-b opacity-30" />
          <div className="container-page relative">
            <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 text-2xs text-fg-faint">
              <Link href="/" className="transition-colors hover:text-fg-muted">Home</Link>
              <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
              <Link href="/blog" className="transition-colors hover:text-fg-muted">The Riff</Link>
            </nav>

            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge tone="iris">{post.category}</Badge>
                <span className="text-2xs text-fg-faint">{fmt(post.date)}</span>
                <span className="text-2xs text-fg-faint">· {post.readMinutes} min read</span>
              </div>
              <h1 className="mt-5 text-[2rem] leading-[1.1] tracking-[-0.035em] md:text-[2.75rem]">
                {post.title}
              </h1>
              <p className="mt-5 text-[1.0625rem] leading-relaxed text-fg-muted">{post.dek}</p>
              <div className="mt-7 flex items-center gap-3 border-t border-[var(--line)] pt-6">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-iris-600),var(--color-cyan-500))] text-[0.8125rem] font-semibold text-white">
                  {post.author.name.split(" ").map((p) => p[0]).join("")}
                </span>
                <span>
                  <span className="block text-[0.875rem] font-medium text-fg-strong">{post.author.name}</span>
                  <span className="block text-[0.75rem] text-fg-subtle">{post.author.role}, DemoRiff</span>
                </span>
              </div>
            </div>
          </div>
        </header>

        <Section className="py-8 md:py-12">
          <div className="container-page">
            <div className="grid gap-12 lg:grid-cols-[1fr_15rem] lg:gap-16">
              <Prose blocks={post.body} />

              <aside className="lg:sticky lg:top-24 lg:self-start">
                {headings.length ? (
                  <nav aria-label="On this page">
                    <p className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                      On this page
                    </p>
                    <ul className="mt-4 flex flex-col gap-2.5 border-l border-[var(--line)] pl-4">
                      {headings.map((h) => (
                        <li key={h.text}>
                          <a
                            href={`#${slugify(h.text)}`}
                            className="text-[0.8125rem] leading-snug text-fg-subtle transition-colors hover:text-fg"
                          >
                            {h.text}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ) : null}

                <Card className="mt-8 p-5">
                  <p className="text-[0.875rem] font-medium text-fg-strong">Try the thing this is about</p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-subtle">
                    Ten free video minutes, every AI feature unlocked, no card.
                  </p>
                  <Button href="/signup" size="sm" className="mt-4 w-full">Start free</Button>
                </Card>
              </aside>
            </div>
          </div>
        </Section>
      </article>

      <Section tone="raised" className="py-16 md:py-20">
        <div className="container-page">
          <h2 className="mb-8 text-[1.25rem]">Keep reading</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {more.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="group block h-full">
                <Card interactive className="flex h-full flex-col gap-3 p-5">
                  <Badge tone="neutral">{p.category}</Badge>
                  <h3 className="text-[0.9375rem] leading-snug">{p.title}</h3>
                  <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-fg-subtle">{p.dek}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-[0.8125rem] font-medium text-iris-300">
                    Read
                    <Icon name="arrowRight" className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
