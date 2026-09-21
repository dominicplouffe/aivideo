import type { Metadata } from "next";
import { getProjects } from "@/lib/data";
import Link from "next/link";
import { PageHeader, Panel, StatTile } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { relativeTime, formatNumber, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Guides" };

const destinations = ["Zendesk", "Intercom", "Notion", "Confluence", "HelpScout", "Markdown"];

export default async function GuidesPage() {
  // From the data access layer, so the ids on this page are the ids the
  // pages it links to will look up. When the list read fixtures and the
  // detail pages read Postgres — or the other way round — every link on the
  // screen was a 404 waiting for somebody to click it.
  const projects = await getProjects();

  const withGuides = projects.filter((p) => p.outputs.includes("guide"));

  return (
    <>
      <PageHeader
        title="Guides"
        description="Step-by-step articles generated from the same recording as your videos, with annotated screenshots that update when the flow changes. Unmetered on every plan."
        actions={
          /* "Sync destinations" had no handler. */
          <Button href="/app/new" size="sm">
            <Icon name="plus" className="size-4" strokeWidth={2.2} />
            New guide
          </Button>
        }
      />

      <div className="space-y-4 px-4 py-6 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Published guides" value={String(withGuides.length)} icon="doc" sub="unmetered" />
          {/* "Total reads" was views × 0.4; "Screenshots current 94%" and
              "Languages 6 per guide" were constants. Guides are not read
              through this deployment, so nothing counts a read. */}
          <StatTile
            label="Steps"
            value={String(withGuides.reduce((n, p) => n + p.segments.length, 0))}
            icon="layers"
            sub="across every guide"
          />
        </div>

        <Panel title="All guides" action={
          <div className="flex flex-wrap gap-1.5">
            {destinations.slice(0, 4).map((d) => (
              <span key={d} className="rounded-md border border-[var(--line)] px-2 py-0.5 text-2xs text-fg-subtle">
                {d}
              </span>
            ))}
          </div>
        }>
          <ul className="divide-y divide-[var(--line)]">
            {withGuides.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/app/guides/${p.id}`}
                  className="group flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-900"
                >
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink-850 text-iris-400">
                    <Icon name="doc" className="size-4" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.875rem] font-medium text-fg-strong">
                      {p.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[0.75rem] text-fg-subtle">
                      <span>{p.segments.length} steps</span>
                      <span>{p.locales.length || 1} languages</span>
                      <span>{relativeTime(p.updatedAt)}</span>
                    </span>
                  </span>
                  <span className={cn(
                    "shrink-0 rounded-md px-2 py-0.5 font-mono text-2xs",
                    p.status === "stale"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-mint-500/15 text-mint-400",
                  )}>
                    {p.status === "stale" ? "screenshots stale" : "current"}
                  </span>
                  <span className="hidden w-24 shrink-0 text-right font-mono text-[0.75rem] text-fg-muted sm:block">
                    {p.segments.length} steps
                  </span>
                  <Icon
                    name="chevronRight"
                    className="size-4 shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
