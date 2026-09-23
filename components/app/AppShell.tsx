"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DEBUG_COOKIE } from "@/lib/debug";

/** Where the sidebar's collapsed state is kept, per device. */
const SIDEBAR_KEY = "demoriff.sidebar";
import { cn, relativeTime } from "@/lib/utils";
import { LogoMark } from "@/components/brand/Logo";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

import { CommandPalette, type PaletteProject } from "./CommandPalette";

interface NavEntry {
  label: string;
  href: string;
  icon: IconName;
  badge?: string;
  /** Only listed while debug mode is on. */
  debugOnly?: boolean;
}

const primary: NavEntry[] = [
  { label: "Home", href: "/app", icon: "grid" },
  { label: "Projects", href: "/app/projects", icon: "folder" },
  { label: "Guides", href: "/app/guides", icon: "doc" },
  { label: "Interactive demos", href: "/app/demos", icon: "cursor" },
  // Shown only in debug mode (⌘/): see lib/debug.ts.
  { label: "Riff Agent", href: "/app/agent", icon: "rocket", badge: "Debug", debugOnly: true },
  { label: "Analytics", href: "/app/analytics", icon: "chart" },
];

const studio: NavEntry[] = [
  { label: "Brand kits", href: "/app/brand", icon: "palette" },
  { label: "Voices", href: "/app/voices", icon: "mic" },
  { label: "Localization", href: "/app/localization", icon: "globe" },
];

const admin: NavEntry[] = [
  { label: "Team", href: "/app/team", icon: "users" },
  { label: "Billing", href: "/app/billing", icon: "creditCard" },
  { label: "Settings", href: "/app/settings", icon: "settings" },
];

export interface ShellUsage {
  usedSeconds: number;
  allowanceSeconds: number;
  fractionUsed: number;
  periodStartsAt: string;
  plan: string;
  planName: string;
  projectsUsed: number;
  /** Null is unlimited. */
  projectsLimit: number | null;
}

export interface ShellViewer {
  name: string;
  email: string;
  role: string;
  workspaceName: string;
  workspaceSlug: string;
  plan: string;
  region: string;
}

