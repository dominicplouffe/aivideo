"use client";

import { useEffect, useRef, useState } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Panel, StatTile } from "./Shared";
import { PLAN_CATALOGUE, formatOverage, formatPrice, type Plan } from "@/lib/billing/plans";

/**
 * Billing: what the workspace is on, what it has used, and how to change it.
 *
 * Everything shown is read from the workspace and its ledger; the plan is
 * changed through Stripe Checkout and the portal, never by a request that
 * writes a plan directly. A limit that is close is said in words next to
 * its meter, because a bar at 92% tells nobody what happens at 100.
 */

interface Summary {
  plan: {
    id: Plan;
    name: string;
    price: string;
    term: "none" | "monthly" | "annual" | "quoted";
    packs: number;
    pack: { size: number; priceCents: number; extraSeconds: number } | null;
    term_ends_at: string | null;
    own_keys: boolean;
  };
  projects: { used: number; limit: number | null };
  ai: { suggestions: { used: number; limit: number | null }; riff: { used: number; limit: number | null } };
  period_starts_at: string;
  included_seconds: number;
  topup_seconds: number;
  used_seconds: number;
  remaining_seconds: number;
  fraction_used: number;
  overage_cents: number;
  hard_stop_at_limit: boolean;
  at_limit_behaviour: string;
}

