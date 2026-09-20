"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Faq as FaqItem } from "@/lib/marketing-data";
import { Icon } from "@/components/ui/Icon";

export function FaqList({ items, className }: { items: FaqItem[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className={cn("divide-y divide-[var(--line)] border-y border-[var(--line)]", className)}>
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-start justify-between gap-6 py-5 text-left transition-colors hover:text-fg-strong"
            >
              <span className={cn("text-[0.9375rem] font-medium md:text-base", isOpen ? "text-fg-strong" : "text-fg")}>
                {item.q}
              </span>
              <span
                className={cn(
                  "mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-all duration-300",
                  isOpen ? "rotate-45 border-iris-500/50 bg-iris-500/12 text-iris-300" : "border-[var(--line)] text-fg-subtle",
                )}
              >
                <Icon name="plus" className="size-3.5" strokeWidth={2} />
              </span>
            </button>
            <div className={cn("grid transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]", isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
              <div className="overflow-hidden">
                <p className="max-w-3xl pb-6 text-[0.9375rem] leading-relaxed text-fg-muted">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
