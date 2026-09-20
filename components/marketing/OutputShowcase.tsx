"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { outputs } from "@/lib/marketing-data";
import { Icon } from "@/components/ui/Icon";
import { Preview, type PreviewKey } from "./Previews";

export function OutputShowcase() {
  const [active, setActive] = useState(0);
  const out = outputs[active];

  return (
    <div>
      {/* tabs */}
      <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 md:mx-0 md:justify-center md:px-0">
        {outputs.map((o, i) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setActive(i)}
            aria-current={i === active}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-[0.875rem] font-medium transition-all duration-250",
              i === active
                ? "border-iris-500/45 bg-iris-500/12 text-fg-strong"
                : "border-[var(--line)] text-fg-subtle hover:border-[var(--line-strong)] hover:text-fg",
            )}
          >
            <Icon name={o.icon} className={cn("size-4", i === active && "text-iris-300")} strokeWidth={1.8} />
            {o.label}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-center lg:gap-16">
        <div key={out.key} className="animate-reveal">
          <h3 className="text-[1.5rem] leading-tight md:text-[2rem]">{out.title}</h3>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-fg-muted">{out.body}</p>

          <div className="mt-7 grid grid-cols-3 gap-4 border-t border-[var(--line)] pt-6">
            {out.stats.map((s) => (
              <div key={s.label}>
                <div className="text-[1.25rem] leading-none font-semibold tracking-[-0.02em] text-fg-strong">
                  {s.value}
                </div>
                <div className="mt-1.5 text-[0.75rem] leading-snug text-fg-subtle">{s.label}</div>
              </div>
            ))}
          </div>

          <Link
            href={out.href}
            className="group mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-iris-300 hover:text-iris-400"
          >
            Explore {out.label.toLowerCase()}
            <Icon name="arrowRight" className="size-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.9} />
          </Link>
        </div>

        <div className="relative">
          <Preview name={out.key as PreviewKey} />
        </div>
      </div>
    </div>
  );
}
