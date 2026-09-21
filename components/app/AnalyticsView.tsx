"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn, formatNumber, formatDuration } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Panel, StatTile, Sparkline, EmptyState } from "./Shared";
import { periods } from "@/lib/analytics/periods";

/**
 * The analytics screen.
 *
 * Every number here arrives as a prop, counted from `analytics_sessions` by
 * the page above. It used to import five fixtures directly — `projects`,
 * `retentionCurve`, `viewsSeries`, `topAccounts` and `trafficSources` —
 * which is why a workspace that had published nothing reported 8.4k views, a
 * 71% completion rate, a retention curve with an annotated cliff, and 3,182
 * views from a "Pricing page embed" that did not exist. Two of those were
 * PRNGs seeded with the project id; two were literal arrays.
 *
 * The component no longer has a source of data of its own, which is the
 * property that keeps it honest: there is nothing here to fall back to.
 */

export interface AnalyticsProject {
  id: string;
  title: string;
  durationSec: number;
  views: number;
  completion: number;
  ctaClicks: number;
  segments: { title: string }[];
}

export interface AnalyticsData {
  views: number;
  completionRate: number;
  ctaClicks: number;
  ctaRate: number;
  accountsIdentified: number;
  viewsByDay: { day: string; views: number }[];
  byOrigin: { origin: string; views: number; completion: number }[];
}

export interface AnalyticsAccount {
  domain: string;
  viewers: number;
  maxDepth: number;
  lastSeenAt: string | null;
}

