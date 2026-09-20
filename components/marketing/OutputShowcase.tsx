"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { outputs } from "@/lib/marketing-data";
import { Icon } from "@/components/ui/Icon";
import { MockApp } from "./MockApp";

export function OutputShowcase() {
  const [active, setActive] = useState(0);
  const out = outputs[active];

  return (
    <div>
      {/* tabs */}
      <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:justify-center md:px-0">
        {outputs.map((o, i) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setActive(i)}
            aria-current={i === active}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-[0.875rem] font-medium transition-all duration-250",
              i === active
                ? "border-iris-500/45 bg-iris-500/12 text-fg-strong"
                : "border-[var(--line)] text-fg-subtle hover:border-[var(--line-strong)] hover:text-fg",
            )}
          >
            <Icon name={o.icon} className={cn("size-4", i === active && "text-iris-300")} strokeWidth={1.8} />
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-center lg:gap-16">
        <div key={out.key} className="animate-reveal">
          <h3 className="text-[1.5rem] leading-tight md:text-[2rem]">{out.title}</h3>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-fg-muted">{out.body}</p>

          <div className="mt-7 grid grid-cols-3 gap-4 border-t border-[var(--line)] pt-6">
            {out.stats.map((s) => (
              <div key={s.label}>
                <div className="text-[1.25rem] leading-none font-semibold tracking-[-0.02em] text-fg-strong">
                  {s.value}
                </div>
                <div className="mt-1.5 text-[0.75rem] leading-snug text-fg-subtle">{s.label}</div>
              </div>
            ))}
          </div>

          <Link
            href={out.href}
            className="group mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-iris-300 hover:text-iris-400"
          >
            Explore {out.label.toLowerCase()}
            <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.9} />
          </Link>
        </div>

        <div className="relative">
          <div className="overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-ink-950 shadow-[0_32px_90px_-34px_rgba(0,0,0,0.9)]">
            {out.key === "video" ? <VideoPreview /> : null}
            {out.key === "interactive" ? <InteractivePreview /> : null}
            {out.key === "guide" ? <GuidePreview /> : null}
            {out.key === "clips" ? <ClipsPreview /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- previews */

function Chrome({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-ink-900/70 px-3.5 py-2">
        <span className="font-mono text-2xs text-fg-faint">{label}</span>
        <span className="flex gap-1">
          <span className="size-2 rounded-full bg-white/10" />
          <span className="size-2 rounded-full bg-white/10" />
        </span>
      </div>
      {children}
    </>
  );
}

function VideoPreview() {
  return (
    <Chrome label="DEMO.MP4 · 3840×2160">
      <div className="relative aspect-video bg-[#0B0D14]">
        <div className="absolute inset-0 origin-[76%_13%] scale-[1.45]">
          <MockApp highlight />
        </div>
        <div className="absolute inset-0 ring-2 ring-inset ring-iris-500/25" />
        <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 backdrop-blur-sm">
          <span className="size-3 rounded-[4px] bg-gradient-to-br from-iris-500 to-cyan-400" />
          <span className="text-[0.5rem] font-semibold text-white/85">Meridian</span>
        </div>
        <div className="absolute inset-x-0 bottom-9 flex justify-center">
          <span className="rounded-lg bg-black/65 px-3 py-1.5 text-[0.6875rem] font-medium text-white/92 backdrop-blur-sm">
            The route prices <span className="text-cyan-300">instantly</span>.
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-gradient-to-t from-black/80 to-transparent px-3 pt-6 pb-2.5">
          <Icon name="play" className="size-3.5 text-white/85" />
          <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/18">
            <div className="h-full w-[38%] rounded-full bg-gradient-to-r from-iris-400 to-cyan-400" />
          </div>
          <span className="font-mono text-[0.5625rem] text-white/65">0:41 / 1:48</span>
        </div>
      </div>
    </Chrome>
  );
}

function InteractivePreview() {
  return (
    <Chrome label="INTERACTIVE TOUR · STEP 3 OF 9">
      <div className="relative aspect-video bg-[#0B0D14]">
        <MockApp highlight />
        <div className="absolute inset-0 bg-ink-1000/45" />
        {/* spotlight */}
        <div
          className="absolute rounded-lg ring-2 ring-cyan-400 shadow-[0_0_0_9999px_rgba(4,5,10,0.55)]"
          style={{ left: "70%", top: "9%", width: "16%", height: "9%" }}
        />
        {/* tooltip */}
        <div className="absolute w-[46%] rounded-xl border border-[var(--line-strong)] bg-ink-850 p-3 shadow-2xl" style={{ left: "44%", top: "26%" }}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[0.5rem] tracking-wider text-cyan-300 uppercase">Step 3</span>
            <span className="font-mono text-[0.5rem] text-fg-faint">3 / 9</span>
          </div>
          <p className="mt-1.5 text-[0.6875rem] leading-snug text-fg">
            Click <span className="font-medium text-fg-strong">New shipment</span> to open the booking panel.
          </p>
          <div className="mt-2.5 flex items-center gap-1.5">
            <span className="rounded-md bg-gradient-to-r from-iris-500 to-violet-500 px-2 py-1 text-[0.5625rem] font-medium text-white">
              Next
            </span>
            <span className="rounded-md border border-[var(--line)] px-2 py-1 text-[0.5625rem] text-fg-subtle">Skip</span>
          </div>
        </div>
        {/* step rail */}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-3 py-2.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full", i < 3 ? "bg-cyan-400" : "bg-white/15")} />
          ))}
        </div>
      </div>
    </Chrome>
  );
}

