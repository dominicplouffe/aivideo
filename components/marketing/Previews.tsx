import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { MockApp } from "./MockApp";

/* ------------------------------------------------------------------
   Product preview panels. Each one is a static, markup-only rendition
   of a real surface in the app — shared between the home page, the
   product pages and the solution pages so the story stays consistent.
   ------------------------------------------------------------------ */

export function Chrome({
  label,
  right,
  children,
  className,
}: {
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-ink-950 shadow-[0_32px_90px_-34px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-ink-900/70 px-3.5 py-2">
        <span className="font-mono text-2xs text-fg-faint">{label}</span>
        {right ?? (
          <span className="flex gap-1">
            <span className="size-2 rounded-full bg-white/10" />
            <span className="size-2 rounded-full bg-white/10" />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------- video */

export function VideoPreview() {
  return (
    <Chrome label="DEMO.MP4 · 3840×2160">
      <div className="relative aspect-video bg-[#0B0D14]">
        <div className="absolute inset-0 origin-[72%_16%] scale-[1.4]">
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

/* ---------------------------------------------------------- interactive */

export function InteractivePreview() {
  return (
    <Chrome label="INTERACTIVE TOUR · STEP 3 OF 9">
      <div className="relative aspect-video bg-[#0B0D14]">
        <MockApp highlight />
        <div className="absolute inset-0 bg-ink-1000/45" />
        <div
          className="absolute rounded-lg ring-2 ring-cyan-400 shadow-[0_0_0_9999px_rgba(4,5,10,0.55)]"
          style={{ left: "70%", top: "9%", width: "16%", height: "9%" }}
        />
        <div
          className="absolute w-[46%] rounded-xl border border-[var(--line-strong)] bg-ink-850 p-3 shadow-2xl"
          style={{ left: "44%", top: "26%" }}
        >
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
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-3 py-2.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className={cn("h-1 flex-1 rounded-full", i < 3 ? "bg-cyan-400" : "bg-white/15")} />
          ))}
        </div>
      </div>
    </Chrome>
  );
}

/* ---------------------------------------------------------- guide */

export function GuidePreview() {
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

/* ---------------------------------------------------------- clips */

export function ClipsPreview() {
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
              <div className={cn("absolute inset-0 origin-center", i === 1 ? "scale-[2]" : "scale-[1.6]")}>
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

/* ---------------------------------------------------------- transcript editor */

export function TranscriptPreview() {
  const words = [
    { t: "So" , c: true }, { t: "um", c: true }, { t: "the" }, { t: "pricing" }, { t: "engine" },
    { t: "runs" }, { t: "on" }, { t: "every" }, { t: "keystroke," }, { t: "so" },
    { t: "you" }, { t: "see" }, { t: "the" }, { t: "rate" }, { t: "before" },
    { t: "you" }, { t: "actually" , c: true }, { t: "commit." },
  ];
  return (
    <Chrome
      label="STUDIO · SCRIPT"
      right={<span className="font-mono text-2xs text-mint-400">−31% words</span>}
    >
      <div className="aspect-video bg-ink-950 p-5">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[
            { l: "Remove fillers", on: true },
            { l: "Tighten", on: true },
            { l: "Formal tone", on: false },
            { l: "Shorten 20%", on: false },
          ].map((c) => (
            <span
              key={c.l}
              className={cn(
                "rounded-lg border px-2 py-1 text-[0.625rem]",
                c.on
                  ? "border-iris-500/45 bg-iris-500/12 text-iris-300"
                  : "border-[var(--line)] text-fg-subtle",
              )}
            >
              {c.l}
            </span>
          ))}
        </div>
        <p className="text-[0.875rem] leading-[1.9]">
          {words.map((w, i) => (
            <span
              key={i}
              className={cn(
                w.c ? "text-fg-faint line-through decoration-rose-400/70" : "text-fg",
              )}
            >
              {w.t}{" "}
            </span>
          ))}
          <span className="inline-block h-4 w-px translate-y-0.5 bg-iris-400 animate-caret" />
        </p>
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-ink-900 p-3">
          <div className="flex items-center gap-2">
            <Icon name="sparkles" className="size-3.5 text-iris-400" strokeWidth={1.8} />
            <span className="text-[0.6875rem] font-medium text-fg">Riff</span>
          </div>
          <p className="mt-1.5 text-[0.6875rem] leading-snug text-fg-subtle">
            Trimmed 31% of words, cut 4 dead-air regions totalling 38s, and keyframed 7 zooms.
            The intro now reaches the first click in 6 seconds instead of 41.
          </p>
        </div>
      </div>
    </Chrome>
  );
}

/* ---------------------------------------------------------- voices */

export function VoicePreview() {
  const voices = [
    { n: "Avery", d: "Warm · US · Narration", on: true },
    { n: "Rhys", d: "Crisp · UK · Technical" },
    { n: "Noor", d: "Bright · AU · Product" },
    { n: "Your voice", d: "Cloned · 0:31 sample", clone: true },
  ];
  return (
    <Chrome label="VOICE LIBRARY · 260 VOICES">
      <div className="aspect-video space-y-2 bg-ink-950 p-5">
        {voices.map((v) => (
          <div
            key={v.n}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-3 py-2.5",
              v.on ? "border-iris-500/45 bg-iris-500/10" : "border-[var(--line)]",
            )}
          >
            <span
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
                v.clone
                  ? "bg-[linear-gradient(135deg,var(--color-cyan-500),var(--color-mint-500))]"
                  : "bg-[linear-gradient(135deg,var(--color-iris-600),var(--color-violet-500))]",
              )}
            >
              <Icon name={v.clone ? "avatar" : "play"} className="size-3.5 text-white" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] font-medium text-fg-strong">{v.n}</span>
              <span className="block font-mono text-[0.5625rem] text-fg-faint">{v.d}</span>
            </span>
            <span className="flex h-6 items-end gap-[2px]">
              {[4, 9, 6, 12, 8, 14, 7, 10, 5].map((h, i) => (
                <span
                  key={i}
                  className={cn("w-[2px] rounded-full", v.on ? "bg-iris-400" : "bg-white/15")}
                  style={{ height: `${h}px` }}
                />
              ))}
            </span>
            {v.clone ? (
              <span className="rounded-md bg-mint-500/15 px-1.5 py-0.5 text-[0.5rem] text-mint-400">CONSENTED</span>
            ) : null}
          </div>
        ))}
      </div>
    </Chrome>
  );
}

