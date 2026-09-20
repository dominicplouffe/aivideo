"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/app/Shared";
import type { Project } from "@/lib/app-data";
import { Canvas, TimelineStrip } from "./Canvas";
import { Transcript } from "./Transcript";
import { Inspector } from "./Inspector";
import { ExportDialog } from "./ExportDialog";
import { buildTimeline, timelineDuration, wordAt, type EditState } from "./types";

export function Studio({ project }: { project: Project }) {
  const [state, setState] = useState<EditState>({
    removeFillers: true,
    deletedSegments: new Set<number>(),
    studioSound: true,
    captions: true,
    music: true,
    presenter: false,
    zoomEnabled: true,
  });

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  const timeline = useMemo(() => buildTimeline(project, state), [project, state]);
  const duration = useMemo(() => timelineDuration(timeline), [timeline]);
  const active = useMemo(() => wordAt(timeline, time), [timeline, time]);
  const activeSegIndex = active?.segIndex ?? null;
  const activeSegment = activeSegIndex !== null ? project.segments[activeSegIndex] : null;
  const inspected = selected !== null ? project.segments[selected] : activeSegment;

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
    setSaved("saving");
  }, []);

  useEffect(() => {
    if (saved !== "saving") return;
    const id = setTimeout(() => setSaved("saved"), 650);
    return () => clearTimeout(id);
  }, [saved]);

  const toggleSegment = useCallback(
    (i: number) => {
      setState((s) => {
        const next = new Set(s.deletedSegments);
        next.has(i) ? next.delete(i) : next.add(i);
        return { ...s, deletedSegments: next };
      });
      setSaved("saving");
    },
    [],
  );

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
            className={cn(
              "hidden items-center gap-1.5 font-mono text-2xs transition-opacity sm:inline-flex",
              saved === "idle" ? "opacity-0" : "opacity-100",
              saved === "saved" ? "text-mint-400" : "text-fg-faint",
            )}
          >
            {saved === "saving" ? (
              <>
                <span className="size-1.5 rounded-full bg-current animate-pulse" />
                Saving
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

      {/* ---------------- body ---------------- */}
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[19rem_1fr_19rem] 2xl:grid-cols-[22rem_1fr_21rem]">
        <div className="hidden min-h-0 min-w-0 xl:block">
          <Transcript
            project={project}
            state={state}
            timeline={timeline}
            activeWord={active}
            activeSegment={selected ?? activeSegIndex}
            onSeek={seek}
            onSelectSegment={setSelected}
            onToggleSegment={toggleSegment}
            onToggleFillers={() => patch({ removeFillers: !state.removeFillers })}
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
            onScrub={seek}
            onTogglePlay={() => setPlaying((p) => !p)}
          />
          <TimelineStrip
            project={project}
            state={state}
            time={time}
            duration={duration}
            activeSegment={selected ?? activeSegIndex}
            onScrub={seek}
            onSelectSegment={setSelected}
          />
        </div>

        <div className="hidden min-h-0 min-w-0 xl:block">
          <Inspector project={project} segment={inspected} state={state} onState={patch} />
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
