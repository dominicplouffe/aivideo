import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app/Shared";
import { RunEditor } from "@/components/app/agent/RunEditor";
import { editModeFor, type EditorMode } from "@/lib/agent/edit-mode";
import { getAgentRunDetail, viewerMay } from "@/lib/data";

export const metadata: Metadata = { title: "Edit agent run" };

const TITLE: Record<EditorMode, string> = {
  new: "New run",
  edit: "Edit run",
  retry: "Edit and retry",
  rerecord: "Record again with changes",
};

export default async function EditAgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, canManageSignIns] = await Promise.all([getAgentRunDetail(id), viewerMay("agent.credentials.manage")]);
  if (!detail) notFound();
  const { run } = detail;
  const mode = editModeFor(run);
  // Approved or recording: nothing to edit until it finishes.
  if (!mode) redirect(`/app/agent/${run.id}`);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Riff Agent", href: "/app/agent" }, { label: "Run", href: `/app/agent/${run.id}` }, { label: TITLE[mode] }]}
        title={TITLE[mode]}
        description="Everything about this run, all of it editable."
      />
      <div className="max-w-4xl px-4 py-6 md:px-8">
        <RunEditor
          mode={mode}
          canManageSignIns={canManageSignIns}
          hasProject={Boolean(run.projectId)}
          initial={{
            runId: run.id,
            brief: run.brief,
            allowedOrigins: run.allowedOrigins,
            entryUrl: run.entryUrl ?? run.outline.find((step) => step.url)?.url ?? null,
            outline: run.outline,
            signIns: run.signIns ?? {},
            attempt: run.attempt ?? 1,
            error: run.error,
          }}
        />
      </div>
    </>
  );
}
