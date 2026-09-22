"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn, formatDuration } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/brand/Logo";
import { MockApp } from "@/components/marketing/MockApp";
import type { Project } from "@/lib/app-data";
import { WatchTracker } from "./WatchTracker";
import { DEFAULT_FONT } from "@/lib/brand";
import { useBrandFont } from "@/components/app/brand/BrandPreview";
import type { ShareBrand } from "@/lib/share/resolve";

export function SharePage({
  project,
  videoUrl = null,
  brand = null,
}: {
  project: Project;
  /**
   * The rendered file, when one has been published.
   *
   * Null for the seeded demo projects, which have no footage behind them —
   * those keep the illustrated player. Everything else gets a real one.
   */
  videoUrl?: string | null;
  /**
   * Whose page this is. The header names the workspace, not a fixture
   * company, and a project wearing a brand kit takes the kit's logo,
   * typeface and accent colour.
   */
  brand?: ShareBrand | null;
}) {
  const kit = brand?.kit ?? null;
  const accent = kit?.tokens.colors.accent ?? null;
  const name = brand?.workspaceName || project.title;
  useBrandFont(kit?.tokens.font ?? DEFAULT_FONT);
  const [tab, setTab] = useState<"video" | "guide" | "tour">("video");
  const [chapter, setChapter] = useState(0);
  const [copied, setCopied] = useState(false);
  const [time, setTime] = useState(0);
  const video = useRef<HTMLVideoElement>(null);

  const seg = project.segments[chapter];

  /**
   * Chapter starts on the *finished* timeline.
   *
   * `segment.start` is a source timestamp, and the published video has had
   * the cuts taken out of it — seeking to a source timestamp would land
   * further and further past the intended chapter as the video goes on.
   */
  const chapterStarts = (() => {
    const starts: number[] = [];
    let t = 0;
    for (const segment of project.segments) {
      starts.push(t);
      t += segment.words.filter((w) => !w.cut).reduce((n, w) => n + w.d, 0) + 0.35;
    }
    return starts;
  })();

  // Following the video rather than a timer: the chapter list highlights
  // where the viewer actually is, including after they drag the scrubber.
  useEffect(() => {
    if (!videoUrl) return;
    let next = 0;
    for (let i = 0; i < chapterStarts.length; i++) if (time >= chapterStarts[i]) next = i;
    setChapter(next);
  });

  const seekToChapter = (index: number) => {
    setChapter(index);
    const el = video.current;
    if (el && chapterStarts[index] !== undefined) {
      el.currentTime = chapterStarts[index];
      void el.play().catch(() => {});
    }
  };

  return (
    <div
      data-theme="dark"
      className="min-h-dvh bg-ink-1000 text-fg"
      style={
        accent
          ? ({
              // The kit's accent, where the page's own purple would be.
              "--color-iris-500": accent,
              "--color-iris-400": accent,
              "--color-iris-300": accent,
              "--color-cyan-400": accent,
              fontFamily: `"${kit!.tokens.font}", Inter, system-ui, sans-serif`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {/* branded header */}
      <header className="hairline-b bg-ink-950">
        <div className="container-page flex h-14 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {kit?.logoUrl ? (
              <img src={kit.logoUrl} alt={`${name} logo`} className="h-7 w-auto max-w-[9rem] object-contain" />
            ) : (
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-[0.6875rem] font-bold text-white"
                style={{ background: accent ?? "linear-gradient(135deg, var(--color-cyan-400), var(--color-iris-500))" }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-[0.9375rem] font-semibold tracking-[-0.02em] text-fg-strong">{name}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* The language switcher changed a state variable and nothing
                else: no content on the page was localised by it and nothing
                was requested. It returns when a translated render exists to
                switch to. */}
            <Button href="/contact" size="sm" data-cta>Book a demo</Button>
          </div>
        </div>
      </header>

      <main className="container-page py-8 md:py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_19rem] lg:gap-12">
          <div className="min-w-0">
            <h1 className="text-[1.5rem] leading-tight tracking-[-0.025em] md:text-[2rem]">
              {project.title}
            </h1>
            <p className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">
              {project.description}
            </p>

            {/* format tabs */}
            <div className="mt-6 inline-flex items-center gap-0.5 rounded-xl border border-[var(--line)] bg-ink-900 p-0.5">
              {([
                { id: "video", label: "Watch", icon: "play" },
                { id: "tour", label: "Click through", icon: "cursor" },
                { id: "guide", label: "Read", icon: "doc" },
              ] as const)
                .filter((t) => t.id === "video" || project.outputs.includes(t.id === "tour" ? "interactive" : "guide"))
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[0.8125rem] font-medium transition-colors",
                      tab === t.id ? "bg-ink-750 text-fg-strong" : "text-fg-subtle hover:text-fg",
                    )}
                  >
                    <Icon name={t.icon} className="size-3.5" strokeWidth={1.9} />
                    {t.label}
                  </button>
                ))}
            </div>

            {/* player */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[#0B0D14] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)]">
              <div className="relative aspect-video">
                {videoUrl ? (
                  // The published file, with the browser's own controls. The
                  // zoom and the cuts are already encoded into it — this is
                  // the finished video, not a re-creation of one.
                  <video
                    ref={video}
                    src={videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 size-full bg-black"
                    onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                  />
                ) : null}
                {/* Measurement, once the viewer leaves. Nothing recorded a
                    view of this page before: somebody could publish a demo,
                    watch it, and find zero views on their analytics. */}
                {videoUrl ? (
                  <WatchTracker projectId={project.id} videoRef={video} />
                ) : (
                  <div
                    className="absolute inset-0 transition-transform duration-700"
                    style={{
                      transform: `scale(${seg?.zoom?.scale ?? 1})`,
                      transformOrigin: `${seg?.zoom?.x ?? 50}% ${seg?.zoom?.y ?? 50}%`,
                    }}
                  >
                    <MockApp highlight={Boolean(seg?.zoom && seg.zoom.scale > 1.6)} />
                  </div>
                )}

                {tab === "tour" && !videoUrl ? (
                  <>
                    <div className="absolute inset-0 bg-ink-1000/45" />
                    <div
                      className="absolute rounded-lg ring-2 ring-cyan-400 shadow-[0_0_0_9999px_rgba(4,5,10,0.55)]"
                      style={{
                        left: `${(seg?.zoom?.x ?? 50) - 8}%`,
                        top: `${(seg?.zoom?.y ?? 40) - 5}%`,
                        width: "16%",
                        height: "10%",
                      }}
                    />
                  </>
                ) : null}

                {/*
                  Everything below is the illustrated player, and it only
                  runs when there is no real one. Captions and a brand badge
                  are burned into a rendered file; drawing a second copy of
                  them over the top would double them.
                */}
                {!videoUrl ? (
                  <>
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 backdrop-blur-sm">
                      <span className="size-3 rounded-[4px] bg-gradient-to-br from-cyan-400 to-iris-500" />
                      <span className="text-[0.5rem] font-semibold text-white/85">{name}</span>
                    </div>

                    <div className="absolute inset-x-0 bottom-9 flex justify-center px-6">
                      <span className="max-w-[80%] rounded-lg bg-black/65 px-3 py-1.5 text-center text-[0.75rem] leading-snug font-medium text-white/92 backdrop-blur-sm">
                        {seg?.words.filter((w) => !w.cut).slice(0, 12).map((w) => w.w).join(" ")}
                      </span>
                    </div>

                    {/* The play button had no handler, and it only ever
                        rendered when there was no video to play — so it was
                        an invitation to press something that could not
                        work. A caption replaces it. */}
                    <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-[0.75rem] text-white/70">
                      This demo has no rendered video yet.
                    </span>

                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-gradient-to-t from-black/80 to-transparent px-3 pt-6 pb-2.5">
                      <Icon name="play" className="size-3.5 text-white/85" />
                      <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/18">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-iris-400 to-cyan-400 transition-[width] duration-500"
                          style={{ width: `${((chapter + 1) / project.segments.length) * 100}%` }}
                        />
                      </span>
                      <span className="font-mono text-[0.5625rem] text-white/65">
                        {formatDuration((project.durationSec * (chapter + 1)) / project.segments.length)} /{" "}
                        {formatDuration(project.durationSec)}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {/* chapters */}
            <div className="mt-5">
              <p className="mb-2.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                Chapters
              </p>
              <ol className="grid gap-1.5 sm:grid-cols-2">
                {project.segments.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => seekToChapter(i)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        chapter === i
                          ? "border-iris-500/40 bg-iris-500/[0.08]"
                          : "border-[var(--line)] hover:border-[var(--line-strong)]",
                      )}
                    >
                      <span className="font-mono text-2xs text-fg-faint tabular-nums">
                        {formatDuration((project.durationSec * i) / project.segments.length)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg">{s.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            {/* written guide */}
            {project.outputs.includes("guide") ? (
              <section className="mt-10 border-t border-[var(--line)] pt-8">
                <h2 className="text-[1.125rem] font-medium text-fg-strong">
                  Prefer to read? Here is the same walkthrough.
                </h2>
                <ol className="mt-5 space-y-5">
                  {project.segments.map((s, i) => (
                    <li key={s.id} className="flex gap-3.5">
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-iris-500/16 font-mono text-2xs text-iris-300">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[0.9375rem] font-medium text-fg-strong">{s.title}</p>
                        <p className="mt-1.5 text-[0.875rem] leading-relaxed text-fg-muted">
                          {s.words.filter((w) => !w.cut).map((w) => w.w).join(" ")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>

          {/* sidebar */}
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="rounded-2xl border border-[var(--line)] bg-ink-950 p-5">
              <p className="text-[0.9375rem] font-medium text-fg-strong">
                Want this for your own lanes?
              </p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-subtle">
                Twenty minutes with a solutions engineer, priced against your actual volume.
              </p>
              <Button href="/contact" size="md" className="mt-4 w-full" data-cta>
                Book a demo
              </Button>
              <Button href="/signup" variant="outline" size="md" className="mt-2 w-full">
                Start a free trial
              </Button>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--line)] p-5">
              <p className="font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">Share</p>
              <div className="mt-3 flex gap-2">
                <input
                  readOnly
                  aria-label="Share link"
                  value={`demos.meridian.app/${project.slug}`}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-ink-900 px-3 font-mono text-2xs text-fg"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={copied ? "Link copied" : "Copy share link"}
                  onClick={() => {
                    navigator.clipboard?.writeText(`https://demos.meridian.app/${project.slug}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  }}
                >
                  <Icon name={copied ? "check" : "copy"} className="size-3.5" strokeWidth={2} />
                </Button>
              </div>
              {/* The second copy of the language switcher, which changed
                  the same unused state variable as the first. */}
            </div>
          </aside>
        </div>
      </main>

      <footer className="hairline-t mt-10">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 py-6">
          <Link href="/" className="flex items-center gap-2 text-2xs text-fg-faint transition-colors hover:text-fg-muted">
            <LogoMark className="size-4" gradientId="share-logo" />
            Made with DemoRiff
          </Link>
          <p className="text-2xs text-fg-faint">© {name}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
