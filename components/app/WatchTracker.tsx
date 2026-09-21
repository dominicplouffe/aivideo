"use client";

import { useEffect, useRef } from "react";

/**
 * Measures how much of a demo was actually watched, and reports it once.
 *
 * Until this existed nothing populated per-second retention. The embed
 * reported a bare view and no watch pattern, and the share page at
 * `/d/[slug]` — the surface a salesperson actually sends — reported nothing
 * at all: a person could publish a video, watch it, and find zero views on
 * their analytics page. That absence is why the retention curve had a
 * fixture behind it; there was no other way for the chart to have a shape.
 *
 * What is sent is one string of second-ranges, `"0-14,22-30"`, to the same
 * `/api/embed/view` endpoint the embed uses, in the format
 * `lib/analytics/bitmap.ts` already parses. No new ingestion path, no new
 * table, and the daily-rotating visitor key deduplicates a refresh exactly
 * as it does for an embed.
 *
 * Nothing is sent while watching. A beacon per second would be a request per
 * second per viewer, and the question analytics answers — which seconds were
 * watched — is only answerable once they stop.
 */
export function WatchTracker({
  projectId,
  videoRef,
}: {
  projectId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  /** Whole seconds seen. A Set because seeking back is not a second twice. */
  const seen = useRef<Set<number>>(new Set());
  const ctaClicked = useRef(false);
  const sent = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const mark = () => {
      const second = Math.floor(video.currentTime);
      if (Number.isFinite(second) && second >= 0) seen.current.add(second);
    };

    /**
     * Reports, at most once.
     *
     * `pagehide` rather than `unload`: a page restored from the back/forward
     * cache never fires `unload`, and on iOS neither does closing the tab —
     * so a viewer on a phone would have been missed entirely.
     * `visibilitychange` covers the tab being switched away from and never
     * returned to.
     */
    const report = () => {
      if (sent.current) return;
      const seconds = [...seen.current].sort((a, b) => a - b);
      const length = Math.ceil(video.duration);
      if (seconds.length === 0 || !Number.isFinite(length) || length <= 0) return;
      sent.current = true;

      // Contiguous runs collapsed into ranges: a two-minute view is
      // "0-119" rather than a hundred and twenty numbers.
      const spans: string[] = [];
      let start = seconds[0];
      let previous = seconds[0];
      for (const second of seconds.slice(1)) {
        if (second === previous + 1) {
          previous = second;
          continue;
        }
        spans.push(start === previous ? `${start}` : `${start}-${previous}`);
        start = second;
        previous = second;
      }
      spans.push(start === previous ? `${start}` : `${start}-${previous}`);

      const url = new URL("/api/embed/view", window.location.origin);
      url.searchParams.set("demo", projectId);
      url.searchParams.set("len", String(length));
      url.searchParams.set("watched", spans.join(","));
      if (ctaClicked.current) url.searchParams.set("cta", "1");
      // Origin only, never the path — the same rule the endpoint applies.
      if (document.referrer) url.searchParams.set("from", document.referrer);

      const sendBeacon = navigator.sendBeacon?.bind(navigator);
      if (sendBeacon) {
        sendBeacon(url.toString());
      } else {
        // `keepalive` is what lets the request outlive the page. Without it
        // a fetch started during teardown is cancelled, which is the same as
        // not measuring at all.
        void fetch(url.toString(), { method: "POST", keepalive: true }).catch(() => {});
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") report();
    };

    // A CTA click anywhere on the page counts for this session.
    const onCta = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-cta]")) ctaClicked.current = true;
    };

    video.addEventListener("timeupdate", mark);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("click", onCta, true);
    window.addEventListener("pagehide", report);

    return () => {
      video.removeEventListener("timeupdate", mark);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("click", onCta, true);
      window.removeEventListener("pagehide", report);
      // Unmounting is the viewer leaving too — a client-side navigation
      // away fires neither `pagehide` nor `visibilitychange`.
      report();
    };
  }, [projectId, videoRef]);

  return null;
}
