"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { brandKits, voices, localeMatrix, type Project, type Segment } from "@/lib/app-data";
import type { EditState } from "./types";

type Tab = "scene" | "audio" | "brand" | "output" | "riff";

const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: "scene", label: "Scene", icon: "frame" },
  { id: "audio", label: "Audio", icon: "volume" },
  { id: "brand", label: "Brand", icon: "palette" },
  { id: "output", label: "Output", icon: "layers" },
  { id: "riff", label: "Riff", icon: "sparkles" },
];

export function Inspector({
  project,
  segment,
  state,
  onState,
}: {
  project: Project;
  segment: Segment | null;
  state: EditState;
  onState: (patch: Partial<EditState>) => void;
}) {
  const [tab, setTab] = useState<Tab>("scene");

  return (
    <aside className="flex min-h-0 w-full flex-col border-l border-[var(--line)] bg-ink-950">
      <div className="flex shrink-0 border-b border-[var(--line)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-2xs font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-iris-500 text-fg-strong"
                : "border-b-2 border-transparent text-fg-faint hover:text-fg",
            )}
          >
            <Icon name={t.icon} className="size-3.5" strokeWidth={1.9} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "scene" ? <SceneTab segment={segment} state={state} onState={onState} /> : null}
        {tab === "audio" ? <AudioTab project={project} state={state} onState={onState} /> : null}
        {tab === "brand" ? <BrandTab project={project} state={state} onState={onState} /> : null}
        {tab === "output" ? <OutputTab project={project} /> : null}
        {tab === "riff" ? <RiffTab project={project} /> : null}
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------- scene */

function SceneTab({
  segment,
  state,
  onState,
}: {
  segment: Segment | null;
  state: EditState;
  onState: (p: Partial<EditState>) => void;
}) {
  if (!segment) {
    return <Empty text="Select a scene in the timeline or the script to inspect it." />;
  }
  return (
    <div className="space-y-5 p-4">
      <Group label="Scene">
        <p className="text-[0.875rem] text-fg-strong">{segment.title}</p>
        {segment.action ? (
          <p className="mt-1 font-mono text-2xs text-cyan-300">{segment.action}</p>
        ) : null}
      </Group>

      <Group label="Camera">
        <SwitchRow
          label="Automatic zoom"
          hint="Keyframed to each interaction"
          on={state.zoomEnabled}
          onChange={(v) => onState({ zoomEnabled: v })}
        />
        {segment.zoom ? (
          <>
            <Readout label="Scale" value={`${segment.zoom.scale.toFixed(2)}×`} />
            <Readout label="Anchor" value={`${segment.zoom.x}% / ${segment.zoom.y}%`} />
            <Readout label="Easing" value="Push · asymmetric, 1.5% overshoot" />
            <Readout label="Hold" value="Bound to narration span" />
          </>
        ) : (
          <p className="text-[0.75rem] text-fg-faint">No zoom on this scene.</p>
        )}
      </Group>

      <Group label="Overlays">
        <SwitchRow label="Captions" hint="Burned in, brand type" on={state.captions} onChange={(v) => onState({ captions: v })} />
        <SwitchRow label="Presenter" hint="Collision-aware placement" on={state.presenter} onChange={(v) => onState({ presenter: v })} />
      </Group>

      <Group label="Masking">
        <div className="flex items-start gap-2.5 rounded-xl border border-mint-500/28 bg-mint-500/[0.06] p-3">
          <Icon name="shield" className="mt-0.5 size-3.5 shrink-0 text-mint-400" strokeWidth={2} />
          <p className="text-[0.75rem] leading-relaxed text-fg-muted">
            3 values masked in this scene by <span className="text-fg">Production safeguards</span>.
            Enforced by your workspace.
          </p>
        </div>
      </Group>
    </div>
  );
}

/* ---------------------------------------------------------- audio */

