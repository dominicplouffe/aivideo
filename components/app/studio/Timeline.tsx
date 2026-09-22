"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { Project, Segment } from "@/lib/app-data";
import { silentSpanSec, wordKey } from "@/lib/segments";
import { chapterSpan, isWordRemoved, resolveWords, type EditState, type EditedWord } from "./types";

/**
 * The timeline: scenes on a zoomable track, speech beneath, an overview of
 * the whole video above.
 *
 * The first version was one row of scene blocks squeezed to the panel's
 * width — forty-two scenes in a thousand pixels, each block a letter wide,
 * with a speech lane beneath it drawn in *source* time so its bars did not
 * even line up with the scenes. What editors converged on is here instead:
 * a track that zooms (⌘ or Ctrl with the wheel, or the buttons; ⌘+ ⌘− ⌘0)
 * and scrolls sideways (Shift with the wheel, or a trackpad), following the
 * playhead while it plays and stopping when the person takes the wheel; a
 * ruler; scene blocks that show a thumbnail, a number, the title and the
 * length when there is room and degrade gracefully when there is not; and
 * an overview bar of the whole video with the visible window drawn on it,
 * which is also the fastest way to jump.
 */

interface Props {
  project: Project;
  state: EditState;
  /** The edited timeline the player is following, in output time. */
  timeline: EditedWord[];
  duration: number;
  time: number;
  playing: boolean;
  activeSegment: number | null;
  /** Narrated: chapters weigh their full (trimmed) span. */
  continuous?: boolean;
  /** Under a narrated preview, each chapter's fitted length, by segment id. */
  chapterSeconds?: Record<string, number>;
  /** The take, for thumbnails. */
  mediaUrl?: string | null;
  /** Words pinned to frames, to draw on the track. */
  pins?: { key: string; label: string; segIndex: number; wordIndex: number }[];
  onUnpin?: (key: string) => void;
  onScrub: (t: number) => void;
  onSelectSegment: (i: number) => void;
}

const MAX_PX_PER_SEC = 240;
/** Below this width a block shows its number only; below half of it, nothing but colour. */
const LABEL_MIN_PX = 72;
const THUMB_MIN_PX = 110;
const THUMB_W = 48;

