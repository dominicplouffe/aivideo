"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { carriesFirstTouch, currentFirstTouch, withFirstTouch } from "@/lib/attribution/first-touch";

/**
 * Carries the visitor's first touch (UTM, dr_* tags, referrer origin,
 * landing path) on every same-site link to /signup or /pricing, by rewriting
 * the link when it is clicked. Nothing is stored on the device.
 */
export function FirstTouchLinks() {
  const router = useRouter();
  useEffect(() => {
    const touch = currentFirstTouch(window.location.href, document.referrer);
    if (!touch) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || !carriesFirstTouch(url.pathname)) return;
      const href = withFirstTouch(`${url.pathname}${url.search}${url.hash}`, touch);
      anchor.setAttribute("href", href);
      const modified = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (modified || anchor.target === "_blank") return;
      event.preventDefault();
      event.stopPropagation();
      router.push(href);
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [router]);
  return null;
}
