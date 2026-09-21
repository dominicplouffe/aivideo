import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Panel, StatTile, EmptyState } from "@/components/app/Shared";
import { Icon } from "@/components/ui/Icon";
import { getProjects, getLocales } from "@/lib/data";
import { LOCALES, localeLabel, SOURCE_LOCALE } from "@/lib/locales";
import { providerReport } from "@/lib/providers";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Localization" };

const statusStyle: Record<string, string> = {
  published: "bg-mint-500/15 text-mint-400 border-mint-500/30",
  rendering: "bg-iris-500/15 text-iris-300 border-iris-500/30",
  stale: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  queued: "bg-white/6 text-fg-subtle border-[var(--line)]",
  none: "bg-transparent text-fg-faint border-[var(--line)]",
};

/**
 * Localization, from the `locales` table.
 *
 * This page rendered the `localeMatrix` fixture — twelve languages with
 * statuses attached, the same twelve on every workspace. German was
 * published and reviewed by Jonas Weber, Japanese was 68% rendered, French
 * had gone stale, and the coverage matrix crossed those invented statuses
 * with real project rows, so a cell could report a language as published for
 * a project that had never been translated. "Languages published" counted
 * the fixture; "Stale translations" counted it too. Two header buttons,
 * "Refresh stale" and "Add languages", had no handlers.
 *
 * The table behind all of it had never had a row written to it. It does now:
 * `POST /api/projects/[id]/locales` queues a language, and what is shown
 * here is what that table holds.
 */
