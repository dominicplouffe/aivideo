"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { MockApp } from "./MockApp";

/* ------------------------------------------------------------------
   The hero showpiece: a looping dramatisation of the pipeline.
   Six stages, each mutating the same canvas — raw take in, finished
   assets out. Everything is markup + CSS transitions; no video file,
   so it stays sharp and costs nothing to load.
   ------------------------------------------------------------------ */

type StageKey = "raw" | "analyze" | "cut" | "zoom" | "brand" | "ship";

interface Stage {
  key: StageKey;
  label: string;
  status: string;
  icon: IconName;
  ms: number;
}

const STAGES: Stage[] = [
  { key: "raw", label: "Raw take", status: "Recording imported · 4:12", icon: "record", ms: 2200 },
  { key: "analyze", label: "Analyzing", status: "Transcribing + detecting intent", icon: "brain", ms: 2000 },
  { key: "cut", label: "Cutting", status: "Removing fillers, silence, wrong turns", icon: "scissors", ms: 2600 },
  { key: "zoom", label: "Directing", status: "Keyframing zoom to each interaction", icon: "zoom", ms: 2600 },
  { key: "brand", label: "Voicing", status: "Studio voice + brand system applied", icon: "palette", ms: 2400 },
  { key: "ship", label: "Ready", status: "4 assets rendered from 1 recording", icon: "rocket", ms: 3400 },
];

/** Transcript with the words the pipeline removes marked up. */
const TRANSCRIPT: { text: string; cut?: boolean; em?: boolean }[] = [
  { text: "So" , cut: true }, { text: "um", cut: true }, { text: "yeah," , cut: true },
  { text: "let" }, { text: "me" }, { text: "show" }, { text: "you" }, { text: "how" },
  { text: "to" }, { text: "create" }, { text: "a" }, { text: "shipment." },
  { text: "You" }, { text: "just" , cut: true }, { text: "click" },
  { text: "New", em: true }, { text: "shipment", em: true },
  { text: "up" , cut: true }, { text: "here" , cut: true }, { text: "in" , cut: true }, { text: "the" , cut: true }, { text: "corner,", cut: true },
  { text: "and" }, { text: "uh", cut: true }, { text: "the" }, { text: "route" },
  { text: "gets" }, { text: "priced" }, { text: "instantly." },
];

const OUTPUTS = [
  { label: "Demo.mp4", meta: "4K · 1:48", icon: "play" as IconName, tone: "iris" },
  { label: "Interactive tour", meta: "9 steps", icon: "cursor" as IconName, tone: "cyan" },
  { label: "Step-by-step guide", meta: "11 screenshots", icon: "doc" as IconName, tone: "mint" },
  { label: "Social cuts", meta: "6 clips · 9:16", icon: "scissors" as IconName, tone: "amber" },
];