export function BillingView({
  purchased,
  canManage,
  startCheckout = null,
}: {
  purchased: string | null;
  canManage: boolean;
  /** A paid plan chosen on /pricing before sign-up: go straight to its checkout. */
  startCheckout?: "byok" | "studio" | null;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    purchased ? "Thanks. Stripe is confirming the purchase; the plan below updates within a few seconds." : null,
  );

  const load = async () => {
    try {
      const response = await fetch("/api/billing");
      const body = (await response.json()) as Summary & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Usage could not be read.");
      setSummary(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  useEffect(() => {
    void load();
    // After a purchase the webhook lands a moment later: poll briefly.
    if (!purchased) return;
    const timer = setInterval(() => void load(), 3000);
    const stop = setTimeout(() => clearInterval(timer), 45_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [purchased]);

  const go = async (path: string, body?: unknown) => {
    setBusy(path);
    setError(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = (await response.json()) as { url?: string; error?: string; note?: string };
      if (!response.ok) throw new Error(result.error ?? "That did not work.");
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      if (result.note) setNotice(result.note);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  // Once, and only for a workspace still on Free that may buy: somebody who
  // clicked "Start Studio" lands on Stripe Checkout rather than on Free.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !startCheckout || purchased || !canManage || summary?.plan.id !== "free") return;
    started.current = true;
    void go("/api/billing/checkout", startCheckout === "studio" ? { plan: "studio", packs: 0 } : { plan: "byok" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, startCheckout, purchased, canManage]);

  if (!summary) {
    return (
      <div className="px-4 py-6 md:px-8">
        <Panel title="Billing">
          <p className="p-5 text-[0.8125rem] text-fg-faint">{error ?? "Loading…"}</p>
        </Panel>
      </div>
    );
  }

  const plan = PLAN_CATALOGUE[summary.plan.id];
  const usedMin = Math.round(summary.used_seconds / 60);
  const allowanceMin = Math.round((summary.included_seconds + summary.topup_seconds) / 60);
  const pct = Math.min(100, summary.fraction_used * 100);
  const termEnds = summary.plan.term_ends_at ? new Date(summary.plan.term_ends_at) : null;
  const inTerm = termEnds !== null && termEnds.getTime() > Date.now();

  return (
    <div className="space-y-4 px-4 py-6 md:px-8">
      {notice ? (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-mint-500/30 bg-mint-500/[0.07] px-4 py-3 text-[0.8125rem] text-fg">
          <Icon name="check" className="mt-0.5 size-4 text-mint-400" strokeWidth={2.4} />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-fg-faint hover:text-fg">
            <Icon name="x" className="size-3.5" strokeWidth={2} />
          </button>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] px-4 py-3 text-[0.8125rem] text-rose-200">
          <Icon name="alert" className="mt-0.5 size-4" strokeWidth={2.2} />
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Current plan" value={summary.plan.name} icon="creditCard" sub={summary.plan.price === "Free" ? "No card on file" : `${summary.plan.price}${summary.plan.packs > 0 ? ` with ${summary.plan.packs} pack${summary.plan.packs === 1 ? "" : "s"}` : ""}`} />
        <StatTile label="Video minutes" value={`${usedMin}`} icon="clock" sub={`of ${allowanceMin} this period`} />
        <StatTile
          label="Projects"
          value={`${summary.projects.used}`}
          icon="layers"
          sub={summary.projects.limit === null ? "unlimited on this plan" : `of ${summary.projects.limit} on this plan`}
        />
        <StatTile
          label="AI this period"
          value={`${summary.ai.suggestions.used + summary.ai.riff.used}`}
          icon="sparkles"
          sub={
            summary.ai.suggestions.limit === null
              ? "unlimited on this plan"
              : `${summary.ai.suggestions.used}/${summary.ai.suggestions.limit} cuts · ${summary.ai.riff.used}/${summary.ai.riff.limit} Riff`
          }
        />
      </div>

      <Panel title="This billing period" description={`Began ${new Date(summary.period_starts_at).toLocaleDateString()}`}>
        <div className="p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[0.875rem] text-fg">Finished video minutes</span>
            <span className="font-mono text-[0.875rem] text-fg-muted tabular-nums">
              {usedMin} / {allowanceMin}
            </span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink-800">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                pct > 90 ? "bg-rose-500" : pct > 75 ? "bg-amber-500" : "bg-[linear-gradient(90deg,var(--color-iris-500),var(--color-cyan-400))]",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-2xs leading-relaxed text-fg-faint">
            A project counts once a period, for its longest render: re-rendering after an edit is free.{" "}
            {summary.at_limit_behaviour}
            {summary.overage_cents > 0 ? ` Overage so far: $${(summary.overage_cents / 100).toFixed(2)}.` : ""}
          </p>
          {plan.overageCentsPerSecond !== null ? (
            <HardStop on={summary.hard_stop_at_limit} canManage={canManage} onChange={load} />
          ) : null}
        </div>
      </Panel>

      {summary.plan.id === "free" ? (
        <Panel title="Choose a plan" description="Both include every AI feature. The difference is whose vendor accounts do the work.">
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <PlanOffer
              plan="byok"
              title="Bring your own keys"
              price="$20 a month, billed $240 for the year"
              points={[
                "Unlimited projects",
                `${PLAN_CATALOGUE.byok.videoSecondsPerPeriod / 60} finished minutes a month`,
                "Unlimited Tighten, Cut to length and Riff",
                "Your Deepgram, ElevenLabs and Anthropic keys, billed by them to you",
                "Twelve-month term",
              ]}
              busy={busy === "/api/billing/checkout:byok"}
              disabled={!canManage}
              onChoose={() => void go("/api/billing/checkout", { plan: "byok" })}
            />
            <PlanOffer
              plan="studio"
              title="Studio"
              price="$99 a month, cancel any time"
              points={[
                `${PLAN_CATALOGUE.studio.projects} projects, +${PLAN_CATALOGUE.studio.projectPack!.size} for $${PLAN_CATALOGUE.studio.projectPack!.priceCents / 100} a month`,
                `${PLAN_CATALOGUE.studio.videoSecondsPerPeriod / 60} finished minutes a month, +${PLAN_CATALOGUE.studio.projectPack!.extraSeconds / 60} per pack`,
                `${PLAN_CATALOGUE.studio.ai.suggestionsPerPeriod} suggested cuts and ${PLAN_CATALOGUE.studio.ai.riffMessagesPerPeriod} Riff messages a month`,
                "Our vendor accounts do the work; nothing to set up",
                `Overage at ${formatOverage("studio")}, or a hard stop you control`,
              ]}
              highlight
              busy={busy === "/api/billing/checkout:studio"}
              disabled={!canManage}
              onChoose={() => void go("/api/billing/checkout", { plan: "studio", packs: 0 })}
            />
          </div>
          {!canManage ? <p className="px-5 pb-4 text-2xs text-fg-faint">Only the workspace owner can change the plan.</p> : null}
        </Panel>
      ) : null}

      {summary.plan.id === "studio" && summary.plan.pack ? (
        <Panel title="Projects" description="Ten come with the plan. Add more in packs; each pack also adds minutes.">
          <PackStepper
            packs={summary.plan.packs}
            pack={summary.plan.pack}
            used={summary.projects.used}
            base={plan.projects ?? 0}
            busy={busy === "/api/billing/packs"}
            disabled={!canManage}
            onSet={(packs) => void go("/api/billing/packs", { packs })}
          />
        </Panel>
      ) : null}

      {summary.plan.own_keys ? (
        <Panel title="Your keys">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-[0.8125rem] leading-relaxed text-fg-subtle">
              This plan runs on your own Deepgram, ElevenLabs and Anthropic accounts. The vendors bill you directly for what you use.
            </p>
            <Button href="/app/settings" variant="outline" size="sm">
              Manage your keys
            </Button>
          </div>
        </Panel>
      ) : null}

      <Panel title="Invoices and payment">
        <div className="flex flex-wrap items-center gap-3 p-5">
          <p className="flex-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
            {summary.plan.id === "free"
              ? "Nothing has been bought yet. Invoices and card details will appear here."
              : inTerm
                ? `${summary.plan.name} runs until ${termEnds!.toLocaleDateString()}. Until then it renews as agreed; card and invoices are in the Stripe portal.`
                : "Card details and invoices are held by Stripe, never by us."}
          </p>
          {summary.plan.id !== "free" ? (
            <>
              <Button variant="outline" size="sm" disabled={!canManage || busy === "/api/billing/portal"} onClick={() => void go("/api/billing/portal")}>
                <Icon name="creditCard" className="size-4" strokeWidth={1.8} />
                Card and invoices
              </Button>
              <Button variant="ghost" size="sm" disabled={!canManage || inTerm || busy === "/api/billing/cancel"} title={inTerm ? `Can be cancelled from ${termEnds!.toLocaleDateString()}` : undefined} onClick={() => void go("/api/billing/cancel")}>
                Cancel at period end
              </Button>
            </>
          ) : null}
          <Button href="/contact" variant="ghost" size="sm">
            Talk to sales about Enterprise
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function PlanOffer({
  plan,
  title,
  price,
  points,
  highlight,
  busy,
  disabled,
  onChoose,
}: {
  plan: Plan;
  title: string;
  price: string;
  points: string[];
  highlight?: boolean;
  busy: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  return (
    <div className={cn("flex flex-col rounded-xl border p-4", highlight ? "border-iris-500/45 bg-iris-500/[0.06]" : "border-[var(--line)]")}>
      <h3 className="text-[0.9375rem] font-medium text-fg-strong">{title}</h3>
      <p className="mt-0.5 text-2xs text-fg-subtle">{price}</p>
      <ul className="mt-3 flex-1 space-y-1.5">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-[0.8125rem] text-fg-muted">
            <Icon name="check" className="mt-0.5 size-3.5 shrink-0 text-mint-400" strokeWidth={2.4} />
            {p}
          </li>
        ))}
      </ul>
      <Button className="mt-4" variant={highlight ? "primary" : "secondary"} size="sm" disabled={disabled || busy} onClick={onChoose}>
        {busy ? "Opening checkout…" : `Choose ${formatPrice(plan)}`}
      </Button>
    </div>
  );
}

function PackStepper({
  packs,
  pack,
  used,
  base,
  busy,
  disabled,
  onSet,
}: {
  packs: number;
  pack: { size: number; priceCents: number; extraSeconds: number };
  used: number;
  base: number;
  busy: boolean;
  disabled: boolean;
  onSet: (packs: number) => void;
}) {
  const [draft, setDraft] = useState(packs);
  useEffect(() => setDraft(packs), [packs]);
  const limit = base + draft * pack.size;
  const tooFew = used > limit;
  return (
    <div className="flex flex-wrap items-center gap-4 p-5">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={disabled || busy || draft === 0} onClick={() => setDraft((d) => Math.max(0, d - 1))} aria-label="One pack fewer">
          −
        </Button>
        <span className="w-24 text-center font-mono text-[0.875rem] text-fg tabular-nums">
          {draft} pack{draft === 1 ? "" : "s"}
        </span>
        <Button variant="outline" size="sm" disabled={disabled || busy || draft >= 20} onClick={() => setDraft((d) => Math.min(20, d + 1))} aria-label="One pack more">
          +
        </Button>
      </div>
      <p className="flex-1 text-[0.8125rem] leading-relaxed text-fg-subtle">
        {limit} projects and {Math.round((150 * 60 + draft * pack.extraSeconds) / 60)} minutes a month, for ${(9_900 + draft * pack.priceCents) / 100} a month.
        {tooFew ? ` You have ${used} projects, so this is too few.` : ""}
      </p>
      <Button size="sm" disabled={disabled || busy || draft === packs || tooFew} onClick={() => onSet(draft)}>
        {busy ? "Updating…" : "Update packs"}
      </Button>
    </div>
  );
}

function HardStop({ on, canManage, onChange }: { on: boolean; canManage: boolean; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={!canManage || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/billing", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hard_stop_at_limit: !on }) });
          await onChange();
        } finally {
          setBusy(false);
        }
      }}
      aria-pressed={on}
      className="mt-3 flex w-full items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2 text-left transition-colors hover:bg-ink-900 disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] text-fg">Hard stop at the allowance</span>
        <span className="block text-2xs text-fg-faint">
          {on ? "Rendering pauses when the minutes run out. Nothing is billed beyond the plan." : "Rendering continues past the minutes and overage is billed at the plan's rate."}
        </span>
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-iris-500" : "bg-ink-700")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-transform", on ? "translate-x-4" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

