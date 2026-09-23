/**
 * Which kind of edit a run allows, from where it stands.
 *
 *   edit      waiting for approval: changed in place
 *   retry     stopped before it made anything: fixed and tried again as itself
 *   rerecord  made a project: recorded again as a new run, new project
 *   null      approved or recording: nothing to edit until it finishes
 */
export type EditorMode = "new" | "edit" | "retry" | "rerecord";

export function editModeFor(run: { status: string; projectId?: string | null }): Exclude<EditorMode, "new"> | null {
  if (run.status === "awaiting_approval") return "edit";
  if (run.projectId) return "rerecord";
  if (run.status === "failed" || run.status === "cancelled") return "retry";
  return null;
}

export const EDIT_LABEL: Record<Exclude<EditorMode, "new">, string> = {
  edit: "Edit run",
  retry: "Edit and retry",
  rerecord: "Record again with changes",
};
