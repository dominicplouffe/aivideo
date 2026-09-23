import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { debugFromCookieHeader } from "@/lib/debug";

/**
 * Cross-origin write protection, applied once.
 *
 * Next 16 calls this file a proxy; it is the successor to `middleware.ts`
 * and runs the same way, before every matched request reaches a handler.
 *
 * The first version of this check lived inside the sign-in route, and a
 * cross-origin `PATCH` to the billing route went straight through — because
 * that route had not been told to call it. A guard that every handler must
 * remember is a guard that will be forgotten, which is the same lesson the
 * workspace check in `authorize` already learned.
 *
 * `SameSite=Lax` on the session cookie is the first line and covers the
 * classic CSRF. This is the second, and it exists because the first depends
 * entirely on the browser: an older client, a proxy that strips the
 * attribute, or a future exception to the rule, and Lax alone is nothing.
 *
 * Checked against `Origin`, not `Referer`, which privacy settings strip
 * often enough that requiring it breaks real people. A request with no
 * `Origin` is allowed through: browsers send it on every state-changing
 * request, and the ones without it are server-to-server calls that
 * authenticate with a key rather than a cookie.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * The origins a state-changing request may come from.
 *
 * Configuration first, and in production *only* configuration. A deployment
 * that sets `NEXT_PUBLIC_SITE_URL` is pinned to it, and nothing a caller
 * sends can widen that — `Host` is attacker-controlled behind a permissive
 * proxy, so an allowlist built from it allows whatever the attacker wrote.
 *
 * Outside production the host the browser actually connected to is added.
 * This used to be `request.nextUrl.origin`, meaning to say "the deployment's
 * own address" — but in Next 16 that reports the configured origin rather
 * than the one serving the request, so it always read
 * `http://localhost:3000`. Signing in therefore worked on port 3000 and
 * nowhere else, and failed with a message that named nothing you could
 * change.
 */
function trustedOrigins(request: NextRequest): string[] {
  const origins: string[] = [];

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) origins.push(configured);

  for (const value of (process.env.DEMORIFF_TRUSTED_ORIGINS ?? "").split(",")) {
    const trimmed = value.trim();
    if (trimmed) origins.push(trimmed);
  }

  if (process.env.NODE_ENV !== "production") {
    const host = request.headers.get("host");
    if (host) origins.push(`http://${host}`, `https://${host}`);
    origins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  return origins;
}

export default function proxy(request: NextRequest) {
  // The Riff Agent is behind debug mode (⌘/). Its API is as absent as its
  // pages until then; see lib/debug.ts.
  if (request.nextUrl.pathname.startsWith("/api/agent/") && !debugFromCookieHeader(request.headers.get("cookie"))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!MUTATING.has(request.method)) return NextResponse.next();

  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.next();

  let candidate: URL;
  try {
    candidate = new URL(origin);
  } catch {
    return refuse();
  }

  const allowed = trustedOrigins(request).some((value) => {
    try {
      return new URL(value).origin === candidate.origin;
    } catch {
      return false;
    }
  });

  return allowed ? NextResponse.next() : refuse();
}

function refuse() {
  return NextResponse.json(
    { error: "Cross-origin request refused." },
    { status: 403 },
  );
}

export const config = {
  // Everything that changes state. Pages are read-only; the API is not.
  matcher: ["/api/:path*"],
};