function GuidePreview() {
  const steps = [
    { n: 1, t: "Open the Shipments workspace", d: "From the left navigation, select Shipments." },
    { n: 2, t: "Start a new shipment", d: "Click New shipment in the top-right corner." },
    { n: 3, t: "Choose origin and destination", d: "Search by port code or city name." },
  ];
  return (
    <Chrome label="GUIDE · MARKDOWN + SCREENSHOTS">
      <div className="aspect-video overflow-hidden bg-ink-950 p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-mint-500/15 px-1.5 py-0.5 font-mono text-[0.5rem] text-mint-400">PUBLISHED</span>
          <span className="font-mono text-[0.5rem] text-fg-faint">6 languages</span>
        </div>
        <h4 className="mt-2 text-[0.9375rem] leading-tight font-semibold text-fg-strong">
          How to create a shipment
        </h4>
        <p className="mt-1 text-[0.625rem] text-fg-faint">Updated today · 11 steps · 2 min read</p>
        <div className="mt-3 space-y-2.5">
          {steps.map((s) => (
            <div key={s.n} className="flex gap-2.5">
              <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-iris-500/18 font-mono text-[0.5rem] text-iris-300">
                {s.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.6875rem] font-medium text-fg">{s.t}</p>
                <p className="mt-0.5 text-[0.5625rem] leading-snug text-fg-subtle">{s.d}</p>
                {s.n === 2 ? (
                  <div className="mt-1.5 h-12 overflow-hidden rounded border border-[var(--line)] bg-[#0B0D14]">
                    <div className="origin-top-right scale-[1.1]">
                      <MockApp highlight />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
}

function ClipsPreview() {
  const clips = [
    { t: "The 4-second hook", d: "0:06" },
    { t: "Pricing, explained", d: "0:22" },
    { t: "Before / after", d: "0:14" },
  ];
  return (
    <Chrome label="SOCIAL CUTS · 9:16">
      <div className="grid aspect-video grid-cols-3 gap-2.5 bg-ink-950 p-4">
        {clips.map((c, i) => (
          <div key={c.t} className="flex flex-col overflow-hidden rounded-lg border border-[var(--line)] bg-[#0B0D14]">
            <div className="relative flex-1 overflow-hidden">
              <div className={cn("absolute inset-0 origin-center", i === 1 ? "scale-[2.2]" : "scale-[1.7]")}>
                <MockApp highlight={i === 1} />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-1.5">
                <span className="block rounded bg-black/70 px-1 py-0.5 text-center text-[0.45rem] leading-tight font-semibold text-white">
                  {c.t.toUpperCase()}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between px-1.5 py-1">
              <span className="font-mono text-[0.45rem] text-fg-faint">{c.d}</span>
              <Icon name="download" className="size-2.5 text-fg-faint" strokeWidth={2} />
            </div>
          </div>
        ))}
      </div>
    </Chrome>
  );
}
