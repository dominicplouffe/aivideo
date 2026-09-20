import { cssPath } from "./describe";
import { isSensitiveField } from "./sensitive";

/**
 * DOM snapshots.
 *
 * An interactive demo is not a video of a product; it is the product's own
 * markup, frozen at each step, that a prospect can click through. That is
 * why it converts better than a video and why it is much harder to build:
 * the snapshot has to look exactly like what the person saw, render with no
 * access to the original server, and contain nothing the customer would not
 * publish.
 *
 * Four rules follow, and every one of them is a refusal:
 *
 *  1. **No scripts survive.** A replay executing the customer's application
 *     code would be non-deterministic at best — it would fetch, redirect,
 *     and eventually error against an API that is not there — and at worst
 *     it is arbitrary JavaScript running on our origin, next to a viewer's
 *     session. The snapshot is markup and styles, nothing else.
 *  2. **No field values.** Not the password, and not the rest either: the
 *     recorder cannot know which document on screen was confidential, so it
 *     treats every one of them as confidential. This matches the
 *     interaction log, which records that typing happened and never what.
 *  3. **Assets are inlined or absolutised**, never left relative. A
 *     relative `/logo.svg` in a snapshot served from our domain is a broken
 *     image in every demo.
 *  4. **There is a size budget.** A page with twenty 4K hero images inlines
 *     to ninety megabytes, and a demo nobody waits for is a demo nobody
 *     sees. What was skipped is recorded rather than silently dropped.
 */

export interface SnapshotOptions {
  /** Per-asset ceiling for inlining, in bytes. Larger assets stay by URL. */
  maxAssetBytes?: number;
  /** Total ceiling for the snapshot, in bytes. */
  maxTotalBytes?: number;
  /** Injected for tests and for a service worker without a window. */
  fetchImpl?: typeof fetch;
}

export interface Snapshot {
  /** A complete document, renderable in an iframe with no network access. */
  html: string;
  /** The page this was taken from, for absolutising anything left relative. */
  url: string;
  title: string;
  viewport: { width: number; height: number; scrollX: number; scrollY: number };
  /** The element the step is about, so the viewer can point at it. */
  targetSelector?: string;
  bytes: number;
  /** Assets left by reference, with the reason. Never silently dropped. */
  skipped: { url: string; reason: "too-large" | "unreachable" | "cross-origin" }[];
}

const DEFAULTS = {
  maxAssetBytes: 512 * 1024,
  maxTotalBytes: 8 * 1024 * 1024,
};

/** Elements that either execute, phone home, or cannot be replayed. */
const STRIP_TAGS = new Set(["script", "noscript", "object", "embed", "applet"]);

/** Attributes that run code the moment the snapshot is parsed. */
function stripEventHandlers(element: Element) {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    // `onclick`, `onerror`, and the two hundred others. An `onerror` on an
    // image is the classic way a "static" snapshot executes.
    if (name.startsWith("on")) element.removeAttribute(attribute.name);
    // `javascript:` in an href survives a naive tag filter untouched.
    if ((name === "href" || name === "src" || name === "action") &&
        /^\s*javascript:/i.test(attribute.value)) {
      element.removeAttribute(attribute.name);
    }
  }
}

function absolutise(value: string, base: string): string {
  try {
    return new URL(value, base).href;
  } catch {
    return value;
  }
}

