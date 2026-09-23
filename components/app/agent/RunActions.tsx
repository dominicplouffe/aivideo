"use client";

import { useState } from "react";
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
 * Revise: the form this run was requested with, filled in, to change any
 * field and plan again. The original stays as the record of what happened;
 * a project it made is left alone.
 */
export function ReviseButton({ runId, hasProject, waiting }: { runId: string; hasProject: boolean; waiting: boolean }) {
  return (
    <Button
      href={`/app/agent/${runId}/revise`}
      size="sm"
      variant={hasProject || waiting ? "outline" : "primary"}
      title={
        waiting
          ? "Change the brief, sites or start page. This run is replaced by the revised one."
          : hasProject
            ? "Change anything and run again. This run and its project stay as they are."
            : "Change anything and run again."
      }
    >
      <Icon name="refresh" className="size-3.5" strokeWidth={2.2} />
      {waiting ? "Revise request" : "Revise and run again"}
    </Button>
  );
}
