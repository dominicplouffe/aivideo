import type { Metadata } from "next";
import { apiReference } from "@/lib/docs-content";
import { Prose } from "@/components/marketing/Prose";
import { Badge, Card } from "@/components/ui/Primitives";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "API reference",
  description: "The DemoRiff REST API: recordings, projects, renders, locales, analytics and webhooks.",
  alternates: { canonical: "/docs/api" },
};

const methodTone: Record<string, string> = {
  GET: "text-cyan-300 border-cyan-500/35 bg-cyan-500/10",
  POST: "text-mint-400 border-mint-500/35 bg-mint-500/10",
  DELETE: "text-rose-400 border-rose-500/35 bg-rose-500/10",
};

export default function ApiPage() {
  return (
    <article>
      <Badge tone="neutral">Developers</Badge>
      <h1 className="mt-4 text-[1.875rem] leading-[1.12] tracking-[-0.03em] md:text-[2.25rem]">
        API reference
      </h1>
      <p className="mt-3 max-w-2xl text-[1rem] leading-relaxed text-fg-muted">
        Everything the app does, over REST. Available on Scale and Enterprise.
      </p>

      <div className="mt-10 border-t border-[var(--line)] pt-10">
        <Prose blocks={apiReference.intro} />
      </div>

      <h2 className="mt-14 text-[1.375rem] leading-tight md:text-[1.625rem]">Endpoints</h2>
      <div className="mt-6 flex flex-col gap-5">
        {apiReference.endpoints.map((e) => (
          <Card key={e.path + e.method} className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-5 py-3.5">
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 font-mono text-2xs font-medium",
                  methodTone[e.method] ?? "text-fg-muted border-[var(--line)]",
                )}
              >
                {e.method}
              </span>
              <code className="font-mono text-[0.8125rem] text-fg-strong">{e.path}</code>
              <span className="w-full text-[0.8125rem] text-fg-subtle sm:w-auto sm:flex-1">{e.summary}</span>
            </div>
            <div className={cn("grid", e.body ? "md:grid-cols-2" : "")}>
              {e.body ? (
                <div className="border-b border-[var(--line)] md:border-r md:border-b-0">
                  <p className="border-b border-[var(--line)] px-5 py-2 font-mono text-2xs text-fg-faint">
                    REQUEST
                  </p>
                  <pre className="overflow-x-auto p-5 font-mono text-[0.6875rem] leading-relaxed text-fg-muted">
                    {e.body}
                  </pre>
                </div>
              ) : null}
              <div>
                <p className="border-b border-[var(--line)] px-5 py-2 font-mono text-2xs text-fg-faint">
                  RESPONSE
                </p>
                <pre className="overflow-x-auto p-5 font-mono text-[0.6875rem] leading-relaxed text-fg-muted">
                  {e.response}
                </pre>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="mt-14 text-[1.375rem] leading-tight md:text-[1.625rem]">Webhooks</h2>
      <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">
        Delivered with an HMAC-SHA256 signature in the DemoRiff-Signature header. Retried with
        exponential backoff for 24 hours.
      </p>
      <div className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {apiReference.webhooks.map((w) => (
          <div key={w.event} className="grid gap-1 py-3 sm:grid-cols-[16rem_1fr] sm:gap-6">
            <code className="font-mono text-[0.8125rem] text-iris-300">{w.event}</code>
            <span className="text-[0.8125rem] text-fg-subtle">{w.when}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
