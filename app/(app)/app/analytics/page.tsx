import type { Metadata } from "next";
import {
  getRetentionCurve,
  getProjects,
  getWorkspaceAnalytics,
  getIdentifiedAccounts,
} from "@/lib/data";
import { PageHeader } from "@/components/app/Shared";
import { AnalyticsView } from "@/components/app/AnalyticsView";
import { windowDays } from "@/lib/analytics/periods";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; days?: string }>;
}) {
  const params = await searchParams;
  const days = windowDays(params.days);

  // From the data access layer, so the ids here are the ids the pages this
  // links to will look up.
  const projects = await getProjects();
  const published = projects.filter((p) => p.status === "published");

  // The selected project has to be one of this workspace's published ones.
  // Taking the parameter on trust would let `?project=<any uuid>` choose
  // what the retention query below is run against.
  const selected =
    published.find((p) => p.id === params.project) ?? published[0] ?? null;

  // One curve, for the project actually on screen. This used to fetch a
  // curve for every published project on every render, which is N queries to
  // draw one chart.
  const [workspace, accounts, curve] = await Promise.all([
    getWorkspaceAnalytics(days),
    getIdentifiedAccounts(days),
    selected ? getRetentionCurve(selected.id, 48) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Per-second retention against the transcript, so a drop-off points at a sentence rather than a timestamp."
      />
      {/* "Export CSV" and "Alerts" were two header buttons with no handlers
          and nothing behind them. */}
      <AnalyticsView
        projects={published.map((p) => ({
          id: p.id,
          title: p.title,
          durationSec: p.durationSec,
          views: p.views,
          completion: p.completion,
          ctaClicks: p.ctaClicks,
          segments: p.segments.map((s) => ({ title: s.title })),
        }))}
        workspace={workspace}
        accounts={accounts}
        curve={curve}
        selectedId={selected?.id ?? null}
        days={days}
      />
    </>
  );
}
