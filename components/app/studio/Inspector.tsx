"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { Project, Segment } from "@/lib/app-data";
import { localeLabel } from "@/lib/locales";
import type { EditState } from "./types";

type Tab = "scene" | "audio" | "brand" | "output" | "riff";

/** A voice as GET /api/voices describes it. */
export interface StudioVoice {
  id: string;
  name: string;
  kind: "studio" | "clone";
  descriptor: string | null;
  accent: string | null;
  available: boolean;
  revoked_at: string | null;
}

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
  segmentIndex,
  state,
  onState,
  voices,
  voiceId,
  onVoice,
  ask,
  onAsked,
}: {
  project: Project;
  segment: Segment | null;
  /** The inspected chapter's index, for actions that name a chapter. */
  segmentIndex: number | null;
  state: EditState;
  onState: (patch: Partial<EditState>) => void;
  /** Voices this workspace may narrate with, and the one this project uses. */
  voices: StudioVoice[];
  voiceId: string | null;
  onVoice: (voiceId: string | null) => void;
  /**
   * A question pushed in from elsewhere — the transcript's action chips.
   * Opens the Riff tab and sends it, so a chip in one panel and a message
   * in another are the same request rather than two features that drifted.
   */
  ask?: { text: string; at: number } | null;
  onAsked?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("scene");

  useEffect(() => {
    if (ask) setTab("riff");
  }, [ask]);

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
        {tab === "audio" ? (
          <AudioTab
            project={project}
            segment={segment}
            segmentIndex={segmentIndex}
            state={state}
            onState={onState}
            voices={voices}
            voiceId={voiceId}
            onVoice={onVoice}
          />
        ) : null}
        {tab === "brand" ? <BrandTab project={project} state={state} onState={onState} /> : null}
        {tab === "output" ? <OutputTab project={project} /> : null}
        {tab === "riff" ? (
          <RiffTab project={project} onState={onState} ask={ask} onAsked={onAsked} />
        ) : null}
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
            {/* Easing and hold were constants dressed as per-scene
                measurements. The two values that are real stay. */}
          </>
        ) : (
          <p className="text-[0.75rem] text-fg-faint">No zoom on this scene.</p>
        )}
      </Group>

      <Group label="Overlays">
        <SwitchRow label="Captions" hint="Burned in, brand type" on={state.captions} onChange={(v) => onState({ captions: v })} />
        <SwitchRow label="Presenter" hint="Collision-aware placement" on={state.presenter} onChange={(v) => onState({ presenter: v })} />
      </Group>

      {/*
        The masking panel is gone, not softened.

        It read "3 values masked in this scene by Production safeguards" —
        a hardcoded 3, rendered identically for every scene of every project,
        including ones with no recording behind them. A fabricated security
        claim is the worst kind of placeholder, because it is the kind
        somebody repeats to their own customer.

        Masking is real and lives in lib/masking; when a recording has been
        scanned this panel comes back reading the manifest. Until then it
        says nothing, which is the only honest thing it can say.
      */}
    </div>
  );
}

/* ---------------------------------------------------------- audio */

