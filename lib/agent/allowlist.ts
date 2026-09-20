import { checkDestination } from "@/lib/webhooks/destinations";

/**
 * Where the agent may go.
 *
 * This is the boundary the whole feature rests on. An agent that drives a
 * browser with a customer's credentials, unattended, is exactly the thing a
 * security reviewer will spend their hour on — and the only answer that
 * survives that hour is "it can reach these origins and nothing else,
 * enforced at the network layer, and every refusal is in the log".
 *
 * Three rules:
 *
 *  1. **Origins, not domains.** `https://app.acme.com` does not admit
 *     `http://app.acme.com`, and it does not admit `acme.com`. A downgrade
 *     to plain http is how a credential ends up on the wire.
 *  2. **Subdomains are not implied.** A wildcard has to be written as one,
 *     and `*.acme.com` never matches `acme.com.evil.example` because the
 *     match is on the parsed host's suffix with a leading dot, not on the
 *     string.
 *  3. **Private addresses are refused whatever the list says.** An allowlist
 *     entry for `http://localhost:8080` would otherwise be a way to point
 *     the agent at our own network from a settings screen.
 */

export type AllowVerdict =
  | { ok: true; origin: string }
  | { ok: false; reason: "malformed" | "scheme" | "not-allowed" | "private" };

/** Normalises an entry so `https://acme.com/` and `https://acme.com` agree. */
export function normaliseEntry(entry: string): string | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;

  // A wildcard entry is a host pattern, not a URL, so it is kept as written
  // after a shape check.
  if (trimmed.startsWith("*.")) {
    const host = trimmed.slice(2).toLowerCase();
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? `*.${host}` : null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function normaliseList(entries: string[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    const normalised = normaliseEntry(entry);
    if (normalised) seen.add(normalised);
  }
  return [...seen].sort();
}

/**
 * Whether a URL is inside the list, by string and shape alone.
 *
 * Synchronous, because it runs on every request a browser makes and a DNS
 * lookup per subresource would be both slow and a different answer each
 * time. The address check is separate, runs once per navigation, and is
 * below.
 */
export function withinAllowlist(rawUrl: string, allowed: string[]): AllowVerdict {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    // `data:`, `blob:` and `about:` are the browser's own, and are handled
    // by the caller; anything else — `file:`, `chrome:` — is refused.
    return { ok: false, reason: "scheme" };
  }

  const origin = url.origin.toLowerCase();
  const host = url.hostname.toLowerCase();

  for (const entry of allowed) {
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1).toLowerCase(); // ".acme.com"
      // The leading dot is the whole point: without it `acme.com.evil.example`
      // ends with `acme.com` and would match.
      if (host.endsWith(suffix) && url.protocol === "https:") return { ok: true, origin };
      continue;
    }
    if (entry === origin) return { ok: true, origin };
  }

  return { ok: false, reason: "not-allowed" };
}

/**
 * The second check, once per navigation: where the host actually resolves.
 *
 * An allowlist is a list of names, and a name resolves to whatever its owner
 * says. Without this, `https://demo.acme.com` pointed at `127.0.0.1` is an
 * approved entry that reaches our own network — which is the same mistake
 * the webhook worker would have made, so it uses the same code.
 */
export async function resolvesPublicly(
  rawUrl: string,
  options: { resolve?: (hostname: string) => Promise<string[]> } = {},
): Promise<AllowVerdict> {
  const verdict = await checkDestination(rawUrl, {
    resolve: options.resolve,
    // Never relaxed here, not even in development. The agent is the one
    // place where "it also works against localhost" is a feature request
    // that ends with a credential in someone else's hands.
    allowInsecure: false,
  });

  if (verdict.ok) return { ok: true, origin: verdict.url.origin };
  return { ok: false, reason: verdict.reason === "scheme" ? "scheme" : "private" };
}

export type AllowRefusal = Extract<AllowVerdict, { ok: false }>["reason"];

export function describeAllowRefusal(reason: AllowRefusal): string {
  switch (reason) {
    case "malformed":
      return "That address could not be parsed.";
    case "scheme":
      return "The agent only follows http and https.";
    case "private":
      return "That address resolves to a private or loopback address.";
    case "not-allowed":
      return "That origin is not on this run's allowlist.";
  }
}