function AudioTab({
  project,
  state,
  onState,
}: {
  project: Project;
  state: EditState;
  onState: (p: Partial<EditState>) => void;
}) {
  const [voice, setVoice] = useState(project.voice);
  return (
    <div className="space-y-5 p-4">
      <Group label="Narration">
        <select
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
          className="h-9 w-full rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
        >
          {voices.map((v) => (
            <option key={v.id} value={`${v.name} — ${v.descriptor}`}>
              {v.name} — {v.accent}
              {v.kind === "clone" ? " (clone)" : ""}
            </option>
          ))}
        </select>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-2xs text-fg-muted transition-colors hover:border-[var(--line-strong)] hover:text-fg"
          >
            <Icon name="play" className="size-3" />
            Preview on this script
          </button>
          <span className="font-mono text-2xs text-fg-faint">34 languages</span>
        </div>
      </Group>

      <Group label="Restoration">
        <SwitchRow
          label="Studio Sound"
          hint="De-reverb, de-noise, level"
          on={state.studioSound}
          onChange={(v) => onState({ studioSound: v })}
        />
        <SwitchRow label="Music bed" hint="Ambient, −26 dB" on={state.music} onChange={(v) => onState({ music: v })} />
        <Readout label="Loudness" value={state.studioSound ? "−16 LUFS (web)" : "unnormalised"} />
        <Readout label="Peak" value={state.studioSound ? "−1.2 dBTP" : "−0.3 dBTP"} />
      </Group>

      <Group label="Pronunciation">
        <p className="text-[0.75rem] leading-relaxed text-fg-subtle">
          3 workspace overrides applied: <span className="text-fg">Meridian</span>,{" "}
          <span className="text-fg">SKU</span>, <span className="text-fg">FTL</span>.
        </p>
        <button className="mt-2 text-2xs font-medium text-iris-300 hover:text-iris-400">
          Edit dictionary
        </button>
      </Group>
    </div>
  );
}

/* ---------------------------------------------------------- brand */

function BrandTab({
  project,
  state,
  onState,
}: {
  project: Project;
  state: EditState;
  onState: (p: Partial<EditState>) => void;
}) {
  const kit = brandKits.find((k) => k.name === project.brandKit) ?? brandKits[0];
  return (
    <div className="space-y-5 p-4">
      <Group label="Brand kit">
        <div className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-ink-900 p-3">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-iris-500 text-[0.6875rem] font-bold text-white">
            M
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.8125rem] font-medium text-fg-strong">{kit.name}</span>
            <span className="block text-2xs text-fg-faint">{kit.usedBy} videos</span>
          </span>
          {kit.locked ? (
            <Icon name="lock" className="size-3.5 shrink-0 text-mint-400" strokeWidth={2} />
          ) : null}
        </div>
        {kit.locked ? (
          <p className="mt-2 text-2xs leading-relaxed text-fg-faint">
            Locked by an admin. Exports that would violate it are blocked rather than corrected.
          </p>
        ) : null}
      </Group>

      <Group label="Palette">
        <div className="flex gap-1.5">
          {kit.colors.map((c) => (
            <span key={c} className="flex-1">
              <span className="block h-8 rounded-lg border border-white/8" style={{ background: c }} />
              <span className="mt-1 block font-mono text-[0.5rem] text-fg-faint">{c}</span>
            </span>
          ))}
        </div>
      </Group>

      <Group label="Applied">
        <Readout label="Intro" value={kit.intro} />
        <Readout label="Outro" value={kit.outro} />
        <Readout label="Captions" value={kit.captionStyle} />
        <Readout label="Cursor" value={kit.cursor} />
        <Readout label="Music" value={kit.music} />
      </Group>

      <Group label="Overrides">
        <SwitchRow label="Show captions" on={state.captions} onChange={(v) => onState({ captions: v })} />
        <SwitchRow label="Music bed" on={state.music} onChange={(v) => onState({ music: v })} />
      </Group>
    </div>
  );
}

/* ---------------------------------------------------------- output */

function OutputTab({ project }: { project: Project }) {
  const outputs: { id: string; label: string; icon: IconName; meta: string; on: boolean }[] = [
    { id: "video", label: "Demo video", icon: "play", meta: "4K60 · 16:9 + 9:16", on: project.outputs.includes("video") },
    { id: "guide", label: "Step-by-step guide", icon: "doc", meta: "Unmetered · 11 steps", on: project.outputs.includes("guide") },
    { id: "interactive", label: "Interactive tour", icon: "cursor", meta: "From captured DOM", on: project.outputs.includes("interactive") },
    { id: "clips", label: "Social cuts", icon: "scissors", meta: "6 clips · 9:16", on: project.outputs.includes("clips") },
  ];
  return (
    <div className="space-y-5 p-4">
      <Group label="Generate">
        <div className="space-y-2">
          {outputs.map((o) => (
            <div
              key={o.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                o.on ? "border-iris-500/35 bg-iris-500/[0.07]" : "border-[var(--line)]",
              )}
            >
              <Icon
                name={o.icon}
                className={cn("size-4 shrink-0", o.on ? "text-iris-300" : "text-fg-faint")}
                strokeWidth={1.8}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.8125rem] text-fg">{o.label}</span>
                <span className="block text-2xs text-fg-faint">{o.meta}</span>
              </span>
              {o.on ? <Icon name="check" className="size-3.5 shrink-0 text-mint-400" strokeWidth={2.6} /> : null}
            </div>
          ))}
        </div>
      </Group>

      <Group label="Languages">
        <div className="space-y-1.5">
          {localeMatrix.slice(0, 6).map((l) => (
            <div key={l.code} className="flex items-center gap-2.5">
              <span className="w-12 font-mono text-2xs text-fg-faint">{l.code}</span>
              <span className="flex-1 truncate text-[0.75rem] text-fg-muted">{l.label}</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[0.5625rem]",
                  l.status === "published" && "bg-mint-500/15 text-mint-400",
                  l.status === "rendering" && "bg-iris-500/15 text-iris-300",
                  l.status === "stale" && "bg-amber-500/15 text-amber-400",
                  (l.status === "queued" || l.status === "none") && "bg-white/6 text-fg-faint",
                )}
              >
                {l.status}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-2xs text-fg-faint">Localized versions never consume video minutes.</p>
      </Group>

      <Group label="Billing">
        <Readout label="This render" value={`${(project.durationSec / 60).toFixed(1)} minutes`} />
        <Readout label="Derived assets" value="0 minutes" />
        <Readout label="Re-render this period" value="Free" />
      </Group>
    </div>
  );
}

