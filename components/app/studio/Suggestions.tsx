"use client";

import { useEffect, useState } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { CutOption, SuggestGoal } from "@/lib/edit/suggest";

/**
 * Suggested cuts, from asking to applying.
 *
 * The card sits above the script. Picking an option strikes its cuts
 * through in the script in amber, so a person reads what would remain
 * before anything changes. Apply takes a checkpoint and makes the cuts;
 * the banner that follows undoes them in one click, and History reaches
 * further back.
 */

export type Suggesting =
  | { goal: SuggestGoal; status: "loading" }
  | { goal: SuggestGoal; status: "ready"; options: CutOption[]; note: string; picked: string | null }
  | { goal: SuggestGoal; status: "error"; error: string };

export function goalTitle(goal: SuggestGoal): string {
  return goal.kind === "tighten" ? "Tighten" : `Cut to ${formatDuration(goal.targetSec)}`;
}

export function goalVerb(goal: SuggestGoal): string {
  return goal.kind === "tighten" ? "Tightened" : `Cut to ${formatDuration(goal.targetSec)}`;
}

export function SuggestionsCard({
  suggesting,
  onPick,
  onApply,
  onCancel,
  onRetry,
  applying,
}: {
  suggesting: Suggesting;
  onPick: (id: string) => void;
  onApply: () => void;
  onCancel: () => void;
  onRetry: () => void;
  applying: boolean;
}) {
  const title = suggesting.goal.kind === "tighten" ? "Tighten this video" : goalTitle(suggesting.goal);
  return (
    <section
      aria-label={title}
      className="border-b border-[var(--line)] bg-ink-900/60 px-4 py-3"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-fg-strong">
            <Icon name="sparkles" className="size-3.5 text-iris-400" strokeWidth={2} />
            {title}
          </h3>
          <p className="mt-0.5 text-2xs leading-relaxed text-fg-faint">
            {suggesting.status === "loading"
              ? "Reading the script and deciding what could go. Up to a minute for a long script."
              : suggesting.status === "ready"
                ? "Pick a version. The script shows what would go, struck through in amber. Nothing changes until you apply, and Undo is one click after."
                : "The suggestion could not be made."}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close suggestions"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-faint hover:bg-ink-850 hover:text-fg"
        >
          <Icon name="x" className="size-3.5" strokeWidth={2} />
        </button>
      </header>

      {suggesting.status === "loading" ? (
        <div className="mt-3 flex items-center gap-2 text-2xs text-fg-subtle">
          <span className="size-1.5 animate-pulse rounded-full bg-iris-400" />
          Thinking…
        </div>
      ) : null}

      {suggesting.status === "error" ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 text-2xs leading-relaxed text-rose-200">
          <Icon name="alert" className="mt-px size-3.5 shrink-0" strokeWidth={2} />
          <span className="flex-1">{suggesting.error}</span>
          <Button size="xs" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}

      {suggesting.status === "ready" ? (
        suggesting.options.length === 0 ? (
          <p className="mt-3 rounded-lg border border-[var(--line)] bg-ink-950 px-3 py-2 text-2xs leading-relaxed text-fg-subtle">
            {suggesting.note || "Nothing worth cutting was found. The script is already tight."}
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-2">
              {suggesting.options.map((option) => (
                <OptionRow key={option.id} option={option} picked={suggesting.picked === option.id} onPick={() => onPick(option.id)} />
              ))}
            </div>
            {suggesting.goal.kind === "target" && suggesting.options.every((o) => o.meetsTarget === false) ? (
              <p className="mt-2 flex items-start gap-1.5 text-2xs leading-relaxed text-amber-300/90">
                <Icon name="info" className="mt-px size-3.5 shrink-0" strokeWidth={2} />
                The closest cut that keeps the point runs {formatDuration(suggesting.options[0].afterSec)}, not{" "}
                {formatDuration(suggesting.goal.targetSec)}. You can apply it and trim by hand from there.
              </p>
            ) : null}
            {suggesting.note ? <p className="mt-2 text-2xs leading-relaxed text-fg-faint">{suggesting.note}</p> : null}
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={onApply} disabled={!suggesting.picked || applying}>
                <Icon name="scissors" className="size-3.5" strokeWidth={2} />
                {applying ? "Applying…" : "Apply"}
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancel} disabled={applying}>
                Keep as is
              </Button>
            </div>
          </>
        )
      ) : null}
    </section>
  );
}