/* ---------------------------------------------------------- avatars */

export function AvatarPreview() {
  return (
    <Chrome label="PRESENTERS · 180 LICENSED">
      <div className="relative aspect-video bg-[#0B0D14]">
        <div className="absolute inset-0 scale-[1.05]">
          <MockApp />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        {/* presenter bubble */}
        <div className="absolute bottom-4 left-4 size-24 overflow-hidden rounded-2xl border-2 border-white/15 bg-[linear-gradient(160deg,#2A2140,#131826)]">
          <div className="flex h-full flex-col items-center justify-end pb-1">
            <div className="size-10 rounded-full bg-[linear-gradient(140deg,#8B7355,#5C4A3A)]" />
            <div className="-mt-1 h-10 w-14 rounded-t-2xl bg-[linear-gradient(160deg,var(--color-iris-600),var(--color-iris-700))]" />
          </div>
          <span className="absolute top-1.5 left-1.5 rounded bg-black/55 px-1 py-0.5 text-[0.45rem] text-white/80">
            Maya · Explainer
          </span>
        </div>
        {/* gallery strip */}
        <div className="absolute right-4 bottom-4 flex gap-1.5">
          {["#8B7355", "#4A5568", "#6B4A5C", "#3A5A4A"].map((c, i) => (
            <span
              key={c}
              className={cn(
                "size-10 overflow-hidden rounded-xl border",
                i === 0 ? "border-cyan-400" : "border-white/10",
              )}
              style={{ background: `linear-gradient(150deg, ${c}, #131826)` }}
            />
          ))}
          <span className="inline-flex size-10 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-[0.5rem] text-white/60">
            +176
          </span>
        </div>
      </div>
    </Chrome>
  );
}

/* ---------------------------------------------------------- brand kit */

