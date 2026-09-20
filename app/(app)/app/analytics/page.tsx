import type { Metadata } from "next";
import { getRetentionCurve } from "@/lib/data";
import { projects } from "@/lib/app-data";
import { PageHeader } from "@/components/app/Shared";
import { AnalyticsView } from "@/components/app/AnalyticsView";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  // Measured curves where there are any, fixtures otherwise. Fetched here
  // rather than in the view because reading the database is a server's job
  // and the view is a client component — the alternative is an endpoint
  // that exists only to move this one array across the boundary.
  const published = projects.filter((p) => p.status === "published");
  const curves = Object.fromEntries(
    await Promise.all(
      published.map(async (project) => [project.id, await getRetentionCurve(project.id, 48)] as const),
    ),
  );

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Per-second retention against the transcript, so a drop-off points at a sentence rather than a timestamp. Account identity syncs to your CRM."
        actions={
          <>
            <Button variant="outline" size="sm">
              <Icon name="download" className="size-4" strokeWidth={1.8} />
              Export CSV
            </Button>
            <Button variant="outline" size="sm">
              <Icon name="settings" className="size-4" strokeWidth={1.8} />
              Alerts
            </Button>
          </>
        }
      />
      <AnalyticsView curves={curves} />
    </>
  );
}