/* ---------------------------------------------------------- riff chat */

const seededReplies = [
  "Trimmed 31% of words, cut 4 dead-air regions totalling 38 seconds, and keyframed 7 zooms. The intro now reaches the first click at 0:06 instead of 0:41.",
  "The retention curve on your last three demos drops hardest when configuration comes before outcome. I can reorder scene 3 ahead of scene 2 — want me to show a diff?",
  "I can get this to 60 seconds by cutting scene 2 entirely and tightening the close. You would lose the reliability-score explanation, which two of your top accounts rewatched.",
  "Rewritten for a technical buyer: adjectives removed, four claims replaced with the numbers behind them. Review the diff before I commit it.",
];

function RiffTab({ project }: { project: Project }) {
  const [log, setLog] = useState<{ who: "you" | "riff"; text: string }[]>([
    {
      who: "riff",
      text: `I auto-edited “${project.title}”. Source was ${Math.round(project.sourceDurationSec / 60)} minutes; the cut is ${Math.round(project.durationSec)} seconds. Ask me to change anything.`,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const send = (text: string) => {
    if (!text.trim()) return;
    setLog((l) => [...l, { who: "you", text }]);
    setDraft("");
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      setLog((l) => [
        ...l,
        { who: "riff", text: seededReplies[l.filter((x) => x.who === "you").length % seededReplies.length] },
      ]);
    }, 900);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {log.map((m, i) => (
          <div key={i} className={cn("flex gap-2.5", m.who === "you" && "justify-end")}>
            {m.who === "riff" ? (
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--color-iris-500),var(--color-violet-500))]">
                <Icon name="sparkles" className="size-3 text-white" strokeWidth={2.2} />
              </span>
            ) : null}
            <span
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-[0.75rem] leading-relaxed",
                m.who === "you"
                  ? "bg-ink-750 text-fg"
                  : "border border-[var(--line)] bg-ink-900 text-fg-muted",
              )}
            >
              {m.text}
            </span>
          </div>
        ))}
        {thinking ? (
          <div className="flex gap-2.5">
            <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--color-iris-500),var(--color-violet-500))]">
              <Icon name="sparkles" className="size-3 text-white" strokeWidth={2.2} />
            </span>
            <span className="flex items-center gap-1 rounded-xl border border-[var(--line)] bg-ink-900 px-3 py-2.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 rounded-full bg-fg-faint"
                  style={{ animation: `dr-fade 1s ${i * 0.15}s infinite alternate` }}
                />
              ))}
            </span>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-[var(--line)] p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {["Cut to 60 seconds", "Rewrite for a technical buyer", "Add a callout on the price"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-lg border border-[var(--line)] px-2 py-1 text-2xs text-fg-subtle transition-colors hover:border-[var(--line-strong)] hover:text-fg"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tell Riff what to change…"
            className="h-9 flex-1 rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
          />
          <Button type="submit" size="sm" iconOnly aria-label="Send">
            <Icon name="arrowRight" className="size-4" strokeWidth={2.2} />
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- bits */

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-ink-900"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[0.8125rem] text-fg">{label}</span>
        {hint ? <span className="block text-2xs text-fg-faint">{hint}</span> : null}
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-iris-500" : "bg-ink-700")}>
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
            on ? "translate-x-4.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[0.75rem] text-fg-subtle">{label}</span>
      <span className="truncate font-mono text-2xs text-fg-muted">{value}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <p className="max-w-[16rem] text-[0.8125rem] leading-relaxed text-fg-subtle">{text}</p>
    </div>
  );
}
