"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { plans, compareGroups, type Plan } from "@/lib/pricing";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Primitives";

export function PricingPlans() {
  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} />
        ))}
      </div>

      <p className="mt-8 text-center text-[0.8125rem] text-fg-faint">
        All prices in USD. Studio is billed monthly; Bring your own keys is billed yearly. Written
        guides are unlimited on every plan, including Free.
      </p>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-6 transition-colors",
        plan.highlight
          ? "border-iris-500/45 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-iris-500)_10%,transparent),transparent_60%)] shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-iris-500)_22%,transparent),0_24px_70px_-30px_var(--color-iris-500)]"
          : "border-[var(--line)] bg-[color-mix(in_oklab,var(--color-fg)_2.5%,transparent)]",
      )}
    >
      {plan.badge ? (
        <span className="absolute -top-2.5 left-6 rounded-full bg-[linear-gradient(135deg,var(--color-iris-500),var(--color-violet-500))] px-2.5 py-0.5 text-2xs font-semibold text-white">
          {plan.badge}
        </span>
      ) : null}

      <h3 className="text-[1.0625rem] font-semibold">{plan.name}</h3>
      <p className="mt-1.5 min-h-[2.5rem] text-[0.8125rem] leading-snug text-fg-subtle">
        {plan.tagline}
      </p>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span
          className={cn(
            "leading-none font-semibold tracking-[-0.03em] text-fg-strong tabular-nums",
            plan.price.startsWith("$") ? "text-[2.25rem]" : "text-[1.75rem]",
          )}
        >
          {plan.price}
        </span>
        {plan.price.startsWith("$") ? <span className="text-[0.8125rem] text-fg-subtle">/mo</span> : null}
      </div>
      <p className="mt-1.5 text-2xs text-fg-faint">{plan.priceNote}</p>

      <Button
        href={plan.cta.href}
        variant={plan.highlight ? "primary" : "secondary"}
        size="md"
        className="mt-5 w-full"
      >
        {plan.cta.label}
      </Button>

      <ul className="mt-6 flex flex-1 flex-col gap-2.5 border-t border-[var(--line)] pt-5">
        {plan.headline.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Icon
              name="check"
              className={cn("mt-0.5 size-3.5 shrink-0", plan.highlight ? "text-iris-300" : "text-mint-400")}
              strokeWidth={2.4}
            />
            <span className="text-[0.8125rem] leading-snug text-fg-muted">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------- comparison matrix */

export function ComparisonTable() {
  const [openGroups, setOpenGroups] = useState<string[]>(compareGroups.map((g) => g.group));

  const toggle = (g: string) =>
    setOpenGroups((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-collapse text-left">
        <thead className="sticky top-16 z-10">
          <tr className="bg-ink-1000">
            <th className="w-[26%] border-b border-[var(--line)] px-4 py-4 align-bottom">
              <span className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                Compare plans
              </span>
            </th>
            {plans.map((p) => (
              <th
                key={p.id}
                className={cn(
                  "border-b border-[var(--line)] px-3 py-4 align-bottom",
                  p.highlight && "bg-[color-mix(in_oklab,var(--color-iris-500)_7%,transparent)]",
                )}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-[0.875rem] font-semibold text-fg-strong">{p.name}</span>
                  <span className="text-2xs text-fg-faint">
                    {p.price.startsWith("$") ? `${p.price}/mo` : p.price}
                  </span>
                  <Link
                    href={p.cta.href}
                    className={cn(
                      "mt-1.5 inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-2xs font-medium transition-colors",
                      p.highlight
                        ? "bg-[linear-gradient(135deg,var(--color-iris-500),var(--color-violet-500))] text-white"
                        : "border border-[var(--line-strong)] text-fg hover:bg-[color-mix(in_oklab,var(--color-fg)_6%,transparent)]",
                    )}
                  >
                    {p.id === "enterprise" ? "Contact" : "Choose"}
                  </Link>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {compareGroups.map((group) => {
            const open = openGroups.includes(group.group);
            return (
              <Fragment key={group.group}>
                <tr>
                  <td colSpan={5} className="px-0 pt-8 pb-2">
                    <button
                      type="button"
                      onClick={() => toggle(group.group)}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left"
                      aria-expanded={open}
                    >
                      <Icon name={group.icon} className="size-4 text-iris-400" strokeWidth={1.7} />
                      <span className="text-[0.875rem] font-semibold text-fg-strong">{group.group}</span>
                      <Icon
                        name="chevronDown"
                        className={cn("size-3.5 text-fg-faint transition-transform", !open && "-rotate-90")}
                        strokeWidth={2}
                      />
                    </button>
                  </td>
                </tr>
                {open
                  ? group.rows.map((row) => (
                      <tr key={row.label} className="group">
                        <td className="border-b border-[var(--line)] px-4 py-3">
                          <span className="text-[0.8125rem] text-fg-muted">{row.label}</span>
                          {row.hint ? (
                            <span className="mt-0.5 block text-2xs text-fg-faint">{row.hint}</span>
                          ) : null}
                        </td>
                        {plans.map((p) => {
                          const v = row.values[p.id];
                          return (
                            <td
                              key={p.id}
                              className={cn(
                                "border-b border-[var(--line)] px-3 py-3 text-center",
                                p.highlight && "bg-[color-mix(in_oklab,var(--color-iris-500)_5%,transparent)]",
                              )}
                            >
                              {v === true ? (
                                <Icon name="check" className="mx-auto size-4 text-mint-400" strokeWidth={2.4} />
                              ) : v === false ? (
                                <span className="text-fg-faint">—</span>
                              ) : (
                                <span className="text-[0.75rem] text-fg">{v}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------- credit explainer */

export function MinuteExplainer() {
  const rows = [
    { label: "Record a 12-minute walkthrough", cost: "0 minutes", note: "Source footage is never billed" },
    { label: "Publish a 3-minute directed cut", cost: "3 minutes", note: "You pay for finished output only" },
    { label: "Generate the written guide", cost: "0 minutes", note: "Unlimited on every plan" },
    { label: "Build the interactive tour", cost: "0 minutes", note: "Same source, no extra charge" },
    { label: "Localize into 34 languages", cost: "0 minutes", note: "Translations are never re-billed" },
    { label: "Cut 6 vertical social clips", cost: "0 minutes", note: "Derived from a video you paid for" },
    { label: "Re-edit and re-render this month", cost: "0 minutes", note: "A project counts once a period, at its longest render" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={cn(
            "grid gap-2 px-5 py-4 sm:grid-cols-[1fr_8rem_1fr] sm:items-center sm:gap-6",
            i !== rows.length - 1 && "border-b border-[var(--line)]",
            i === 1 && "bg-[color-mix(in_oklab,var(--color-iris-500)_6%,transparent)]",
          )}
        >
          <span className="text-[0.875rem] text-fg">{r.label}</span>
          <span
            className={cn(
              "font-mono text-[0.8125rem]",
              r.cost === "0 minutes" ? "text-mint-400" : "text-iris-300",
            )}
          >
            {r.cost}
          </span>
          <span className="text-[0.75rem] text-fg-subtle">{r.note}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 border-t border-[var(--line-strong)] bg-ink-900 px-5 py-4">
        <span className="text-[0.875rem] font-medium text-fg-strong">Total billed</span>
        <Badge tone="iris">3 of your monthly minutes</Badge>
      </div>
    </div>
  );
}
