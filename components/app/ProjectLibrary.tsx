"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cn, formatDuration, formatNumber, relativeTime } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { StatusPill, Avatar, EmptyState } from "./Shared";
import { collections, members, currentUser, type Project, type ProjectStatus } from "@/lib/app-data";

const statuses: (ProjectStatus | "all")[] = [
  "all", "published", "ready", "processing", "stale", "draft", "failed",
];

/**
 * A take whose transcription died, offered back to the person who made it.
 *
 * Without this a failed import is a dead row: the library shows "Failed" and
 * the only way out is to record the whole thing again. The pipeline replaces
 * a project's segments rather than appending to them, so pressing this twice
 * is harmless — which is the property that lets it be one click and no
 * confirmation.
 */
function RetryButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");

  return (
    <button
      type="button"
      disabled={state === "working"}
      onClick={async (event) => {
        // The card is a link to the Studio, and the Studio is the one place
        // this project cannot usefully be opened yet.
        event.preventDefault();
        event.stopPropagation();
        setState("working");
        try {
          const response = await fetch(`/api/projects/${projectId}/process`, { method: "POST" });
          if (!response.ok) throw new Error("retry failed");
          setState("idle");
          router.refresh();
        } catch {
          setState("error");
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-2xs font-medium transition-colors",
        state === "error"
          ? "border-rose-500/40 bg-rose-500/15 text-rose-200"
          : "border-white/15 bg-black/60 text-white/90 backdrop-blur-sm hover:bg-black/75",
        state === "working" && "cursor-wait opacity-70",
      )}
    >
      <Icon
        name={state === "error" ? "alert" : "refresh"}
        className={cn("size-3", state === "working" && "animate-spin")}
        strokeWidth={2.2}
      />
      {state === "working" ? "Processing…" : state === "error" ? "Retry failed" : "Retry"}
    </button>
  );
}

