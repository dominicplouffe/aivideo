import { cn } from "@/lib/utils";
import type { Block } from "@/lib/content-blocks";
import { Icon } from "@/components/ui/Icon";
import { slugify } from "@/lib/utils";

const toneMap = {
  info: { icon: "info" as const, cls: "border-iris-500/28 bg-iris-500/[0.06]", ic: "text-iris-400" },
  warn: { icon: "alert" as const, cls: "border-amber-500/28 bg-amber-500/[0.06]", ic: "text-amber-400" },
  good: { icon: "check" as const, cls: "border-mint-500/28 bg-mint-500/[0.06]", ic: "text-mint-400" },
};

export function Prose({ blocks, className }: { blocks: Block[]; className?: string }) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h2":
            return (
              <h2 key={i} id={slugify(b.text)} className="mt-12 mb-4 scroll-mt-28 text-[1.375rem] leading-tight md:text-[1.625rem] first:mt-0">
                {b.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} id={slugify(b.text)} className="mt-8 mb-3 scroll-mt-28 text-[1.0625rem] font-medium text-fg-strong">
                {b.text}
              </h3>
            );
          case "p":
            return (
              <p key={i} className="mt-4 text-[0.9375rem] leading-[1.78] text-fg-muted first:mt-0">
                {b.text}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="mt-4 flex flex-col gap-2.5">
                {b.items.map((it) => (
                  <li key={it} className="flex items-start gap-2.5">
                    <span className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-iris-500" />
                    <span className="text-[0.9375rem] leading-[1.7] text-fg-muted">{it}</span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="mt-4 flex flex-col gap-2.5">
                {b.items.map((it, n) => (
                  <li key={it} className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-iris-500/15 font-mono text-2xs text-iris-300">
                      {n + 1}
                    </span>
                    <span className="text-[0.9375rem] leading-[1.7] text-fg-muted">{it}</span>
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={i} className="my-8 border-l-2 border-iris-500 pl-6">
                <p className="text-[1.125rem] leading-snug text-fg-strong">“{b.text}”</p>
                {b.cite ? <footer className="mt-3 text-[0.8125rem] text-fg-subtle">{b.cite}</footer> : null}
              </blockquote>
            );
          case "callout": {
            const t = toneMap[b.tone];
            return (
              <div key={i} className={cn("my-7 flex items-start gap-3.5 rounded-2xl border p-5", t.cls)}>
                <Icon name={t.icon} className={cn("mt-0.5 size-[1.125rem] shrink-0", t.ic)} strokeWidth={1.9} />
                <div>
                  <p className="text-[0.9375rem] font-medium text-fg-strong">{b.title}</p>
                  <p className="mt-1.5 text-[0.875rem] leading-relaxed text-fg-muted">{b.text}</p>
                </div>
              </div>
            );
          }
          case "code":
            return (
              <div key={i} className="my-7 overflow-hidden rounded-2xl border border-[var(--line)] bg-ink-950">
                <div className="border-b border-[var(--line)] bg-ink-900/70 px-4 py-2">
                  <span className="font-mono text-2xs text-fg-faint">{b.lang}</span>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[0.75rem] leading-relaxed text-fg-muted">
                  {b.code}
                </pre>
              </div>
            );
          case "table":
            return (
              <div key={i} className="my-7 overflow-x-auto">
                <table className="w-full border-collapse text-left text-[0.8125rem]">
                  <thead>
                    <tr>
                      {b.head.map((h) => (
                        <th key={h} className="border-b border-[var(--line-strong)] px-3 py-2.5 font-medium text-fg-strong">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, n) => (
                      <tr key={n}>
                        {r.map((c, m) => (
                          <td key={m} className="border-b border-[var(--line)] px-3 py-2.5 text-fg-muted">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "steps":
            return (
              <ol key={i} className="my-7 flex flex-col gap-4">
                {b.items.map((s, n) => (
                  <li key={s.title} className="flex gap-4 rounded-2xl border border-[var(--line)] p-5">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-iris-500/15 font-mono text-[0.75rem] text-iris-300">
                      {n + 1}
                    </span>
                    <div>
                      <p className="text-[0.9375rem] font-medium text-fg-strong">{s.title}</p>
                      <p className="mt-1.5 text-[0.875rem] leading-relaxed text-fg-subtle">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            );
          case "divider":
            return <hr key={i} className="my-10 border-t border-[var(--line)]" />;
        }
      })}
    </div>
  );
}
