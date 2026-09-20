/**
 * The session cookie, and the request checks that go with it.
 *
 * Every attribute here is load-bearing:
 *
 *  - **`__Host-` prefix.** A browser refuses to accept a `__Host-` cookie
 *    unless it is Secure, path `/`, and has no Domain. That makes it
 *    impossible for a compromised subdomain to set a session cookie for the
 *    parent — the class of attack that a plain cookie name leaves wide open.
 *  - **HttpOnly.** Script cannot read it, so an XSS that would otherwise be
 *    a full account takeover is merely a very bad day.
 *  - **SameSite=Lax.** Not Strict: a person following a link from their
 *    email into the app should arrive signed in. Lax withholds the cookie
 *    from cross-site *writes*, which is the half that matters.
 *  - **No Max-Age on the cookie itself.** The session's lifetime lives in
 *    the database, where it can be shortened. A cookie that outlives its row
 *    is merely a cookie that fails; a cookie that outlives a *revocation*
 *    would be a security bug, and this shape makes that impossible.
 */

export const SESSION_COOKIE = "__Host-demoriff_session";

/** In development the `__Host-` prefix cannot be used: there is no HTTPS. */
export function cookieName(): string {
  return process.env.NODE_ENV === "production" ? SESSION_COOKIE : "demoriff_session";
}

export function serializeSessionCookie(token: string, options: { maxAgeSeconds?: number } = {}): string {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${cookieName()}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${options.maxAgeSeconds}`);
  return parts.join("; ");
}

/** The cookie that ends a session: same attributes, no value, expired. */
export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production";
  const parts = [`${cookieName()}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  const name = cookieName();
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

/**
 * Whether a state-changing request came from somewhere we trust.
 *
 * `SameSite=Lax` already withholds the cookie from cross-site form posts,
 * which covers the classic CSRF. This is the second layer, and it exists
 * because the first depends entirely on the browser getting it right: an
 * older browser, a misconfigured proxy that strips the attribute, or a
 * future exception to the rule, and Lax alone is nothing.
 *
 * Checked against `Origin` rather than `Referer`: `Referer` is stripped by
 * privacy settings often enough that requiring it breaks real users, while
 * `Origin` is sent on every cross-origin request that matters.
 *
 * A request with no `Origin` at all is allowed. Browsers send it on every
 * state-changing navigation; the requests without it are server-to-server
 * API calls, which authenticate with a key rather than a cookie and are not
 * what CSRF is about.
 */
export function originAllowed(request: Request, allowed: string[] = trustedOrigins()): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const url = new URL(origin);
    return allowed.some((candidate) => {
      try {
        return new URL(candidate).origin === url.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function trustedOrigins(): string[] {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const extra = (process.env.DEMORIFF_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const origins = [...extra];
  if (configured) origins.push(configured);
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }
  return origins;
}
