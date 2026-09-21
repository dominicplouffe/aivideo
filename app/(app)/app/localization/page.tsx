import type { Metadata } from "next";
import { getProjects } from "@/lib/data";
import Link from "next/link";
import { PageHeader, Panel, StatTile } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { localeMatrix } from "@/lib/app-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Localization" };

const statusStyle: Record<string, string> = {
  published: "bg-mint-500/15 text-mint-400 border-mint-500/30",
  rendering: "bg-iris-500/15 text-iris-300 border-iris-500/30",
  stale: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  queued: "bg-white/6 text-fg-subtle border-[var(--line)]",
  none: "bg-transparent text-fg-faint border-[var(--line)]",
};

export default async function LocalizationPage() {
  // From the data access layer, so the ids on this page are the ids the
  // pages it links to will look up. When the list read fixtures and the
  // detail pages read Postgres — or the other way round — every link on the
  // screen was a 404 waiting for somebody to click it.
  const projects = await getProjects();

  const localized = projects.filter((p) => p.locales.length > 0);
  const published = localeMatrix.filter((l) => l.status === "published").length;
  const stale = localeMatrix.filter((l) => l.status === "stale").length;

  return (
    <>
      <PageHeader
        title="Localization"
        description="A full re-voice with matched lip movement, not a subtitle track. Localized versions never consume additional video minutes."
        actions={
          <>
            <Button variant="outline" size="sm">
              <Icon name="refresh" className="size-4" strokeWidth={1.8} />
              Refresh stale
            </Button>
            <Button size="sm">
              <Icon name="globe" className="size-4" strokeWidth={1.8} />
              Add languages
            </Button>
          </>
        }
      />

      <div className="space-y-4 px-4 py-6 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Languages published" value={String(published)} icon="globe" sub="of 34 available" />
          {/* `localized.length * 4` presented a multiplication as a count. */}
          <StatTile label="Languages configured" value={String(localized.length)} icon="layers" />
          <StatTile label="Stale translations" value={String(stale)} deltaTone="down" delta="needs review" icon="alert" />
          <StatTile label="Minutes billed" value="0" icon="creditCard" sub="translations are never re-billed" />
        </div>

        {/* matrix */}
        <Panel
          title="Coverage matrix"
          description="Every project against every language, with staleness tracked per cell"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] border-collapse text-left">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-64 border-b border-[var(--line)] bg-ink-950 px-5 py-3 text-2xs font-medium text-fg-faint">
                    PROJECT
                  </th>
                  {localeMatrix.slice(0, 8).map((l) => (
                    <th key={l.code} className="border-b border-[var(--line)] px-2 py-3 text-center">
                      <span className="block font-mono text-2xs text-fg-muted">{l.code}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {localized.map((p) => (
                  <tr key={p.id}>
                    <td className="sticky left-0 z-10 border-b border-[var(--line)] bg-ink-950 px-5 py-3">
                      <Link
                        href={`/app/studio/${p.id}`}
                        className="block truncate text-[0.8125rem] text-fg transition-colors hover:text-iris-300"
                      >
                        {p.title}
                      </Link>
                      <span className="block text-2xs text-fg-faint">{p.locales.length} languages</span>
                    </td>
                    {localeMatrix.slice(0, 8).map((l) => {
                      const has = p.locales.includes(l.code);
                      const state = !has
                        ? "none"
                        : p.status === "stale"
                          ? "stale"
                          : l.status === "rendering"
                            ? "rendering"
                            : "published";
                      return (
                        <td key={l.code} className="border-b border-[var(--line)] px-2 py-3 text-center">
                          <span
                            className={cn(
                              "inline-flex size-6 items-center justify-center rounded-md border",
                              statusStyle[state],
                            )}
                            title={`${l.label}: ${state}`}
                          >
                            {state === "published" ? (
                              <Icon name="check" className="size-3" strokeWidth={3} />
                            ) : state === "stale" ? (
                              <Icon name="alert" className="size-3" strokeWidth={2.4} />
                            ) : state === "rendering" ? (
                              <span className="size-1.5 rounded-full bg-current animate-pulse" />
                            ) : (
                              <span className="text-2xs">–</span>
                            )}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-[var(--line)] px-5 py-3">
            {[
              { l: "Published", c: "bg-mint-500/15 border-mint-500/30" },
              { l: "Rendering", c: "bg-iris-500/15 border-iris-500/30" },
              { l: "Stale", c: "bg-amber-500/15 border-amber-500/30" },
              { l: "Not localized", c: "bg-transparent border-[var(--line)]" },
            ].map((k) => (
              <span key={k.l} className="flex items-center gap-1.5 text-2xs text-fg-subtle">
                <span className={cn("size-3 rounded border", k.c)} />
                {k.l}
              </span>
            ))}
          </div>
        </Panel>

        {/* per-language detail */}
        <Panel title="Languages" description="Reviewers, pinning and staleness">
          <ul className="divide-y divide-[var(--line)]">
            {localeMatrix.map((l) => (
              <li key={l.code} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <span className="w-14 shrink-0 font-mono text-2xs text-fg-faint">{l.code}</span>
                <span className="min-w-0 flex-1 text-[0.875rem] text-fg">{l.label}</span>

                {l.pinned ? (
                  <span
                    title="Manual corrections preserved across regeneration"
                    className="inline-flex shrink-0 items-center gap-1 rounded bg-cyan-500/12 px-1.5 py-0.5 text-2xs text-cyan-300"
                  >
                    <Icon name="lock" className="size-2.5" strokeWidth={2.6} />
                    Pinned
                  </span>
                ) : null}

                <span className="w-36 shrink-0 text-2xs text-fg-subtle">
                  {l.reviewer ? `Reviewed by ${l.reviewer}` : "No reviewer assigned"}
                </span>

                {l.status === "rendering" ? (
                  <span className="flex w-28 shrink-0 items-center gap-2">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink-800">
                      <span
                        className="block h-full rounded-full bg-iris-500"
                        style={{ width: `${(l.progress ?? 0) * 100}%` }}
                      />
                    </span>
                    <span className="font-mono text-2xs text-iris-300">
                      {Math.round((l.progress ?? 0) * 100)}%
                    </span>
                  </span>
                ) : (
                  <span
                    className={cn(
                      "w-28 shrink-0 rounded-md border px-2 py-0.5 text-center font-mono text-2xs capitalize",
                      statusStyle[l.status],
                    )}
                  >
                    {l.status === "none" ? "not enabled" : l.status}
                  </span>
                )}

                <Button
                  variant={l.status === "stale" ? "secondary" : "ghost"}
                  size="xs"
                  className="shrink-0"
                >
                  {l.status === "stale" ? "Regenerate" : l.status === "none" ? "Enable" : "Review"}
                </Button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="How pinning works">
          <div className="grid gap-4 p-5 md:grid-cols-3">
            {[
              { i: "globe" as const, t: "Derived, not duplicated", d: "Every language is generated from the source project, so changing the source marks each one stale rather than silently diverging." },
              { i: "lock" as const, t: "Corrections survive", d: "A reviewer's manual fix pins that segment. Regeneration merges around it instead of overwriting their work." },
              { i: "creditCard" as const, t: "Never re-billed", d: "Translating a video you already rendered costs zero additional video minutes, on every paid plan." },
            ].map((c) => (
              <div key={c.t} className="flex gap-3">
                <Icon name={c.i} className="mt-0.5 size-4 shrink-0 text-iris-400" strokeWidth={1.8} />
                <div>
                  <p className="text-[0.875rem] font-medium text-fg-strong">{c.t}</p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-subtle">{c.d}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
