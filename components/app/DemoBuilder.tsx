"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { MockApp } from "@/components/marketing/MockApp";
import type { Project } from "@/lib/app-data";

type StepKind = "hotspot" | "fork" | "form";

interface TourStep {
  id: string;
  kind: StepKind;
  title: string;
  tooltip: string;
  target: { x: number; y: number; w: number; h: number };
  required: boolean;
}

function toTour(project: Project): TourStep[] {
  const steps: TourStep[] = project.segments.map((s, i) => ({
    id: s.id,
    kind: "hotspot",
    title: s.title,
    tooltip:
      s.words.filter((w) => !w.cut).slice(0, 16).map((w) => w.w).join(" ").replace(/\s+/g, " ") + "…",
    target: {
      x: s.zoom?.x ?? 50,
      y: s.zoom?.y ?? 40,
      w: 16,
      h: 9,
    },
    required: i < 3,
  }));
  if (steps.length > 3) {
    steps.splice(1, 0, {
      id: "fork-1",
      kind: "fork",
      title: "What do you want to see?",
      tooltip: "Route the viewer by role so they reach what they care about in two clicks.",
      target: { x: 50, y: 40, w: 30, h: 16 },
      required: true,
    });
    steps.splice(steps.length - 1, 0, {
      id: "form-1",
      kind: "form",
      title: "Capture the lead",
      tooltip: "Ask for a work email before the final step. Maps to a HubSpot contact.",
      target: { x: 50, y: 50, w: 28, h: 18 },
      required: false,
    });
  }
  return steps;
}

const kindMeta: Record<StepKind, { label: string; icon: IconName; tone: string }> = {
  hotspot: { label: "Hotspot", icon: "cursor", tone: "text-cyan-300 bg-cyan-500/12" },
  fork: { label: "Branch", icon: "layers", tone: "text-violet-400 bg-violet-500/12" },
  form: { label: "Lead form", icon: "mail", tone: "text-amber-400 bg-amber-500/12" },
};

