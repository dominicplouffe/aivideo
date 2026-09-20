import type { Metadata } from "next";
import Link from "next/link";
import { docSections } from "@/lib/docs-content";
import { Icon } from "@/components/ui/Icon";
import { Card, Eyebrow } from "@/components/ui/Primitives";

export const metadata: Metadata = {
  title: "Help center",
  description: "Guides, references and troubleshooting for DemoRiff — recording, the Studio, publishing, billing and the API.",
  alternates: { canonical: "/docs" },
};

export default function DocsIndexPage() {
  return (
    <div>
      <Eyebrow icon="lifebuoy">Help center</Eyebrow>
      <h1 className="mt-5 text-[2rem] leading-[1.1] tracking-[-0.03em] md:text-[2.5rem]">
        Everything, written down
      </h1>
      <p className="mt-4 max-w-2xl text-[1rem] leading-relaxed text-fg-muted">
        Start with the quickstart if you are new. If something is missing here, email
        hello@demoriff.com and we will write it.
      </p>

      <div className="mt-12 flex flex-col gap-10">
        {docSections.map((s) => (
          <section key={s.title}>
            <h2 className="flex items-center gap-2.5 text-[1.0625rem]">
              <Icon name={s.icon} className="size-4 text-iris-400" strokeWidth={1.8} />
              {s.title}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {s.pages.map((p) => (
                <Link key={p.slug} href={`/docs/${p.slug}`} className="group block h-full">
                  <Card interactive className="flex h-full flex-col gap-1.5 p-5">
                    <span className="text-[0.9375rem] font-medium text-fg-strong">{p.title}</span>
                    <span className="text-[0.8125rem] leading-relaxed text-fg-subtle">{p.summary}</span>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <section>
          <h2 className="flex items-center gap-2.5 text-[1.0625rem]">
            <Icon name="code" className="size-4 text-iris-400" strokeWidth={1.8} />
            Developers
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link href="/docs/api" className="group block h-full">
              <Card interactive className="flex h-full flex-col gap-1.5 p-5">
                <span className="text-[0.9375rem] font-medium text-fg-strong">API reference</span>
                <span className="text-[0.8125rem] leading-relaxed text-fg-subtle">
                  REST endpoints, webhooks, rate limits and idempotency.
                </span>
              </Card>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
