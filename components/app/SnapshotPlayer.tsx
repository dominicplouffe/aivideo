"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import {
  SNAPSHOT_SANDBOX, tooltipAlign, tooltipSide, type Tour, type TourStep,
} from "@/lib/demo/tour";

/**
 * The interactive demo viewer.
 *
 * It renders the customer's own markup, captured at the moment of each
 * click, inside a sandboxed frame — which is what makes an interactive demo
 * feel like the product rather than a video of it.
 *
 * The sandbox is the load-bearing part. Snapshots contain no scripts by
 * construction, so the frame needs neither `allow-scripts` nor
 * `allow-same-origin`; granting both together would not be a sandbox at all,
 * since the framed document could reach out and remove its own sandbox
 * attribute. The policy lives in `lib/demo/tour.ts` with that reasoning
 * attached, and a test asserts the two tokens never appear together.
 *
 * The hotspot is drawn in an overlay *outside* the frame rather than
 * injected into the snapshot. Injecting would mean editing the customer's
 * markup at display time, which is how a "safe" snapshot quietly becomes
 * executable again.
 */

interface SnapshotPlayerProps {
  tour: Tour;
  /** Starts on this step. Used by the builder's step list. */
  index?: number;
  onIndexChange?: (index: number) => void;
  className?: string;
}

function StepTooltip({ step }: { step: TourStep }) {
  const hotspot = step.hotspot;

  // A step with no hotspot is the closing screen: the tooltip sits at the
  // bottom of the frame, where it covers nothing in particular.
  if (!hotspot) {
    return (
      <div className="pointer-events-auto absolute bottom-[6%] left-1/2 z-20 w-[min(22rem,80%)] -translate-x-1/2 rounded-xl border border-[var(--line-strong)] bg-ink-800/95 p-3 text-center shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] backdrop-blur">
        <p className="text-sm font-semibold text-fg">{step.title}</p>
        {step.caption ? <p className="mt-1 text-xs leading-relaxed text-fg-muted">{step.caption}</p> : null}
      </div>
    );
  }

  const side = tooltipSide(hotspot);
  const align = tooltipAlign(hotspot);
  const vertical = side === "top" || side === "bottom";

  // Anchored to the hotspot's edge and nudged clear of it, so the tooltip
  // never covers the control the viewer is being asked to click — and, when
  // that control is in a corner, aligned to the near edge rather than
  // centred half-way off the frame.
  const position: React.CSSProperties = {
    top:
      side === "bottom" ? `calc(${(hotspot.y + hotspot.h) * 100}% + 10px)`
      : side === "top" ? undefined
      : `${(hotspot.y + hotspot.h / 2) * 100}%`,
    bottom: side === "top" ? `calc(${(1 - hotspot.y) * 100}% + 10px)` : undefined,
    left:
      side === "right" ? `calc(${(hotspot.x + hotspot.w) * 100}% + 10px)`
      : side === "left" ? undefined
      : vertical && align === "end" ? undefined
      : vertical && align === "start" ? `${hotspot.x * 100}%`
      : `${(hotspot.x + hotspot.w / 2) * 100}%`,
    right:
      side === "left" ? `calc(${(1 - hotspot.x) * 100}% + 10px)`
      : vertical && align === "end" ? `${(1 - (hotspot.x + hotspot.w)) * 100}%`
      : undefined,
    transform:
      vertical ? (align === "center" ? "translateX(-50%)" : undefined) : "translateY(-50%)",
  };

  return (
    <div
      className="pointer-events-auto absolute z-20 w-[min(20rem,64%)] rounded-xl border border-[var(--line-strong)] bg-ink-800/95 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] backdrop-blur"
      style={position}
    >
      <p className="text-sm font-semibold text-fg">{step.title}</p>
      {step.caption ? (
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">{step.caption}</p>
      ) : null}
    </div>
  );
}

