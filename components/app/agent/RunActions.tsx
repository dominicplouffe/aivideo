"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { OutlineStep } from "@/lib/agent/run";
import { PlanEditor } from "./PlanEditor";

/** "Edit plan" on a waiting run; the editor replaces the read-only plan while open. */
export function EditablePlan({
  runId,
  outline,
  canEdit,
  startEditing = false,
  children,
}: {
  runId: string;
  outline: OutlineStep[];
  canEdit: boolean;
  /** Open the editor straight away: a revised run arrives here to be changed. */
  startEditing?: boolean;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(canEdit && startEditing);
  return (
    <>
      {editing ? <PlanEditor runId={runId} outline={outline} onDone={() => setEditing(false)} /> : children}
      {canEdit && !editing ? (
        <div className="border-t border-[var(--line)] px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Icon name="wand" className="size-3.5" strokeWidth={2} />
            Edit plan
          </Button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Revise and run again: a copy of this finished run, waiting for approval,
 * opened ready to edit. This run stays as it is, as the record of what
 * happened; a project it made is left alone.
 */
export function ReviseButton({ runId, hasProject }: { runId: string; hasProject: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={hasProject ? "outline" : "primary"}
        disabled={busy}
        title={hasProject ? "Makes a new run, and a new project when it records. This run and its project stay as they are." : "Makes a new run from this one, ready to edit."}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const response = await fetch("/api/agent/runs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ revise_of: runId }),
            });
            const body = (await response.json()) as { run?: { id: string }; error?: string };
            if (!response.ok || !body.run) throw new Error(body.error ?? "The run could not be copied.");
            router.push(`/app/agent/${body.run.id}?edit=1`);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
            setBusy(false);
          }
        }}
      >
        <Icon name="refresh" className="size-3.5" strokeWidth={2.2} />
        {busy ? "Copying…" : "Revise and run again"}
      </Button>
      {error ? <span className="text-2xs text-rose-300">{error}</span> : null}
    </span>
  );
}