export function BrandPreview() {
  const swatches = ["#6E56F8", "#22D3EE", "#0B0D14", "#F5F7FF", "#34D399"];
  return (
    <Chrome label="BRAND KIT · MERIDIAN">
      <div className="aspect-video bg-ink-950 p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-iris-500">
            <span className="text-[0.75rem] font-bold text-white">M</span>
          </span>
          <div>
            <p className="text-[0.875rem] font-medium text-fg-strong">Meridian — Primary</p>
            <p className="font-mono text-[0.5625rem] text-fg-faint">Applied to 248 videos</p>
          </div>
          <span className="ml-auto rounded-md bg-mint-500/15 px-2 py-0.5 text-[0.5625rem] text-mint-400">
            Locked for team
          </span>
        </div>

        <div className="mt-4 flex gap-1.5">
          {swatches.map((s) => (
            <span key={s} className="flex-1">
              <span className="block h-8 rounded-lg border border-white/8" style={{ background: s }} />
              <span className="mt-1 block font-mono text-[0.45rem] text-fg-faint">{s}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { l: "Intro", v: "2.0s logo sting" },
            { l: "Lower third", v: "Slide + fade" },
            { l: "Cursor", v: "Iris glow, 1.6×" },
            { l: "Captions", v: "Inter Semibold" },
            { l: "Music bed", v: "Ambient · −26dB" },
            { l: "Outro CTA", v: "Book a demo" },
          ].map((r) => (
            <div key={r.l} className="rounded-lg border border-[var(--line)] px-2.5 py-2">
              <p className="text-[0.5625rem] text-fg-faint">{r.l}</p>
              <p className="mt-0.5 text-[0.625rem] text-fg">{r.v}</p>
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
}

/* ---------------------------------------------------------- localization */

export function LocalizationPreview() {
  const langs = [
    { l: "Spanish", s: "Published", tone: "mint" },
    { l: "German", s: "Published", tone: "mint" },
    { l: "Japanese", s: "Rendering 68%", tone: "iris" },
    { l: "Portuguese (BR)", s: "Published", tone: "mint" },
    { l: "French", s: "Queued", tone: "neutral" },
    { l: "Korean", s: "Queued", tone: "neutral" },
  ];
  return (
    <Chrome label="LOCALIZATION · 34 LANGUAGES">
      <div className="aspect-video bg-ink-950 p-5">
        <div className="flex items-center justify-between">
          <p className="text-[0.8125rem] font-medium text-fg-strong">Create a shipment · 1:48</p>
          <span className="font-mono text-[0.5625rem] text-fg-faint">6 selected</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {langs.map((x) => (
            <div key={x.l} className="flex items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2">
              <Icon name="globe" className="size-3.5 text-fg-faint" strokeWidth={1.8} />
              <span className="flex-1 text-[0.75rem] text-fg">{x.l}</span>
              <span className="flex items-center gap-1.5">
                <Icon name="mic" className="size-3 text-fg-faint" strokeWidth={1.8} />
                <span className="font-mono text-[0.5rem] text-fg-faint">lip-sync</span>
              </span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-mono text-[0.5rem]",
                  x.tone === "mint" && "bg-mint-500/15 text-mint-400",
                  x.tone === "iris" && "bg-iris-500/15 text-iris-300",
                  x.tone === "neutral" && "bg-white/6 text-fg-faint",
                )}
              >
                {x.s}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
}

/* ---------------------------------------------------------- analytics */

export function AnalyticsPreview() {
  const retention = [100, 98, 96, 95, 93, 90, 88, 86, 72, 70, 68, 66, 64, 62, 58, 55, 52, 50, 48, 46, 44, 42, 40, 39];
  return (
    <Chrome label="ANALYTICS · CREATE A SHIPMENT">
      <div className="aspect-video bg-ink-950 p-5">
        <div className="grid grid-cols-4 gap-2">
          {[
            { l: "Views", v: "8,412" },
            { l: "Avg. watched", v: "71%" },
            { l: "CTA clicks", v: "1,033" },
            { l: "Conversion", v: "12.3%" },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-[var(--line)] px-2.5 py-2">
              <p className="text-[0.5625rem] text-fg-faint">{k.l}</p>
              <p className="mt-0.5 text-[0.875rem] font-semibold text-fg-strong">{k.v}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-[var(--line)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.625rem] text-fg-subtle">Retention curve</span>
            <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[0.5rem] text-rose-400">
              −16% drop at 0:34
            </span>
          </div>
          <div className="flex h-16 items-end gap-[3px]">
            {retention.map((v, i) => (
              <span
                key={i}
                className={cn("flex-1 rounded-t-[2px]", i === 8 ? "bg-rose-500/70" : "bg-iris-500/55")}
                style={{ height: `${v}%` }}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-ink-900 px-3 py-2">
          <Icon name="sparkles" className="size-3.5 shrink-0 text-iris-400" strokeWidth={1.8} />
          <p className="text-[0.625rem] leading-snug text-fg-subtle">
            Viewers drop when pricing config starts. Suggested: move the outcome ahead of the setup.
          </p>
        </div>
      </div>
    </Chrome>
  );
}

/* ---------------------------------------------------------- recorder */

export function RecorderPreview() {
  return (
    <Chrome label="RECORDER">
      <div className="relative aspect-video bg-[#0B0D14]">
        <MockApp />
        <div className="absolute inset-0 ring-2 ring-inset ring-rose-500/40" />
        <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/65 px-2.5 py-1 backdrop-blur">
          <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
          <span className="font-mono text-[0.5625rem] text-white/85">REC 02:41 · 4K60</span>
        </div>
        <div className="absolute right-3 bottom-3 size-16 overflow-hidden rounded-full border-2 border-white/15 bg-gradient-to-br from-ink-700 to-ink-850">
          <div className="flex h-full items-center justify-center">
            <Icon name="avatar" className="size-7 text-fg-faint" strokeWidth={1.4} />
          </div>
        </div>
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5">
          {[
            { i: "mic" as IconName, on: true },
            { i: "volume" as IconName, on: true },
            { i: "avatar" as IconName, on: true },
            { i: "pause" as IconName, on: false },
          ].map((b, n) => (
            <span
              key={n}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-lg border backdrop-blur",
                b.on ? "border-white/15 bg-white/10 text-white/85" : "border-white/8 bg-black/40 text-white/40",
              )}
            >
              <Icon name={b.i} className="size-3.5" strokeWidth={1.9} />
            </span>
          ))}
        </div>
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
          <span className="rounded-lg border border-cyan-500/35 bg-black/65 px-3 py-1.5 font-mono text-[0.5625rem] text-cyan-300 backdrop-blur">
            captured: click → #new-shipment · 00:02:38.412
          </span>
        </div>
      </div>
    </Chrome>
  );
}

/* ---------------------------------------------------------- agent */

export function AgentPreview() {
  const lines = [
    { r: "you", t: "Make a 90-second demo of the new rate-shopping feature for logistics buyers." },
    { r: "agent", t: "Reading your changelog and the Linear issue. Drafting a 5-beat outline…" },
    { r: "agent", t: "Recording against staging.meridian.app with the demo tenant. 11 interactions captured." },
    { r: "agent", t: "Cut to 1:34, 7 zooms, Avery voice, Meridian brand kit. Ready for review." },
  ];
  return (
    <Chrome label="RIFF AGENT">
      <div className="aspect-video space-y-2 overflow-hidden bg-ink-950 p-5">
        {lines.map((l, i) => (
          <div key={i} className={cn("flex gap-2.5", l.r === "you" && "justify-end")}>
            {l.r === "agent" ? (
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--color-iris-500),var(--color-violet-500))]">
                <Icon name="sparkles" className="size-3 text-white" strokeWidth={2} />
              </span>
            ) : null}
            <span
              className={cn(
                "max-w-[80%] rounded-xl px-3 py-2 text-[0.6875rem] leading-snug",
                l.r === "you"
                  ? "bg-ink-750 text-fg"
                  : "border border-[var(--line)] bg-ink-900 text-fg-muted",
              )}
            >
              {l.t}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-xl border border-mint-500/35 bg-mint-500/8 px-3 py-2">
          <Icon name="check" className="size-3.5 text-mint-400" strokeWidth={2.4} />
          <span className="text-[0.6875rem] text-fg">rate-shopping-demo.mp4 · 1:34 · awaiting your review</span>
        </div>
      </div>
    </Chrome>
  );
}

/* ---------------------------------------------------------- import */

export function ImportPreview() {
  const files = [
    { n: "Q3 all-hands product segment.mp4", s: "412 MB · 18:04", st: "Re-cut to 3:20", tone: "mint" },
    { n: "Loom — onboarding walkthrough", s: "Imported from Loom", st: "Processing", tone: "iris" },
    { n: "Gong call — discovery call", s: "Zoom cloud", st: "Queued", tone: "neutral" },
  ];
  return (
    <Chrome label="IMPORT">
      <div className="aspect-video bg-ink-950 p-5">
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-6 text-center">
          <Icon name="upload" className="mx-auto size-6 text-iris-400" strokeWidth={1.6} />
          <p className="mt-2 text-[0.75rem] text-fg">Drop video files, or paste a Loom / Zoom / Drive link</p>
          <p className="mt-1 font-mono text-[0.5625rem] text-fg-faint">MP4 · MOV · WEBM · MKV · up to 12 GB</p>
        </div>
        <div className="mt-3 space-y-1.5">
          {files.map((f) => (
            <div key={f.n} className="flex items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2">
              <Icon name="play" className="size-3 text-fg-faint" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.6875rem] text-fg">{f.n}</span>
                <span className="block font-mono text-[0.5rem] text-fg-faint">{f.s}</span>
              </span>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-mono text-[0.5rem]",
                  f.tone === "mint" && "bg-mint-500/15 text-mint-400",
                  f.tone === "iris" && "bg-iris-500/15 text-iris-300",
                  f.tone === "neutral" && "bg-white/6 text-fg-faint",
                )}
              >
                {f.st}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
}

export const previewMap = {
  video: VideoPreview,
  interactive: InteractivePreview,
  guide: GuidePreview,
  clips: ClipsPreview,
  transcript: TranscriptPreview,
  voice: VoicePreview,
  avatar: AvatarPreview,
  brand: BrandPreview,
  localization: LocalizationPreview,
  analytics: AnalyticsPreview,
  recorder: RecorderPreview,
  agent: AgentPreview,
  import: ImportPreview,
} as const;

export type PreviewKey = keyof typeof previewMap;

export function Preview({ name }: { name: PreviewKey }) {
  const C = previewMap[name];
  return <C />;
}