function AudioTab({
  project,
  segment,
  segmentIndex,
  state,
  onState,
  voices,
  voiceId,
  onVoice,
}: {
  project: Project;
  segment: Segment | null;
  segmentIndex: number | null;
  state: EditState;
  onState: (p: Partial<EditState>) => void;
  voices: StudioVoice[];
  voiceId: string | null;
  onVoice: (voiceId: string | null) => void;
}) {
  // A voice that can no longer narrate — a studio voice the vendor withdrew,
  // a clone whose consent was revoked — is listed only if it is the one
  // already chosen, so the person sees why their render will refuse rather
  // than a voice that silently vanished from the menu.
  const studio = voices.filter((v) => v.kind === "studio" && (v.available || v.id === voiceId));
  const clones = voices.filter((v) => v.kind === "clone" && (!v.revoked_at || v.id === voiceId));
  const chosen = voices.find((v) => v.id === voiceId) ?? null;

  return (
    <div className="space-y-5 p-4">
      {/*
        The picker saves through the project, not local state: the version
        before this one was a <select> nothing persisted, so a person who
        changed the voice and reloaded found it changed back.
      */}
      <Group label="Narration">
        {voices.length === 0 ? (
          <p className="text-[0.75rem] leading-relaxed text-fg-subtle">
            This video uses the audio on your recording. To narrate it with a
            studio voice, import the library on the Voices page.
          </p>
        ) : (
          <>
            <label htmlFor="narration-voice" className="sr-only">
              Narrating voice
            </label>
            <select
              id="narration-voice"
              value={voiceId ?? ""}
              onChange={(e) => onVoice(e.target.value || null)}
              className="w-full rounded-lg border border-[var(--line)] bg-ink-900 px-2.5 py-2 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
            >
              <option value="">Voice on the recording</option>
              {studio.length > 0 ? (
                <optgroup label="Studio library">
                  {studio.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.accent ? ` · ${v.accent}` : ""}
                      {v.available ? "" : " (no longer offered)"}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {clones.length > 0 ? (
                <optgroup label="Your clones">
                  {clones.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.revoked_at ? " (consent withdrawn)" : ""}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <p className="mt-2 text-[0.75rem] leading-relaxed text-fg-subtle">
              {chosen
                ? `Renders will speak the transcript in ${chosen.name}'s voice${
                    chosen.descriptor ? ` — ${chosen.descriptor}` : ""
                  }. Your recording is kept; switch back to it here at any time.`
                : "Renders keep the audio on your recording. Choose a voice to have the transcript read instead."}
            </p>
            {chosen ? (
              <ChapterPreview
                projectId={project.id}
                segment={segment}
                segmentIndex={segmentIndex}
                voiceName={chosen.name}
                // Re-arm when the words or the voice change: the clip that
                // was playing described a different edit.
                editKey={`${voiceId}:${segmentIndex}:${state.removeFillers}:${state.cutWords.size}:${state.deletedSegments.size}`}
              />
            ) : null}
          </>
        )}
      </Group>

      <Group label="Restoration">
        <SwitchRow
          label="Studio Sound"
          hint="De-reverb, de-noise, level"
          on={state.studioSound}
          onChange={(v) => onState({ studioSound: v })}
        />
        <SwitchRow label="Music bed" hint="Ambient, −26 dB" on={state.music} onChange={(v) => onState({ music: v })} />
        {/* Loudness and peak were two constants that changed with a
            checkbox rather than with the audio. Nothing measures them yet. */}
      </Group>

      {/* The pronunciation dictionary claimed three specific overrides
          were applied, from a hardcoded sentence, beside a button with no
          handler. It belongs with synthesis and comes back with it. */}
    </div>
  );
}

/**
 * Hear the inspected chapter in the chosen voice.
 *
 * One synthesis per chapter per voice, and the render reuses the clip, so
 * this is the cheap way to find out whether a voice suits the script before
 * spending a render on it. It also says whether the reading fits the
 * chapter's footage — the thing the render will otherwise discover for you.
 */
function ChapterPreview({
  projectId,
  segment,
  segmentIndex,
  voiceName,
  editKey,
}: {
  projectId: string;
  segment: Segment | null;
  segmentIndex: number | null;
  voiceName: string;
  editKey: string;
}) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "playing" | "ready"; durationSec: number; availableSec: number; url: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const audio = useRef<HTMLAudioElement | null>(null);

  // A different chapter or a changed edit invalidates what was fetched.
  useEffect(() => {
    audio.current?.pause();
    setState({ kind: "idle" });
  }, [editKey]);
  useEffect(() => () => audio.current?.pause(), []);

  if (segmentIndex === null || !segment) {
    return (
      <p className="mt-3 text-2xs text-fg-faint">
        Select a chapter in the script or the timeline to preview it in this voice.
      </p>
    );
  }
  const title = `${String(segmentIndex + 1).padStart(2, "0")} ${segment.title}`;

  const play = (url: string) => {
    if (!audio.current) {
      audio.current = new Audio();
      audio.current.addEventListener("ended", () =>
        setState((s) => (s.kind === "playing" ? { ...s, kind: "ready" } : s)),
      );
    }
    audio.current.src = url;
    void audio.current.play().catch(() =>
      setState({ kind: "error", message: "The browser would not play the clip." }),
    );
  };

  const preview = async () => {
    if (state.kind === "playing") {
      audio.current?.pause();
      setState({ ...state, kind: "ready" });
      return;
    }
    if (state.kind === "ready") {
      play(state.url);
      setState({ ...state, kind: "playing" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const response = await fetch(`/api/projects/${projectId}/narration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment_index: segmentIndex }),
      });
      const body = (await response.json()) as {
        error?: string;
        audio_url?: string;
        duration_sec?: number;
        available_sec?: number;
      };
      if (!response.ok || !body.audio_url) throw new Error(body.error ?? "The preview did not come back.");
      play(body.audio_url);
      setState({
        kind: "playing",
        url: body.audio_url,
        durationSec: body.duration_sec ?? 0,
        availableSec: body.available_sec ?? 0,
      });
    } catch (cause) {
      setState({ kind: "error", message: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  const fitted = state.kind === "playing" || state.kind === "ready" ? state : null;
  const runsLong = fitted ? fitted.durationSec > fitted.availableSec * 1.03 : false;

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] bg-ink-900/60 p-3">
      <div className="flex items-center gap-2.5">
        <Button
          variant="outline"
          size="sm"
          disabled={state.kind === "loading"}
          onClick={() => void preview()}
          aria-label={state.kind === "playing" ? `Stop previewing ${title}` : `Preview ${title} in ${voiceName}'s voice`}
        >
          <Icon
            name={state.kind === "playing" ? "pause" : "play"}
            className={cn("size-3.5", state.kind === "loading" && "animate-pulse")}
            strokeWidth={2}
          />
          {state.kind === "loading" ? "Synthesizing…" : state.kind === "playing" ? "Stop" : "Preview this chapter"}
        </Button>
        <span className="min-w-0 truncate text-2xs text-fg-subtle">{title}</span>
      </div>
      {fitted ? (
        <p className={cn("mt-2 text-2xs leading-relaxed", runsLong ? "text-amber-300" : "text-fg-subtle")}>
          {voiceName} reads it in {fitted.durationSec.toFixed(1)}s; the footage runs{" "}
          {fitted.availableSec.toFixed(1)}s.
          {runsLong
            ? " The render will pace it to fit — cut a few words here if it sounds hurried."
            : " It fits."}
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p role="alert" className="mt-2 text-2xs text-rose-300">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------- brand */

/**
 * The brand tab.
 *
 * This rendered a fixture brand kit for every project in every workspace: a
 * name, a "used by 48 videos" count, a lock icon claiming an admin had
 * locked it, a five-swatch palette, and five "Applied" readouts naming an
 * intro, an outro, a caption style, a cursor treatment and a music bed. None
 * of it was stored anywhere and none of it reached the renderer, so a person
 * reading this panel was told their video would carry a visual identity that
 * nothing would apply.
 *
 * The `brand_kits` table exists and has no repository yet. Until it does,
 * this says so. The two override switches stay because they are real —
 * they write to the project's edit state and the renderer reads them.
 */
function BrandTab({
  project,
  state,
  onState,
}: {
  project: Project;
  state: EditState;
  onState: (p: Partial<EditState>) => void;
}) {
  return (
    <div className="space-y-5 p-4">
      <Group label="Brand kit">
        {project.brandKit ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-ink-900 p-3">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-iris-500 text-[0.6875rem] font-bold text-white">
              {project.brandKit.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] font-medium text-fg-strong">
                {project.brandKit}
              </span>
            </span>
          </div>
        ) : (
          <p className="text-[0.75rem] leading-relaxed text-fg-faint">
            No brand kit is applied to this project. Exports use the source footage as recorded.
          </p>
        )}
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
  // Meta read off the project rather than written into the source. "11
  // steps" and "6 clips · 9:16" were constants shown against every project,
  // including ones with no chapters and no clips.
  const outputs: { id: string; label: string; icon: IconName; meta: string; on: boolean }[] = [
    {
      id: "video",
      label: "Demo video",
      icon: "play",
      meta: `${project.segments.length} chapter${project.segments.length === 1 ? "" : "s"}`,
      on: project.outputs.includes("video"),
    },
    {
      id: "guide",
      label: "Step-by-step guide",
      icon: "doc",
      meta: `Unmetered · ${project.segments.length} step${project.segments.length === 1 ? "" : "s"}`,
      on: project.outputs.includes("guide"),
    },
    { id: "interactive", label: "Interactive tour", icon: "cursor", meta: "Not built yet", on: false },
    { id: "clips", label: "Social cuts", icon: "scissors", meta: "Not built yet", on: false },
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

      {/*
        The languages list was the global `localeMatrix` fixture rendered as
        this project's render status — six rows saying "published" and
        "rendering" about locales nobody had asked for. A project's real
        locales are the ones it has, and a new project has one.
      */}
      <Group label="Languages">
        {project.locales.length > 0 ? (
          <div className="space-y-1.5">
            {project.locales.map((code) => (
              <div key={code} className="flex items-center gap-2.5">
                <span className="w-12 font-mono text-2xs text-fg-faint">{code}</span>
                <span className="flex-1 truncate text-[0.75rem] text-fg-muted">
                  {localeLabel(code)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[0.75rem] text-fg-faint">
            Source language only. Other languages need a speech synthesis provider.
          </p>
        )}
      </Group>

      <Group label="Billing">
        <Readout label="This render" value={`${(project.durationSec / 60).toFixed(1)} minutes`} />
        <p className="mt-2 text-2xs leading-relaxed text-fg-faint">
          Billed from the encoded output when a render completes, not from this estimate.
        </p>
      </Group>
    </div>
  );
}

/* ---------------------------------------------------------- riff chat */

/**
 * The Riff panel.
 *
 * It asks a model about the cut and shows what comes back. When the model
 * proposes a change, the change arrives as data behind an Accept button
 * rather than being applied — a suggestion and a decision are two events,
 * and only one of them is the person's.
 *
 * What was here before answered "Cut to 60 seconds" with "Trimmed 31% of
 * words, cut 4 dead-air regions totalling 38 seconds, and keyframed 7
 * zooms", from an array of four strings, having changed nothing. The numbers
 * were invented, the edit never happened, and the panel said it had.
 */

interface RiffTurn {
  who: "you" | "riff";
  text: string;
  proposal?: EditProposal;
  proposalSummary?: string;
  applied?: boolean;
}

/** The shape the endpoint returns. Mirrors `EditProposal` in lib/providers. */
interface EditProposal {
  removeFillers?: boolean;
  deletedSegments?: number[];
  captions?: boolean;
  music?: boolean;
  zoomEnabled?: boolean;
}

function RiffTab({
  project,
  onState,
  ask,
  onAsked,
}: {
  project: Project;
  onState: (patch: Partial<EditState>) => void;
  ask?: { text: string; at: number } | null;
  onAsked?: () => void;
}) {
  const [log, setLog] = useState<RiffTurn[]>([
    {
      who: "riff",
      // Derived, and true. Every other sentence this panel used to open with
      // was not.
      text:
        `“${project.title}” runs ${Math.round(project.durationSec)}s from a ` +
        `${Math.round(project.sourceDurationSec)}s take, across ` +
        `${project.segments.length} chapter${project.segments.length === 1 ? "" : "s"}. ` +
        `Ask me about it, or tell me what to change.`,
    },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [offline, setOffline] = useState(false);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || thinking) return;

    const history = log.map((turn) => ({
      role: turn.who === "you" ? ("user" as const) : ("assistant" as const),
      text: turn.text,
    }));

    setLog((l) => [...l, { who: "you", text: message }]);
    setDraft("");
    setThinking(true);

    try {
      const response = await fetch(`/api/projects/${project.id}/riff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const body = (await response.json()) as {
        reply?: string;
        proposal?: EditProposal | null;
        proposal_summary?: string | null;
        provider?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "Riff could not answer.");

      setOffline(body.provider === "offline-assistant");
      setLog((l) => [
        ...l,
        {
          who: "riff",
          text: body.reply ?? "",
          proposal: body.proposal ?? undefined,
          proposalSummary: body.proposal_summary ?? undefined,
        },
      ]);
    } catch (cause) {
      setLog((l) => [
        ...l,
        { who: "riff", text: cause instanceof Error ? cause.message : String(cause) },
      ]);
    } finally {
      setThinking(false);
    }
  };

  // A chip pressed in the transcript arrives here. Keyed on `at` rather than
  // the text so pressing the same chip twice asks twice.
  const lastAsk = useRef<number>(0);
  useEffect(() => {
    if (!ask || ask.at === lastAsk.current) return;
    lastAsk.current = ask.at;
    void send(ask.text);
    onAsked?.();
    // `send` is recreated every render; depending on it would re-fire the
    // question on each keystroke in the composer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  const apply = (index: number, proposal: EditProposal) => {
    const patch: Partial<EditState> = {};
    if (proposal.removeFillers !== undefined) patch.removeFillers = proposal.removeFillers;
    if (proposal.captions !== undefined) patch.captions = proposal.captions;
    if (proposal.music !== undefined) patch.music = proposal.music;
    if (proposal.zoomEnabled !== undefined) patch.zoomEnabled = proposal.zoomEnabled;
    if (proposal.deletedSegments) patch.deletedSegments = new Set(proposal.deletedSegments);

    // Through the same autosaving patch every switch in this panel uses, so
    // an accepted proposal is an ordinary edit and undoes like one.
    onState(patch);
    setLog((l) => l.map((turn, i) => (i === index ? { ...turn, applied: true } : turn)));
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

              {m.proposal ? (
                <span className="mt-2.5 block border-t border-[var(--line)] pt-2.5">
                  <span className="block text-2xs text-fg-faint">
                    {m.proposalSummary ?? "Apply this change"}
                  </span>
                  {m.applied ? (
                    <span className="mt-1.5 inline-flex items-center gap-1 text-2xs text-mint-400">
                      <Icon name="check" className="size-3" strokeWidth={3} />
                      Applied
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => apply(i, m.proposal!)}
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-iris-500/45 bg-iris-500/12 px-2.5 py-1 text-2xs font-medium text-iris-200 transition-colors hover:bg-iris-500/20"
                    >
                      <Icon name="check" className="size-3" strokeWidth={2.6} />
                      Accept
                    </button>
                  )}
                </span>
              ) : null}
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
        {offline ? (
          <p className="mb-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-1.5 text-2xs leading-relaxed text-amber-200">
            No language model is configured, so Riff can only report what it measures. Set
            ANTHROPIC_API_KEY to have it read the transcript.
          </p>
        ) : null}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {["What could I cut?", "Which chapter is weakest?", "Get this under a minute"].map((s) => (
            <button
              key={s}
              type="button"
              disabled={thinking}
              onClick={() => void send(s)}
              className="rounded-lg border border-[var(--line)] px-2 py-1 text-2xs text-fg-subtle transition-colors hover:border-[var(--line-strong)] hover:text-fg disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tell Riff what to change…"
            className="h-9 flex-1 rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
          />
          <Button type="submit" size="sm" iconOnly aria-label="Send" disabled={thinking}>
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