export function SnapshotPlayer({ tour, index, onIndexChange, className }: SnapshotPlayerProps) {
  const [internal, setInternal] = useState(0);
  const current = index ?? internal;
  const containerRef = useRef<HTMLDivElement>(null);

  const step = tour.steps[current];
  const total = tour.steps.length;

  const go = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(0, next), Math.max(0, total - 1));
      if (index === undefined) setInternal(clamped);
      onIndexChange?.(clamped);
    },
    [index, onIndexChange, total],
  );

  // Arrow keys move between steps when the player has focus. A tour is
  // navigated far more often than it is authored, and reaching for a mouse
  // for every step is the difference between browsing and working.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") go(current + 1);
      if (event.key === "ArrowLeft") go(current - 1);
      if (event.key === "Home") go(0);
      if (event.key === "End") go(total - 1);
    };
    node.addEventListener("keydown", onKey);
    return () => node.removeEventListener("keydown", onKey);
  }, [current, go, total]);

  const aspect = useMemo(() => {
    if (!step) return 16 / 9;
    const { width, height } = step.snapshot.viewport;
    return width > 0 && height > 0 ? width / height : 16 / 9;
  }, [step]);

  /**
   * The frame is rendered at the viewport it was captured in and scaled to
   * fit, never resized to fit.
   *
   * A responsive application reflows: shrink the frame to 960px and the
   * sidebar collapses, the form moves, and every hotspot — whose coordinates
   * are fractions of the *captured* viewport — points at the wrong control.
   * Scaling keeps the layout identical to what the person recorded, which is
   * the entire claim an interactive demo makes.
   */
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !step) return;
    const captured = step.snapshot.viewport.width;
    if (captured <= 0) return;

    const measure = () => setScale(node.clientWidth / captured);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [step]);

  if (!step) {
    return (
      <div className={cn("grid place-items-center rounded-2xl border border-[var(--line)] bg-ink-850 p-12 text-center", className)}>
        <div>
          <p className="text-sm font-semibold text-fg">No steps captured yet</p>
          <p className="mt-1 max-w-sm text-xs text-fg-muted">
            Record a session with the capture extension. Every click becomes a step, and the
            screen it produced becomes the slide.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={containerRef}
        tabIndex={0}
        role="group"
        aria-label={`Interactive demo, step ${current + 1} of ${total}: ${step.title}`}
        className="relative min-w-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-white outline-none ring-offset-2 ring-offset-[var(--color-ink-900)] focus-visible:ring-2 focus-visible:ring-[var(--color-iris-400)]"
        style={{ aspectRatio: String(aspect) }}
      >
        <iframe
          // Keyed by step so React replaces the frame rather than mutating
          // a document that has already been parsed.
          key={step.id}
          title={`${step.snapshot.title} — step ${current + 1}`}
          srcDoc={step.snapshot.html}
          sandbox={SNAPSHOT_SANDBOX}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="absolute left-0 top-0 origin-top-left border-0 bg-white"
          style={{
            width: `${step.snapshot.viewport.width}px`,
            height: `${step.snapshot.viewport.height}px`,
            transform: `scale(${scale})`,
          }}
        />

        {/* Overlay: outside the frame, so the snapshot is never edited to
            display it. Click-through except for the tooltip itself. */}
        <div className="pointer-events-none absolute inset-0">
          {step.hotspot ? (
            <button
              type="button"
              onClick={() => go(current + 1)}
              aria-label={step.title}
              className="pointer-events-auto absolute rounded-lg ring-2 ring-[var(--color-iris-400)] ring-offset-2 ring-offset-transparent transition-[box-shadow] duration-200 hover:ring-[var(--color-cyan-300)] motion-safe:animate-[pulse_2.4s_ease-in-out_infinite]"
              style={{
                left: `${step.hotspot.x * 100}%`,
                top: `${step.hotspot.y * 100}%`,
                width: `${step.hotspot.w * 100}%`,
                height: `${step.hotspot.h * 100}%`,
              }}
            />
          ) : null}
          <StepTooltip step={step} />
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <Button size="sm" variant="secondary" onClick={() => go(current - 1)} disabled={current === 0}>
          <Icon name="chevronLeft" className="size-4" /> Back
        </Button>

        <div
          className="flex min-w-0 flex-1 items-center gap-1"
          role="progressbar"
          aria-valuenow={current + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label="Demo progress"
        >
          {tour.steps.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-200",
                i <= current ? "bg-[var(--color-iris-400)]" : "bg-[var(--line-strong)]",
              )}
            />
          ))}
        </div>

        <span className="shrink-0 text-xs tabular-nums text-fg-muted">
          {current + 1} / {total}
        </span>

        <Button size="sm" onClick={() => go(current + 1)} disabled={current >= total - 1}>
          Next <Icon name="arrowRight" className="size-4" />
        </Button>
      </div>
    </div>
  );
}
