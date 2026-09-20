import type { Metadata } from "next";
import { PageHeader } from "@/components/app/Shared";
import { AnalyticsView } from "@/components/app/AnalyticsView";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
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
      <AnalyticsView />
    </>
  );
}
