"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * The searchable projects, handed down from the layout's own read.
 *
 * This list used to be the seeded fixture array, so ⌘K in a workspace with
 * no projects offered eight of somebody else's and navigated to a Studio
 * that would 404.
 */
export interface PaletteProject {
  id: string;
  title: string;
  slug: string;
  description: string;
  collection: string;
  status: string;
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: IconName;
  group: string;
  href?: string;
  keywords?: string;
}

const staticCommands: Command[] = [
  { id: "new", label: "New recording", icon: "record", group: "Actions", href: "/app/new", keywords: "record capture create" },
  { id: "import", label: "Import existing video", icon: "upload", group: "Actions", href: "/app/new?mode=import", keywords: "loom zoom upload mp4" },
  { id: "projects", label: "Go to projects", icon: "folder", group: "Navigate", href: "/app/projects" },
  { id: "guides", label: "Go to guides", icon: "doc", group: "Navigate", href: "/app/guides" },
  { id: "demos", label: "Go to interactive demos", icon: "cursor", group: "Navigate", href: "/app/demos" },
  { id: "analytics", label: "Go to analytics", icon: "chart", group: "Navigate", href: "/app/analytics" },
  { id: "brand", label: "Go to brand kits", icon: "palette", group: "Navigate", href: "/app/brand" },
  { id: "voices", label: "Go to voices", icon: "mic", group: "Navigate", href: "/app/voices" },
  { id: "localization", label: "Go to localization", icon: "globe", group: "Navigate", href: "/app/localization" },
  { id: "team", label: "Manage team", icon: "users", group: "Workspace", href: "/app/team" },
  { id: "billing", label: "Billing and usage", icon: "creditCard", group: "Workspace", href: "/app/billing" },
  { id: "settings", label: "Workspace settings", icon: "settings", group: "Workspace", href: "/app/settings" },
  { id: "keys", label: "API keys", icon: "key", group: "Workspace", href: "/app/settings#api" },
  { id: "docs", label: "Open help center", icon: "lifebuoy", group: "Help", href: "/docs" },
  { id: "api", label: "Open API reference", icon: "code", group: "Help", href: "/docs/api" },
];

export function CommandPalette({
  open,
  onClose,
  projects = [],
}: {
  open: boolean;
  onClose: () => void;
  projects?: PaletteProject[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(
    () => [
      ...staticCommands,
      ...projects.map((p) => ({
        id: p.id,
        label: p.title,
        hint: `${p.collection} · ${p.status}`,
        icon: "play" as IconName,
        group: "Projects",
        href: `/app/studio/${p.id}`,
        keywords: p.description + " " + p.slug,
      })),
    ],
    [projects],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 9);
    return commands
      .filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          c.group.toLowerCase().includes(q) ||
          (c.keywords ?? "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [query, commands]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const target = results[cursor];
        if (target?.href) {
          onClose();
          router.push(target.href);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, cursor, onClose, router]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-ink-900 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4">
          <Icon name="search" className="size-4 shrink-0 text-fg-faint" strokeWidth={1.9} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, jump to a page, or run a command…"
            className="h-12 flex-1 bg-transparent text-[0.875rem] text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <kbd className="rounded border border-[var(--line)] px-1.5 py-0.5 font-mono text-[0.625rem] text-fg-faint">
            ESC
          </kbd>
        </div>

        <div className="max-h-[22rem] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-[0.875rem] text-fg-subtle">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((c, i) => {
              const showGroup = c.group !== lastGroup;
              lastGroup = c.group;
              return (
                <div key={c.id}>
                  {showGroup ? (
                    <p className="px-4 pt-3 pb-1.5 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
                      {c.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => {
                      if (c.href) {
                        onClose();
                        router.push(c.href);
                      }
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      i === cursor ? "bg-[color-mix(in_oklab,var(--color-iris-500)_16%,transparent)]" : "",
                    )}
                  >
                    <Icon
                      name={c.icon}
                      className={cn("size-4 shrink-0", i === cursor ? "text-iris-300" : "text-fg-faint")}
                      strokeWidth={1.8}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.875rem] text-fg">{c.label}</span>
                      {c.hint ? (
                        <span className="block truncate text-2xs text-fg-faint">{c.hint}</span>
                      ) : null}
                    </span>
                    {i === cursor ? (
                      <Icon name="arrowRight" className="size-3.5 shrink-0 text-fg-faint" strokeWidth={2} />
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-[var(--line)] px-4 py-2.5 text-2xs text-fg-faint">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-[var(--line)] px-1 py-0.5 font-mono">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-[var(--line)] px-1 py-0.5 font-mono">↵</kbd> open
          </span>
          <span className="ml-auto">{results.length} results</span>
        </div>
      </div>
    </div>
  );
}
