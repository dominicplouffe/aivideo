import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/app/Shared";
import { RunRequestForm } from "@/components/app/agent/RunRequestForm";
import { getAgentRunDetail } from "@/lib/data";

export const metadata: Metadata = { title: "Revise run" };

/**
 * Revising a run: the form it was requested with, filled in as it was, to
 * change anything — the sites, the brief, the start page — and plan again.
 */
export default async function ReviseRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getAgentRunDetail(id);
  if (!detail) notFound();
  const { run } = detail;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Riff Agent", href: "/app/agent" }, { label: "Run", href: `/app/agent/${run.id}` }, { label: "Revise" }]}
        title="Revise run"
        description="Everything this run was requested with. Change any of it; the revised run is planned and waits for approval like any other."
      />
      <div className="max-w-2xl px-4 py-6 md:px-8">
        <Panel title="Request">
          <div className="px-5 py-5">
            <RunRequestForm
              revise={{
                id: run.id,
                brief: run.brief,
                allowedOrigins: run.allowedOrigins,
                entryUrl: run.entryUrl ?? run.outline.find((step) => step.url)?.url ?? null,
                status: run.status,
                steps: run.outline.length,
                hasProject: Boolean(run.projectId),
              }}
            />
          </div>
        </Panel>
      </div>
    </>
  );
}