export function AppShell({
  children,
  debug = false,
  usage = null,
  viewer = null,
  projects = [],
}: {
  children: React.ReactNode;
  /** Debug mode: features not ready to be shown. Toggled with ⌘/. */
  debug?: boolean;
  /** Real metered usage, or null when there is nothing measured to show. */
  usage?: ShellUsage | null;
  /** The signed-in member. Null only while the layout is gating. */
  viewer?: ShellViewer | null;
  /** This workspace's projects, for the ⌘K palette. */
  projects?: PaletteProject[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const debugRef = useRef(debug);
  debugRef.current = debug;
  const [debugNotice, setDebugNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!debugNotice) return;
    const timer = setTimeout(() => setDebugNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [debugNotice]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  /*
   * Collapsed to an icon rail, on wide screens only. Remembered on the
   * device rather than the workspace: a laptop wants the room, a monitor
   * does not, and the same person uses both. The mobile drawer always opens
   * at full width, since a rail behind a hamburger helps nobody.
   */
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "collapsed");
    } catch {
      // Storage may be unavailable; the sidebar simply starts expanded.
    }
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, c ? "expanded" : "collapsed");
      } catch {
        // Not remembered, still toggled.
      }
      return !c;
    });
  const rail = collapsed && !mobileOpen;

  useEffect(() => setMobileOpen(false), [pathname]);

  // Initials and a hue from the signed-in address, so two people do not get
  // the same badge. There is no fixture identity to fall back to: the shell
  // used to greet everybody as "Renata Alves" until a viewer arrived, which
  // on a slow read meant somebody's own workspace briefly wore a stranger's
  // name.
  const label = viewer?.name ?? "";
  const initials =
    label
      .split(/[\s.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "·";
  const hue = viewer
    ? [...viewer.email].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7)
    : 240;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      // ⌘/ / Ctrl+/ toggles debug mode, for features not ready to show.
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        const on = !debugRef.current;
        document.cookie = `${DEBUG_COOKIE}=${on ? "1" : "0"}; path=/; max-age=${on ? 60 * 60 * 24 * 365 : 0}; samesite=lax`;
        setDebugNotice(on ? "Debug mode on: Riff Agent is visible." : "Debug mode off.");
        router.refresh();
      }
      // ⌘B / Ctrl+B, the editor convention, folds the sidebar.
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh bg-ink-1000">
      {/* ---------------- sidebar ---------------- */}
      <aside
        data-collapsed={rail || undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-[var(--line)] bg-ink-950 transition-[transform,width] duration-300 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          rail && "lg:w-16",
        )}
      >
        <div className={cn("flex h-14 items-center gap-2 border-b border-[var(--line)]", rail ? "justify-center px-2" : "justify-between px-4")}>
          <Link href="/app" className="flex items-center gap-2.5" aria-label="Home">
            <LogoMark className="size-7" gradientId="app-logo" />
            {rail ? null : (
              <span className="text-[0.9375rem] font-semibold tracking-[-0.03em] text-fg-strong">
                Demo<span className="text-fg-muted">Riff</span>
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="inline-flex size-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-ink-850 lg:hidden"
            aria-label="Close navigation"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>

        {/*
          The workspace you are in.

          A card, not a button. It was a button with a chevron-down — the
          universal promise of a menu — and no `onClick`, because an account
          belongs to exactly one workspace in this build. An affordance for
          something that cannot happen is a worse lie than a plain label.
        */}
        <div className={cn("border-b border-[var(--line)]", rail ? "p-2" : "p-3")}>
          <div
            title={rail && viewer ? `${viewer.workspaceName} · ${viewer.plan} · ${viewer.region.toUpperCase()}` : undefined}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl border border-[var(--line)] bg-ink-900 text-left",
              rail ? "justify-center px-0 py-2" : "px-3 py-2.5",
            )}
          >
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-iris-500 text-[0.6875rem] font-bold text-white">
              {(viewer?.workspaceName ?? "·").charAt(0).toUpperCase()}
            </span>
            {rail ? null : (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-medium text-fg-strong">
                  {viewer?.workspaceName ?? "Your workspace"}
                </span>
                <span className="block text-2xs text-fg-faint">
                  {viewer ? `${viewer.plan} · ${viewer.region.toUpperCase()}` : ""}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* new project */}
        <div className={rail ? "p-2" : "p-3"}>
          <Button href="/app/new" size="sm" className="w-full" title={rail ? "New recording" : undefined} aria-label="New recording">
            <Icon name="plus" className="size-4" strokeWidth={2.2} />
            {rail ? null : "New recording"}
          </Button>
        </div>

        <nav className={cn("flex-1 overflow-y-auto pb-3", rail ? "px-2" : "px-3")} aria-label="Application">
          <NavGroup entries={primary.filter((e) => debug || !e.debugOnly)} pathname={pathname} rail={rail} />
          <NavGroup label="Studio" entries={studio} pathname={pathname} rail={rail} />
          <NavGroup label="Workspace" entries={admin} pathname={pathname} rail={rail} />
        </nav>

        {/*
          Metered usage, read from the workspace row.

          This used to show 164/240 and "resets in 10 days" from the fixtures
          — on every page, for every account, beside a project list served
          from Postgres. Now it renders the real figures, or, when there is
          nothing measured to show, only the link.
        */}
        <div className={cn("border-t border-[var(--line)]", rail ? "p-2" : "p-3")}>
          {rail ? (
            usage ? (
              // The meter, folded: the bar alone, with the numbers on hover
              // and the link behind it.
              <Link
                href="/app/billing"
                title={`Video minutes ${Math.round(usage.usedSeconds / 60)}/${Math.round(usage.allowanceSeconds / 60)}${
                  usage.projectsLimit !== null ? ` · Projects ${usage.projectsUsed}/${usage.projectsLimit}` : ""
                } · ${usage.planName}`}
                aria-label="Usage and plan"
                className="block rounded-lg p-1.5 hover:bg-ink-850"
              >
                <span className="block h-1.5 overflow-hidden rounded-full bg-ink-750">
                  <span
                    className="block h-full rounded-full bg-[linear-gradient(90deg,var(--color-iris-500),var(--color-cyan-400))]"
                    style={{ width: `${Math.min(100, usage.fractionUsed * 100)}%` }}
                  />
                </span>
              </Link>
            ) : null
          ) : (
          <div className="rounded-xl border border-[var(--line)] bg-ink-900 p-3">
            {usage ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-fg-subtle">Video minutes</span>
                  <span className="font-mono text-2xs text-fg">
                    {Math.round(usage.usedSeconds / 60)}/{Math.round(usage.allowanceSeconds / 60)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-750">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-iris-500),var(--color-cyan-400))]"
                    style={{ width: `${Math.min(100, usage.fractionUsed * 100)}%` }}
                  />
                </div>
                {usage.projectsLimit !== null ? (
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-2xs text-fg-subtle">Projects</span>
                    <span className="font-mono text-2xs text-fg">
                      {usage.projectsUsed}/{usage.projectsLimit}
                    </span>
                  </div>
                ) : null}
                <p className="mt-2 text-2xs text-fg-faint">
                  {usage.planName} · period began {relativeTime(usage.periodStartsAt)}
                </p>
              </>
            ) : (
              <p className="text-2xs text-fg-faint">
                Usage is metered once a render completes.
              </p>
            )}
            <Link
              href="/app/billing"
              className="mt-2.5 inline-flex items-center gap-1 text-2xs font-medium text-iris-300 hover:text-iris-400"
            >
              Manage plan
              <Icon name="chevronRight" className="size-3" strokeWidth={2.4} />
            </Link>
          </div>
          )}

          {/* fold / unfold, wide screens only */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-pressed={collapsed}
            aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
            title={`${collapsed ? "Expand" : "Collapse"} sidebar (⌘B)`}
            className={cn(
              "mt-2 hidden items-center gap-2 rounded-lg py-1.5 text-2xs text-fg-faint transition-colors hover:bg-ink-850 hover:text-fg lg:flex",
              rail ? "w-full justify-center" : "w-full px-2",
            )}
          >
            <Icon name={collapsed ? "chevronRight" : "chevronLeft"} className="size-3.5" strokeWidth={2.2} />
            {rail ? null : "Collapse"}
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* ---------------- main ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--color-ink-1000)_85%,transparent)] px-4 backdrop-blur-xl md:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ml-1 inline-flex size-9 items-center justify-center rounded-lg text-fg-subtle hover:bg-ink-850 lg:hidden"
            aria-label="Open navigation"
          >
            <Icon name="menu" className="size-4.5" />
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="group flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-[var(--line)] bg-ink-900 px-3 text-left transition-colors hover:border-[var(--line-strong)] md:max-w-sm"
          >
            <Icon name="search" className="size-4 text-fg-faint" strokeWidth={1.9} />
            <span className="flex-1 truncate text-[0.8125rem] text-fg-faint">
              Search projects, guides, transcripts…
            </span>
            <kbd className="hidden rounded border border-[var(--line)] px-1.5 py-0.5 font-mono text-[0.625rem] text-fg-faint sm:block">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Link
              href="/docs"
              className="hidden size-9 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-ink-850 hover:text-fg sm:inline-flex"
              aria-label="Help"
            >
              <Icon name="lifebuoy" className="size-4.5" strokeWidth={1.7} />
            </Link>
            {/*
              The notification bell is gone rather than disabled. It had no
              `onClick` and a permanent unread dot — a badge claiming unread
              news that could never be opened, on every page.
            */}
            <Link
              href="/app/settings"
              className="ml-1 inline-flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-ink-850"
              aria-label={viewer ? `Signed in as ${viewer.email}` : "Settings"}
              title={viewer?.email}
            >
              <span
                className="inline-flex size-7 items-center justify-center rounded-full text-[0.6875rem] font-semibold text-white"
                style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${hue + 40} 70% 45%))` }}
              >
                {initials}
              </span>
            </Link>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} projects={projects} />

      {debugNotice ? (
        <div role="status" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-[var(--line-strong)] bg-ink-900 px-3.5 py-2 text-[0.8125rem] text-fg shadow-lg">
          {debugNotice}
        </div>
      ) : null}
    </div>
  );
}

function NavGroup({
  label,
  entries,
  pathname,
  rail = false,
}: {
  label?: string;
  entries: NavEntry[];
  pathname: string;
  /** Icons only: the label moves to a tooltip and a group heading becomes a rule. */
  rail?: boolean;
}) {
  return (
    <div className={rail ? "mb-3" : "mb-5"}>
      {label ? (
        rail ? (
          <hr className="mx-2 mb-2 border-[var(--line)]" aria-hidden />
        ) : (
          <p className="mb-1.5 px-3 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
            {label}
          </p>
        )
      ) : null}
      <ul className="flex flex-col gap-0.5">
        {entries.map((e) => {
          const active = pathname === e.href || (e.href !== "/app" && pathname.startsWith(e.href));
          return (
            <li key={e.href}>
              <Link
                href={e.href}
                aria-current={active ? "page" : undefined}
                aria-label={rail ? e.label : undefined}
                title={rail ? (e.badge ? `${e.label} · ${e.badge}` : e.label) : undefined}
                className={cn(
                  "relative flex items-center rounded-lg text-[0.8125rem] font-medium transition-colors",
                  rail ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2",
                  active
                    ? "bg-[color-mix(in_oklab,var(--color-iris-500)_16%,transparent)] text-fg-strong"
                    : "text-fg-subtle hover:bg-ink-850 hover:text-fg",
                )}
              >
                <Icon
                  name={e.icon}
                  className={cn("size-4", active ? "text-iris-300" : "text-fg-faint")}
                  strokeWidth={1.8}
                />
                {rail ? null : e.label}
                {e.badge ? (
                  rail ? (
                    <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-iris-400" aria-hidden />
                  ) : (
                    <span className="ml-auto rounded bg-iris-500/18 px-1.5 py-0.5 text-2xs text-iris-300">
                      {e.badge}
                    </span>
                  )
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
