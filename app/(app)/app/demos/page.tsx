import type { Metadata } from "next";
import { getProjects } from "@/lib/data";
import Link from "next/link";
import { PageHeader, Panel, StatTile, EmptyState } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { formatNumber, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Interactive demos" };

export default async function DemosPage() {
  // From the data access layer, so the ids on this page are the ids the
  // pages it links to will look up. When the list read fixtures and the
  // detail pages read Postgres — or the other way round — every link on the
  // screen was a 404 waiting for somebody to click it.
  const projects = await getProjects();

  const demos = projects.filter((p) => p.outputs.includes("interactive"));

  return (
    <>
      <PageHeader
        title="Interactive demos"
        description="Click-through tours generated from the DOM captured during your recording. Six times the engagement of a video embed, and indexable by search engines."
        actions={
          <Button href="/app/new" size="sm">
            <Icon name="plus" className="size-4" strokeWidth={2.2} />
            New demo
          </Button>
        }
      />

      <div className="space-y-4 px-4 py-6 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Live demos" value={String(demos.length)} icon="cursor" />
          {/*
            "Tour starts" multiplied real view counts by 0.62, and
            "Completion 58%" and "Leads captured 847" were constants — which
            made all three read as measured, because the first one was
            derived from something real. Nothing measures a tour: the
            renderer does not produce interactive output yet.
          */}
          <StatTile
            label="Chapters"
            value={String(demos.reduce((n, p) => n + p.segments.length, 0))}
            icon="layers"
            sub="across every demo"
          />
        </div>

        {demos.length === 0 ? (
          <Panel>
            <EmptyState
              icon="cursor"
              title="No interactive demos yet"
              description="Record with the browser extension so the DOM is captured, and the tour generates alongside the video."
              action={<Button href="/app/new" size="sm">Record a flow</Button>}
            />
          </Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {demos.map((p) => (
              <Link key={p.id} href={`/app/demos/${p.id}`} className="group block">
                <Panel className="h-full transition-colors group-hover:border-[var(--line-strong)]">
                  <div className="relative aspect-video overflow-hidden border-b border-[var(--line)] bg-[#0B0D14]">
                    <span className="absolute inset-0 grid-bg opacity-30" />
                    <span className="absolute inset-0 bg-[radial-gradient(circle_at_68%_30%,color-mix(in_oklab,var(--color-cyan-500)_32%,transparent),transparent_62%)]" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-xl border border-[var(--line-strong)] bg-ink-850/90 px-3.5 py-2.5 backdrop-blur-sm">
                        <span className="block font-mono text-2xs text-cyan-300">STEP 3</span>
                        <span className="mt-1 block text-[0.75rem] text-fg">
                          Click <span className="font-medium text-fg-strong">New shipment</span>
                        </span>
                      </span>
                    </span>
                    <span className="absolute inset-x-0 bottom-0 flex gap-1 p-3">
                      {Array.from({ length: p.segments.length }).map((_, i) => (
                        <span
                          key={i}
                          className={`h-1 flex-1 rounded-full ${i < 3 ? "bg-cyan-400" : "bg-white/15"}`}
                        />
                      ))}
                    </span>
                  </div>
                  <div className="p-5">
                    <h2 className="text-[0.9375rem] font-medium text-fg-strong">{p.title}</h2>
                    <p className="mt-1.5 text-[0.8125rem] text-fg-subtle">
                      {p.segments.length} steps · {p.segments.length > 5 ? "2 branches" : "linear"} ·{" "}
                      {relativeTime(p.updatedAt)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {[
                        { l: `${p.segments.length} steps`, i: "layers" as const },
                        { l: "Embedded ×3", i: "code" as const },
                      ].map((s) => (
                        <span
                          key={s.l}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-850 px-2 py-1 text-2xs text-fg-muted"
                        >
                          <Icon name={s.i} className="size-3" strokeWidth={2} />
                          {s.l}
                        </span>
                      ))}
                    </div>
                  </div>
                </Panel>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
