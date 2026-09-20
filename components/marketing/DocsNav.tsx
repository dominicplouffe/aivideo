"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/Icon";

export function DocsNav({
  sections,
}: {
  sections: { title: string; icon: IconName; pages: { slug: string; title: string }[] }[];
}) {
  const pathname = usePathname();
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <nav aria-label="Documentation" className="flex flex-col gap-6">
        {sections.map((s) => (
          <div key={s.title}>
            <p className="flex items-center gap-2 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
              <Icon name={s.icon} className="size-3.5" strokeWidth={1.9} />
              {s.title}
            </p>
            <ul className="mt-3 flex flex-col gap-0.5 border-l border-[var(--line)]">
              {s.pages.map((p) => {
                const href = `/docs/${p.slug}`;
                const active = pathname === href;
                return (
                  <li key={p.slug}>
                    <Link
                      href={href}
                      className={cn(
                        "-ml-px block border-l-2 py-1.5 pl-4 text-[0.8125rem] transition-colors",
                        active
                          ? "border-iris-500 text-fg-strong"
                          : "border-transparent text-fg-subtle hover:border-[var(--line-strong)] hover:text-fg",
                      )}
                    >
                      {p.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div>
          <p className="flex items-center gap-2 font-mono text-2xs tracking-[0.14em] text-fg-faint uppercase">
            <Icon name="code" className="size-3.5" strokeWidth={1.9} />
            Developers
          </p>
          <ul className="mt-3 flex flex-col gap-0.5 border-l border-[var(--line)]">
            <li>
              <Link
                href="/docs/api"
                className={cn(
                  "-ml-px block border-l-2 py-1.5 pl-4 text-[0.8125rem] transition-colors",
                  pathname === "/docs/api"
                    ? "border-iris-500 text-fg-strong"
                    : "border-transparent text-fg-subtle hover:border-[var(--line-strong)] hover:text-fg",
                )}
              >
                API reference
              </Link>
            </li>
          </ul>
        </div>
      </nav>
    </aside>
  );
}