export function ProjectLibrary({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");
  const [collection, setCollection] = useState<string>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"updated" | "views" | "title">("updated");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => (status === "all" ? true : p.status === status))
      .filter((p) => (collection === "all" ? true : p.collection === collection))
      .filter(
        (p) =>
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.segments.some((s) => s.words.some((w) => w.w.toLowerCase().includes(q))),
      )
      .sort((a, b) => {
        if (sort === "views") return b.views - a.views;
        if (sort === "title") return a.title.localeCompare(b.title);
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [projects, query, status, collection, sort]);

  return (
    <div>
      {/* toolbar */}
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-4 md:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 md:max-w-sm">
            <Icon
              name="search"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-faint"
              strokeWidth={1.9}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles and transcripts…"
              className="h-9 w-full rounded-xl border border-[var(--line)] bg-ink-900 pr-3 pl-9 text-[0.8125rem] text-fg placeholder:text-fg-faint focus:border-iris-500/50 focus:outline-none"
            />
          </div>

          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            aria-label="Collection"
            className="h-9 rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
          >
            <option value="all">All collections</option>
            {collections.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label="Sort"
            className="h-9 rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-[0.8125rem] text-fg focus:border-iris-500/50 focus:outline-none"
          >
            <option value="updated">Last updated</option>
            <option value="views">Most viewed</option>
            <option value="title">Title A–Z</option>
          </select>

          <div className="ml-auto inline-flex items-center gap-0.5 rounded-xl border border-[var(--line)] bg-ink-900 p-0.5">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-label={`${v} view`}
                aria-pressed={view === v}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-lg transition-colors",
                  view === v ? "bg-ink-750 text-fg" : "text-fg-faint hover:text-fg",
                )}
              >
                <Icon name={v} className="size-4" strokeWidth={1.9} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[0.75rem] font-medium capitalize transition-colors",
                status === s
                  ? "bg-[color-mix(in_oklab,var(--color-iris-500)_18%,transparent)] text-iris-300"
                  : "text-fg-subtle hover:bg-ink-850 hover:text-fg",
              )}
            >
              {s === "all" ? "All" : s}
              <span className="ml-1.5 font-mono text-2xs text-fg-faint">
                {s === "all" ? projects.length : projects.filter((p) => p.status === s).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* results */}
      <div className="px-4 py-6 md:px-8">
        {/*
          An empty workspace and an over-filtered one are different problems
          and want different answers. A new account used to be told "Nothing
          matches those filters" and offered a Clear filters button that
          changed nothing, because there was nothing to filter.
        */}
        {projects.length === 0 ? (
          <EmptyState
            icon="play"
            title="Record your first walkthrough"
            description="Capture a tab or a window, and DemoRiff transcribes it, cuts the dead air and turns it into a video and a written guide you can edit as text."
            action={
              <Button href="/app/new" size="sm">
                <Icon name="plus" className="size-3.5" strokeWidth={2.4} />
                New recording
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search"
            title="Nothing matches those filters"
            description="Try a different collection or clear the search. Transcript search covers every word spoken in every project."
            action={
              <Button variant="outline" size="sm" onClick={() => { setQuery(""); setStatus("all"); setCollection("all"); }}>
                Clear filters
              </Button>
            }
          />
        ) : view === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => {
              const owner = members.find((m) => m.id === p.owner) ?? currentUser;
              return (
                <Link key={p.id} href={`/app/studio/${p.id}`} className="group block">
                  <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-ink-950 transition-colors hover:border-[var(--line-strong)]">
                    <div className="relative aspect-video overflow-hidden border-b border-[var(--line)] bg-[#0B0D14]">
                      {p.recordingId && p.hasMedia ? (
                        // A frame from the take itself. `#t=1` asks the
                        // browser for the frame one second in — the first
                        // frame of a screen recording is usually the moment
                        // before anything has been drawn.
                        <video
                          src={`/api/recordings/${p.recordingId}/media#t=1`}
                          className="absolute inset-0 size-full object-cover"
                          preload="metadata"
                          muted
                          playsInline
                          tabIndex={-1}
                          aria-hidden
                        />
                      ) : (
                        <>
                          <span className="absolute inset-0 bg-[radial-gradient(circle_at_70%_28%,color-mix(in_oklab,var(--color-iris-500)_40%,transparent),transparent_62%)]" />
                          <span className="absolute inset-0 grid-bg opacity-35" />
                        </>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="inline-flex size-11 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                          <Icon name="play" className="size-4 text-white/90" />
                        </span>
                      </span>
                      <span className="absolute top-2.5 left-2.5">
                        <StatusPill status={p.status} />
                      </span>
                      {p.status === "failed" ? (
                        <span className="absolute right-2.5 bottom-2.5">
                          <RetryButton projectId={p.id} />
                        </span>
                      ) : null}
                      {p.durationSec && p.status !== "failed" ? (
                        <span className="absolute right-2.5 bottom-2.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-2xs text-white/85">
                          {formatDuration(p.durationSec)}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-1 flex-col gap-2.5 p-4">
                      <h3 className="text-[0.9375rem] leading-snug font-medium text-fg-strong">{p.title}</h3>
                      <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-fg-subtle">
                        {p.description}
                      </p>
                      <div className="mt-auto flex items-center gap-2 border-t border-[var(--line)] pt-3">
                        <Avatar name={owner.name} hue={owner.hue} size={22} />
                        <span className="text-2xs text-fg-faint">{relativeTime(p.updatedAt)}</span>
                        <span className="ml-auto flex items-center gap-1">
                          {p.outputs.map((o) => (
                            <span key={o} className="inline-flex size-5 items-center justify-center rounded bg-ink-850 text-fg-faint">
                              <Icon
                                name={o === "video" ? "play" : o === "guide" ? "doc" : o === "interactive" ? "cursor" : "scissors"}
                                className="size-2.5"
                                strokeWidth={2.2}
                              />
                            </span>
                          ))}
                          {p.locales.length > 1 ? (
                            <span className="ml-1 rounded bg-ink-850 px-1.5 py-0.5 font-mono text-2xs text-fg-faint">
                              {p.locales.length}×
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-ink-950">
            <div className="hidden items-center gap-4 border-b border-[var(--line)] px-5 py-2.5 text-2xs text-fg-faint md:flex">
              <span className="flex-1">Project</span>
              <span className="w-24">Status</span>
              <span className="w-28">Collection</span>
              <span className="w-20 text-right">Views</span>
              <span className="w-20 text-right">Completion</span>
              <span className="w-24 text-right">Updated</span>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {filtered.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/app/studio/${p.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-ink-900"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.875rem] font-medium text-fg-strong">{p.title}</span>
                      <span className="block truncate text-[0.75rem] text-fg-subtle">{p.description}</span>
                    </span>
                    <span className="flex w-24 items-center gap-1.5">
                      <StatusPill status={p.status} />
                    </span>
                    <span className="w-28 text-[0.75rem] text-fg-subtle">
                      {p.status === "failed" ? <RetryButton projectId={p.id} /> : p.collection}
                    </span>
                    <span className="w-20 text-right font-mono text-[0.75rem] text-fg-muted">
                      {p.views ? formatNumber(p.views) : "—"}
                    </span>
                    <span className="w-20 text-right font-mono text-[0.75rem] text-fg-muted">
                      {p.completion ? `${Math.round(p.completion * 100)}%` : "—"}
                    </span>
                    <span className="w-24 text-right text-[0.75rem] text-fg-faint">
                      {relativeTime(p.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
