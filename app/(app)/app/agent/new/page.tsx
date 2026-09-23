import type { Metadata } from "next";
import { PageHeader } from "@/components/app/Shared";
import { RunEditor } from "@/components/app/agent/RunEditor";
import { viewerMay } from "@/lib/data";

export const metadata: Metadata = { title: "New agent run" };

export default async function NewAgentRunPage() {
  const canManageSignIns = await viewerMay("agent.credentials.manage");
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Riff Agent", href: "/app/agent" }, { label: "New run" }]}
        title="New run"
        description="Say where the agent may go and what to show. Plan the steps, read them, change anything, then send the run for approval. Nothing records before that."
      />
      <div className="max-w-4xl px-4 py-6 md:px-8">
        <RunEditor
          mode="new"
          canManageSignIns={canManageSignIns}
          initial={{ brief: "", allowedOrigins: [], requestOrigins: [], entryUrl: null, outline: [], signIns: {} }}
        />
      </div>
    </>
  );
}