export function HeroCanvas() {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) {
      setIndex(STAGES.length - 1);
      return;
    }
    const stage = STAGES[index];
    timer.current = setTimeout(() => setIndex((i) => (i + 1) % STAGES.length), stage.ms);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, reduced]);

  const stage = STAGES[index];
  const at = (k: StageKey) => STAGES.findIndex((s) => s.key === k) <= index;

  const cutsApplied = at("cut");
  const zoomed = at("zoom") && !at("ship");
  const branded = at("brand");
  const shipped = at("ship");

  const waveform = useMemo(
    () =>
      Array.from({ length: 76 }, (_, i) => {
        const v = Math.abs(Math.sin(i * 0.63) * 0.55 + Math.sin(i * 1.71) * 0.3 + Math.sin(i * 0.21) * 0.25);
        return Math.max(0.12, Math.min(1, v));
      }),
    [],
  );
  // Regions that get removed on the "cut" stage.
  const deadZones = [[2, 8], [24, 30], [46, 52], [64, 69]];
  const isDead = (i: number) => deadZones.some(([a, b]) => i >= a && i <= b);

  return (
    <div className="relative">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-16 -top-24 -bottom-16 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 30%, color-mix(in oklab, var(--color-iris-500) 26%, transparent), transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative overflow-hidden rounded-[20px] border border-[var(--line-strong)] bg-ink-950 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
        {/* ---------- window chrome ---------- */}
        <div className="flex items-center gap-3 border-b border-[var(--line)] bg-ink-900/80 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#FF5F57]/70" />
            <span className="size-2.5 rounded-full bg-[#FEBC2E]/70" />
            <span className="size-2.5 rounded-full bg-[#28C840]/70" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate font-mono text-2xs text-fg-faint">
              demoriff.com/studio/shipment-walkthrough
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-2xs transition-colors duration-500",
                shipped
                  ? "border-mint-500/40 bg-mint-500/12 text-mint-400"
                  : "border-iris-500/40 bg-iris-500/12 text-iris-300",
              )}
            >
              <span className={cn("size-1.5 rounded-full bg-current", !shipped && "animate-pulse")} />
              {shipped ? "Complete" : "Processing"}
            </span>
          </div>
        </div>

        {/* ---------- body ---------- */}
        <div className="grid lg:grid-cols-[1fr_17.5rem]">
          {/* viewport */}
          <div className="relative">
            <div className="relative aspect-[16/10] overflow-hidden bg-[#0B0D14]">
              {/* the app being demoed */}
              <div
                className="absolute inset-0 origin-[72%_16%] transition-transform duration-[1400ms]"
                style={{
                  transform: zoomed ? "scale(1.45)" : "scale(1)",
                  transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <MockApp highlight={at("zoom")} />
              </div>

              {/* brand frame */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 transition-opacity duration-700"
                style={{ opacity: branded ? 1 : 0 }}
              >
                <div className="absolute inset-0 rounded-none ring-2 ring-inset ring-iris-500/30" />
                <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 backdrop-blur-sm">
                  <span className="size-3 rounded-[4px] bg-gradient-to-br from-iris-500 to-cyan-400" />
                  <span className="text-[0.5rem] font-semibold tracking-tight text-white/85">Meridian</span>
                </div>
              </div>

              {/* analysis scan */}
              {stage.key === "analyze" ? (
                <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                  <div
                    className="absolute inset-x-0 h-24"
                    style={{
                      background:
                        "linear-gradient(180deg, transparent, color-mix(in oklab, var(--color-cyan-400) 22%, transparent), transparent)",
                      animation: "dr-scan 2s cubic-bezier(0.4,0,0.2,1) infinite",
                    }}
                  />
                  <div className="absolute inset-0 grid-bg opacity-30" />
                </div>
              ) : null}

              {/* click reticle */}
              <div
                aria-hidden
                className="pointer-events-none absolute transition-opacity duration-500"
                style={{ left: "76%", top: "13%", opacity: at("zoom") && !shipped ? 1 : 0 }}
              >
                <span className="absolute -translate-x-1/2 -translate-y-1/2">
                  <span className="block size-10 rounded-full border border-cyan-400/60 animate-pulse-ring" />
                </span>
                <span className="absolute -translate-x-1/2 -translate-y-1/2">
                  <span className="block size-2.5 rounded-full bg-cyan-400 shadow-[0_0_14px_3px_rgba(34,211,238,0.6)]" />
                </span>
              </div>

              {/* caption bar */}
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 flex justify-center pb-3 transition-all duration-700",
                  branded ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
                )}
              >
                <span className="rounded-lg bg-black/65 px-3 py-1.5 text-[0.6875rem] font-medium text-white/92 backdrop-blur-sm">
                  Click <span className="text-cyan-300">New shipment</span> — the route prices instantly.
                </span>
              </div>

              {/* shipped overlay */}
              <div
                className={cn(
                  "absolute inset-0 flex items-center justify-center bg-ink-1000/82 backdrop-blur-[3px] transition-opacity duration-700",
                  shipped ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <div className="grid w-full max-w-sm grid-cols-2 gap-2 px-6">
                  {OUTPUTS.map((o, i) => (
                    <div
                      key={o.label}
                      className="surface-card flex items-center gap-2 rounded-xl px-2.5 py-2 transition-all duration-500"
                      style={{
                        transitionDelay: shipped ? `${140 + i * 110}ms` : "0ms",
                        opacity: shipped ? 1 : 0,
                        transform: shipped ? "none" : "translateY(10px)",
                      }}
                    >
                      <span
                        className={cn(
                          "inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink-850",
                          o.tone === "iris" && "text-iris-400",
                          o.tone === "cyan" && "text-cyan-400",
                          o.tone === "mint" && "text-mint-400",
                          o.tone === "amber" && "text-amber-400",
                        )}
                      >
                        <Icon name={o.icon} className="size-3.5" strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[0.6875rem] font-medium text-fg-strong">{o.label}</span>
                        <span className="block font-mono text-[0.5625rem] text-fg-faint">{o.meta}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ---------- timeline ---------- */}
            <div className="border-t border-[var(--line)] bg-ink-900/60 px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-2xs text-fg-faint">TIMELINE</span>
                <span className="font-mono text-2xs text-fg-faint tabular-nums">
                  {cutsApplied ? "01:48 / 01:48" : "04:12 / 04:12"}
                </span>
              </div>

              {/* waveform */}
              <div className="flex h-9 items-center gap-[2px]">
                {waveform.map((v, i) => {
                  const dead = isDead(i);
                  return (
                    <span
                      key={i}
                      className="flex-1 rounded-full transition-all duration-700"
                      style={{
                        height: `${(cutsApplied && dead ? 0.08 : v) * 100}%`,
                        background:
                          cutsApplied && dead
                            ? "color-mix(in oklab, var(--color-rose-500) 45%, transparent)"
                            : branded
                              ? "linear-gradient(180deg, var(--color-cyan-400), var(--color-iris-500))"
                              : "color-mix(in oklab, var(--color-fg) 22%, transparent)",
                        opacity: cutsApplied && dead ? 0.5 : 1,
                        transitionDelay: `${(i % 12) * 18}ms`,
                      }}
                    />
                  );
                })}
              </div>

              {/* keyframe track */}
              <div className="relative mt-2 h-6 rounded-md border border-[var(--line)] bg-ink-850">
                {[14, 38, 57, 79].map((left, i) => (
                  <span
                    key={left}
                    className="absolute top-1/2 -translate-y-1/2 transition-all duration-700"
                    style={{
                      left: `${left}%`,
                      opacity: at("zoom") ? 1 : 0,
                      transform: `translateY(-50%) scale(${at("zoom") ? 1 : 0.5})`,
                      transitionDelay: `${i * 90}ms`,
                    }}
                  >
                    <span className="flex items-center gap-1 rounded bg-cyan-500/18 px-1.5 py-0.5 font-mono text-[0.5rem] text-cyan-300 ring-1 ring-cyan-500/40">
                      <Icon name="zoom" className="size-2.5" strokeWidth={2} />
                      {(1.4 + i * 0.2).toFixed(1)}×
                    </span>
                  </span>
                ))}
                <span
                  className="absolute inset-y-0 w-px bg-iris-400 transition-all duration-1000"
                  style={{ left: shipped ? "100%" : `${18 + index * 15}%` }}
                />
              </div>
            </div>
          </div>

          {/* ---------- transcript panel ---------- */}
          <aside className="hidden flex-col border-l border-[var(--line)] bg-ink-900/40 lg:flex">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
              <span className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">Script</span>
              <span
                className={cn(
                  "font-mono text-2xs transition-colors duration-500",
                  cutsApplied ? "text-mint-400" : "text-fg-faint",
                )}
              >
                {cutsApplied ? "−31% words" : "verbatim"}
              </span>
            </div>

            <div className="flex-1 px-4 py-4">
              <p className="text-[0.8125rem] leading-[1.8]">
                {TRANSCRIPT.map((w, i) => (
                  <span
                    key={i}
                    className={cn(
                      "transition-all duration-500",
                      w.cut && cutsApplied && "text-fg-faint line-through decoration-rose-400/70",
                      w.cut && !cutsApplied && "rounded bg-rose-500/12 text-rose-300",
                      w.em && "font-medium text-cyan-300",
                      !w.cut && !w.em && "text-fg-muted",
                    )}
                    style={{
                      transitionDelay: `${(i % 10) * 30}ms`,
                      opacity: w.cut && cutsApplied ? 0.4 : 1,
                    }}
                  >
                    {w.text}{" "}
                  </span>
                ))}
              </p>

              <div
                className={cn(
                  "mt-5 space-y-2 transition-all duration-700",
                  branded ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                )}
              >
                <Row icon="mic" label="Voice" value="Avery — Warm US" />
                <Row icon="volume" label="Studio Sound" value="On · −18 LUFS" />
                <Row icon="globe" label="Languages" value="EN + 5 queued" />
                <Row icon="palette" label="Brand kit" value="Meridian / Primary" />
              </div>
            </div>

            {/* stage ticker */}
            <div className="border-t border-[var(--line)] px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-md",
                    shipped ? "bg-mint-500/15 text-mint-400" : "bg-iris-500/15 text-iris-300",
                  )}
                >
                  <Icon name={stage.icon} className="size-3.5" strokeWidth={1.9} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.6875rem] font-medium text-fg">{stage.label}</span>
                  <span className="block truncate font-mono text-[0.5625rem] text-fg-faint">{stage.status}</span>
                </span>
              </div>
              <div className="mt-2.5 flex gap-1">
                {STAGES.map((s, i) => (
                  <span
                    key={s.key}
                    className={cn(
                      "h-0.5 flex-1 rounded-full transition-colors duration-500",
                      i <= index ? "bg-iris-500" : "bg-[color-mix(in_oklab,var(--color-fg)_12%,transparent)]",
                    )}
                  />
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-ink-850/60 px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-[0.6875rem] text-fg-subtle">
        <Icon name={icon} className="size-3.5 text-iris-400" strokeWidth={1.8} />
        {label}
      </span>
      <span className="font-mono text-[0.5625rem] text-fg-muted">{value}</span>
    </div>
  );
}
