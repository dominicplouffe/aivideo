/**
 * The embed runtime.
 *
 * This is the script a customer pastes into their marketing site, which
 * makes it the one piece of our code that runs on somebody else's page. Two
 * consequences follow, and they shape everything below.
 *
 * **It must not damage the host page.** A slow embed is a slower landing
 * page and a worse Core Web Vitals score, and the customer will remove it
 * and blame us — correctly. So: no layout shift, no synchronous work, no
 * blocking requests, and no global anything.
 *
 * **It must not be a liability.** No third-party cookies, no fingerprinting,
 * nothing read from the host page beyond what the embed tag itself declares.
 * A marketing team should be able to add this without asking legal.
 *
 * The runtime is built to a standalone IIFE — the same build the tests
 * exercise — so there is no framework, no module loader and no dependency on
 * anything the host page happens to have.
 */

export interface EmbedOptions {
  /** The published demo. */
  id: string;
  /** Where the player is served from. */
  origin: string;
  /** Aspect ratio as width/height. Reserves space before anything loads. */
  aspectRatio: number;
  /** Poster image shown until the player is ready. */
  poster?: string;
  /** Start playing as soon as it is visible. Off by default. */
  autoplay?: boolean;
  /** Cookieless analytics. On by default; `data-analytics="off"` opts out. */
  analytics?: boolean;
  /** Preferred locale, when the demo has more than one. */
  locale?: string;
}

export const DEFAULT_ASPECT = 16 / 9;

/**
 * Reads options from the embed tag.
 *
 * Everything comes from attributes on the element the customer pasted.
 * Nothing is read from the surrounding page, and nothing is inferred from
 * the URL — an embed that behaves differently depending on where it sits is
 * an embed nobody can debug.
 */
export function readOptions(element: Element, defaults: { origin: string }): EmbedOptions | null {
  const id = element.getAttribute("data-demo") ?? element.getAttribute("data-demo-id");
  if (!id) return null;

  const ratio = parseAspect(element.getAttribute("data-aspect"));

  return {
    id,
    origin: element.getAttribute("data-origin") ?? defaults.origin,
    aspectRatio: ratio,
    poster: element.getAttribute("data-poster") ?? undefined,
    autoplay: element.getAttribute("data-autoplay") === "true",
    // Opt-out rather than opt-in: the measurement is cookieless and
    // aggregate, and an embed nobody can measure is an embed nobody renews.
    analytics: element.getAttribute("data-analytics") !== "off",
    locale: element.getAttribute("data-locale") ?? undefined,
  };
}

/**
 * Parses an aspect ratio, tolerating the three ways people write one.
 *
 * `16:9`, `16/9` and `1.777` all appear in the wild, usually because the
 * person pasting the snippet copied the shape from another vendor's docs.
 * Rejecting two of them to be principled costs a support ticket and buys
 * nothing.
 */
export function parseAspect(value: string | null): number {
  if (!value) return DEFAULT_ASPECT;

  const parts = value.split(/[:/]/);
  if (parts.length === 2) {
    const width = Number(parts[0]);
    const height = Number(parts[1]);
    if (width > 0 && height > 0) return width / height;
  }

  const direct = Number(value);
  if (direct > 0 && Number.isFinite(direct)) return direct;

  return DEFAULT_ASPECT;
}

/**
 * Builds the player URL.
 *
 * Query parameters only, no fragment: a fragment is not sent to the server,
 * so a server-rendered first frame could not know which demo it was for.
 */
export function playerUrl(options: EmbedOptions): string {
  const url = new URL(`/embed/${encodeURIComponent(options.id)}`, options.origin);
  if (options.autoplay) url.searchParams.set("autoplay", "1");
  if (options.locale) url.searchParams.set("locale", options.locale);
  if (!options.analytics) url.searchParams.set("analytics", "off");
  return url.toString();
}

/**
 * The placeholder that holds the space.
 *
 * `aspect-ratio` reserves the exact height before a single byte of the
 * player has loaded, which is what keeps Cumulative Layout Shift at zero.
 * The older padding-top trick works too and is uglier; every browser that
 * can run this runtime supports `aspect-ratio`.
 *
 * Styles are inline. A stylesheet would be a second request that can arrive
 * late — and arriving late is precisely the failure this is preventing.
 */
export function placeholderStyle(options: EmbedOptions): Record<string, string> {
  return {
    position: "relative",
    display: "block",
    width: "100%",
    aspectRatio: String(options.aspectRatio),
    // A background means the reserved space reads as deliberate rather than
    // as a hole in the page while the player loads.
    background: options.poster
      ? `#0b0d14 center/cover no-repeat url("${options.poster.replace(/"/g, "%22")}")`
      : "#0b0d14",
    borderRadius: "12px",
    overflow: "hidden",
  };
}

export function iframeAttributes(options: EmbedOptions): Record<string, string> {
  return {
    src: playerUrl(options),
    title: "Interactive product demo",
    // Lazy: an embed below the fold should not compete with the content
    // above it for bandwidth.
    loading: "lazy",
    // The player is ours, so it needs scripts. It does not need — and must
    // never have — the ability to navigate the host page away.
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    allow: "fullscreen; clipboard-write",
    referrerpolicy: "strict-origin-when-cross-origin",
    style: "position:absolute;inset:0;width:100%;height:100%;border:0;display:block",
  };
}

/**
 * Whether the runtime can drive the player, or should fall back.
 *
 * The fallback is not a degraded experience for old browsers; it is the
 * same iframe, inserted immediately rather than when the element scrolls
 * into view. Anything that cannot be feature-detected safely gets the
 * simpler path, because a demo that works is worth more than a demo that
 * loads cleverly.
 */
export function canObserve(scope: { IntersectionObserver?: unknown } = globalThis): boolean {
  return typeof scope.IntersectionObserver === "function";
}

/**
 * A cookieless view event.
 *
 * No identifier is generated, stored or read. The server sees a demo id, a
 * referring origin and nothing else — which means this needs no consent
 * banner, and a customer's marketing team can paste the snippet without
 * asking their legal team first.
 */
export function viewEventUrl(options: EmbedOptions, referrer: string): string {
  const url = new URL("/api/embed/view", options.origin);
  url.searchParams.set("demo", options.id);
  // Origin only, never the full URL: the path of a page on someone else's
  // site is their data, not ours.
  url.searchParams.set("from", safeOrigin(referrer));
  if (options.locale) url.searchParams.set("locale", options.locale);
  return url.toString();
}

export function safeOrigin(referrer: string): string {
  try {
    return new URL(referrer).origin;
  } catch {
    return "unknown";
  }
}
