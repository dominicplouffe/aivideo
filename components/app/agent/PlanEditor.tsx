"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { OutlineStep } from "@/lib/agent/run";

/**
 * Editing a plan before it is approved.
 *
 * Every part of a step a person might need to correct: the page, the one
 * action and the exact text of the control it names, and the narration.
 * Steps can be added, removed and moved. What is saved is checked exactly
 * as a planned outline is — a page off the run's sites is refused — and the
 * approval, when it comes, covers the plan as edited.
 */

type Draft = {
  intent: string;
  url: string;
  kind: "none" | "click" | "fill";
  target: string;
  value: string;
  narration: string;
};

function toDraft(step: OutlineStep): Draft {
  return {
    intent: step.intent,
    url: step.url ?? "",
    kind: step.action?.kind ?? "none",
    target: step.action?.target ?? "",
    value: step.action?.kind === "fill" ? step.action.value : "",
    narration: step.narration ?? "",
  };
}

function fromDraft(d: Draft) {
  return {
    intent: d.intent.trim(),
    ...(d.url.trim() ? { url: d.url.trim() } : {}),
    ...(d.narration.trim() ? { narration: d.narration.trim() } : {}),
    ...(d.kind !== "none" && d.target.trim()
      ? { action: d.kind === "click" ? { kind: "click", target: d.target.trim() } : { kind: "fill", target: d.target.trim(), value: d.value } }
      : {}),
  };
}

const blank: Draft = { intent: "", url: "", kind: "none", target: "", value: "", narration: "" };

export function PlanEditor({ runId, outline, onDone }: { runId: string; outline: OutlineStep[]; onDone: () => void }) {
  const router = useRouter();
  const [steps, setSteps] = useState<Draft[]>(() => outline.map(toDraft));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (i: number, patch: Partial<Draft>) => setSteps((all) => all.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) =>
    setSteps((all) => {
      const j = i + by;
      if (j < 0 || j >= all.length) return all;
      const next = [...all];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    setError(null);
    const empty = steps.findIndex((s) => !s.intent.trim());
    if (empty >= 0) {
      setError(`Step ${empty + 1} needs a description.`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/agent/runs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: runId, decision: "edit", outline: steps.map(fromDraft) }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The plan was not saved.");
      onDone();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-lg border border-[var(--line)] bg-ink-950 px-2.5 py-1.5 text-[0.8125rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none";
  const label = "mb-1 block text-2xs text-fg-faint";

  return (
    <div className="divide-y divide-[var(--line)]">
      {steps.map((step, i) => (
        <div key={i} className="space-y-2.5 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-ink-900 font-mono text-2xs text-fg-subtle">
              {i + 1}
            </span>
            <input value={step.intent} onChange={(e) => change(i, { intent: e.target.value })} placeholder="What this step shows" className={field} aria-label={`Step ${i + 1} description`} />
            <div className="flex shrink-0 items-center">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="inline-flex size-7 items-center justify-center rounded-md text-fg-faint hover:bg-ink-850 hover:text-fg disabled:opacity-30">
                <Icon name="chevronDown" className="size-3.5 rotate-180" strokeWidth={2.2} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Move down" className="inline-flex size-7 items-center justify-center rounded-md text-fg-faint hover:bg-ink-850 hover:text-fg disabled:opacity-30">
                <Icon name="chevronDown" className="size-3.5" strokeWidth={2.2} />
              </button>
              <button type="button" onClick={() => setSteps((all) => all.filter((_, k) => k !== i))} disabled={steps.length === 1} aria-label="Remove step" className="inline-flex size-7 items-center justify-center rounded-md text-fg-faint hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-30">
                <Icon name="trash" className="size-3.5" strokeWidth={1.9} />
              </button>
            </div>
          </div>
          <div className="grid gap-2.5 pl-8 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={label}>Open this page first (optional)</span>
              <input value={step.url} onChange={(e) => change(i, { url: e.target.value })} placeholder="https://app.yourproduct.com/…" className={cn(field, "font-mono")} spellCheck={false} />
            </label>
            <label className="block">
              <span className={label}>Then</span>
              <select value={step.kind} onChange={(e) => change(i, { kind: e.target.value as Draft["kind"] })} className={field}>
                <option value="none">Just show the page</option>
                <option value="click">Click a button or link</option>
                <option value="fill">Type into a field</option>
              </select>
            </label>
            {step.kind !== "none" ? (
              <label className="block">
                <span className={label}>{step.kind === "click" ? "Its exact text on the page" : "The field's label or placeholder"}</span>
                <input value={step.target} onChange={(e) => change(i, { target: e.target.value })} placeholder={step.kind === "click" ? "New shipment" : "Ask Q anything…"} className={field} />
              </label>
            ) : null}
            {step.kind === "fill" ? (
              <label className="block sm:col-span-2">
                <span className={label}>What to type</span>
                <input value={step.value} onChange={(e) => change(i, { value: e.target.value })} className={field} />
              </label>
            ) : null}
            <label className="block sm:col-span-2">
              <span className={label}>Narration</span>
              <textarea value={step.narration} onChange={(e) => change(i, { narration: e.target.value })} rows={2} className={field} />
            </label>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 px-5 py-4">
        <Button type="button" variant="outline" size="sm" onClick={() => setSteps((all) => [...all, { ...blank }])}>
          <Icon name="plus" className="size-3.5" strokeWidth={2.2} />
          Add a step
        </Button>
        <span className="flex-1" />
        {error ? <span className="text-2xs text-rose-300">{error}</span> : null}
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save plan"}
        </Button>
      </div>
    </div>
  );
}