export function Timeline({
  project,
  state,
  timeline,
  duration,
  time,
  playing,
  activeSegment,
  continuous = false,
  chapterSeconds,
  mediaUrl,
  pins = [],
  onUnpin,
  onScrub,
  onSelectSegment,
}: Props) {
  /* ---------------- layout: chapters on the output timeline ---------------- */
  const weightOf = useCallback(
    (s: Segment, i: number) =>
      chapterSeconds
        ? chapterSeconds[s.id] ?? 0
        : continuous
          ? silentSpanSec(chapterSpan(s, i, state))
          : s.words.length === 0
            ? silentSpanSec(s)
            : resolveWords(s, i, state)
                .filter((w) => !isWordRemoved(state, i, w.wordIndex, w))
                .reduce((m, w) => m + w.d, 0) + 0.35,
    [chapterSeconds, continuous, state],
  );
  const scenes = useMemo(() => {
    let acc = 0;
    return project.segments
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => !state.deletedSegments.has(i))
      .map(({ s, i }) => {
        const seconds = weightOf(s, i);
        const start = acc;
        acc += seconds;
        return { s, i, start, seconds };
      });
  }, [project.segments, state.deletedSegments, weightOf]);
  const total = Math.max(duration, scenes.reduce((n, sc) => n + sc.seconds, 0), 0.1);

  /* ---------------- zoom and scroll ---------------- */
  const scroller = useRef<HTMLDivElement>(null);
  const [viewportPx, setViewportPx] = useState(800);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportPx(el.clientWidth));
    ro.observe(el);
    setViewportPx(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const fitPxPerSec = viewportPx / total;
  // null means "fit the panel"; a number is a zoom the person chose.
  const [zoom, setZoom] = useState<number | null>(null);
  const pxPerSec = Math.min(MAX_PX_PER_SEC, Math.max(fitPxPerSec, zoom ?? fitPxPerSec));
  const trackWidth = Math.max(viewportPx, total * pxPerSec);
  const zoomed = pxPerSec > fitPxPerSec + 1e-6;
  const x = (t: number) => t * pxPerSec;

  const zoomBy = useCallback(
    (factor: number, aroundClientX?: number) => {
      const el = scroller.current;
      const next = Math.min(MAX_PX_PER_SEC, Math.max(fitPxPerSec, pxPerSec * factor));
      if (el && aroundClientX !== undefined) {
        // Keep the second under the pointer where it is.
        const rect = el.getBoundingClientRect();
        const offset = aroundClientX - rect.left;
        const second = (el.scrollLeft + offset) / pxPerSec;
        requestAnimationFrame(() => {
          el.scrollLeft = second * next - offset;
        });
      }
      setZoom(next <= fitPxPerSec + 1e-6 ? null : next);
    },
    [fitPxPerSec, pxPerSec],
  );

  // The person's own scrolling pauses the follow for a moment.
  const userScrolledAt = useRef(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomBy(e.deltaY < 0 ? 1.25 : 0.8, e.clientX);
        return;
      }
      // Shift turns a vertical wheel sideways; a trackpad already is.
      if (e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
      userScrolledAt.current = Date.now();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomBy(1.25);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomBy(0.8);
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomBy]);

  // Follow the playhead while playing: when it nears the right edge, page
  // forward so it lands a third of the way in — the way an editor's
  // timeline pages rather than crawls, so the eye is not chasing it.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing || !zoomed) return;
    if (Date.now() - userScrolledAt.current < 3000) return;
    const px = x(time);
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    if (px > right - 48 || px < left) el.scrollLeft = Math.max(0, px - el.clientWidth * 0.3);
  }, [time, playing, zoomed, pxPerSec]);

  /* ---------------- ruler ---------------- */
  const ticks = useMemo(() => {
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const step = steps.find((s) => s * pxPerSec >= 72) ?? 600;
    const out: number[] = [];
    for (let t = 0; t <= total + 1e-6; t += step) out.push(t);
    return { step, at: out };
  }, [pxPerSec, total]);

  /* ---------------- speech lane, in output time ---------------- */
  const speech = useMemo(() => {
    const bucketPx = 3;
    const count = Math.max(1, Math.ceil(trackWidth / bucketPx));
    const bucketSec = total / count;
    const bars = Array.from({ length: count }, () => ({ spoken: 0, cut: false }));
    const bucketOf = (t: number) => Math.min(count - 1, Math.max(0, Math.floor(t / bucketSec)));
    for (const w of timeline) {
      if (w.silent) continue;
      for (let b = bucketOf(w.start); b <= bucketOf(Math.max(w.start, w.end - 1e-6)); b++) {
        const from = Math.max(w.start, b * bucketSec);
        const to = Math.min(w.end, (b + 1) * bucketSec);
        bars[b].spoken += Math.max(0, to - from);
      }
    }
    // Removed words have no output time; they are marked where the join is.
    project.segments.forEach((seg, segIndex) => {
      if (state.deletedSegments.has(segIndex)) return;
      const kept = timeline.filter((w) => w.segIndex === segIndex);
      if (kept.length === 0) return;
      for (const w of resolveWords(seg, segIndex, state)) {
        if (!isWordRemoved(state, segIndex, w.wordIndex, w)) continue;
        const next = kept.find((k) => k.srcStart >= w.t);
        const at = next ? next.start : kept[kept.length - 1].end;
        bars[bucketOf(at)].cut = true;
      }
    });
    return bars.map((b) => ({ density: Math.min(1, b.spoken / bucketSec), cut: b.cut }));
  }, [timeline, trackWidth, total, project.segments, state]);

  /* ---------------- thumbnails ---------------- */
  const thumbs = useSceneThumbnails(
    mediaUrl ?? null,
    scenes.map(({ s, i }) => ({ id: s.id, at: continuous ? chapterSpan(s, i, state).start : s.start })),
    pxPerSec * Math.min(...scenes.map((sc) => sc.seconds), Infinity) >= THUMB_MIN_PX ||
      scenes.some((sc) => sc.seconds * pxPerSec >= THUMB_MIN_PX),
  );

  /* ---------------- pins on the track ---------------- */
  const pinMarks = useMemo(
    () =>
      pins
        .map((pin) => {
          const entry = timeline.find((w) => w.segIndex === pin.segIndex && w.wordIndex === pin.wordIndex);
          return entry ? { ...pin, at: entry.start } : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [pins, timeline],
  );

  /* ---------------- overview drag ---------------- */
  const overview = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const scrubOverview = (clientX: number) => {
    const el = overview.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onScrub(Math.min(total, Math.max(0, ((clientX - rect.left) / rect.width) * total)));
  };
  const scrubTrack = (clientX: number) => {
    const el = scroller.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onScrub(Math.min(total, Math.max(0, (el.scrollLeft + clientX - rect.left) / pxPerSec)));
  };

  const viewFrom = scroller.current ? scroller.current.scrollLeft / pxPerSec : 0;
  const viewSec = viewportPx / pxPerSec;

  return (
    <div className="border-t border-[var(--line)] bg-ink-950 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">Timeline</span>
        <div className="flex items-center gap-3 font-mono text-2xs text-fg-faint">
          <span>{scenes.length} scenes</span>
          <span>{state.removeFillers ? "fillers cut" : "verbatim"}</span>
          <span className="text-fg-muted tabular-nums">{formatDuration(duration)}</span>
          <span className="flex items-center gap-0.5 border-l border-[var(--line)] pl-3" role="group" aria-label="Zoom">
            <ZoomButton label="Zoom out (⌘−)" onClick={() => zoomBy(0.8)} disabled={!zoomed}>
              −
            </ZoomButton>
            <ZoomButton label="Fit to panel (⌘0)" onClick={() => setZoom(null)} disabled={!zoomed}>
              Fit
            </ZoomButton>
            <ZoomButton label="Zoom in (⌘+)" onClick={() => zoomBy(1.25)} disabled={pxPerSec >= MAX_PX_PER_SEC - 1e-6}>
              +
            </ZoomButton>
          </span>
        </div>
      </div>

      {/* overview: the whole video, the window on it, the playhead */}
      <div
        ref={overview}
        role="slider"
        aria-label="Overview"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(time)}
        tabIndex={-1}
        className="relative mb-2 h-3 cursor-pointer overflow-hidden rounded-full border border-[var(--line)] bg-ink-900"
        onMouseDown={(e) => {
          dragging.current = true;
          scrubOverview(e.clientX);
        }}
        onMouseMove={(e) => dragging.current && scrubOverview(e.clientX)}
        onMouseUp={() => (dragging.current = false)}
        onMouseLeave={() => (dragging.current = false)}
      >
        {scenes.map((sc, k) => (
          <span
            key={sc.s.id}
            aria-hidden
            className={cn("absolute inset-y-0", k % 2 ? "bg-iris-500/10" : "bg-iris-500/[0.18]", activeSegment === sc.i && "bg-iris-500/40")}
            style={{ left: `${(sc.start / total) * 100}%`, width: `${(sc.seconds / total) * 100}%` }}
          />
        ))}
        {zoomed ? (
          <span
            aria-hidden
            className="absolute inset-y-0 rounded-full border border-fg/40 bg-fg/[0.06]"
            style={{ left: `${(viewFrom / total) * 100}%`, width: `${Math.min(100, (viewSec / total) * 100)}%` }}
          />
        ) : null}
        <span aria-hidden className="absolute inset-y-0 w-px bg-iris-400" style={{ left: `${(time / total) * 100}%` }} />
      </div>

      {/* the track */}
      <div
        ref={scroller}
        className="relative overflow-x-auto overflow-y-hidden rounded-lg border border-[var(--line)] bg-ink-900 [scrollbar-width:thin]"
        onScroll={() => (userScrolledAt.current = Date.now())}
      >
        <div className="relative" style={{ width: trackWidth }} onClick={(e) => scrubTrack(e.clientX)}>
          {/* ruler */}
          <div className="relative h-4 border-b border-[var(--line)]">
            {ticks.at.map((t) => (
              <span
                key={t}
                aria-hidden
                className="absolute top-0 flex h-full items-end gap-1 border-l border-[var(--line-strong)] pl-1 font-mono text-[0.5625rem] leading-none text-fg-faint"
                style={{ left: x(t) }}
              >
                {formatDuration(t)}
              </span>
            ))}
          </div>

          {/* scenes */}
          <div className="relative h-14">
            {scenes.map((sc, k) => {
              const width = Math.max(2, x(sc.seconds) - 1);
              const thumb = thumbs.get(sc.s.id);
              const showLabel = width >= LABEL_MIN_PX;
              const showNumber = width >= LABEL_MIN_PX / 2;
              const showThumb = width >= THUMB_MIN_PX && thumb;
              const showLength = width >= 150;
              const isActive = activeSegment === sc.i;
              return (
                <button
                  key={sc.s.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSegment(sc.i);
                    onScrub(sc.start + 0.01);
                  }}
                  title={`${String(sc.i + 1).padStart(2, "0")} ${sc.s.title} · ${formatDuration(sc.seconds)}`}
                  className={cn(
                    "absolute inset-y-1 flex items-center gap-2 overflow-hidden rounded-md border px-1.5 text-left transition-colors",
                    isActive
                      ? "border-iris-500/60 bg-iris-500/[0.18]"
                      : k % 2
                        ? "border-[var(--line)] bg-ink-850 hover:bg-ink-800"
                        : "border-[var(--line)] bg-ink-900 hover:bg-ink-850",
                  )}
                  style={{ left: x(sc.start), width }}
                >
                  {showThumb ? (
                    // A frame from the scene's own footage.
                    <img src={thumb} alt="" className="h-full w-12 shrink-0 rounded-sm object-cover" style={{ width: THUMB_W }} />
                  ) : null}
                  {showNumber ? (
                    <span className="shrink-0 font-mono text-2xs text-fg-faint">{String(sc.i + 1).padStart(2, "0")}</span>
                  ) : null}
                  {showLabel ? <span className="min-w-0 flex-1 truncate text-[0.6875rem] text-fg-muted">{sc.s.title}</span> : null}
                  {showLength ? (
                    <span className="shrink-0 font-mono text-2xs text-fg-faint tabular-nums">{formatDuration(sc.seconds)}</span>
                  ) : null}
                  {sc.s.zoom && sc.s.zoom.scale > 1.2 && state.zoomEnabled && width >= LABEL_MIN_PX ? (
                    <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 rounded bg-cyan-500/20 px-1 font-mono text-[0.5rem] text-cyan-300">
                      <Icon name="zoom" className="size-2" strokeWidth={3} />
                      {sc.s.zoom.scale.toFixed(1)}
                    </span>
                  ) : null}
                </button>
              );
            })}
            {/* pins */}
            {pinMarks.map((pin) => (
              <button
                key={pin.key}
                type="button"
                title={`“${pin.label}” is pinned to this frame. Click to unpin.`}
                aria-label={`Unpin ${pin.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onUnpin?.(pin.key);
                }}
                className="absolute -top-0.5 z-10 -translate-x-1/2 rounded-full bg-amber-400 p-0.5 text-ink-950 shadow hover:bg-amber-300"
                style={{ left: x(pin.at) }}
              >
                <Icon name="target" className="size-2.5" strokeWidth={3} />
              </button>
            ))}
          </div>

          {/* speech, in output time, aligned with the scenes above */}
          <div className="flex h-6 items-center gap-px border-t border-[var(--line)] px-px" aria-label="Speech" role="img">
            {speech.map((bar, i) => (
              <span
                key={i}
                className={cn(
                  "w-[2px] shrink-0 rounded-full",
                  bar.cut && (state.removeFillers || state.cutWords.size > 0)
                    ? "bg-rose-500/60"
                    : bar.density > 0
                      ? state.studioSound
                        ? "bg-cyan-400/65"
                        : "bg-fg-faint/45"
                      : "bg-fg-faint/12",
                )}
                style={{ height: `${Math.max(8, Math.round(bar.density * 100))}%` }}
              />
            ))}
          </div>

          {/* playhead */}
          <span aria-hidden className="pointer-events-none absolute inset-y-0 z-10 w-px bg-iris-400" style={{ left: x(time) }}>
            <span className="absolute -top-px left-1/2 size-2 -translate-x-1/2 rotate-45 bg-iris-400" />
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-[0.625rem] text-fg-faint">
        ⌘ or Ctrl + wheel to zoom · Shift + wheel to scroll · click the overview to jump
      </p>
    </div>
  );
}

function ZoomButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-mono text-2xs text-fg-subtle transition-colors hover:bg-ink-800 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/**
 * One frame per scene, drawn from the take in the background.
 *
 * A hidden video element seeks to each scene's first second and a small
 * canvas captures the frame, one scene at a time so the decoder is never
 * asked for two things at once. Cached by take and second, so a re-render
 * of the panel costs nothing and a zoom that reveals a block finds its
 * frame ready. Started only when a block is wide enough to show one.
 */
const thumbnailCache = new Map<string, string>();

function useSceneThumbnails(
  mediaUrl: string | null,
  wanted: { id: string; at: number }[],
  enabled: boolean,
): Map<string, string> {
  const [, bump] = useState(0);
  const running = useRef(false);
  const cancelled = useRef(false);
  const key = (at: number) => `${mediaUrl}#${at.toFixed(2)}`;

  useEffect(() => {
    cancelled.current = false;
    if (!mediaUrl || !enabled || running.current) return;
    const missing = wanted.filter((w) => !thumbnailCache.has(key(w.at)));
    if (missing.length === 0) return;
    running.current = true;
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = mediaUrl;
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext("2d");
    const seekTo = (t: number) =>
      new Promise<void>((resolve) => {
        const done = () => {
          video.removeEventListener("seeked", done);
          resolve();
        };
        video.addEventListener("seeked", done);
        video.currentTime = t;
      });
    (async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          video.addEventListener("loadedmetadata", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("video failed to load")), { once: true });
        });
        for (const w of missing) {
          if (cancelled.current) break;
          // A moment into the scene rather than its first frame, which is
          // often the tail of the previous transition.
          await seekTo(w.at + 0.4);
          if (!ctx) break;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnailCache.set(key(w.at), canvas.toDataURL("image/jpeg", 0.6));
          bump((n) => n + 1);
        }
      } catch {
        // No thumbnails, then. The blocks still have their numbers and titles.
      } finally {
        video.removeAttribute("src");
        video.load();
        running.current = false;
      }
    })();
    return () => {
      cancelled.current = true;
    };
  }, [mediaUrl, enabled, wanted.map((w) => `${w.id}:${w.at.toFixed(2)}`).join("|")]);

  const out = new Map<string, string>();
  for (const w of wanted) {
    const hit = thumbnailCache.get(key(w.at));
    if (hit) out.set(w.id, hit);
  }
  return out;
}