/** Rewrites `srcset`, which is a comma-separated list of URL + descriptor. */
function absolutiseSrcset(value: string, base: string): string {
  return value
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return "";
      const [url, ...descriptors] = trimmed.split(/\s+/);
      return [absolutise(url, base), ...descriptors].join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Reads a stylesheet's rules, or returns null when the browser will not say.
 *
 * A cross-origin stylesheet without CORS headers throws on `cssRules` — the
 * same-origin policy, working exactly as intended. There is no way around
 * it and pretending otherwise produces a demo with no styling, so the link
 * is kept and the fact recorded.
 */
function readRules(sheet: CSSStyleSheet): string | null {
  try {
    return Array.from(sheet.cssRules)
      .map((rule) => rule.cssText)
      .join("\n");
  } catch {
    return null;
  }
}

/**
 * Inlines a document's stylesheets.
 *
 * Styles are what make a snapshot recognisable, so this runs before the
 * asset budget is spent on images: an unstyled page with every logo intact
 * is worth less than a styled one with a placeholder.
 */
function inlineStyles(source: Document, target: Document, skipped: Snapshot["skipped"]) {
  const sheets = Array.from(source.styleSheets);

  for (const sheet of sheets) {
    const owner = sheet.ownerNode;
    if (!(owner instanceof Element)) continue;

    const rules = readRules(sheet);
    const selector = cssPath(owner);
    const clone = target.querySelector(selector);

    if (rules === null) {
      if (sheet.href) skipped.push({ url: sheet.href, reason: "cross-origin" });
      continue;
    }

    const style = target.createElement("style");
    // Relative `url()` inside the CSS resolves against the stylesheet, not
    // the document — which is a different base when the CSS lives on a CDN.
    style.textContent = sheet.href ? rewriteCssUrls(rules, sheet.href) : rules;

    if (clone && clone.tagName.toLowerCase() === "link") clone.replaceWith(style);
    else (target.head ?? target.documentElement).appendChild(style);
  }
}

/** Absolutises `url(...)` references inside a stylesheet. */
export function rewriteCssUrls(css: string, base: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote, url) => {
    if (/^(data:|https?:|blob:|#)/i.test(url)) return match;
    return `url(${quote}${absolutise(url, base)}${quote})`;
  });
}

/**
 * Serialises open shadow roots as declarative shadow DOM.
 *
 * A component library built on custom elements renders nothing at all
 * without this — the outer HTML of `<my-table>` is `<my-table></my-table>`,
 * and the entire table lives in a shadow root that `outerHTML` does not
 * see. Closed roots are genuinely unreachable; that is the point of them.
 */
function inlineShadowRoots(source: Element, target: Element, doc: Document) {
  const sourceNodes = [source, ...Array.from(source.querySelectorAll("*"))];
  const targetNodes = [target, ...Array.from(target.querySelectorAll("*"))];

  for (let i = 0; i < sourceNodes.length; i++) {
    const shadow = sourceNodes[i].shadowRoot;
    const clone = targetNodes[i];
    if (!shadow || !clone) continue;

    const template = doc.createElement("template");
    template.setAttribute("shadowrootmode", "open");
    template.innerHTML = shadow.innerHTML;
    clone.insertBefore(template, clone.firstChild);
  }
}

/**
 * Takes a snapshot of the current document.
 *
 * Synchronous by design. A step snapshot is taken at the moment of a click,
 * and awaiting a dozen asset fetches first would capture the page as it
 * looked a second later — after the menu closed, after the toast faded.
 * Images are absolutised rather than inlined for the same reason; inlining
 * is a later, offline pass that `inlineAssets` performs on the result.
 */
export function captureSnapshot(
  doc: Document,
  options: { targetSelector?: string } = {},
): Snapshot {
  const win = doc.defaultView;
  const base = doc.baseURI;
  const skipped: Snapshot["skipped"] = [];

  const clone = doc.implementation.createHTMLDocument(doc.title);
  clone.documentElement.replaceWith(doc.documentElement.cloneNode(true) as HTMLElement);

  for (const element of Array.from(clone.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();

    if (STRIP_TAGS.has(tag)) {
      element.remove();
      continue;
    }

    stripEventHandlers(element);

    // An iframe's content is either same-origin (and a snapshot of its own)
    // or unreachable. Either way the frame must not be left pointing at a
    // live URL, which would load the real application inside the demo.
    if (tag === "iframe" || tag === "frame") {
      const src = element.getAttribute("src");
      if (src) skipped.push({ url: absolutise(src, base), reason: "cross-origin" });
      element.removeAttribute("src");
      element.setAttribute("data-demoriff-frame", "removed");
      continue;
    }

    for (const attribute of ["src", "href", "poster", "data-src"]) {
      const value = element.getAttribute(attribute);
      if (value && !/^(data:|blob:|#|about:)/i.test(value)) {
        element.setAttribute(attribute, absolutise(value, base));
      }
    }
    const srcset = element.getAttribute("srcset");
    if (srcset) element.setAttribute("srcset", absolutiseSrcset(srcset, base));

    // Form values: the DOM property holds what the person typed, and the
    // attribute holds what the page shipped. Neither is recorded — see the
    // note at the top of this file.
    if (tag === "input" || tag === "textarea") {
      element.removeAttribute("value");
      if (isSensitiveField(element)) {
        element.setAttribute("placeholder", "");
        element.setAttribute("data-demoriff-masked", "true");
      }
    }
    if (tag === "option") element.removeAttribute("selected");
  }

  inlineStyles(doc, clone, skipped);
  inlineShadowRoots(doc.documentElement, clone.documentElement, clone);

  const head = clone.head ?? clone.documentElement;

  // A <base> makes anything still relative resolve against the original
  // site rather than against the domain the demo is served from.
  const baseEl = clone.createElement("base");
  baseEl.setAttribute("href", base);
  head.insertBefore(baseEl, head.firstChild);

  // The charset has to be stated in the markup, even when the original page
  // never bothered. Plenty of sites declare UTF-8 only in the HTTP
  // `Content-Type` header, and a snapshot is served from somewhere else —
  // an iframe, a blob, our viewer — where that header is gone. Without this
  // the demo renders every em dash as "â€”", and every non-English demo as
  // gibberish.
  if (!clone.querySelector("meta[charset]")) {
    const charset = clone.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    head.insertBefore(charset, head.firstChild);
  }

  const html = `<!doctype html>\n${clone.documentElement.outerHTML}`;

  return {
    html,
    url: doc.location?.href ?? base,
    title: doc.title,
    viewport: {
      width: win?.innerWidth ?? 0,
      height: win?.innerHeight ?? 0,
      scrollX: Math.round(win?.scrollX ?? 0),
      scrollY: Math.round(win?.scrollY ?? 0),
    },
    targetSelector: options.targetSelector,
    bytes: html.length,
    skipped,
  };
}

/**
 * Inlines a snapshot's remaining assets as data URIs.
 *
 * Runs after capture, off the click path, and against a budget. A snapshot
 * that still points at the customer's CDN works until they redeploy; one
 * with its assets inlined works in five years, which is the promise an
 * evergreen demo makes.
 */
export async function inlineAssets(
  snapshot: Snapshot,
  options: SnapshotOptions = {},
): Promise<Snapshot> {
  const config = { ...DEFAULTS, ...options };
  const fetchImpl = options.fetchImpl ?? fetch;

  const urls = new Set(
    Array.from(snapshot.html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)).map((m) => m[1]),
  );

  const skipped = [...snapshot.skipped];
  let html = snapshot.html;
  let budget = config.maxTotalBytes - html.length;

  for (const url of urls) {
    if (budget <= 0) {
      skipped.push({ url, reason: "too-large" });
      continue;
    }

    try {
      const response = await fetchImpl(url);
      if (!response.ok) {
        skipped.push({ url, reason: "unreachable" });
        continue;
      }
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.byteLength > config.maxAssetBytes) {
        skipped.push({ url, reason: "too-large" });
        continue;
      }

      const type = response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream";
      // Base64 is a third larger than the bytes it encodes, and that third
      // comes out of the same budget.
      const encoded = `data:${type};base64,${toBase64(buffer)}`;
      if (encoded.length > budget) {
        skipped.push({ url, reason: "too-large" });
        continue;
      }

      html = html.split(`"${url}"`).join(`"${encoded}"`);
      budget -= encoded.length;
    } catch {
      // A CDN that refuses us, a URL that no longer resolves. The snapshot
      // keeps the reference and says so.
      skipped.push({ url, reason: "unreachable" });
    }
  }

  return { ...snapshot, html, bytes: html.length, skipped };
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
