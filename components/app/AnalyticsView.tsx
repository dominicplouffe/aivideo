"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn, formatNumber, formatDuration } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Panel, StatTile, Sparkline } from "./Shared";
import { projects, retentionCurve, viewsSeries, topAccounts, trafficSources } from "@/lib/app-data";

/** Label and the number of days it covers, so the switcher can mean it. */
const periods = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "12 months", days: 365 },
] as const;

export function AnalyticsView({ curves }: { curves?: Record<string, number[]> }) {
  const published = projects.filter((p) => p.status === "published");
  const [period, setPeriod] = useState<(typeof periods)[number]>(periods[1]);
  const [projectId, setProjectId] = useState(published[0].id);

  const project = published.find((p) => p.id === projectId) ?? published[0];
  // A measured curve when the workspace has views, the seeded one when it
  // does not. An empty dashboard on a new workspace teaches nothing about
  // what the product does.
  const curve = useMemo(
    () => curves?.[project.id] ?? retentionCurve(project.id, 48),
    [curves, project.id],
  );
  // Resampled to the selected period. This was fixed at 30 days while the
  // switcher changed one label — clicking "12 months" relabelled a
  // thirty-day chart and moved nothing.
  const series = useMemo(
    () => viewsSeries(project.id, period.days),
    [project.id, period.days],
  );

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

  // Biggest single-step drop — the sentence that lost them.
  const drop = useMemo(() => {
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
    return { at, pct: worst };
  }, [curve]);

  const dropSeconds = (drop.at / curve.length) * project.durationSec;
  const dropSegment =
    project.segments[Math.min(project.segments.length - 1, Math.floor((drop.at / curve.length) * project.segments.length))];

  return (
    <div className="space-y-4 px-4 py-6 md:px-8">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          aria-label="Project"
          className="h-9 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none sm:max-w-xs"
        >
          {published.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        <div className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--line)] bg-ink-900 p-0.5">
          {periods.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPeriod(p)}
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

      {/* tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/*
          Deltas come from the series or are absent. "Accounts reached 284 /
          +37 / identified via CRM" was four constants describing a CRM
          integration that had not been consulted; the tile now counts the
          accounts actually in the table below.
        */}
        <StatTile
          label="Views"
          value={formatNumber(project.views)}
          delta={delta ?? undefined}
          icon="eye"
          sub={`last ${period.label}`}
        />
        <StatTile
          label="Avg. completion"
          value={`${Math.round(project.completion * 100)}%`}
          icon="play"
        />
        <StatTile
          label="CTA clicks"
          value={formatNumber(project.ctaClicks)}
          icon="target"
          sub={`${((project.ctaClicks / Math.max(1, project.views)) * 100).toFixed(1)}% conversion`}
        />
        <StatTile
          label="Accounts identified"
          value={formatNumber(topAccounts.length)}
          icon="briefcase"
          sub="seen on a personalized link"
        />
      </div>

      {/* retention */}
      <Panel
        title="Retention curve"
        description="Per-second watched, overlaid on the transcript so a cliff is attributable to a sentence"
      >
        <div className="p-5">
          <div className="flex h-40 items-end gap-[3px]">
            {curve.map((v, i) => (
              <span
                key={i}
                title={`${formatDuration((i / curve.length) * project.durationSec)} · ${Math.round(v * 100)}%`}
                className={cn(
                  "flex-1 rounded-t-[2px] transition-colors",
                  i === drop.at ? "bg-rose-500/80" : "bg-iris-500/55 hover:bg-iris-500/80",
                )}
                style={{ height: `${v * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-2xs text-fg-faint">
            <span>0:00</span>
            <span>{formatDuration(project.durationSec / 2)}</span>
            <span>{formatDuration(project.durationSec)}</span>
          </div>

          <div className="mt-5 flex flex-wrap items-start gap-3 rounded-xl border border-[var(--line)] bg-ink-900 p-4">
            <Icon name="sparkles" className="mt-0.5 size-4 shrink-0 text-iris-400" strokeWidth={1.9} />
            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] font-medium text-fg-strong">
                Largest drop: −{Math.round(drop.pct * 100)}% at {formatDuration(dropSeconds)}
              </p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-muted">
                That is the start of <span className="text-fg">“{dropSegment?.title}”</span>. Open
                it in the Studio to read what is said there — the words are the only place this
                can be explained from.
              </p>
            </div>
            <Link
              href={`/app/studio/${project.id}`}
              className="shrink-0 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-2xs font-medium text-fg transition-colors hover:bg-ink-850"
            >
              Open in Studio
            </Link>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        {/* views */}
        <Panel title="Views over time">
          <div className="p-5">
            <p className="text-[1.5rem] leading-none font-semibold tracking-[-0.03em] text-fg-strong tabular-nums">
              {formatNumber(series.reduce((a, b) => a + b, 0))}
            </p>
            {delta ? (
              <p
                className={cn(
                  "mt-1.5 flex items-center gap-1 text-[0.75rem]",
                  delta.startsWith("-") ? "text-rose-300" : "text-mint-400",
                )}
              >
                <Icon name="trending" className="size-3.5" strokeWidth={2} />
                {delta} vs. the {Math.floor(period.days / 2)} days before
              </p>
            ) : null}
            <Sparkline data={series} className="mt-4 h-24" />
            <div className="mt-2 flex justify-between font-mono text-2xs text-fg-faint">
              <span>{period.label} ago</span>
              <span>today</span>
            </div>
          </div>
        </Panel>

        {/* sources */}
        <Panel title="Traffic sources" description="Completion by where the viewer came from">
          <ul className="divide-y divide-[var(--line)]">
            {trafficSources.map((s) => (
              <li key={s.source} className="flex items-center gap-4 px-5 py-3">
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg">{s.source}</span>
                <span className="w-20 text-right font-mono text-[0.75rem] text-fg-muted">
                  {formatNumber(s.views)}
                </span>
                <span className="flex w-24 shrink-0 items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        s.completion > 0.6 ? "bg-mint-500" : s.completion > 0.4 ? "bg-amber-500" : "bg-rose-500",
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
          {/* The footnote quoted 78% and 32% to match the fixture beside
              it. It now reads off the same rows the table does. */}
          <p className="border-t border-[var(--line)] px-5 py-3 text-[0.75rem] leading-relaxed text-fg-subtle">
            {(() => {
              const sorted = [...trafficSources].sort((a, b) => b.completion - a.completion);
              const best = sorted[0];
              const worst = sorted[sorted.length - 1];
              if (!best || !worst || best === worst) {
                return "Completion by source tells you whether a weak number is the video or the traffic.";
              }
              return `A demo that completes at ${Math.round(best.completion * 100)}% from ${best.source} and ${Math.round(worst.completion * 100)}% from ${worst.source} does not have a video problem. It has a traffic problem.`;
            })()}
          </p>
        </Panel>
      </div>

      {/* accounts */}
      <Panel title="Accounts" description="Viewers identified through your CRM or a personalized link">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr>
                {["Account", "Viewers", "Max depth", "Stage"].map((h) => (
                  <th key={h} className="border-b border-[var(--line)] px-5 py-2.5 text-2xs font-medium text-fg-faint">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topAccounts.map((a) => (
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
                  <td className="border-b border-[var(--line)] px-5 py-3">
                    <span className="rounded-md bg-ink-850 px-2 py-0.5 text-2xs text-fg-muted">{a.stage}</span>
                  </td>
                  {/* "View in CRM" had no handler and no CRM to open. */}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* "Alerting is on… Three reps were notified this week" was a
            fabricated event report beside a Configure alerts button with no
            handler. Neither alerting nor its configuration exists yet. */}
      </Panel>
    </div>
  );
}
