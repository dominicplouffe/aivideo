"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Panel } from "./Shared";
import { MockApp } from "@/components/marketing/MockApp";
import { localeMatrix, type Project } from "@/lib/app-data";

interface Step {
  n: number;
  title: string;
  body: string;
  action?: string;
  zoom?: { scale: number; x: number; y: number };
  gif?: boolean;
  masked?: number;
}

function toSteps(project: Project): Step[] {
  return project.segments.map((s, i) => ({
    n: i + 1,
    title: s.title,
    body: s.words
      .filter((w) => !w.cut)
      .map((w) => w.w)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
    action: s.action,
    zoom: s.zoom,
    gif: Boolean(s.action?.startsWith("click")),
    masked: i === 1 ? 3 : i === 4 ? 1 : 0,
  }));
}

const blocks: { id: string; label: string; icon: IconName }[] = [
  { id: "text", label: "Text", icon: "doc" },
  { id: "callout", label: "Callout", icon: "info" },
  { id: "table", label: "Table", icon: "grid" },
  { id: "code", label: "Code", icon: "code" },
  { id: "screenshot", label: "Screenshot", icon: "frame" },
  { id: "video", label: "Video", icon: "play" },
];

export function GuideEditor({ project }: { project: Project }) {
  const steps = toSteps(project);
  const [selected, setSelected] = useState(0);
  const [locale, setLocale] = useState("en-US");
  const [showVideo, setShowVideo] = useState(true);

  const step = steps[selected];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line)] bg-ink-950 px-4 py-2.5">
        <Link
          href="/app/guides"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-ink-850 hover:text-fg"
          aria-label="Back to guides"
        >
          <Icon name="chevronLeft" className="size-4" strokeWidth={2.2} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[0.9375rem] font-medium text-fg-strong">{project.title}</h1>
          <p className="text-2xs text-fg-faint">
            {steps.length} steps · {project.locales.length || 1} languages · unmetered
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            aria-label="Language"
            className="h-9 rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
          >
            {localeMatrix.slice(0, 6).map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <Button variant="outline" size="sm">
            <Icon name="external" className="size-4" strokeWidth={1.8} />
            <span className="hidden sm:inline">Publish to Zendesk</span>
          </Button>
          <Button size="sm">
            <Icon name="rocket" className="size-4" strokeWidth={1.9} />
            Publish
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[15rem_1fr_18rem]">
        {/* step rail */}
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-ink-950 lg:flex">
          <p className="px-4 pt-4 pb-2 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
            Steps
          </p>
          <ol className="flex flex-col gap-0.5 px-2 pb-4">
            {steps.map((s, i) => (
              <li key={s.n}>
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selected === i ? "bg-iris-500/14 text-fg-strong" : "text-fg-subtle hover:bg-ink-900 hover:text-fg",
                  )}
                >
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-ink-850 font-mono text-2xs">
                    {s.n}
                  </span>
                  <span className="min-w-0 text-[0.75rem] leading-snug">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-auto border-t border-[var(--line)] p-3">
            <Button variant="outline" size="sm" className="w-full">
              <Icon name="plus" className="size-3.5" strokeWidth={2.2} />
              Add step
            </Button>
          </div>
        </aside>

        {/* article */}
        <div className="min-h-0 overflow-y-auto bg-ink-1000">
          <div className="mx-auto max-w-2xl px-5 py-8 md:px-8">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-mint-500/15 px-1.5 py-0.5 font-mono text-2xs text-mint-400">
                PUBLISHED
              </span>
              <span className="font-mono text-2xs text-fg-faint">{locale}</span>
            </div>
            <h2 className="mt-3 text-[1.625rem] leading-tight tracking-[-0.025em]">
              How to {project.title.toLowerCase().replace(/^.*— /, "")}
            </h2>
            <p className="mt-2 text-[0.8125rem] text-fg-faint">
              Updated today · {steps.length} steps · about {Math.max(1, Math.round(steps.length * 0.45))} min read
            </p>

            {showVideo ? (
              <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)] bg-[#0B0D14]">
                <div className="relative aspect-video">
                  <div className="absolute inset-0 origin-[72%_16%] scale-[1.2]">
                    <MockApp highlight />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <span className="inline-flex size-12 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                      <Icon name="play" className="size-4 text-white/90" />
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-8 space-y-8">
              {steps.map((s, i) => (
                <section
                  key={s.n}
                  onClick={() => setSelected(i)}
                  className={cn(
                    "cursor-pointer rounded-xl border p-4 transition-colors",
                    selected === i ? "border-iris-500/40 bg-iris-500/[0.05]" : "border-transparent hover:border-[var(--line)]",
                  )}
                >
                  <div className="flex gap-3.5">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-iris-500/16 font-mono text-[0.75rem] text-iris-300">
                      {s.n}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[1rem] font-medium text-fg-strong">{s.title}</h3>
                      <p className="mt-2 text-[0.875rem] leading-[1.75] text-fg-muted">{s.body}</p>

                      {s.action ? (
                        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--line)] bg-[#0B0D14]">
                          <div className="relative aspect-[16/9]">
                            <div
                              className="absolute inset-0"
                              style={{
                                transform: `scale(${s.zoom?.scale ?? 1})`,
                                transformOrigin: `${s.zoom?.x ?? 50}% ${s.zoom?.y ?? 50}%`,
                              }}
                            >
                              <MockApp highlight={Boolean(s.zoom && s.zoom.scale > 1.6)} />
                            </div>
                            {s.zoom ? (
                              <span
                                className="absolute"
                                style={{ left: `${s.zoom.x}%`, top: `${s.zoom.y}%` }}
                              >
                                <span className="absolute -translate-x-1/2 -translate-y-1/2">
                                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-iris-500 font-mono text-[0.5625rem] font-bold text-white ring-2 ring-white/25">
                                    {s.n}
                                  </span>
                                </span>
                              </span>
                            ) : null}
                            <span className="absolute right-2 bottom-2 flex gap-1.5">
                              {s.gif ? (
                                <span className="rounded bg-black/65 px-1.5 py-0.5 font-mono text-[0.5rem] text-white/80">
                                  GIF
                                </span>
                              ) : null}
                              {s.masked ? (
                                <span className="inline-flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[0.5rem] text-mint-400">
                                  <Icon name="shield" className="size-2" strokeWidth={3} />
                                  {s.masked} masked
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {s.action ? (
                        <p className="mt-2 font-mono text-2xs text-fg-faint">{s.action}</p>
                      ) : null}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>

        {/* inspector */}
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-[var(--line)] bg-ink-950 lg:flex">
          <div className="space-y-5 p-4">
            <div>
              <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                Step {step.n}
              </p>
              <input
                defaultValue={step.title}
                key={step.n}
                className="h-9 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
              />
            </div>

            <div>
              <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                Insert block
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {blocks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="flex flex-col items-center gap-1 rounded-lg border border-[var(--line)] py-2 text-2xs text-fg-subtle transition-colors hover:border-[var(--line-strong)] hover:text-fg"
                  >
                    <Icon name={b.icon} className="size-3.5" strokeWidth={1.9} />
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                Screenshot
              </p>
              <div className="space-y-1.5">
                <Row label="Crop" value={step.zoom ? `${step.zoom.scale.toFixed(1)}× at ${step.zoom.x}%` : "full frame"} />
                <Row label="Annotation" value={`Numbered marker ${step.n}`} />
                <Row label="Animated" value={step.gif ? "GIF, 1.2 MB" : "static PNG"} />
                <Row label="Masked values" value={step.masked ? `${step.masked} detected` : "none"} />
              </div>
              <Button variant="outline" size="sm" className="mt-3 w-full">
                <Icon name="refresh" className="size-3.5" strokeWidth={1.9} />
                Re-capture this step
              </Button>
            </div>

            <div>
              <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                Article
              </p>
              <button
                type="button"
                onClick={() => setShowVideo((v) => !v)}
                className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-ink-900"
              >
                <span className="flex-1 text-[0.8125rem] text-fg">Video at the top</span>
                <span className={cn("relative h-5 w-9 rounded-full transition-colors", showVideo ? "bg-iris-500" : "bg-ink-700")}>
                  <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-transform", showVideo ? "translate-x-4.5" : "translate-x-0.5")} />
                </span>
              </button>
            </div>

            <div>
              <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                Destinations
              </p>
              <ul className="space-y-1.5">
                {[
                  { n: "Zendesk", s: "synced 3h ago" },
                  { n: "Notion", s: "synced 3h ago" },
                  { n: "Help center", s: "live" },
                  { n: "Markdown export", s: "available" },
                ].map((d) => (
                  <li key={d.n} className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-2.5 py-2">
                    <Icon name="check" className="size-3 shrink-0 text-mint-400" strokeWidth={3} />
                    <span className="min-w-0 flex-1 truncate text-[0.75rem] text-fg">{d.n}</span>
                    <span className="shrink-0 font-mono text-[0.5625rem] text-fg-faint">{d.s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[0.75rem] text-fg-subtle">{label}</span>
      <span className="truncate font-mono text-2xs text-fg-muted">{value}</span>
    </div>
  );
}
