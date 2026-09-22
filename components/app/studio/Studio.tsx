"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/app/Shared";
import type { Project } from "@/lib/app-data";
import { wordKey } from "@/lib/segments";
import { Canvas, TimelineStrip } from "./Canvas";
import { Transcript, type WordEditChange } from "./Transcript";
import { Inspector, type StudioVoice } from "./Inspector";
import { ExportDialog } from "./ExportDialog";
import {
  buildTimeline,
  hydrateEditState,
  serializeEditState,
  sourceTimeAt,
  timelineDuration,
  wordAt,
  type EditState,
} from "./types";

export function Studio({
  project,
  transcriptionLive = true,
  transcriptionMissing = [],
}: {
  project: Project;
  /** False when these words came from the mock rather than a microphone. */
  transcriptionLive?: boolean;
  transcriptionMissing?: string[];
}) {
  // Seeded from what was saved last time. The editor used to start from the
  // defaults on every load, so a person who deleted three chapters and came
  // back the next morning found all three restored and no explanation.
  const [state, setState] = useState<EditState>(() => hydrateEditState(project.editState));

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // A question pushed from the transcript's chips into the Riff panel.
  const [ask, setAsk] = useState<{ text: string; at: number } | null>(null);
  // The voices this workspace may narrate with, and which one this project
  // uses. Fetched here rather than in the Audio tab so the header can name
  // the voice before that tab has ever been opened.
  const [voices, setVoices] = useState<StudioVoice[]>([]);
  const [voiceId, setVoiceId] = useState<string | null>(project.voiceId ?? null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/voices")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((body: { data?: StudioVoice[] }) => {
        if (!cancelled) setVoices(body.data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const narrator = voiceId ? voices.find((v) => v.id === voiceId) ?? null : null;
  // With a voice chosen, chapters play whole and the cut is a cut of words,
  // not of footage. The timeline and the strip follow the render's rule.
  const narrated = voiceId !== null;
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  const timeline = useMemo(
    () => buildTimeline(project, state, { continuous: narrated }),
    [project, state, narrated],
  );
  const duration = useMemo(() => timelineDuration(timeline), [timeline]);
  const active = useMemo(() => wordAt(timeline, time), [timeline, time]);
  const activeSegIndex = active?.segIndex ?? null;
  const activeSegment = activeSegIndex !== null ? project.segments[activeSegIndex] : null;
  const inspectedIndex = selected ?? activeSegIndex;
  const inspected = inspectedIndex !== null ? project.segments[inspectedIndex] : null;

  /* ---------------- playback loop ---------------- */
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const step = (now: number) => {
      const dt = (now - last.current) / 1000;
      last.current = now;
      setTime((t) => {
        const next = t + dt;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, duration]);

  // Keep the playhead inside the timeline when an edit shortens it.
  useEffect(() => {
    setTime((t) => Math.min(t, duration));
  }, [duration]);

  /* ---------------- edits ---------------- */
  const patch = useCallback((p: Partial<EditState>) => {
    setState((s) => ({ ...s, ...p }));
    setDirty(true);
  }, []);

  /* ---------------- autosave ---------------- */
  // `dirty` rather than a save on every render: the first render must not
  // write, or opening a project you never edit would stamp its row.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    setSaved("saving");

    // Coalesced. Ticking four checkboxes in a row is one write, not four,
    // and the last one wins — which is the only ordering that is correct
    // when the requests can overtake each other.
    const id = setTimeout(async () => {
      try {
        const response = await fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edit_state: serializeEditState(state) }),
        });
        setSaved(response.ok ? "saved" : "error");
      } catch {
        setSaved("error");
      }
    }, 600);

    return () => clearTimeout(id);
  }, [dirty, state, project.id]);

  const toggleSegment = useCallback(
    (i: number) => {
      setState((s) => {
        const next = new Set(s.deletedSegments);
        next.has(i) ? next.delete(i) : next.add(i);
        return { ...s, deletedSegments: next };
      });
      setDirty(true);
    },
    [],
  );

  // Saved at once, not coalesced with the edit: it is one deliberate choice,
  // and the person wants to know it took.
  const chooseVoice = useCallback(
    async (next: string | null) => {
      const previous = voiceId;
      setVoiceId(next);
      setSaved("saving");
      try {
        const response = await fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voice_id: next }),
        });
        if (!response.ok) throw new Error();
        setSaved("saved");
      } catch {
        setVoiceId(previous);
        setSaved("error");
      }
    },
    [project.id, voiceId],
  );

  // A rewrite replaces whatever sat under it: an earlier rewrite inside the
  // run, and any hand cuts, which would otherwise remove words that no
  // longer exist as words.
  const editWords = useCallback((changes: WordEditChange[]) => {
    setState((s) => {
      const edits = new Map(s.wordEdits);
      const cuts = new Set(s.cutWords);
      for (const { key, edit } of changes) {
        const [seg, first] = key.split(":").map(Number);
        const span = edit?.span ?? edits.get(key)?.span ?? 1;
        for (let i = first; i < first + span; i++) {
          const inner = wordKey(seg, i);
          cuts.delete(inner);
          if (inner !== key) edits.delete(inner);
        }
        if (edit) edits.set(key, edit);
        else edits.delete(key);
      }
      return { ...s, wordEdits: edits, cutWords: cuts };
    });
    setDirty(true);
  }, []);

  // A glossary term is a workspace fact, saved on its own rather than with
  // the edit, and reported through the same Saved indicator.
  const rememberTerm = useCallback(async (term: { heard: string; text: string; spoken: string | null }) => {
    setSaved("saving");
    try {
      const response = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(term),
      });
      setSaved(response.ok ? "saved" : "error");
    } catch {
      setSaved("error");
    }
  }, []);

  const setWordsCut = useCallback((keys: string[], cut: boolean) => {
    setState((s) => {
      const next = new Set(s.cutWords);
      for (const key of keys) cut ? next.add(key) : next.delete(key);
      return { ...s, cutWords: next };
    });
    setDirty(true);
  }, []);

  const seek = useCallback((t: number) => setTime(Math.max(0, Math.min(t, duration))), [duration]);

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (e.key === "ArrowRight") seek(time + (e.shiftKey ? 5 : 1));
      if (e.key === "ArrowLeft") seek(time - (e.shiftKey ? 5 : 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [time, seek]);

  const captionText = useMemo(() => {
    if (!active) return "";
    const around = timeline.filter(
      (w) => w.segIndex === active.segIndex && w.start >= active.start - 2.2 && w.start <= active.start + 2.2,
    );
    return around.map((w) => w.text).join(" ");
  }, [active, timeline]);

  const savedMinutes = ((project.sourceDurationSec - duration) / 60).toFixed(1);

  // Where the source file should be, for the frame the playhead is over.
  const sourceTime = useMemo(() => sourceTimeAt(timeline, time), [timeline, time]);
  // Only when the bytes arrived. A recording row exists from the moment
  // somebody presses record, so pointing a <video> at one that never
  // finished uploading is a guaranteed 404.
  const mediaUrl =
    project.recordingId && project.hasMedia !== false
      ? `/api/recordings/${project.recordingId}/media`
      : null;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* ---------------- studio header ---------------- */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line)] bg-ink-950 px-4 py-2.5">
        <Link
          href="/app/projects"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-ink-850 hover:text-fg"
          aria-label="Back to projects"
        >
          <Icon name="chevronLeft" className="size-4" strokeWidth={2.2} />
        </Link>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[0.9375rem] font-medium text-fg-strong">{project.title}</h1>
            <StatusPill status={project.status} />
            {narrator ? (
              // Said in the header, not only in a tab: a render of this
              // project will not carry the voice on the recording.
              // The same tokens as the Ready pill beside it: cyan-300 is
              // remapped for the light theme, cyan-200 is not.
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 text-2xs font-medium text-cyan-300">
                <Icon name="mic" className="size-3" strokeWidth={2} />
                Narrated by {narrator.name}
              </span>
            ) : null}
          </div>
          <p className="flex items-center gap-2.5 text-2xs text-fg-faint">
            <span>{project.collection}</span>
            <span>·</span>
            <span className="tabular-nums">
              {formatDuration(duration)} cut from a {formatDuration(project.sourceDurationSec)} take
            </span>
            {Number(savedMinutes) > 0 ? (
              <>
                <span>·</span>
                <span className="text-mint-400">{savedMinutes} min of dead air removed</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span
            aria-live="polite"
            className={cn(
              "hidden items-center gap-1.5 font-mono text-2xs transition-opacity sm:inline-flex",
              saved === "idle" ? "opacity-0" : "opacity-100",
              saved === "saved" && "text-mint-400",
              saved === "error" && "text-rose-300",
              (saved === "idle" || saved === "saving") && "text-fg-faint",
            )}
          >
            {saved === "saving" ? (
              <>
                <span className="size-1.5 rounded-full bg-current animate-pulse" />
                Saving
              </>
            ) : saved === "error" ? (
              <>
                <Icon name="alert" className="size-3" strokeWidth={2.4} />
                Not saved
              </>
            ) : (
              <>
                <Icon name="check" className="size-3" strokeWidth={3} />
                Saved
              </>
            )}
          </span>
          <Button href={`/d/${project.slug}`} variant="ghost" size="sm">
            <Icon name="eye" className="size-4" strokeWidth={1.8} />
            <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Icon name="share" className="size-4" strokeWidth={1.8} />
            <span className="hidden sm:inline">Share</span>
          </Button>
          <Button size="sm" onClick={() => setExportOpen(true)}>
            <Icon name="download" className="size-4" strokeWidth={1.9} />
            Export
          </Button>
        </div>
      </header>

      {/* ---------------- placeholder-transcript warning ---------------- */}
      {/*
        The mock providers are what make this app explorable with no
        credentials, and they are worth keeping. But a person who records
        themselves and reads back words they never said deserves to be told
        why before they spend an hour editing them — not after.
      */}
      {!transcriptionLive && project.segments.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2 text-2xs text-amber-200">
          <Icon name="alert" className="size-3.5 shrink-0" strokeWidth={2.2} />
          <span className="font-medium">This transcript is a placeholder.</span>
          <span className="text-amber-200/80">
            No speech-to-text provider is configured, so these words were generated rather than
            heard.
            {transcriptionMissing.length > 0 ? (
              <>
                {" "}
                Set <code className="font-mono">{transcriptionMissing.join(", ")}</code> and
                reprocess the take to transcribe it for real.
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      {/* ---------------- body ---------------- */}
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[19rem_1fr_19rem] 2xl:grid-cols-[22rem_1fr_21rem]">
        <div className="hidden min-h-0 min-w-0 xl:flex xl:flex-col">
          <Transcript
            project={project}
            state={state}
            timeline={timeline}
            activeWord={active}
            activeSegment={selected ?? activeSegIndex}
            onSeek={seek}
            onSelectSegment={setSelected}
            onToggleSegment={toggleSegment}
            onCutWords={setWordsCut}
            onEditWords={editWords}
            onGlossary={(term) => void rememberTerm(term)}
            onToggleFillers={() => patch({ removeFillers: !state.removeFillers })}
            onAsk={(text) => setAsk({ text, at: Date.now() })}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-col">
          <Canvas
            project={project}
            segment={activeSegment}
            captionText={captionText}
            time={time}
            duration={duration}
            playing={playing}
            state={state}
            mediaUrl={mediaUrl}
            sourceTime={sourceTime}
            onScrub={seek}
            onTogglePlay={() => setPlaying((p) => !p)}
          />
          <TimelineStrip
            project={project}
            state={state}
            continuous={narrated}
            time={time}
            duration={duration}
            activeSegment={selected ?? activeSegIndex}
            onScrub={seek}
            onSelectSegment={setSelected}
          />
        </div>

        <div className="hidden min-h-0 min-w-0 xl:flex xl:flex-col">
          <Inspector
            project={project}
            segment={inspected}
            segmentIndex={inspectedIndex}
            state={state}
            onState={patch}
            voices={voices}
            voiceId={voiceId}
            onVoice={(next) => void chooseVoice(next)}
            ask={ask}
            onAsked={() => setAsk(null)}
          />
        </div>
      </div>

      {/* small screens: stacked transcript below */}
      <div className="min-h-0 border-t border-[var(--line)] xl:hidden">
        <div className="max-h-[50vh] overflow-y-auto">
          <Transcript
            project={project}
            state={state}
            timeline={timeline}
            activeWord={active}
            activeSegment={selected ?? activeSegIndex}
            onSeek={seek}
            onSelectSegment={setSelected}
            onToggleSegment={toggleSegment}
            onCutWords={setWordsCut}
            onEditWords={editWords}
            onGlossary={(term) => void rememberTerm(term)}
            onToggleFillers={() => patch({ removeFillers: !state.removeFillers })}
          />
        </div>
      </div>

      {exportOpen ? (
        <ExportDialog project={project} duration={duration} onClose={() => setExportOpen(false)} />
      ) : null}
    </div>
  );
}
