"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { pipeline } from "@/lib/marketing-data";
import { Icon } from "@/components/ui/Icon";
import { MockApp } from "./MockApp";

const AUTO_MS = 7000;

export function Pipeline() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const raf = useRef<number | null>(null);
  const start = useRef<number>(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (paused) return;
    start.current = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start.current) / AUTO_MS);
      setProgress(p);
      if (p >= 1) {
        setActive((a) => (a + 1) % pipeline.length);
        start.current = t;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [paused, active]);

  const step = pipeline[active];

  return (
    <div
      className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-14"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* steps */}
      <div className="flex flex-col gap-2">
        {pipeline.map((s, i) => {
          const isActive = i === active;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setActive(i);
                setProgress(0);
                start.current = performance.now();
              }}
              aria-current={isActive}
              className={cn(
                "group relative overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300",
                isActive
                  ? "border-[var(--line-strong)] bg-[color-mix(in_oklab,var(--color-fg)_5%,transparent)]"
                  : "border-transparent hover:bg-[color-mix(in_oklab,var(--color-fg)_3%,transparent)]",
              )}
            >
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors duration-300",
                    isActive
                      ? "border-iris-500/45 bg-iris-500/12 text-iris-300"
                      : "border-[var(--line)] bg-ink-850 text-fg-faint",
                  )}
                >
                  <Icon name={s.icon} className="size-4" strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xs tracking-[0.14em] text-fg-faint">{s.index}</span>
                    <span className="font-mono text-2xs tracking-[0.14em] text-iris-300 uppercase">{s.kicker}</span>
                  </div>
                  <h3
                    className={cn(
                      "mt-1.5 text-[1.0625rem] leading-snug transition-colors",
                      isActive ? "text-fg-strong" : "text-fg-muted",
                    )}
                  >
                    {s.title}
                  </h3>
                  <div
                    className={cn(
                      "grid transition-all duration-400",
                      isActive ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="text-[0.875rem] leading-relaxed text-fg-subtle">{s.body}</p>
                      <ul className="mt-3 flex flex-col gap-1.5">
                        {s.bullets.map((b) => (
                          <li key={b} className="flex items-start gap-2 text-[0.8125rem] text-fg-subtle">
                            <Icon name="check" className="mt-0.5 size-3.5 shrink-0 text-mint-400" strokeWidth={2.2} />
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              {isActive ? (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-0 h-[2px] bg-[linear-gradient(90deg,var(--color-iris-500),var(--color-cyan-400))]"
                  style={{ width: `${progress * 100}%` }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* visual */}
      <div className="relative">
        <div className="sticky top-24 overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-ink-950 shadow-[0_32px_90px_-32px_rgba(0,0,0,0.85)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] bg-ink-900/70 px-4 py-2.5">
            <span className="font-mono text-2xs text-fg-faint">
              {step.key === "record" ? "RECORDER" : step.key === "riff" ? "STUDIO" : "PUBLISH"}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-2xs text-fg-faint">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  step.key === "record" ? "bg-rose-400 animate-pulse" : "bg-mint-400",
                )}
              />
              {step.key === "record" ? "REC 02:41" : step.key === "riff" ? "EDIT" : "LIVE"}
            </span>
          </div>

          <div className="relative aspect-[16/10] bg-[#0B0D14]">
            <div
              className="absolute inset-0 origin-[72%_16%] transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ transform: step.key === "riff" ? "scale(1.4)" : "scale(1)" }}
            >
              <MockApp highlight={step.key === "riff"} />
            </div>

            {/* record overlay */}
            {step.key === "record" ? (
              <>
                <div className="absolute inset-0 ring-2 ring-inset ring-rose-500/40" />
                <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur">
                  <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="font-mono text-[0.625rem] text-white/85">Capturing clicks + audio</span>
                </div>
                <div className="absolute right-4 bottom-4 size-16 overflow-hidden rounded-full border-2 border-white/15 bg-gradient-to-br from-ink-700 to-ink-850">
                  <div className="flex h-full items-center justify-center">
                    <Icon name="avatar" className="size-7 text-fg-faint" strokeWidth={1.4} />
                  </div>
                </div>
              </>
            ) : null}

            {/* riff overlay */}
            {step.key === "riff" ? (
              <>
                <div className="absolute" style={{ left: "76%", top: "13%" }}>
                  <span className="absolute -translate-x-1/2 -translate-y-1/2">
                    <span className="block size-10 rounded-full border border-cyan-400/60 animate-pulse-ring" />
                  </span>
                  <span className="absolute -translate-x-1/2 -translate-y-1/2 block size-2.5 rounded-full bg-cyan-400 shadow-[0_0_14px_3px_rgba(34,211,238,0.6)]" />
                </div>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-black/65 px-3 py-1.5 text-[0.6875rem] text-white/90 backdrop-blur-sm">
                  Click <span className="text-cyan-300">New shipment</span> — the route prices instantly.
                </div>
              </>
            ) : null}

            {/* ship overlay */}
            {step.key === "ship" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-ink-1000/85 backdrop-blur-[3px]">
                <div className="w-full max-w-xs space-y-2 px-6">
                  {[
                    { l: "Landing page hero", m: "demoriff.com/d/meridian", i: "play" },
                    { l: "Interactive tour", m: "Embedded · 9 steps", i: "cursor" },
                    { l: "Help center article", m: "Published to Zendesk", i: "doc" },
                    { l: "6 vertical clips", m: "Queued to LinkedIn", i: "scissors" },
                  ].map((o, i) => (
                    <div
                      key={o.l}
                      className="surface-card flex items-center gap-2.5 rounded-xl px-3 py-2 animate-reveal"
                      style={{ animationDelay: `${i * 110}ms` }}
                    >
                      <Icon name={o.i as "play"} className="size-4 text-iris-400" strokeWidth={1.8} />
                      <span className="min-w-0">
                        <span className="block truncate text-[0.75rem] font-medium text-fg-strong">{o.l}</span>
                        <span className="block truncate font-mono text-[0.5625rem] text-fg-faint">{o.m}</span>
                      </span>
                      <Icon name="check" className="ml-auto size-3.5 text-mint-400" strokeWidth={2.4} />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
