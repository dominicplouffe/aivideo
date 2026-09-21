import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/Shared";
import { Recorder } from "@/components/app/Recorder";
import { getProjects } from "@/lib/data";

export const metadata: Metadata = { title: "New recording" };

export default async function NewRecordingPage() {
  // The collections this workspace already uses, offered as suggestions.
  // The recorder used to read a five-item fixture here.
  const projects = await getProjects();
  const collections = [...new Set(projects.map((p) => p.collection).filter(Boolean))].sort();

  return (
    <>
      <PageHeader
        title="New recording"
        description="Record your screen, import existing footage, or brief the agent to record it for you."
        breadcrumb={[{ label: "Projects", href: "/app/projects" }, { label: "New" }]}
      />
      <Suspense fallback={<div className="px-8 py-10 text-[0.875rem] text-fg-subtle">Loading…</div>}>
        <Recorder collections={collections} />
      </Suspense>
    </>
  );
}