export function AnalyticsView({
  projects,
  workspace,
  accounts,
  curve,
  selectedId,
  days,
}: {
  /** Published projects in this workspace. Empty is a normal state. */
  projects: AnalyticsProject[];
  workspace: AnalyticsData;
  accounts: AnalyticsAccount[];
  /** Per-second retention for the selected project, or empty if unwatched. */
  curve: number[];
  selectedId: string | null;
  days: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const period = periods.find((p) => p.days === days) ?? periods[1];
  const project = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null;

  /**
   * The window is a URL parameter, so changing it re-reads from the server.
   *
   * It used to be local state feeding a fixture generator that ignored it:
   * clicking "12 months" relabelled a thirty-day chart and moved nothing on
   * screen.
   */
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(search.toString());
    next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const series = workspace.viewsByDay.map((d) => d.views);

  /**
   * Change against the preceding window of the same length.
   *
   * Computed, not written down. The four deltas on this page were string
   * literals — "+18.4%", "+3.1pt", "+24.9%", "+37" — which never moved when
   * the period, the project or the data did.
   */
  const delta = useMemo(() => {
    const half = Math.floor(series.length / 2);
    if (half < 2) return null;
    const previous = series.slice(0, half).reduce((a, b) => a + b, 0);
    const current = series.slice(half).reduce((a, b) => a + b, 0);
    if (previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
  }, [series]);

  // Biggest single-step drop — the sentence that lost them. Only meaningful
  // with a measured curve; with none there is no cliff to point at.
  const drop = useMemo(() => {
    if (curve.length < 2) return null;
    let worst = 0;
    let at = 0;
    curve.forEach((v, i) => {
      if (i === 0) return;
      const d = curve[i - 1] - v;
      if (d > worst) {
        worst = d;
        at = i;
      }
    });
    return worst > 0 ? { at, pct: worst } : null;
  }, [curve]);

  if (projects.length === 0) {
    return (
      <div className="px-4 py-6 md:px-8">
        <Panel title="Analytics">
          <EmptyState
            icon="chart"
            title="Nothing published yet"
            description="Analytics start the moment somebody opens a published demo. Publish a project and its views, retention and traffic sources appear here."
            action={
              <Link
                href="/app/projects"
                className="rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-2xs font-medium text-fg transition-colors hover:bg-ink-850"
              >
                Go to projects
              </Link>
            }
          />
        </Panel>
      </div>
    );
  }

  const dropSeconds = project && drop ? (drop.at / curve.length) * project.durationSec : 0;
  const dropSegment =
    project && drop && project.segments.length > 0
      ? project.segments[
          Math.min(
            project.segments.length - 1,
            Math.floor((drop.at / curve.length) * project.segments.length),
          )
        ]
      : null;

  return (
    <div className="space-y-4 px-4 py-6 md:px-8">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={project?.id ?? ""}
          onChange={(e) => setParam("project", e.target.value)}
          aria-label="Project"
          className="h-9 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none sm:max-w-xs"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        <div className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--line)] bg-ink-900 p-0.5">
          {periods.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setParam("days", String(p.days))}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-2xs font-medium transition-colors",
                period.label === p.label ? "bg-ink-750 text-fg" : "text-fg-subtle hover:text-fg",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* tiles — workspace-wide, over the selected window */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Views"
          value={formatNumber(workspace.views)}
          delta={delta ?? undefined}
          icon="eye"
          sub={`last ${period.label}`}
        />
        <StatTile
          label="Avg. completion"
          value={`${Math.round(workspace.completionRate * 100)}%`}
          icon="play"
          sub="reached the end"
        />
        <StatTile
          label="CTA clicks"
          value={formatNumber(workspace.ctaClicks)}
          icon="target"
          sub={`${(workspace.ctaRate * 100).toFixed(1)}% conversion`}
        />
        <StatTile
          label="Accounts identified"
          value={formatNumber(workspace.accountsIdentified)}
          icon="briefcase"
          sub="gave an address or used a personalized link"
        />
      </div>

      {/* retention */}
      <Panel
        title="Retention curve"
        description="Per-second watched, overlaid on the transcript so a cliff is attributable to a sentence"
      >
        {curve.length === 0 ? (
          <EmptyState
            icon="chart"
            title="No views of this project yet"
            description="The curve is drawn from how long each viewer actually watched. There is nothing to draw until somebody opens it."
          />
        ) : (
          <div className="p-5">
            <div className="flex h-40 items-end gap-[3px]">
              {curve.map((v, i) => (
                <span
                  key={i}
                  title={`${formatDuration((i / curve.length) * (project?.durationSec ?? 0))} · ${Math.round(v * 100)}%`}
                  className={cn(
                    "flex-1 rounded-t-[2px] transition-colors",
                    drop && i === drop.at ? "bg-rose-500/80" : "bg-iris-500/55 hover:bg-iris-500/80",
                  )}
                  style={{ height: `${v * 100}%` }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between font-mono text-2xs text-fg-faint">
              <span>0:00</span>
              <span>{formatDuration((project?.durationSec ?? 0) / 2)}</span>
              <span>{formatDuration(project?.durationSec ?? 0)}</span>
            </div>

            {drop && project ? (
              <div className="mt-5 flex flex-wrap items-start gap-3 rounded-xl border border-[var(--line)] bg-ink-900 p-4">
                <Icon name="sparkles" className="mt-0.5 size-4 shrink-0 text-iris-400" strokeWidth={1.9} />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.875rem] font-medium text-fg-strong">
                    Largest drop: −{Math.round(drop.pct * 100)}% at {formatDuration(dropSeconds)}
                  </p>
                  {dropSegment ? (
                    <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-muted">
                      That is the start of <span className="text-fg">“{dropSegment.title}”</span>.
                      Open it in the Studio to read what is said there — the words are the only
                      place this can be explained from.
                    </p>
                  ) : null}
                </div>
                <Link
                  href={`/app/studio/${project.id}`}
                  className="shrink-0 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-2xs font-medium text-fg transition-colors hover:bg-ink-850"
                >
                  Open in Studio
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        {/* views */}
        <Panel title="Views over time">
          <div className="p-5">
            <p className="text-[1.5rem] leading-none font-semibold tracking-[-0.03em] text-fg-strong tabular-nums">
              {formatNumber(workspace.views)}
            </p>
            {delta ? (
              <p
                className={cn(
                  "mt-1.5 flex items-center gap-1 text-[0.75rem]",
                  delta.startsWith("-") ? "text-rose-300" : "text-mint-400",
                )}
              >
                <Icon name="trending" className="size-3.5" strokeWidth={2} />
                {delta} vs. the {Math.floor(series.length / 2)} days before
              </p>
            ) : null}
            {series.length > 1 ? (
              <>
                <Sparkline data={series} className="mt-4 h-24" />
                <div className="mt-2 flex justify-between font-mono text-2xs text-fg-faint">
                  <span>{period.label} ago</span>
                  <span>today</span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-fg-subtle">
                {workspace.views === 0
                  ? "No views in this window."
                  : "A chart needs more than one day of views."}
              </p>
            )}
          </div>
        </Panel>

        {/* sources */}
        <Panel title="Traffic sources" description="Completion by where the viewer came from">
          {workspace.byOrigin.length === 0 ? (
            <p className="px-5 py-8 text-center text-[0.8125rem] leading-relaxed text-fg-subtle">
              No views in this window, so there is nowhere they came from.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-[var(--line)]">
                {workspace.byOrigin.map((s) => (
                  <li key={s.origin} className="flex items-center gap-4 px-5 py-3">
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg">{s.origin}</span>
                    <span className="w-20 text-right font-mono text-[0.75rem] text-fg-muted">
                      {formatNumber(s.views)}
                    </span>
                    <span className="flex w-24 shrink-0 items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            s.completion > 0.6
                              ? "bg-mint-500"
                              : s.completion > 0.4
                                ? "bg-amber-500"
                                : "bg-rose-500",
                          )}
                          style={{ width: `${s.completion * 100}%` }}
                        />
                      </span>
                      <span className="font-mono text-2xs text-fg-faint">
                        {Math.round(s.completion * 100)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-[var(--line)] px-5 py-3 text-[0.75rem] leading-relaxed text-fg-subtle">
                {(() => {
                  const sorted = [...workspace.byOrigin].sort((a, b) => b.completion - a.completion);
                  const best = sorted[0];
                  const worst = sorted[sorted.length - 1];
                  if (!best || !worst || best === worst) {
                    return "Completion by source tells you whether a weak number is the video or the traffic.";
                  }
                  return `A demo that completes at ${Math.round(best.completion * 100)}% from ${best.origin} and ${Math.round(worst.completion * 100)}% from ${worst.origin} does not have a video problem. It has a traffic problem.`;
                })()}
              </p>
            </>
          )}
        </Panel>
      </div>

      {/* accounts */}
      <Panel
        title="Accounts"
        description="Viewers who gave an address at a gate or arrived on a personalized link"
      >
        {accounts.length === 0 ? (
          <p className="px-5 py-8 text-center text-[0.8125rem] leading-relaxed text-fg-subtle">
            Nobody has identified themselves yet. Identity here is given, never inferred — an
            address typed into a gate, or a link a salesperson sent.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead>
                <tr>
                  {["Account", "Viewers", "Max depth"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-[var(--line)] px-5 py-2.5 text-2xs font-medium text-fg-faint"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.domain}>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      <span className="text-[0.875rem] text-fg-strong">{a.domain}</span>
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      <span className="font-mono text-[0.8125rem] text-fg-muted">{a.viewers}</span>
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-800">
                          <span
                            className="block h-full rounded-full bg-iris-500"
                            style={{ width: `${a.maxDepth * 100}%` }}
                          />
                        </span>
                        <span className="font-mono text-2xs text-fg-faint">
                          {Math.round(a.maxDepth * 100)}%
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
