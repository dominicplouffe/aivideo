import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/Shared";
import { Recorder } from "@/components/app/Recorder";

export const metadata: Metadata = { title: "New recording" };

export default function NewRecordingPage() {
  return (
    <>
      <PageHeader
        title="New recording"
        description="Record your screen, import existing footage, or brief the agent to record it for you."
        breadcrumb={[{ label: "Projects", href: "/app/projects" }, { label: "New" }]}
      />
      <Suspense fallback={<div className="px-8 py-10 text-[0.875rem] text-fg-subtle">Loading…</div>}>
        <Recorder />
      </Suspense>
    </>
  );
}
