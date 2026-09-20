import Link from "next/link";
import type { Metadata } from "next";
import { PageHeader, Panel, StatTile, StatusPill, Avatar, Sparkline } from "@/components/app/Shared";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import {
  projects, activity, workspace, currentUser, members,
  viewsSeries, localeMatrix,
} from "@/lib/app-data";
import { relativeTime, formatDuration, formatNumber, cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

const quickActions: { label: string; hint: string; href: string; icon: IconName }[] = [
  { label: "Record your screen", hint: "4K capture with intent tracking", href: "/app/new", icon: "record" },
  { label: "Import a video", hint: "Loom, Zoom, Drive or a file", href: "/app/new?mode=import", icon: "upload" },
  { label: "Brief Riff Agent", hint: "Describe it, review the cut", href: "/app/new?mode=agent", icon: "sparkles" },
  { label: "Translate a project", hint: "34 languages, no extra minutes", href: "/app/localization", icon: "globe" },
];

export default function DashboardPage() {
  const recent = [...projects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const published = projects.filter((p) => p.status === "published");
  const totalViews = published.reduce((n, p) => n + p.views, 0);
  const avgCompletion =
    published.reduce((n, p) => n + p.completion, 0) / Math.max(1, published.length);
  const totalCta = published.reduce((n, p) => n + p.ctaClicks, 0);
  const stale = projects.filter((p) => p.status === "stale");

  return (
    <>
      <PageHeader
        title={`Good afternoon, ${currentUser.name.split(" ")[0]}`}
        description={`${workspace.name} shipped ${published.length} published assets this quarter. ${workspace.minutes.total - workspace.minutes.used} video minutes remain in this cycle.`}
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
          <StatTile label="Total views" value={formatNumber(totalViews)} delta="+18.4%" icon="eye" sub="vs. last 30 days" />
          <StatTile label="Avg. completion" value={`${Math.round(avgCompletion * 100)}%`} delta="+3.1pt" icon="play" sub="across published" />
          <StatTile label="CTA clicks" value={formatNumber(totalCta)} delta="+24.9%" icon="target" sub="12.3% conversion" />
          <StatTile
            label="Minutes used"
            value={`${workspace.minutes.used}`}
            delta={`${workspace.minutes.total - workspace.minutes.used} left`}
            deltaTone="flat"
            icon="clock"
            sub="resets in 10 days"
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
            <ul className="divide-y divide-[var(--line)]">
              {recent.slice(0, 6).map((p) => {
                const owner = members.find((m) => m.id === p.owner) ?? currentUser;
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
                      <Avatar name={owner.name} hue={owner.hue} size={26} className="hidden shrink-0 sm:inline-flex" />
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
          </Panel>

          {/* right column */}
          <div className="flex flex-col gap-4">
            <Panel title="Views this month" bodyClassName="p-5">
              <p className="text-[1.75rem] leading-none font-semibold tracking-[-0.03em] text-fg-strong tabular-nums">
                {formatNumber(viewsSeries("dash").reduce((a, b) => a + b, 0))}
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-[0.75rem] text-mint-400">
                <Icon name="trending" className="size-3.5" strokeWidth={2} />
                +18.4% vs. previous 30 days
              </p>
              <Sparkline data={viewsSeries("dash")} className="mt-4 h-14" />
            </Panel>

            <Panel title="Localization" action={
              <Link href="/app/localization" className="text-[0.8125rem] font-medium text-iris-300 hover:text-iris-400">
                Manage
              </Link>
            }>
              <ul className="divide-y divide-[var(--line)]">
                {localeMatrix.slice(0, 5).map((l) => (
                  <li key={l.code} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="font-mono text-2xs text-fg-faint">{l.code}</span>
                    <span className="flex-1 truncate text-[0.8125rem] text-fg">{l.label}</span>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 font-mono text-2xs",
                        l.status === "published" && "bg-mint-500/15 text-mint-400",
                        l.status === "rendering" && "bg-iris-500/15 text-iris-300",
                        l.status === "stale" && "bg-amber-500/15 text-amber-400",
                        l.status === "queued" && "bg-white/6 text-fg-faint",
                        l.status === "none" && "bg-white/4 text-fg-faint",
                      )}
                    >
                      {l.status === "rendering" ? `${Math.round((l.progress ?? 0) * 100)}%` : l.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Activity">
              <ul className="divide-y divide-[var(--line)]">
                {activity.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex gap-3 px-5 py-3">
                    <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-lg bg-ink-850 text-fg-faint">
                      <Icon
                        name={
                          a.kind === "publish" ? "rocket"
                          : a.kind === "comment" ? "quote"
                          : a.kind === "translate" ? "globe"
                          : a.kind === "invite" ? "users"
                          : a.kind === "render" ? "refresh"
                          : "wand"
                        }
                        className="size-3"
                        strokeWidth={2}
                      />
                    </span>
                    <span className="min-w-0 text-[0.8125rem] leading-snug">
                      <span className="text-fg">{a.who}</span>{" "}
                      <span className="text-fg-subtle">{a.what}</span>{" "}
                      <span className="text-fg">{a.target}</span>
                      <span className="mt-0.5 block text-2xs text-fg-faint">{relativeTime(a.when)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