export default async function LocalizationPage() {
  const [projects, locales] = await Promise.all([getProjects(), getLocales()]);

  const translation = providerReport().find((c) => c.capability === "translation");

  const published = locales.filter((l) => l.status === "published").length;
  const stale = locales.filter((l) => l.status === "stale").length;
  const inProgress = locales.filter((l) => l.status === "queued" || l.status === "rendering").length;
  const languages = new Set(locales.map((l) => l.code)).size;

  // Only projects that actually have a language configured. The old version
  // filtered on `p.locales.length > 0` and then crossed each row with the
  // fixture's statuses regardless.
  const byProject = new Map<string, typeof locales>();
  for (const row of locales) {
    byProject.set(row.projectId, [...(byProject.get(row.projectId) ?? []), row]);
  }
  const localized = projects.filter((p) => byProject.has(p.id));

  // The columns are the languages this workspace uses, not all thirty-four.
  const columns = [...new Set(locales.map((l) => l.code))].sort();

  return (
    <>
      <PageHeader
        title="Localization"
        description="A full re-voice with matched lip movement, not a subtitle track. Localized versions never consume additional video minutes."
      />

      <div className="space-y-4 px-4 py-6 md:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Languages published"
            value={String(published)}
            icon="globe"
            sub={`of ${LOCALES.length - 1} available`}
          />
          <StatTile label="Languages configured" value={String(languages)} icon="layers" />
          <StatTile
            label="In progress"
            value={String(inProgress)}
            icon="refresh"
            sub="queued or rendering"
          />
          <StatTile
            label="Stale translations"
            value={String(stale)}
            deltaTone={stale > 0 ? "down" : "flat"}
            delta={stale > 0 ? "needs review" : undefined}
            icon="alert"
          />
        </div>

        {!translation?.live ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/28 bg-amber-500/[0.06] p-4">
            <Icon name="alert" className="size-4 shrink-0 text-amber-400" strokeWidth={1.9} />
            <p className="min-w-0 flex-1 text-[0.8125rem] leading-relaxed text-fg-muted">
              Translation is running on the deterministic mock. Set{" "}
              <code className="font-mono text-fg">
                {translation?.missing.join(" and ") || "a translation provider"}
              </code>{" "}
              to translate for real — until then a queued language will not produce usable text.
            </p>
          </div>
        ) : null}

        {locales.length === 0 ? (
          <Panel title="Languages">
            <EmptyState
              icon="globe"
              title="Nothing is localized yet"
              description={
                projects.length === 0
                  ? "Record or import a video first. Languages are added to a project, and translations never consume additional video minutes."
                  : "Open a project and add a language to it. Translations never consume additional video minutes."
              }
              action={
                projects.length > 0 ? (
                  <Link
                    href="/app/projects"
                    className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-2xs font-medium text-fg transition-colors hover:bg-ink-850"
                  >
                    Go to projects
                  </Link>
                ) : (
                  <Link
                    href="/app/new"
                    className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-2xs font-medium text-fg transition-colors hover:bg-ink-850"
                  >
                    New recording
                  </Link>
                )
              }
            />
          </Panel>
        ) : (
          <>
            <Panel
              title="Coverage matrix"
              description="Every localized project against the languages this workspace uses"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-left">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 w-64 border-b border-[var(--line)] bg-ink-950 px-5 py-3 text-2xs font-medium text-fg-faint">
                        PROJECT
                      </th>
                      {columns.map((code) => (
                        <th
                          key={code}
                          className="border-b border-[var(--line)] px-2 py-3 text-center"
                        >
                          <span className="block font-mono text-2xs text-fg-muted">{code}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {localized.map((p) => {
                      const rows = byProject.get(p.id) ?? [];
                      return (
                        <tr key={p.id}>
                          <td className="sticky left-0 z-10 border-b border-[var(--line)] bg-ink-950 px-5 py-3">
                            <Link
                              href={`/app/studio/${p.id}`}
                              className="block truncate text-[0.8125rem] text-fg transition-colors hover:text-iris-300"
                            >
                              {p.title}
                            </Link>
                            <span className="block text-2xs text-fg-faint">
                              {rows.length} {rows.length === 1 ? "language" : "languages"}
                            </span>
                          </td>
                          {columns.map((code) => {
                            // The cell's state is that language's own row for
                            // that project, or "none". It used to be the
                            // fixture's global status for the language.
                            const state = rows.find((r) => r.code === code)?.status ?? "none";
                            return (
                              <td
                                key={code}
                                className="border-b border-[var(--line)] px-2 py-3 text-center"
                              >
                                <span
                                  className={cn(
                                    "inline-flex size-6 items-center justify-center rounded-md border",
                                    statusStyle[state],
                                  )}
                                  title={`${localeLabel(code)}: ${state}`}
                                >
                                  {state === "published" ? (
                                    <Icon name="check" className="size-3" strokeWidth={3} />
                                  ) : state === "stale" ? (
                                    <Icon name="alert" className="size-3" strokeWidth={2.4} />
                                  ) : state === "rendering" ? (
                                    <span className="size-1.5 animate-pulse rounded-full bg-current" />
                                  ) : state === "queued" ? (
                                    <Icon name="clock" className="size-3" strokeWidth={2.2} />
                                  ) : (
                                    <span className="text-2xs">–</span>
                                  )}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t border-[var(--line)] px-5 py-3">
                {[
                  { l: "Published", c: "bg-mint-500/15 border-mint-500/30" },
                  { l: "Rendering", c: "bg-iris-500/15 border-iris-500/30" },
                  { l: "Queued", c: "bg-white/6 border-[var(--line)]" },
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

            <Panel title="Languages" description="Every language configured in this workspace">
              <ul className="divide-y divide-[var(--line)]">
                {locales.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                    <span className="w-14 shrink-0 font-mono text-2xs text-fg-faint">{l.code}</span>
                    <span className="min-w-0 flex-1 text-[0.875rem] text-fg">
                      {localeLabel(l.code)}
                      <span className="ml-2 text-2xs text-fg-faint">{l.projectTitle}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md border px-2 py-0.5 font-mono text-2xs",
                        statusStyle[l.status],
                      )}
                    >
                      {l.status === "rendering" && l.progress !== null
                        ? `${Math.round(l.progress * 100)}%`
                        : l.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}

        <Panel title="How this is billed">
          <p className="px-5 py-4 text-[0.8125rem] leading-relaxed text-fg-subtle">
            Translations are never re-billed. A project localized into eleven languages consumes
            the same video minutes as one in{" "}
            <span className="font-mono text-fg-muted">{SOURCE_LOCALE}</span> alone — charging per
            language per video is why teams localize two markets instead of eleven.
          </p>
        </Panel>
      </div>
    </>
  );
}
