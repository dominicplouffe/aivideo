"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import type { Project } from "@/lib/app-data";

/**
 * The written walkthrough.
 *
 * Two states, and the difference between them is the whole point:
 *
 *  - **Exported.** A render produced `guide.json`, and every screenshot here
 *    is a frame lifted out of the recording at that step's timestamp.
 *  - **Draft.** Nobody has exported one yet, so the steps are derived from
 *    the transcript and there are no pictures. The page says so rather than
 *    illustrating itself with a drawing of a generic application, which is
 *    what it used to do — and which made an un-exported guide look finished.
 */

interface GuideStep {
  ordinal: number;
  title: string;
  body: string;
  atSec: number;
  screenshotUrl: string | null;
}

interface LoadedGuide {
  title: string;
  locale: string;
  steps: GuideStep[];
  markdown_url: string | null;
}

/** The draft a transcript implies, for a project with no export yet. */
function draftSteps(project: Project): GuideStep[] {
  return project.segments.map((segment, i) => ({
    ordinal: i,
    title: segment.title,
    body: segment.words
      .filter((w) => !w.cut)
      .map((w) => w.w)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
    atSec: segment.start,
    screenshotUrl: null,
  }));
}

export function GuideEditor({ project }: { project: Project }) {
  const [guide, setGuide] = useState<LoadedGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/projects/${project.id}/guide`);
        const body = (await response.json()) as { guide?: LoadedGuide | null };
        if (!cancelled) setGuide(body.guide ?? null);
      } catch {
        if (!cancelled) setGuide(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const steps = useMemo(
    () => (guide ? guide.steps : draftSteps(project)),
    [guide, project],
  );
  const exported = guide !== null;
  const step = steps[Math.min(selected, Math.max(0, steps.length - 1))];

  const readMinutes = Math.max(
    1,
    Math.round(steps.reduce((n, s) => n + s.body.split(/\s+/).length, 0) / 200),
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--line)] bg-ink-950 px-4 py-2.5">
        <Link
          href="/app/guides"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-ink-850 hover:text-fg"
          aria-label="Back to guides"
        >
          <Icon name="chevronLeft" className="size-4" strokeWidth={2.2} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[0.9375rem] font-medium text-fg-strong">{project.title}</h1>
          <p className="text-2xs text-fg-faint">
            {steps.length} steps · {exported ? "exported" : "draft from the transcript"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {guide?.markdown_url ? (
            <Button href={guide.markdown_url} variant="outline" size="sm">
              <Icon name="download" className="size-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Markdown</span>
            </Button>
          ) : null}
          <Button href={`/app/studio/${project.id}`} size="sm">
            <Icon name="scissors" className="size-4" strokeWidth={1.9} />
            Open in Studio
          </Button>
        </div>
      </header>

      {/*
        The one thing this page owes a person who has not exported yet: that
        what they are reading is a draft, and where the button is.
      */}
      {!loading && !exported ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-iris-500/25 bg-iris-500/[0.07] px-4 py-2 text-2xs text-iris-200">
          <Icon name="info" className="size-3.5 shrink-0" strokeWidth={2.2} />
          <span className="font-medium">This is a draft.</span>
          <span className="text-iris-200/80">
            The steps come from the transcript. Export a guide from the Studio to capture a
            screenshot for each one.
          </span>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[15rem_1fr]">
        {/* step rail */}
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-ink-950 lg:flex">
          <p className="px-4 pt-4 pb-2 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
            Steps
          </p>
          <ol className="flex flex-col gap-0.5 px-2 pb-4">
            {steps.map((s, i) => (
              <li key={s.ordinal}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(i);
                    document
                      .getElementById(`guide-step-${s.ordinal}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selected === i
                      ? "bg-iris-500/14 text-fg-strong"
                      : "text-fg-subtle hover:bg-ink-900 hover:text-fg",
                  )}
                >
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-ink-850 font-mono text-2xs">
                    {s.ordinal + 1}
                  </span>
                  <span className="min-w-0 text-[0.75rem] leading-snug">{s.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        {/* article */}
        <div className="min-h-0 overflow-y-auto bg-ink-1000">
          <div className="mx-auto max-w-2xl px-5 py-8 md:px-8">
            <h2 className="text-[1.625rem] leading-tight tracking-[-0.025em]">
              {guide?.title ?? project.title}
            </h2>
            <p className="mt-2 text-[0.8125rem] text-fg-faint">
              {steps.length} steps · about {readMinutes} min read
            </p>

            {loading ? (
              <p className="mt-8 text-[0.875rem] text-fg-faint">Loading…</p>
            ) : steps.length === 0 ? (
              <p className="mt-8 text-[0.875rem] text-fg-muted">
                This project has no transcript yet, so there is nothing to write up.
              </p>
            ) : (
              <div className="mt-8 space-y-8">
                {steps.map((s, i) => (
                  <section
                    key={s.ordinal}
                    id={`guide-step-${s.ordinal}`}
                    onClick={() => setSelected(i)}
                    className={cn(
                      "cursor-pointer scroll-mt-6 rounded-xl border p-4 transition-colors",
                      selected === i
                        ? "border-iris-500/40 bg-iris-500/[0.05]"
                        : "border-transparent hover:border-[var(--line)]",
                    )}
                  >
                    <div className="flex gap-3.5">
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-iris-500/16 font-mono text-[0.75rem] text-iris-300">
                        {s.ordinal + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[1rem] font-medium text-fg-strong">{s.title}</h3>
                        {s.body ? (
                          <p className="mt-2 text-[0.875rem] leading-[1.75] text-fg-muted">{s.body}</p>
                        ) : null}

                        {s.screenshotUrl ? (
                          <figure className="mt-4 overflow-hidden rounded-lg border border-[var(--line)] bg-[#0B0D14]">
                            {/*
                              A real frame from the recording. Plain <img>
                              rather than next/image: the URL is signed and
                              expires, so there is nothing for an optimizer
                              to cache and every rewrite risks dropping the
                              signature.
                            */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={s.screenshotUrl}
                              alt={`Step ${s.ordinal + 1}: ${s.title}`}
                              className="w-full"
                              loading="lazy"
                            />
                            <figcaption className="border-t border-[var(--line)] px-3 py-1.5 font-mono text-[0.625rem] text-fg-faint">
                              captured at {s.atSec.toFixed(1)}s
                            </figcaption>
                          </figure>
                        ) : null}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
