"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn, formatDuration, stablePercent } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { MockApp } from "@/components/marketing/MockApp";
import type { Project, Segment } from "@/lib/app-data";
import { silentSpanSec, wordKey } from "@/lib/segments";
import { isWordRemoved, resolveWords, type EditState } from "./types";

export function Canvas({
  project,
  segment,
  captionText,
  time,
  duration,
  playing,
  state,
  mediaUrl,
  sourceTime,
  onScrub,
  onTogglePlay,
}: {
  project: Project;
  segment: Segment | null;
  captionText: string;
  time: number;
  duration: number;
  playing: boolean;
  state: EditState;
  /** The take behind this project, when there is one. */
  mediaUrl?: string | null;
  /** Where the playhead points in the *source* file, not the edited one. */
  sourceTime?: number | null;
  onScrub: (t: number) => void;
  onTogglePlay: () => void;
}) {
  const zoom = state.zoomEnabled ? segment?.zoom : undefined;
  const scale = zoom?.scale ?? 1;
  const origin = zoom ? `${zoom.x}% ${zoom.y}%` : "50% 50%";

  const video = useRef<HTMLVideoElement>(null);

  // Play and pause follow the Studio's transport rather than the video's own
  // controls, so the spacebar means one thing everywhere in the editor.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (playing) void el.play().catch(() => {});
    else el.pause();
  }, [playing, mediaUrl]);

  // Seek only when the file has drifted from where the edit says it should
  // be. Writing `currentTime` on every frame would re-decode continuously
  // and stutter; the threshold lets a run of uncut words play at native
  // speed and jumps only at an actual cut.
  useEffect(() => {
    const el = video.current;
    if (!el || sourceTime == null || !Number.isFinite(sourceTime)) return;
    if (Math.abs(el.currentTime - sourceTime) > 0.32) {
      try {
        el.currentTime = sourceTime;
      } catch {
        // Seeking before metadata has loaded throws in some browsers. The
        // next frame's effect will do it once the file is ready.
      }
    }
  }, [sourceTime]);

  // `studioSound` is the Studio's mute, and a preview that ignores it is a
  // preview of a different video than the one being exported.
  useEffect(() => {
    const el = video.current;
    if (el) el.muted = !state.studioSound;
  }, [state.studioSound]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* viewport */}
      <div className="flex min-h-0 flex-1 items-center justify-center bg-ink-1000 p-4 md:p-6">
        <div className="relative w-full max-w-4xl">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[#0B0D14] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)]">
            <div
              className="absolute inset-0 transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ transform: `scale(${scale})`, transformOrigin: origin }}
            >
              {mediaUrl ? (
                <video
                  ref={video}
                  src={mediaUrl}
                  className="size-full object-contain"
                  playsInline
                  preload="metadata"
                  // The transport lives in the Studio header; a second set of
                  // controls inside the frame is two things to disagree.
                  controls={false}
                />
              ) : (
                // Fixture projects have no footage behind them. Showing the
                // sample interface is honest for those and nothing else.
                <MockApp highlight={Boolean(zoom && zoom.scale > 1.6)} />
              )}
            </div>

            {/*
              The brand frame and watermark only draw over the illustrated
              canvas.

              Two things were wrong with them over a real take. The word
              was "Meridian" — a fixture workspace's name, shown to every
              account regardless of theirs. And the renderer burns in
              neither, so a preview carrying them showed something the
              exported file would not have, which is the one thing a preview
              must not do.
            */}
            {!mediaUrl ? (
              <>
                <div aria-hidden className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-iris-500/20" />
                <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 backdrop-blur-sm">
                  <span className="size-3 rounded-[4px] bg-gradient-to-br from-cyan-400 to-iris-500" />
                  <span className="text-[0.5rem] font-semibold text-white/85">Sample</span>
                </div>
              </>
            ) : null}

            {/* The presenter bubble is drawn here and by nothing else: the
                encoder has no overlay for it. It stays as a preview of what
                the setting means, over the sample canvas only. */}
            {state.presenter && !mediaUrl ? (
              <div className="absolute right-4 bottom-12 size-20 overflow-hidden rounded-2xl border-2 border-white/15 bg-[linear-gradient(160deg,#2A2140,#131826)]">
                <div className="flex h-full flex-col items-center justify-end pb-1">
                  <div className="size-8 rounded-full bg-[linear-gradient(140deg,#8B7355,#5C4A3A)]" />
                  <div className="-mt-1 h-8 w-11 rounded-t-2xl bg-[linear-gradient(160deg,var(--color-iris-600),var(--color-iris-700))]" />
                </div>
              </div>
            ) : null}

            {/* zoom reticle */}
            {zoom && zoom.scale > 1.2 ? (
              <span
                aria-hidden
                className="pointer-events-none absolute"
                style={{ left: `${zoom.x}%`, top: `${zoom.y}%` }}
              >
                <span className="absolute -translate-x-1/2 -translate-y-1/2">
                  <span className="block size-9 rounded-full border border-cyan-400/50 animate-pulse-ring" />
                </span>
                <span className="absolute block size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400 shadow-[0_0_12px_3px_rgba(34,211,238,0.55)]" />
              </span>
            ) : null}

            {/* caption */}
            {state.captions && captionText ? (
              <div className="absolute inset-x-0 bottom-3 flex justify-center px-6">
                <span className="max-w-[80%] rounded-lg bg-black/68 px-3 py-1.5 text-center text-[0.75rem] leading-snug font-medium text-white/93 backdrop-blur-sm">
                  {captionText}
                </span>
              </div>
            ) : null}

            {/* play overlay */}
            {!playing ? (
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label="Play"
                className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
              >
                <span className="inline-flex size-14 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm">
                  <Icon name="play" className="size-5 text-white/92" />
                </span>
              </button>
            ) : null}
          </div>

          {/* transport */}
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--line)] bg-ink-950 px-3.5 py-2.5">
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={playing ? "Pause" : "Play"}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-fg transition-colors hover:bg-ink-750"
            >
              <Icon name={playing ? "pause" : "play"} className="size-3.5" strokeWidth={2.2} />
            </button>

            <span className="shrink-0 font-mono text-2xs text-fg-muted tabular-nums">
              {formatDuration(time)}
            </span>

            <input
              type="range"
              min={0}
              max={Math.max(0.1, duration)}
              step={0.01}
              value={Math.min(time, duration)}
              onChange={(e) => onScrub(Number(e.target.value))}
              aria-label="Seek"
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              style={{
                background: `linear-gradient(90deg, var(--color-iris-500) ${(time / Math.max(0.1, duration)) * 100}%, color-mix(in oklab, var(--color-fg) 12%, transparent) ${(time / Math.max(0.1, duration)) * 100}%)`,
              }}
            />

            <span className="shrink-0 font-mono text-2xs text-fg-faint tabular-nums">
              {formatDuration(duration)}
            </span>

            <span className="ml-1 hidden shrink-0 items-center gap-1.5 border-l border-[var(--line)] pl-3 sm:flex">
              <span className="font-mono text-2xs text-fg-faint">
                {project.sourceDurationSec > 0
                  ? `−${Math.round((1 - duration / project.sourceDurationSec) * 100)}% vs raw take`
                  : ""}
              </span>
            </span>
          </div>

          {/* current step */}
          {segment ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5 px-1">
              <span className="font-mono text-2xs text-fg-faint">NOW</span>
              <span className="text-[0.8125rem] text-fg">{segment.title}</span>
              {segment.action ? (
                <span className="rounded bg-ink-850 px-1.5 py-0.5 font-mono text-2xs text-cyan-300">
                  {segment.action}
                </span>
              ) : null}
              {zoom && zoom.scale > 1 ? (
                <span className="inline-flex items-center gap-1 rounded bg-cyan-500/12 px-1.5 py-0.5 font-mono text-2xs text-cyan-300">
                  <Icon name="zoom" className="size-2.5" strokeWidth={2.4} />
                  {zoom.scale.toFixed(1)}×
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- timeline strip */

export function TimelineStrip({
  project,
  state,
  continuous = false,
  time,
  duration,
  activeSegment,
  onScrub,
  onSelectSegment,
}: {
  project: Project;
  state: EditState;
  /** Narrated: chapters play whole, so each weighs its full span. */
  continuous?: boolean;
  time: number;
  duration: number;
  activeSegment: number | null;
  onScrub: (t: number) => void;
  onSelectSegment: (i: number) => void;
}) {
  const live = project.segments
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => !state.deletedSegments.has(i));

  /**
   * The speech lane, bucketed across the source recording.
   *
   * Density is the fraction of each bucket that carries a spoken word, which
   * is a real property of the transcript. `cut` marks a bucket containing
   * words the current edit removes, so the red bars line up with what
   * actually disappears.
   */
  const speech = useMemo(() => {
    const BUCKETS = 110;
    const words = project.segments.flatMap((segment, segIndex) =>
      resolveWords(segment, segIndex, state).map((word) => ({ ...word, segIndex })),
    );

    const span = Math.max(
      project.sourceDurationSec,
      words.reduce((end, word) => Math.max(end, word.t + word.d), 0),
      1,
    );
    const bucketSec = span / BUCKETS;

    const bars = Array.from({ length: BUCKETS }, () => ({ spoken: 0, cut: false }));
    for (const word of words) {
      const index = Math.min(BUCKETS - 1, Math.max(0, Math.floor(word.t / bucketSec)));
      bars[index].spoken += word.d;
      if (
        word.cut ||
        state.deletedSegments.has(word.segIndex) ||
        state.cutWords.has(wordKey(word.segIndex, word.wordIndex))
      ) {
        bars[index].cut = true;
      }
    }

    // Clamped at 1: several short words can overflow a bucket, and a bar
    // taller than the lane is a rendering bug rather than a louder moment.
    return bars.map((bar) => ({
      density: Math.min(1, bar.spoken / bucketSec),
      cut: bar.cut,
    }));
  }, [project.segments, project.sourceDurationSec, state]);

  // A chapter's share of the strip is its running time under this edit.
  // Silent footage plays as recorded; see `silentSpanSec`.
  const weightOf = (s: Segment, i: number) =>
    s.words.length === 0 || continuous
      ? silentSpanSec(s)
      : resolveWords(s, i, state)
          .filter((w) => !isWordRemoved(state, i, w.wordIndex, w))
          .reduce((m, w) => m + w.d, 0);
  const totalWeight = live.reduce((n, { s, i }) => n + weightOf(s, i), 0);

  let acc = 0;
  const laid = live.map(({ s, i }) => {
    const w = weightOf(s, i);
    const start = acc;
    acc += w;
    return { s, i, start, width: w / Math.max(0.01, totalWeight) };
  });

  const playheadPct = duration ? (time / duration) * 100 : 0;

  return (
    <div className="border-t border-[var(--line)] bg-ink-950 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">Timeline</span>
        <div className="flex items-center gap-3 font-mono text-2xs text-fg-faint">
          <span>{laid.length} scenes</span>
          <span>{state.removeFillers ? "fillers cut" : "verbatim"}</span>
          <span className="text-fg-muted tabular-nums">{formatDuration(duration)}</span>
        </div>
      </div>

      <div
        className="relative"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onScrub(((e.clientX - rect.left) / rect.width) * duration);
        }}
      >
        {/* scene lane */}
        <div className="flex h-11 gap-px overflow-hidden rounded-lg border border-[var(--line)]">
          {laid.map(({ s, i, width }) => (
            <button
              key={s.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectSegment(i);
              }}
              title={s.title}
              style={{ width: `${width * 100}%` }}
              className={cn(
                "group relative flex min-w-0 items-center overflow-hidden px-2 text-left transition-colors",
                activeSegment === i
                  ? "bg-[color-mix(in_oklab,var(--color-iris-500)_24%,transparent)]"
                  : "bg-ink-900 hover:bg-ink-850",
              )}
            >
              <span className="truncate text-[0.6875rem] text-fg-muted">{s.title}</span>
              {s.zoom && s.zoom.scale > 1.2 && state.zoomEnabled ? (
                <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 rounded bg-cyan-500/20 px-1 font-mono text-[0.5rem] text-cyan-300">
                  <Icon name="zoom" className="size-2" strokeWidth={3} />
                  {s.zoom.scale.toFixed(1)}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/*
          Speech across the source take.

          This was `Math.sin` at three frequencies, with the "cut" bars at a
          hardcoded list of indices — `[12, 13, 34, 35, 36, 61, 62, 88, 89]`
          — which turned red when filler removal was on. It sat directly
          under a real video and read as measured audio.

          It is measured now, from the transcript rather than the waveform:
          each bar is how much of that slice of the recording was speech, and
          a bar is red when the words in it are ones the edit removes. It is
          labelled for what it is, because it is not an amplitude plot.
        */}
        <div className="mt-1 flex items-center gap-2">
          <span className="w-16 shrink-0 font-mono text-[0.5rem] tracking-[0.1em] text-fg-faint uppercase">
            Speech
          </span>
          <div className="flex h-7 flex-1 items-center gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-ink-900 px-1">
            {speech.map((bar, i) => (
              <span
                key={i}
                className={cn(
                  "flex-1 rounded-full transition-all duration-500",
                  bar.cut && state.removeFillers
                    ? "bg-rose-500/45"
                    : bar.density > 0
                      ? state.studioSound
                        ? "bg-cyan-400/65"
                        : "bg-fg-faint/45"
                      : "bg-fg-faint/12",
                )}
                // `stablePercent` rather than a template string: heights
                // derived from floats are a hydration mismatch waiting to
                // happen when Node and the browser round differently.
                style={{ height: stablePercent(Math.max(0.08, bar.density)) }}
              />
            ))}
          </div>
        </div>

        {/* playhead */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-iris-400"
          style={{ left: `${playheadPct}%` }}
        >
          <span className="absolute -top-1 -left-[3px] size-[7px] rotate-45 rounded-[1px] bg-iris-400" />
        </span>
      </div>
    </div>
  );
}
