/**
 * First touch: where a visitor came from the first time they landed, kept
 * without a cookie or device storage.
 *
 * The tags ride in the URL from the landing page to /signup or /pricing,
 * then inside the signed sign-in state, and are written once onto the new
 * workspace (`workspaces.first_touch`). Checkout copies them into the
 * Stripe session's metadata so a paid customer's source can be read from
 * Stripe itself. No names or emails ever travel here: values are cut to a
 * short, plain character set and anything else is dropped.
 */

/** Query keys carried on internal links and into the sign-in state. */
export const FIRST_TOUCH_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "dr_seq",
  "dr_step",
  "dr_call",
  "ft_ref",
  "ft_lp",
] as const;

export type FirstTouchKey = (typeof FIRST_TOUCH_KEYS)[number];

export interface FirstTouch {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  dr_seq?: string;
  dr_step?: string;
  dr_call?: string;
  /** Origin of the external site that sent the visitor, never a path. */
  referrer_origin?: string;
  /** First page path, query removed. */
  landing_path?: string;
}

const MAX = 100;
const PLAIN = /^[A-Za-z0-9._~+-]+$/;
const FIELD: Record<FirstTouchKey, keyof FirstTouch> = {
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_content: "utm_content",
  utm_term: "utm_term",
  dr_seq: "dr_seq",
  dr_step: "dr_step",
  dr_call: "dr_call",
  ft_ref: "referrer_origin",
  ft_lp: "landing_path",
};

function clean(key: FirstTouchKey, raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const value = raw.trim().slice(0, MAX);
  if (!value) return undefined;
  if (key === "ft_ref") {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
      return url.origin;
    } catch {
      return undefined;
    }
  }
  if (key === "ft_lp") {
    if (!value.startsWith("/") || value.startsWith("//")) return undefined;
    const path = value.split(/[?#]/)[0];
    return /^[A-Za-z0-9._~/-]+$/.test(path) ? path : undefined;
  }
  // utm_term may hold a keyword with spaces.
  const v = key === "utm_term" ? value.replace(/\s+/g, "+") : value;
  return PLAIN.test(v) ? v : undefined;
}

/** Reads the first-touch keys from a query string. Undefined when none is usable. */
export function parseFirstTouch(params: URLSearchParams | null | undefined): FirstTouch | undefined {
  if (!params) return undefined;
  const out: FirstTouch = {};
  let any = false;
  for (const key of FIRST_TOUCH_KEYS) {
    const value = clean(key, params.get(key));
    if (value) {
      out[FIELD[key]] = value;
      any = true;
    }
  }
  return any ? out : undefined;
}

/** Accepts only a FirstTouch-shaped object with clean values (e.g. from signed state). */
export function sanitizeFirstTouch(input: unknown): FirstTouch | undefined {
  if (!input || typeof input !== "object") return undefined;
  const params = new URLSearchParams();
  for (const key of FIRST_TOUCH_KEYS) {
    const value = (input as Record<string, unknown>)[FIELD[key]];
    if (typeof value === "string") params.set(key, value);
  }
  return parseFirstTouch(params);
}

/** The query pairs for a FirstTouch, for carrying on a link. */
export function firstTouchParams(touch: FirstTouch | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!touch) return params;
  for (const key of FIRST_TOUCH_KEYS) {
    const value = touch[FIELD[key]];
    if (value) params.set(key, value);
  }
  return params;
}

/**
 * The first touch of the page now open: its own tags, plus the referrer's
 * origin and this path when the visitor has just arrived from outside.
 */
export function currentFirstTouch(href: string, referrer: string | null | undefined): FirstTouch | undefined {
  const url = new URL(href);
  const params = new URLSearchParams();
  for (const key of FIRST_TOUCH_KEYS) {
    const value = url.searchParams.get(key);
    if (value) params.set(key, value);
  }
  if (!params.has("ft_ref") && referrer) {
    try {
      const origin = new URL(referrer).origin;
      if (origin !== url.origin) params.set("ft_ref", origin);
    } catch {
      /* no usable referrer */
    }
  }
  const parsed = parseFirstTouch(params);
  if (!parsed) return undefined;
  if (!parsed.landing_path) parsed.landing_path = clean("ft_lp", url.pathname);
  return parsed;
}

/** Adds the first-touch keys to a same-site href, keeping any it already carries. */
export function withFirstTouch(href: string, touch: FirstTouch | undefined, base = "https://demoriff.invalid"): string {
  if (!touch) return href;
  const url = new URL(href, base);
  for (const [key, value] of firstTouchParams(touch)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Same-site paths whose links carry the first touch. */
export function carriesFirstTouch(pathname: string): boolean {
  return pathname === "/signup" || pathname === "/pricing";
}

/** Stripe metadata pairs (`ft_` prefix; Stripe caps keys at 40 chars and values at 500). */
export function firstTouchMetadata(touch: FirstTouch | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!touch) return out;
  for (const [field, value] of Object.entries(touch)) {
    if (typeof value === "string" && value) out[`ft_${field}`] = value.slice(0, 500);
  }
  return out;
}
