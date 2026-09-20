import {
  canObserve, iframeAttributes, placeholderStyle, readOptions, viewEventUrl,
  type EmbedOptions,
} from "./runtime";

/**
 * The entry point, and everything that touches the host page.
 *
 * Kept apart from `runtime.ts` so the decisions in there stay testable
 * without a DOM. What is here is the part that has to be careful: it runs on
 * somebody else's site, alongside their code, and must leave no trace beyond
 * the element the customer pasted.
 *
 * Nothing is written to `window`. No global is defined, no prototype is
 * touched, no listener is attached to `document` that is not removed. Two
 * copies of this script on one page are harmless, because a mounted element
 * is marked and skipped.
 */

const MOUNTED = "data-demoriff-mounted";
const SELECTOR = "[data-demoriff], .demoriff-embed";

declare const __DEMORIFF_ORIGIN__: string;

function defaultOrigin(): string {
  // Baked in at build time so the snippet is one tag with no configuration.
  // Falls back to the script's own origin, which is right when a customer
  // self-hosts the runtime.
  try {
    if (typeof __DEMORIFF_ORIGIN__ === "string") return __DEMORIFF_ORIGIN__;
  } catch {
    // Not defined in this build.
  }
  const current = document.currentScript as HTMLScriptElement | null;
  if (current?.src) {
    try {
      return new URL(current.src).origin;
    } catch {
      // Fall through.
    }
  }
  return "https://demoriff.com";
}

function applyStyles(element: HTMLElement, styles: Record<string, string>) {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(
      property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
      value,
    );
  }
}

/** True when the host page already reserved space for the embed. */
function hasReservedHeight(host: HTMLElement): boolean {
  if (host.style.height || host.style.minHeight || host.style.paddingTop) return true;
  // A stylesheet may have done it, in which case the element already has a
  // height and nothing is about to move.
  return host.getBoundingClientRect().height > 1;
}

function mountIframe(host: HTMLElement, options: EmbedOptions) {
  if (host.querySelector("iframe")) return;

  const frame = document.createElement("iframe");
  for (const [name, value] of Object.entries(iframeAttributes(options))) {
    frame.setAttribute(name, value);
  }
  host.appendChild(frame);

  if (options.analytics) reportView(options);
}

/**
 * Reports a view without a cookie, an identifier, or a blocked request.
 *
 * `sendBeacon` because it does not delay the page and survives the user
 * navigating away mid-flight. `keepalive` fetch is the fallback; neither is
 * awaited, and a failure is swallowed — a measurement that breaks a
 * customer's page is worse than no measurement.
 */
function reportView(options: EmbedOptions) {
  const url = viewEventUrl(options, document.referrer || location.href);
  try {
    if (navigator.sendBeacon?.(url)) return;
    void fetch(url, { method: "POST", mode: "no-cors", keepalive: true }).catch(() => {});
  } catch {
    // Analytics must never be a reason the host page misbehaves.
  }
}

function mount(host: HTMLElement) {
  if (host.hasAttribute(MOUNTED)) return;

  const options = readOptions(host, { origin: defaultOrigin() });
  if (!options) return;

  host.setAttribute(MOUNTED, "true");

  // The snippet is documented with an inline `aspect-ratio`, which reserves
  // the height in markup — before this script exists. That is the only
  // version with genuinely zero layout shift: however small and however
  // async a script is, the browser can still paint before it runs, and then
  // growing the element from nothing pushes the whole page down.
  //
  // Setting it here as well covers an embed pasted without it, which then
  // shifts once on a slow connection instead of never working. The warning
  // is how somebody finds out why their Core Web Vitals moved.
  if (!host.style.aspectRatio && !hasReservedHeight(host)) {
    console.warn(
      "[demoriff] This embed has no inline aspect-ratio, so it will shift the " +
        "page when it loads. Add style=\"aspect-ratio:16/9;width:100%\" to the " +
        "element to reserve the space in markup.",
    );
  }
  applyStyles(host, placeholderStyle(options));

  if (!canObserve()) {
    mountIframe(host, options);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.disconnect();
        mountIframe(host, options);
      }
    },
    // A generous margin: the player should be ready by the time it is
    // scrolled to, not start loading at that moment.
    { rootMargin: "400px" },
  );
  observer.observe(host);
}

function scan(root: ParentNode = document) {
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))) {
    mount(element);
  }
}

export function boot() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scan(), { once: true });
  } else {
    scan();
  }

  // Embeds added later — by a CMS, a tab switch, a single-page route change
  // — mount too. Without this the snippet works on a static page and
  // mysteriously does not inside the customer's app.
  if (typeof MutationObserver === "function") {
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (node.matches(SELECTOR)) mount(node as HTMLElement);
          else scan(node);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
}

boot();
