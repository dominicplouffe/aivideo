"use client";

import { useEffect, useRef, useCallback } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { MockApp } from "@/components/marketing/MockApp";
import type { Project, Segment } from "@/lib/app-data";
import type { EditState } from "./types";
import { BrandCaption, BrandCard, BrandLogo, useBrandFont } from "@/components/app/brand/BrandPreview";
import { DEFAULT_FONT, type ResolvedBrand } from "@/lib/brand";

/** The narrated preview's control and playback state, from the Studio. */
export interface NarratedPreviewControl {
  status: "off" | "loading" | "on" | "error";
  /** The plan no longer matches the edit; the button offers a refresh. */
  stale: boolean;
  error: string | null;
  voiceName: string;
  /** Plan it, refresh it when stale, or turn it off when fresh. */
  onToggle: () => void;
  /** Turn the preview off regardless of staleness. */
  onOff: () => void;
  /** The readings to play over the picture, on the edited timeline. Empty when off. */
  audio: { segmentId: string; url: string; at: number; durationSec: number }[];
  /** The video's rate for the clip under the playhead. */
  playbackRate: number;
  /** The playhead is inside a held frame: the picture stays put while the reading continues. */
  holding: boolean;
}

export function Canvas({
  project,
  segment,
  captionText,
  time,
  duration,
  cutTime,
  cutDuration,
  card = null,
  playing,
  state,
  mediaUrl,
  sourceTime,
  narration,
  pinning,
  brand = null,
  onScrub,
  onTogglePlay,
}: {
  project: Project;
  segment: Segment | null;
  captionText: string;
  /** The playhead over the whole export, and the export's length: what the transport shows. */
  time: number;
  duration: number;
  /** The playhead within the cut, and the cut's length: what the footage and readings follow. */
  cutTime: number;
  cutDuration: number;
  /** The brand card under the playhead, when the export is on one. */
  card?: "intro" | "outro" | null;
  playing: boolean;
  state: EditState;
  /** The take behind this project, when there is one. */
  mediaUrl?: string | null;
  /** Where the playhead points in the *source* file, not the edited one. */
  sourceTime?: number | null;
  /** Present when a voice is chosen: the narrated preview and its state. */
  narration?: NarratedPreviewControl;
  /** A word is waiting to be pinned to the frame under the playhead. */
  pinning?: { label: string; onConfirm: () => void; onCancel: () => void };
  /** The project's brand kit, resolved, so captions and the logo look here as they will in the export. */
  brand?: { tokens: ResolvedBrand; logoUrl: string | null } | null;
  onScrub: (t: number) => void;
  onTogglePlay: () => void;
}) {
  useBrandFont(brand?.tokens.font ?? DEFAULT_FONT);
  const zoom = state.zoomEnabled ? segment?.zoom : undefined;
  const scale = zoom?.scale ?? 1;
  const origin = zoom ? `${zoom.x}% ${zoom.y}%` : "50% 50%";

  const video = useRef<HTMLVideoElement>(null);

  const previewing = narration?.status === "on" && narration.audio.length > 0;
  const holding = previewing && narration.holding;

  // Play and pause follow the Studio's transport rather than the video's own
  // controls, so the spacebar means one thing everywhere in the editor. In a
  // held frame the picture stays put while the transport keeps running.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    // On a card the footage is parked at the edge of the cut, not running
    // under it: otherwise it drifts and gets re-seeked every third of a second.
    if (playing && !holding && !card) void el.play().catch(() => {});
    else el.pause();
  }, [playing, holding, card, mediaUrl]);

  // Under the plan the picture runs at each clip's speed.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const rate = previewing ? narration.playbackRate : 1;
    if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = Math.min(4, Math.max(0.25, rate));
  }, [previewing, narration?.playbackRate]);

  /*
   * The readings, played over the picture from where the playhead is.
   *
   * One element per reading, made ahead of time: the next chapter's file is
   * fetched while the current one plays, so it is ready the moment the
   * playhead crosses into it. With a single element re-pointed at the
   * boundary, the file arrived late, the playhead had moved on, and the
   * catch-up seek threw away the first third of a second of every chapter —
   * the first word, clipped, on every scene.
   */
  const readers = useRef(new Map<string, HTMLAudioElement>());
  const readerFor = useCallback((url: string) => {
    let el = readers.current.get(url);
    if (!el) {
      el = new Audio();
      el.preload = "auto";
      el.src = url;
      el.load();
      readers.current.set(url, el);
    }
    return el;
  }, []);
  useEffect(() => {
    const pool = readers.current;
    if (!previewing) {
      for (const el of pool.values()) el.pause();
      return;
    }
    const clips = narration.audio;
    const index = clips.findIndex((a) => cutTime >= a.at && cutTime < a.at + a.durationSec);
    // What comes next, whether or not we are inside a reading now: a pause
    // between chapters is the time to fetch the one after it.
    const upcoming = clips.filter((a) => a.at > cutTime).sort((a, b) => a.at - b.at).slice(0, 2);
    for (const a of upcoming) readerFor(a.url);

    const clip = index >= 0 ? clips[index] : null;
    // Keep what is playing, what just played and what is next; let go of the rest.
    const keep = new Set<string>([...(clip ? [clip.url] : []), ...upcoming.map((a) => a.url), ...(index > 0 ? [clips[index - 1].url] : [])]);
    for (const [url, el] of pool) {
      if (!keep.has(url)) {
        el.pause();
        el.removeAttribute("src");
        el.load();
        pool.delete(url);
      }
    }
    for (const [url, el] of pool) if (url !== clip?.url && !el.paused) el.pause();

    if (!clip || !playing || card) return;
    const el = readerFor(clip.url);
    const want = cutTime - clip.at;
    // Seek only once the file can be seeked, and only for real drift. A
    // reading that has just begun is never jumped forward: better a few
    // frames late than the first word gone.
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA && Math.abs(el.currentTime - want) > 0.3 && !(want < 0.6 && el.currentTime < want)) {
      el.currentTime = want;
    }
    if (el.paused) void el.play().catch(() => {});
  }, [previewing, narration?.audio, cutTime, playing, card, readerFor]);
  useEffect(
    () => () => {
      for (const el of readers.current.values()) el.pause();
    },
    [],
  );

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
  // preview of a different video than the one being exported. Under a
  // narrator the recording's own voice is replaced, so it is silenced.
  useEffect(() => {
    const el = video.current;
    if (el) el.muted = previewing || !state.studioSound;
  }, [state.studioSound, previewing]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* viewport */}
      <div className="flex min-h-0 flex-1 items-center justify-center bg-ink-1000 p-4 md:p-6">
        <div className="relative w-full max-w-4xl">
          <div
            className="relative aspect-video overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[#0B0D14] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)]"
            // A size container, so a kit's caption scales with the frame here
            // exactly as the burned-in one scales with the export.
            style={{ containerType: "inline-size", fontFamily: brand ? `"${brand.tokens.font}", Inter, system-ui, sans-serif` : undefined }}
          >
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

            {/* caption, and the kit's logo, drawn as the renderer draws them */}
            {state.captions && captionText ? (
              brand ? (
                <BrandCaption brand={brand.tokens} text={captionText} />
              ) : (
                <div className="absolute inset-x-0 bottom-3 flex justify-center px-6">
                  <span className="max-w-[80%] rounded-lg bg-black/68 px-3 py-1.5 text-center text-[0.75rem] leading-snug font-medium text-white/93 backdrop-blur-sm">
                    {captionText}
                  </span>
                </div>
              )
            ) : null}
            {brand?.logoUrl ? <BrandLogo url={brand.logoUrl} position={brand.tokens.logoPosition} /> : null}

            {/* the kit's card, over everything but the transport, while the export is on one */}
            {card && brand ? (
              <BrandCard
                brand={brand.tokens}
                logoUrl={brand.logoUrl}
                title={card === "intro" ? project.title : brand.tokens.outro}
                line={card === "intro" ? brand.tokens.intro : ""}
                kind={card}
              />
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

          {pinning ? (
            <div
              role="status"
              className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-[0.8125rem] text-amber-200"
            >
              <Icon name="target" className="size-4 shrink-0" strokeWidth={2.2} />
              <span className="min-w-0 flex-1">
                Scrub to the frame that <span className="font-medium text-amber-100">“{pinning.label}”</span> should land on,
                then pin it.
              </span>
              <button
                type="button"
                onClick={pinning.onConfirm}
                className="rounded-lg bg-amber-400 px-2.5 py-1 text-2xs font-semibold text-ink-950 transition-colors hover:bg-amber-300"
              >
                Pin here
              </button>
              <button
                type="button"
                onClick={pinning.onCancel}
                className="text-2xs text-amber-200/80 underline-offset-2 hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : null}

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

            {narration ? (
              <button
                type="button"
                onClick={narration.onToggle}
                disabled={narration.status === "loading"}
                title={
                  narration.status === "error"
                    ? narration.error ?? "The preview failed."
                    : narration.stale && narration.status === "on"
                      ? "You have edited since this was planned. The audio still says the old words; click to regenerate the changed chapters."
                      : `Play the edit as it will render, read by ${narration.voiceName}.`
                }
                aria-pressed={previewing}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-2xs font-medium transition-colors",
                  previewing && narration.stale
                    ? "border-amber-500/40 bg-amber-500/12 text-amber-300 hover:bg-amber-500/20"
                    : previewing
                      ? "border-cyan-500/40 bg-cyan-500/12 text-cyan-300 hover:bg-cyan-500/20"
                      : narration.status === "error"
                        ? "border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                        : "border-[var(--line)] text-fg-subtle hover:border-[var(--line-strong)] hover:text-fg",
                )}
              >
                <Icon name={previewing && narration.stale ? "refresh" : "mic"} className={cn("size-3.5", narration.status === "loading" && "animate-pulse")} strokeWidth={2} />
                {narration.status === "loading"
                  ? "Planning…"
                  : previewing && narration.stale
                    ? "Narrated · edits not in audio yet"
                    : previewing
                      ? "Narrated"
                      : narration.status === "error"
                        ? "Preview failed"
                        : "Hear it narrated"}
              </button>
            ) : null}
            {narration && previewing ? (
              <button
                type="button"
                onClick={narration.onOff}
                title="Back to the recorded voice"
                aria-label="Turn the narrated preview off"
                className="inline-flex h-8 shrink-0 items-center rounded-lg border border-[var(--line)] px-2 text-2xs text-fg-faint transition-colors hover:border-[var(--line-strong)] hover:text-fg"
              >
                Off
              </button>
            ) : null}

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
                  ? `−${Math.round((1 - cutDuration / project.sourceDurationSec) * 100)}% vs raw take`
                  : ""}
              </span>
            </span>
          </div>

          {narration?.status === "error" && narration.error ? (
            <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 text-2xs leading-relaxed text-rose-200">
              <Icon name="alert" className="mt-px size-3.5 shrink-0" strokeWidth={2} />
              <span>{narration.error}</span>
            </p>
          ) : null}

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
