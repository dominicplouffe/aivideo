import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader, Panel, StatTile, StatusPill, Sparkline, EmptyState } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { getProjects, getUsage, getViewer, getRecentActivity, getWorkspaceAnalytics } from "@/lib/data";
import { relativeTime, formatDuration, formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

const quickActions: { label: string; hint: string; href: string; icon: IconName }[] = [
  { label: "Record your screen", hint: "4K capture with intent tracking", href: "/app/new", icon: "record" },
  { label: "Import a video", hint: "Loom, Zoom, Drive or a file", href: "/app/new?mode=import", icon: "upload" },
  { label: "Brief Riff Agent", hint: "Describe it, review the cut", href: "/app/new?mode=agent", icon: "sparkles" },
  { label: "Translate a project", hint: "34 languages, no extra minutes", href: "/app/localization", icon: "globe" },
];

/** An icon for an audit action like `project.published` or `member.invited`. */
function activityIcon(action: string): IconName {
  if (action.includes("publish")) return "rocket";
  if (action.includes("render")) return "refresh";
  if (action.includes("locale") || action.includes("translat")) return "globe";
  if (action.includes("member") || action.includes("invite")) return "users";
  if (action.includes("workspace")) return "grid";
  if (action.includes("agent")) return "sparkles";
  return "wand";
}

/** Morning / afternoon / evening, rather than a hardcoded "afternoon". */
function greeting(hour = new Date().getHours()): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  // From the data access layer, so every card on this page links to a page
  // that can find what it names.
  const [projects, usage, viewer, activity, analytics] = await Promise.all([
    getProjects(),
    getUsage(),
    getViewer(),
    getRecentActivity(5),
    getWorkspaceAnalytics(30),
  ]);

  const recent = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const published = projects.filter((p) => p.status === "published");
  const totalViews = published.reduce((n, p) => n + p.views, 0);
  const avgCompletion =
    published.reduce((n, p) => n + p.completion, 0) / Math.max(1, published.length);
  const totalCta = published.reduce((n, p) => n + p.ctaClicks, 0);
  const stale = projects.filter((p) => p.status === "stale");

  // The minutes sentence is only true when something has measured them. It
  // used to read "76 video minutes remain in this cycle" from a fixture, on
  // every account, directly above a tile correctly reporting 0 used.
  const minutesLeft = usage
    ? Math.max(0, Math.round((usage.allowanceSeconds - usage.usedSeconds) / 60))
    : null;
  const firstName = viewer?.name?.split(/[\s.]+/)[0] ?? "";

  return (
    <>
      <PageHeader
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        description={
          [
            viewer?.workspaceName
              ? `${viewer.workspaceName} has ${published.length} published asset${published.length === 1 ? "" : "s"}.`
              : null,
            minutesLeft !== null
              ? `${minutesLeft} video minute${minutesLeft === 1 ? "" : "s"} remain in this cycle.`
              : null,
          ]
            .filter(Boolean)
            .join(" ") || "Record your screen to get started."
        }
        actions={
          <>
            <Button href="/app/analytics" variant="outline" size="sm">
              <Icon name="chart" className="size-4" strokeWidth={1.8} />
              Analytics
            </Button>
            <Button href="/app/new" size="sm">
              <Icon name="plus" className="size-4" strokeWidth={2.2} />
              New recording
            </Button>
          </>
        }
      />

      <div className="px-4 py-6 md:px-8 md:py-8">
        {/* stats */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* The three deltas here were string literals, and "12.3%
              conversion" was one too — beside three totals that are real,
              which is what made them read as measured. */}
          <StatTile label="Total views" value={formatNumber(totalViews)} icon="eye" />
          <StatTile
            label="Avg. completion"
            value={`${Math.round(avgCompletion * 100)}%`}
            icon="play"
            sub="across published"
          />
          <StatTile
            label="CTA clicks"
            value={formatNumber(totalCta)}
            icon="target"
            sub={`${((totalCta / Math.max(1, totalViews)) * 100).toFixed(1)}% conversion`}
          />
          <StatTile
            label="Minutes used"
            value={`${usage ? Math.round(usage.usedSeconds / 60) : 0}`}
            delta={
              usage
                ? `${Math.max(0, Math.round((usage.allowanceSeconds - usage.usedSeconds) / 60))} left`
                : undefined
            }
            deltaTone="flat"
            icon="clock"
          />
        </div>

        {/* stale banner */}
        {stale.length ? (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-500/28 bg-amber-500/[0.06] p-5 sm:flex-row sm:items-center">
            <Icon name="alert" className="size-5 shrink-0 text-amber-400" strokeWidth={1.8} />
            <div className="min-w-0 flex-1">
              <p className="text-[0.9375rem] font-medium text-fg-strong">
                {stale.length} asset{stale.length > 1 ? "s" : ""} went stale after a UI change
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-fg-muted">
                {stale.map((s) => s.title).join(", ")} — re-record the changed step and everything
                downstream rebuilds, in every language.
              </p>
            </div>
            <Button href={`/app/studio/${stale[0].id}`} variant="secondary" size="sm" className="shrink-0">
              Review
            </Button>
          </div>
        ) : null}

        {/* quick actions */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((a) => (
            <Link key={a.href + a.label} href={a.href} className="group">
              <div className="flex h-full items-center gap-3.5 rounded-2xl border border-[var(--line)] bg-ink-950 p-4 transition-colors hover:border-[var(--line-strong)] hover:bg-ink-900">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink-850 text-iris-400 transition-colors group-hover:bg-iris-500/15">
                  <Icon name={a.icon} className="size-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.875rem] font-medium text-fg-strong">{a.label}</span>
                  <span className="block truncate text-[0.75rem] text-fg-subtle">{a.hint}</span>
                </span>
                <Icon
                  name="arrowRight"
                  className="ml-auto size-4 shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5"
                  strokeWidth={1.9}
                />
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_22rem]">
          {/* recent projects */}
          <Panel
            title="Recent projects"
            description="Everything in the workspace, newest first"
            action={
              <Link href="/app/projects" className="text-[0.8125rem] font-medium text-iris-300 hover:text-iris-400">
                View all
              </Link>
            }
          >
            {recent.length === 0 ? (
              <EmptyState
                icon="record"
                title="No projects yet"
                description="Record your screen or import a video, and it will appear here."
                action={
                  <Button href="/app/new" size="sm">
                    <Icon name="plus" className="size-4" strokeWidth={2.2} />
                    New recording
                  </Button>
                }
              />
            ) : (
            <ul className="divide-y divide-[var(--line)]">
              {recent.slice(0, 6).map((p) => {
                return (
                  <li key={p.id}>
                    <Link
                      href={`/app/studio/${p.id}`}
                      className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-ink-900"
                    >
                      <span className="relative hidden h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[#0B0D14] sm:block">
                        <span className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,color-mix(in_oklab,var(--color-iris-500)_38%,transparent),transparent_60%)]" />
                        <span className="absolute inset-0 grid-bg opacity-40" />
                        {p.durationSec ? (
                          <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 font-mono text-[0.5rem] text-white/80">
                            {formatDuration(p.durationSec)}
                          </span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[0.875rem] font-medium text-fg-strong">{p.title}</span>
                          <StatusPill status={p.status} />
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-fg-subtle">
                          <span>{p.collection}</span>
                          {p.locales.length ? <span>{p.locales.length} languages</span> : null}
                          {p.views ? <span>{formatNumber(p.views)} views</span> : null}
                          <span>{relativeTime(p.updatedAt)}</span>
                        </span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-1 md:flex">
                        {p.outputs.map((o) => (
                          <span
                            key={o}
                            title={o}
                            className="inline-flex size-6 items-center justify-center rounded-md bg-ink-850 text-fg-faint"
                          >
                            <Icon
                              name={
                                o === "video" ? "play" : o === "guide" ? "doc" : o === "interactive" ? "cursor" : "scissors"
                              }
                              className="size-3"
                              strokeWidth={2}
                            />
                          </span>
                        ))}
                      </span>
                      <Icon
                        name="chevronRight"
                        className="size-4 shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5"
                        strokeWidth={2}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
            )}
          </Panel>

          {/* right column */}
          <div className="flex flex-col gap-4">
            {/*
              Views over the last 30 days, counted from `analytics_sessions`.

              This panel used to print `viewsSeries("dash")` — a PRNG seeded
              with the literal string "dash" — which summed to 7.7k on every
              account that had ever existed, including ones created that
              morning with nothing published.
            */}
            <Panel title="Views this month" bodyClassName="p-5">
              <p className="text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-fg-strong tabular-nums">
                {formatNumber(analytics.views)}
              </p>
              {analytics.viewsByDay.length > 1 ? (
                <Sparkline data={analytics.viewsByDay.map((d) => d.views)} className="mt-4 h-14" />
              ) : (
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-fg-subtle">
                  {analytics.views === 0
                    ? "Nothing has been watched yet. Publish a project and its views appear here."
                    : "A chart needs more than one day of views."}
                </p>
              )}
            </Panel>

            <Panel title="Activity" description="From the workspace audit log">
              {activity.length === 0 ? (
                <p className="px-5 py-4 text-[0.8125rem] leading-relaxed text-fg-subtle">
                  Nothing has happened in this workspace yet.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--line)]">
                  {activity.map((a) => (
                    <li key={a.id} className="flex gap-3 px-5 py-3">
                      <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-ink-850 text-fg-faint">
                        <Icon name={activityIcon(a.action)} className="size-3" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 text-[0.8125rem] leading-snug">
                        <span className="text-fg">{a.who}</span>{" "}
                        <span className="text-fg-subtle">{a.action}</span>
                        <span className="mt-0.5 block text-2xs text-fg-faint">{relativeTime(a.at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
