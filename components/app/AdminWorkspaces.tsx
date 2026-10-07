"use client";

import { useState } from "react";
import { cn, formatDate } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Panel } from "./Shared";
import type { AdminWorkspace } from "@/lib/admin/workspaces";
import type { Plan } from "@/lib/billing/plans";

/**
 * The staff admin page: every workspace, and a grant form under each.
 *
 * The page reads the list on the server; this only edits one row at a time
 * and swaps in what the route returns, so the row shows what was written
 * rather than what was typed.
 */

export interface PlanOption {
  id: Plan;
  name: string;
  /** Null is unlimited. */
  seats: number | null;
  minutes: number;
  pack: { size: number; minutes: number } | null;
}

const minutes = (seconds: number) => Math.round(seconds / 60);

export function AdminWorkspaces({
  query,
  workspaces: initial,
  plans,
}: {
  query: string;
  workspaces: AdminWorkspace[];
  plans: PlanOption[];
}) {
  const [workspaces, setWorkspaces] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const planName = (id: Plan) => plans.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="space-y-4 px-4 py-6 md:px-8">
      <form method="get" className="flex max-w-xl gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search by workspace name, URL or member email"
          aria-label="Search workspaces"
          className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 text-[0.875rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
        />
        <Button type="submit" size="sm" variant="secondary">
          Search
        </Button>
      </form>

      <Panel
        title={query ? `Workspaces matching “${query}”` : "Workspaces"}
        description={`${workspaces.length} shown, newest first${workspaces.length >= 200 ? " — search to narrow" : ""}`}
      >
        {workspaces.length === 0 ? (
          <p className="p-5 text-[0.8125rem] text-fg-faint">No workspaces match.</p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {workspaces.map((w) => (
              <li key={w.id}>
                <div className="grid grid-cols-2 items-center gap-x-6 gap-y-3 px-5 py-3.5 sm:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_repeat(5,6.5rem)_auto]">
                  <div className="col-span-full min-w-0 lg:col-span-1">
                    <p className="truncate text-[0.875rem] font-medium text-fg-strong">{w.name}</p>
                    <p className="truncate font-mono text-2xs text-fg-faint">
                      {w.slug} · {w.owner ?? "no owner"} · since {formatDate(w.createdAt)}
                    </p>
                  </div>
                  <Figure label="Plan" value={planName(w.plan) + (w.projectPacks ? ` + ${w.projectPacks} packs` : "")} />
                  <Figure
                    label="Minutes"
                    value={`${minutes(w.videoSecondsUsed)} / ${minutes(w.videoSecondsLimit)}${w.topupSeconds ? ` + ${minutes(w.topupSeconds)}` : ""}`}
                  />
                  <Figure label="Projects" value={String(w.projects)} />
                  <Figure label="Members" value={`${w.members} / ${w.seatsTotal}`} />
                  <Figure label="Stripe" value={w.subscriptionStatus ?? "—"} />
                  <Button
                    size="sm"
                    variant={open === w.id ? "primary" : "secondary"}
                    onClick={() => setOpen(open === w.id ? null : w.id)}
                    aria-expanded={open === w.id}
                  >
                    {open === w.id ? "Close" : "Grant access"}
                  </Button>
                </div>
                {open === w.id ? (
                  <GrantForm
                    workspace={w}
                    plans={plans}
                    onSaved={(saved) => setWorkspaces((all) => all.map((x) => (x.id === saved.id ? saved : x)))}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs text-fg-faint">{label}</p>
      <p className="truncate font-mono text-[0.8125rem] text-fg-muted" title={value}>{value}</p>
    </div>
  );
}

function GrantForm({
  workspace,
  plans,
  onSaved,
}: {
  workspace: AdminWorkspace;
  plans: PlanOption[];
  onSaved: (workspace: AdminWorkspace) => void;
}) {
  const [plan, setPlan] = useState<Plan>(workspace.plan);
  const [packs, setPacks] = useState(workspace.projectPacks);
  const [seats, setSeats] = useState(workspace.seatsTotal);
  const [monthly, setMonthly] = useState(minutes(workspace.videoSecondsLimit));
  const [add, setAdd] = useState(0);
  const [reset, setReset] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const option = plans.find((p) => p.id === plan)!;

  // A new plan or pack count brings that plan's own figures with it; they
  // can still be overridden before saving.
  const choosePlan = (id: Plan) => {
    const next = plans.find((p) => p.id === id)!;
    const nextPacks = next.pack ? packs : 0;
    setPlan(id);
    setPacks(nextPacks);
    setSeats(next.seats ?? seats);
    setMonthly(next.minutes + (next.pack ? nextPacks * next.pack.minutes : 0));
  };
  const choosePacks = (n: number) => {
    setPacks(n);
    setMonthly(option.minutes + (option.pack ? n * option.pack.minutes : 0));
  };

  const save = async () => {
    setState("saving");
    setError(null);
    try {
      const response = await fetch(`/api/admin/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          project_packs: packs,
          seats,
          monthly_minutes: monthly,
          add_minutes: add,
          reset_usage: reset,
          note,
        }),
      });
      const body = (await response.json()) as { workspace?: AdminWorkspace; error?: string };
      if (!response.ok || !body.workspace) throw new Error(body.error ?? "That did not save.");
      onSaved(body.workspace);
      setAdd(0);
      setReset(false);
      setState("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setState("error");
    }
  };

  return (
    <div className="border-t border-[var(--line)] bg-ink-900/40 px-5 py-4">
      {workspace.stripeSubscriptionId ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-[0.8125rem] text-fg">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-amber-400" strokeWidth={2} />
          Stripe bills this workspace ({workspace.subscriptionStatus}). Its next subscription event will overwrite the plan,
          packs, seats and monthly minutes set here. Added minutes are kept.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-[0.8125rem] font-medium text-fg">Plan</span>
          <select
            value={plan}
            onChange={(e) => choosePlan(e.target.value as Plan)}
            className={cn(inputClass, "mt-1.5")}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {option.pack ? (
          <NumberField
            label="Project packs"
            hint={`Each adds ${option.pack.size} projects and ${option.pack.minutes} minutes`}
            value={packs}
            onChange={choosePacks}
          />
        ) : null}
        <NumberField label="Seats" value={seats} onChange={setSeats} />
        <NumberField label="Monthly minutes" hint="The allowance each period" value={monthly} onChange={setMonthly} />
        <NumberField label="Add minutes" hint="Top-up; never expires" value={add} onChange={setAdd} />
      </div>

      <label className="mt-4 flex items-start gap-2.5 text-[0.8125rem] text-fg">
        <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} className="mt-0.5" />
        <span>
          Reset usage now
          <span className="block text-2xs text-fg-faint">
            Starts a new period: {minutes(workspace.videoSecondsUsed)} minutes used and this period&apos;s AI actions go back to zero.
            Without Stripe, nothing else resets them. Period started {formatDate(workspace.periodStartsAt)}.
          </span>
        </span>
      </label>

      <label className="mt-4 block">
        <span className="text-[0.8125rem] font-medium text-fg">Note</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why, for the audit log — e.g. design partner, comped through 2027"
          maxLength={500}
          className={cn(inputClass, "mt-1.5")}
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={state === "saving"} onClick={() => void save()}>
          {state === "saving" ? "Saving…" : "Save grant"}
        </Button>
        {state === "saved" ? (
          <span className="inline-flex items-center gap-1.5 text-2xs text-mint-400">
            <Icon name="check" className="size-3" strokeWidth={3} />
            Saved
          </span>
        ) : null}
        {error ? <span className="text-2xs text-rose-300">{error}</span> : null}
      </div>
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3.5 text-[0.875rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none";

function NumberField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.8125rem] font-medium text-fg">{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className={cn(inputClass, "mt-1.5 font-mono")}
      />
      {hint ? <span className="mt-1 block text-2xs text-fg-faint">{hint}</span> : null}
    </label>
  );
}
