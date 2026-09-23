"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The project's name, edited where it is shown.
 *
 * Click it (or its pencil) to edit; Enter or clicking away saves, Escape
 * puts it back. Saved on its own, not with the edit's autosave, so a rename
 * is never held up by, or mixed into, a change to the cut.
 */
export function ProjectTitle({ projectId, title, onRenamed }: { projectId: string; title: string; onRenamed: (title: string) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const save = async () => {
    const next = draft.replace(/\s+/g, " ").trim();
    if (!next || next === title) {
      setDraft(title);
      setEditing(false);
      setError(null);
      return;
    }
    setState("saving");
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The name was not saved.");
      onRenamed(next);
      setEditing(false);
      setState("idle");
      // The project list, the browser tab and the palette read the name on the server.
      router.refresh();
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : String(cause));
      input.current?.focus();
    }
  };

  if (editing) {
    return (
      <span className="flex min-w-0 flex-col">
        <input
          ref={input}
          value={draft}
          maxLength={140}
          disabled={state === "saving"}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setDraft(title);
              setEditing(false);
              setError(null);
            }
          }}
          aria-label="Project name"
          className={cn(
            "w-[min(32rem,60vw)] rounded-md border bg-ink-900 px-1.5 py-0.5 text-[0.9375rem] font-medium text-fg-strong focus:outline-none",
            state === "error" ? "border-rose-500/60" : "border-iris-500/50",
          )}
        />
        {error ? <span className="mt-0.5 text-2xs text-rose-300">{error}</span> : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Rename"
      className="group/title flex min-w-0 items-center gap-1.5 rounded-md px-1 -mx-1 text-left hover:bg-ink-850"
    >
      <h1 className="truncate text-[0.9375rem] font-medium text-fg-strong">{title}</h1>
      <svg aria-hidden viewBox="0 0 24 24" className="size-3.5 shrink-0 text-fg-faint opacity-0 transition-opacity group-hover/title:opacity-100" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}
