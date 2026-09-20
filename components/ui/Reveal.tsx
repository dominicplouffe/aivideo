"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-triggered reveal. Uses a single shared IntersectionObserver so a page
 * with a hundred revealed elements still costs one observer.
 */
let observer: IntersectionObserver | null = null;

function getObserver() {
  if (typeof window === "undefined") return null;
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.visible = "true";
            observer?.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
  }
  return observer;
}

export function Reveal({
  children,
  className,
  delay = 0,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = getObserver();
    if (!obs) return;
    // Anything already on screen at mount reveals immediately.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) {
      node.dataset.visible = "true";
      return;
    }
    obs.observe(node);
    return () => obs.unobserve(node);
  }, []);

  return (
    <As
      ref={ref}
      data-reveal=""
      className={className}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </As>
  );
}

/** Staggers direct children of a container. */
export function RevealGroup({
  children,
  className,
  step = 70,
  as: As = "div",
}: {
  children: ReactNode[];
  className?: string;
  step?: number;
  as?: ElementType;
}) {
  return (
    <As className={cn(className)}>
      {children.map((child, i) => (
        <Reveal key={i} delay={i * step}>
          {child}
        </Reveal>
      ))}
    </As>
  );
}
