/**
 * The windows the analytics screen can be read over.
 *
 * In its own module because both sides of the client boundary need it: the
 * page (a server component) validates the `days` search parameter against
 * this list, and the view (a client component) renders the switcher from it.
 *
 * It used to live in the view. A server component that imports a plain value
 * from a `"use client"` module does not get the value — Next.js replaces the
 * module with a table of client references, so `periods` arrived as a proxy
 * and `periods.some(...)` threw "is not a function" at request time. The
 * page compiled cleanly and 500'd on every load, which is the failure mode
 * worth remembering: the type checker cannot see across that boundary.
 */
export const periods = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "12 months", days: 365 },
] as const;

export type Period = (typeof periods)[number];

/** The requested window, or 30 days when it is absent or not one we offer. */
export function windowDays(raw: string | undefined): number {
  const n = Number(raw);
  return periods.some((p) => p.days === n) ? n : 30;
}
