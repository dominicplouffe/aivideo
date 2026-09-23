/**
 * Which blocked hosts a person should look at.
 *
 * A run's trail lists every request the boundary refused. Most are
 * analytics and tracking — a demo does not need them and is better without
 * them — and one or two are the app's own services, which it cannot work
 * without. This tells them apart, so the editor can offer "Allow" where it
 * matters and say "usually not needed" where it does not.
 */

/** Hosts whose job is measuring visitors. Blocking them changes nothing a viewer sees. */
const TRACKERS = [
  /(^|\.)sentry\.io$/,
  /(^|\.)mixpanel\.com$/,
  /(^|\.)googletagmanager\.com$/,
  /(^|\.)google-analytics\.com$/,
  /(^|\.)doubleclick\.net$/,
  /(^|\.)mouseflow\.com$/,
  /(^|\.)hotjar\.(com|io)$/,
  /(^|\.)segment\.(com|io)$/,
  /(^|\.)amplitude\.com$/,
  /(^|\.)heap(analytics)?\.(com|io)$/,
  /(^|\.)intercom\.(io|com)$/,
  /(^|\.)fullstory\.com$/,
  /(^|\.)clarity\.ms$/,
  /(^|\.)posthog\.com$/,
  /(^|\.)datadoghq\.(com|eu)$/,
  /(^|\.)newrelic\.com$/,
  /(^|\.)nr-data\.net$/,
  /(^|\.)facebook\.net$/,
  /(^|\.)linkedin\.com$/,
];

export interface BlockedHost {
  origin: string;
  /** What kinds of request were refused: xhr, fetch, script, stylesheet… */
  kinds: string[];
  count: number;
  /** Analytics or tracking: usually not needed for a demo. */
  tracker: boolean;
}

export function isTracker(origin: string): boolean {
  try {
    const host = new URL(origin).host;
    return TRACKERS.some((pattern) => pattern.test(host));
  } catch {
    return false;
  }
}

/**
 * Blocked hosts from a trail, app services first. `refusedReason` is
 * written as "<resource type>: <reason>" by the driver.
 */
export function blockedHosts(
  actions: { kind: string; url?: string | null; refusedReason?: string | null }[],
  alreadyAllowed: string[],
): BlockedHost[] {
  const byOrigin = new Map<string, BlockedHost>();
  for (const action of actions) {
    if (action.kind !== "refused" || !action.url) continue;
    let origin: string;
    try {
      origin = new URL(action.url).origin;
    } catch {
      continue;
    }
    if (alreadyAllowed.includes(origin)) continue;
    const kind = (action.refusedReason ?? "").split(":")[0].trim() || "request";
    const entry = byOrigin.get(origin) ?? { origin, kinds: [], count: 0, tracker: isTracker(origin) };
    entry.count += 1;
    if (!entry.kinds.includes(kind)) entry.kinds.push(kind);
    byOrigin.set(origin, entry);
  }
  return [...byOrigin.values()].sort((a, b) => Number(a.tracker) - Number(b.tracker) || b.count - a.count);
}