function OptionRow({ option, picked, onPick }: { option: CutOption; picked: boolean; onPick: () => void }) {
  const saved = Math.max(0, option.beforeSec - option.afterSec);
  const items = [
    ...option.chapters.map((c) => `Drop “${c.title}”`),
    ...option.phrases.map((p) => `“${p.text}”`),
  ];
  const [open, setOpen] = useState(false);
  return (
    <div
      role="radio"
      aria-checked={picked}
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      className={cn(
        "cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors",
        picked ? "border-iris-500/50 bg-iris-500/[0.08]" : "border-[var(--line)] hover:border-[var(--line-strong)]",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-full border", picked ? "border-iris-400 bg-iris-500" : "border-fg/25")}>
          {picked ? <Icon name="check" className="size-2.5 text-white" strokeWidth={3} /> : null}
        </span>
        <span className="text-[0.8125rem] font-medium text-fg-strong">{option.label}</span>
        <span className="ml-auto font-mono text-2xs text-fg-muted tabular-nums">
          {formatDuration(option.beforeSec)} → {formatDuration(option.afterSec)}
        </span>
        <span className={cn("rounded px-1.5 py-0.5 font-mono text-2xs tabular-nums", option.meetsTarget === false ? "bg-amber-500/15 text-amber-300" : "bg-mint-500/15 text-mint-400")}>
          −{formatDuration(saved)}
        </span>
      </div>
      {option.summary ? <p className="mt-1 pl-6 text-2xs leading-relaxed text-fg-subtle">{option.summary}</p> : null}
      <p className="mt-1 pl-6 text-2xs text-fg-faint">
        {option.chapters.length > 0 ? `${option.chapters.length} scene${option.chapters.length === 1 ? "" : "s"} dropped` : null}
        {option.chapters.length > 0 && option.phrases.length > 0 ? " · " : null}
        {option.phrases.length > 0 ? `${option.phrases.length} phrase${option.phrases.length === 1 ? "" : "s"} cut` : null}
        {option.meetsTarget === false ? " · does not reach the target" : null}
        {items.length > 0 ? (
          <>
            {" · "}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
              className="underline-offset-2 hover:text-fg hover:underline"
            >
              {open ? "hide the list" : "see what goes"}
            </button>
          </>
        ) : null}
      </p>
      {open ? (
        <ul className="mt-1.5 max-h-40 space-y-0.5 overflow-y-auto pl-6 text-2xs leading-relaxed text-fg-subtle">
          {items.map((item, i) => (
            <li key={i} className="truncate">{item}</li>
          ))}
          {option.unmatched.length > 0 ? (
            <li className="text-fg-faint">
              {option.unmatched.length} suggested phrase{option.unmatched.length === 1 ? "" : "s"} could not be found in the script and will be ignored.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------- applied */

export interface Applied {
  label: string;
  savedSec: number;
  checkpointId: string;
}

export function AppliedBanner({
  applied,
  onUndo,
  onDismiss,
  onHistory,
  busy,
}: {
  applied: Applied;
  onUndo: () => void;
  onDismiss: () => void;
  onHistory: () => void;
  busy: boolean;
}) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-mint-500/[0.07] px-4 py-2 text-2xs">
      <Icon name="check" className="size-3.5 text-mint-400" strokeWidth={2.6} />
      <span className="text-fg">
        {applied.label}
        {applied.savedSec > 0 ? <span className="text-fg-subtle"> · {formatDuration(applied.savedSec)} shorter</span> : null}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        <Button size="xs" variant="outline" onClick={onUndo} disabled={busy}>
          <Icon name="refresh" className="size-3" strokeWidth={2.2} />
          {busy ? "Undoing…" : "Undo"}
        </Button>
        <Button size="xs" variant="ghost" onClick={onHistory}>
          History
        </Button>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="inline-flex size-6 items-center justify-center rounded-md text-fg-faint hover:bg-ink-850 hover:text-fg">
          <Icon name="x" className="size-3" strokeWidth={2} />
        </button>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------- history */

export interface CheckpointSummary {
  id: string;
  label: string;
  kind: "ai" | "restore" | "manual";
  createdAt: string;
}

export function HistoryPanel({
  projectId,
  onRestore,
  onClose,
  busy,
  refreshKey,
}: {
  projectId: string;
  onRestore: (checkpoint: CheckpointSummary) => void;
  onClose: () => void;
  busy: boolean;
  /** Changes when a checkpoint was just made, so the list reloads. */
  refreshKey: number;
}) {
  const [items, setItems] = useState<CheckpointSummary[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/checkpoints`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((body: { data?: CheckpointSummary[] }) => {
        if (!cancelled) setItems(body.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  return (
    <section aria-label="History" className="border-b border-[var(--line)] bg-ink-900/60 px-4 py-3">
      <header className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-fg-strong">
          <Icon name="clock" className="size-3.5 text-iris-400" strokeWidth={2} />
          History
        </h3>
        <button type="button" onClick={onClose} aria-label="Close history" className="inline-flex size-7 items-center justify-center rounded-md text-fg-faint hover:bg-ink-850 hover:text-fg">
          <Icon name="x" className="size-3.5" strokeWidth={2} />
        </button>
      </header>
      <p className="mt-0.5 text-2xs leading-relaxed text-fg-faint">
        The edit as it stood before each change made for you. Going back is itself kept, so you can come forward again.
      </p>
      {items === null ? (
        <p className="mt-3 text-2xs text-fg-faint">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-2xs text-fg-faint">Nothing yet. A checkpoint is taken before any suggested cut is applied.</p>
      ) : (
        <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-2.5 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.75rem] text-fg">{item.label}</span>
                <span className="block text-2xs text-fg-faint">{new Date(item.createdAt).toLocaleString()}</span>
              </span>
              <Button size="xs" variant="outline" onClick={() => onRestore(item)} disabled={busy}>
                Go back to this
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
