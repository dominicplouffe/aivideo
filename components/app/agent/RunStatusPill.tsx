import { cn } from "@/lib/utils";
import type { FixtureStatus } from "@/lib/agent/fixtures";

/**
 * A run's status, in colour.
 *
 * `awaiting_approval` is the only one styled to demand attention, because it
 * is the only one where the product is waiting on a person. Everything else
 * is information.
 */
const META: Record<FixtureStatus | "drafted" | "outlining", { label: string; cls: string; dot: string }> = {
  drafted: { label: "Drafted", cls: "text-fg-subtle border-[var(--line-strong)] bg-ink-850", dot: "bg-fg-faint" },
  outlining: { label: "Planning", cls: "text-iris-300 border-iris-500/35 bg-iris-500/10", dot: "bg-iris-400 animate-pulse" },
  awaiting_approval: {
    label: "Waiting for approval",
    cls: "text-amber-400 border-amber-500/40 bg-amber-500/12",
    dot: "bg-amber-400 animate-pulse",
  },
  approved: { label: "Approved", cls: "text-cyan-300 border-cyan-500/35 bg-cyan-500/10", dot: "bg-cyan-400" },
  recording: { label: "Recording", cls: "text-iris-300 border-iris-500/35 bg-iris-500/10", dot: "bg-iris-400 animate-pulse" },
  recorded: { label: "Recorded", cls: "text-mint-400 border-mint-500/35 bg-mint-500/10", dot: "bg-mint-400" },
  failed: { label: "Stopped", cls: "text-rose-400 border-rose-500/35 bg-rose-500/10", dot: "bg-rose-400" },
  cancelled: { label: "Cancelled", cls: "text-fg-subtle border-[var(--line-strong)] bg-ink-850", dot: "bg-fg-faint" },
};

export function RunStatusPill({ status, className }: { status: string; className?: string }) {
  const meta = META[status as keyof typeof META] ?? META.drafted;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-medium",
        meta.cls,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