export function DemoBuilder({ project }: { project: Project }) {
  const steps = toTour(project);
  const [selected, setSelected] = useState(0);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const step = steps[selected];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line)] bg-ink-950 px-4 py-2.5">
        <Link
          href="/app/demos"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-ink-850 hover:text-fg"
          aria-label="Back to demos"
        >
          <Icon name="chevronLeft" className="size-4" strokeWidth={2.2} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[0.9375rem] font-medium text-fg-strong">{project.title}</h1>
          <p className="text-2xs text-fg-faint">
            {steps.length} steps · {steps.filter((s) => s.kind === "fork").length} branches · real DOM
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-xl border border-[var(--line)] bg-ink-900 p-0.5">
            {(["desktop", "mobile"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewport(v)}
                aria-pressed={viewport === v}
                aria-label={`${v} viewport`}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-lg transition-colors",
                  viewport === v ? "bg-ink-750 text-fg" : "text-fg-faint hover:text-fg",
                )}
              >
                <Icon name={v === "desktop" ? "frame" : "crop"} className="size-4" strokeWidth={1.9} />
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" href={`/app/demos/${project.id}/preview`}>
            <Icon name="play" className="size-4" strokeWidth={1.9} />
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button variant="outline" size="sm">
            <Icon name="code" className="size-4" strokeWidth={1.8} />
            <span className="hidden sm:inline">Embed</span>
          </Button>
          <Button size="sm">
            <Icon name="rocket" className="size-4" strokeWidth={1.9} />
            Publish
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[17rem_1fr_19rem]">
        {/* step list */}
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-ink-950 lg:flex">
          <p className="px-4 pt-4 pb-2 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
            Flow
          </p>
          <ol className="flex flex-col gap-1 px-2 pb-4">
            {steps.map((s, i) => {
              const m = kindMeta[s.kind];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2.5 text-left transition-colors",
                      selected === i
                        ? "border-iris-500/40 bg-iris-500/[0.08]"
                        : "border-transparent hover:bg-ink-900",
                    )}
                  >
                    <span className="flex shrink-0 flex-col items-center gap-1">
                      <span className="inline-flex size-5 items-center justify-center rounded-md bg-ink-850 font-mono text-2xs text-fg-subtle">
                        {i + 1}
                      </span>
                      {i < steps.length - 1 ? <span className="h-3 w-px bg-[var(--line)]" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.5625rem]", m.tone)}>
                          <Icon name={m.icon} className="size-2.5" strokeWidth={2.4} />
                          {m.label}
                        </span>
                        {s.required ? (
                          <span className="text-[0.5625rem] text-fg-faint">required</span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-[0.75rem] leading-snug text-fg">{s.title}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-auto space-y-1.5 border-t border-[var(--line)] p-3">
            {(["hotspot", "fork", "form"] as StepKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className="flex w-full items-center gap-2 rounded-lg border border-[var(--line)] px-2.5 py-2 text-2xs text-fg-subtle transition-colors hover:border-[var(--line-strong)] hover:text-fg"
              >
                <Icon name="plus" className="size-3" strokeWidth={2.6} />
                Add {kindMeta[k].label.toLowerCase()}
              </button>
            ))}
          </div>
        </aside>

        {/* canvas */}
        <div className="flex min-h-0 items-center justify-center overflow-auto bg-ink-1000 p-5">
          <div
            className={cn(
              "relative overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[#0B0D14] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)] transition-all duration-300",
              viewport === "desktop" ? "aspect-video w-full max-w-3xl" : "aspect-[9/16] w-full max-w-[19rem]",
            )}
          >
            <MockApp highlight />
            <div className="absolute inset-0 bg-ink-1000/50" />

            {/* spotlight */}
            <div
              className="absolute rounded-lg ring-2 ring-cyan-400 shadow-[0_0_0_9999px_rgba(4,5,10,0.6)] transition-all duration-500"
              style={{
                left: `${step.target.x - step.target.w / 2}%`,
                top: `${step.target.y - step.target.h / 2}%`,
                width: `${step.target.w}%`,
                height: `${step.target.h}%`,
              }}
            />

            {/* tooltip */}
            <div
              className="absolute w-[58%] max-w-[18rem] rounded-xl border border-[var(--line-strong)] bg-ink-850 p-3.5 shadow-2xl transition-all duration-500"
              style={{
                left: `${Math.min(62, step.target.x)}%`,
                top: `${Math.min(64, step.target.y + step.target.h / 2 + 4)}%`,
              }}
            >
              <div className="flex items-center justify-between">
                <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.5625rem]", kindMeta[step.kind].tone)}>
                  <Icon name={kindMeta[step.kind].icon} className="size-2.5" strokeWidth={2.4} />
                  {kindMeta[step.kind].label}
                </span>
                <span className="font-mono text-[0.5625rem] text-fg-faint">
                  {selected + 1} / {steps.length}
                </span>
              </div>
              <p className="mt-2 text-[0.75rem] font-medium text-fg-strong">{step.title}</p>
              <p className="mt-1 line-clamp-3 text-[0.6875rem] leading-snug text-fg-muted">{step.tooltip}</p>

              {step.kind === "fork" ? (
                <div className="mt-2.5 space-y-1.5">
                  {["I run operations", "I'm in finance", "I'm evaluating for IT"].map((o) => (
                    <span key={o} className="block rounded-lg border border-[var(--line)] px-2 py-1.5 text-[0.625rem] text-fg">
                      {o}
                    </span>
                  ))}
                </div>
              ) : step.kind === "form" ? (
                <div className="mt-2.5 space-y-1.5">
                  <span className="block h-6 rounded-lg border border-[var(--line)] bg-ink-900" />
                  <span className="block rounded-lg bg-gradient-to-r from-iris-500 to-violet-500 px-2 py-1.5 text-center text-[0.625rem] font-medium text-white">
                    Continue the tour
                  </span>
                </div>
              ) : (
                <div className="mt-2.5 flex items-center gap-1.5">
                  <span className="rounded-md bg-gradient-to-r from-iris-500 to-violet-500 px-2 py-1 text-[0.625rem] font-medium text-white">
                    Next
                  </span>
                  <span className="rounded-md border border-[var(--line)] px-2 py-1 text-[0.625rem] text-fg-subtle">
                    Skip
                  </span>
                </div>
              )}
            </div>

            {/* progress rail */}
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-3 py-2.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={cn("h-1 flex-1 rounded-full transition-colors", i <= selected ? "bg-cyan-400" : "bg-white/15")}
                />
              ))}
            </div>
          </div>
        </div>

        {/* inspector */}
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-[var(--line)] bg-ink-950 lg:flex">
          <div className="space-y-5 p-4">
            <Group label="Step">
              <input
                key={step.id}
                defaultValue={step.title}
                className="h-9 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
              />
              <textarea
                key={`${step.id}-t`}
                defaultValue={step.tooltip}
                rows={3}
                className="mt-2 w-full resize-y rounded-xl border border-[var(--line)] bg-ink-900 px-3 py-2 text-[0.75rem] leading-relaxed text-fg focus:border-iris-500/50 focus:outline-none"
              />
            </Group>

            <Group label="Target">
              <Row label="Selector" value="button#new-shipment" mono />
              <Row label="Position" value={`${step.target.x}% / ${step.target.y}%`} mono />
              <Row label="Action" value={step.required ? "click required" : "any / skip"} />
              <Row label="Editable text" value="yes — fix a typo here" />
            </Group>

            <Group label="Behaviour">
              <Row label="Advance on" value="click target" />
              <Row label="Allow skip" value={step.required ? "no" : "yes"} />
              <Row label="Mobile position" value="auto (below target)" />
            </Group>

            <Group label="Analytics">
              <Row label="Reached" value="4,208 (68%)" mono />
              <Row label="Completed" value="3,910 (93%)" mono />
              <Row label="Median dwell" value="6.4s" mono />
              {selected === 1 ? (
                <div className="mt-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.07] p-3">
                  <p className="text-[0.75rem] text-fg">Branch split</p>
                  <div className="mt-2 space-y-1.5">
                    {[
                      { l: "Operations", v: 0.58 },
                      { l: "Finance", v: 0.27 },
                      { l: "IT", v: 0.15 },
                    ].map((b) => (
                      <div key={b.l} className="flex items-center gap-2">
                        <span className="w-16 text-[0.625rem] text-fg-subtle">{b.l}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
                          <span className="block h-full rounded-full bg-violet-500" style={{ width: `${b.v * 100}%` }} />
                        </span>
                        <span className="font-mono text-[0.5625rem] text-fg-faint">
                          {Math.round(b.v * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Group>

            <Group label="Embed">
              <pre className="overflow-x-auto rounded-xl border border-[var(--line)] bg-ink-900 p-2.5 font-mono text-[0.5625rem] leading-relaxed text-fg-muted">
{`<div data-demoriff="${project.id}"
     data-mode="interactive"></div>
<script src="https://embed.demoriff.com/v1.js"
        async></script>`}
              </pre>
              <p className="mt-2 text-2xs leading-snug text-fg-faint">
                34 KB async runtime. Text is server-rendered so search engines index it.
              </p>
            </Group>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">{label}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[0.75rem] text-fg-subtle">{label}</span>
      <span className={cn("truncate text-2xs text-fg-muted", mono && "font-mono")}>{value}</span>
    </div>
  );
}
