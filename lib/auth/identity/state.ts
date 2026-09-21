import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The `state` parameter, which is the only thing standing between the SSO
 * callback and login CSRF.
 *
 * Without it, an attacker completes an authorization flow as themselves,
 * stops before the redirect, and then gets a victim's browser to load the
 * callback URL carrying *their* code. The victim's browser is now signed
 * into the attacker's account, and everything the victim does next — a
 * recording, a script, a brand kit — lands somewhere the attacker can read.
 * The defence is that the callback must present a value this server issued
 * to this browser, and nothing else.
 *
 * Three properties, and each one is load-bearing:
 *
 *  1. **Signed**, so it cannot be minted by whoever is driving the browser.
 *  2. **Expiring**, so a state captured from a proxy log is not useful an
 *     hour later.
 *  3. **Bound to a nonce that is also set as a cookie**, so a state issued
 *     to one browser cannot be replayed in another. A signature alone proves
 *     only that *we* issued it, not that we issued it to the browser now
 *     presenting it.
 *
 * The return path travels inside the signed blob rather than as its own
 * query parameter, which is what stops the callback from being turned into
 * an open redirect.
 */

const TTL_MS = 10 * 60 * 1000;

export interface StatePayload {
  /** Matched against the nonce cookie. */
  nonce: string;
  /** Where to send the browser afterwards. Always a same-site path. */
  next: string;
  connectionId?: string;
  issuedAt: number;
}

function secret(): string {
  const value = process.env.DEMORIFF_SSO_STATE_SECRET ?? process.env.DEMORIFF_SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    // Falling back to a constant here would mean every deployment shares a
    // signing key, which is the same as having none.
    throw new Error("DEMORIFF_SSO_STATE_SECRET must be set in production.");
  }
  return "development-sso-state-secret";
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/**
 * A return path that cannot leave this site.
 *
 * Anything that is not a single-slash-prefixed path is discarded rather than
 * repaired. `//evil.example` and `/\evil.example` are both read as a host by
 * some browsers, and `https://evil.example` needs no explanation — a
 * post-login redirect is exactly the surface phishing wants, because the
 * user has just been asked to trust what they are looking at.
 */
export function safeNext(raw: string | null | undefined, fallback = "/app"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // A path that parses as absolute against a foreign base is not a path.
  try {
    const url = new URL(raw, "https://demoriff.invalid");
    if (url.origin !== "https://demoriff.invalid") return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function issueState(input: { next?: string | null; connectionId?: string }): {
  state: string;
  nonce: string;
} {
  const nonce = randomBytes(24).toString("base64url");
  const payload: StatePayload = {
    nonce,
    next: safeNext(input.next),
    connectionId: input.connectionId,
    issuedAt: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { state: `${body}.${sign(body)}`, nonce };
}

export type StateVerdict =
  | { ok: true; payload: StatePayload }
  | { ok: false; reason: "malformed" | "signature" | "expired" | "nonce" };

/**
 * Checks a returned state against the nonce the browser is carrying.
 *
 * Both halves are required. The signature proves this server issued the
 * value; the nonce proves it issued it to this browser.
 */
export function verifyState(
  state: string | null | undefined,
  cookieNonce: string | null | undefined,
  now = Date.now(),
): StateVerdict {
  if (!state) return { ok: false, reason: "malformed" };
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };

  const body = state.slice(0, dot);
  const given = Buffer.from(state.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "signature" };
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!payload.issuedAt || now - payload.issuedAt > TTL_MS) return { ok: false, reason: "expired" };

  if (!cookieNonce || !payload.nonce) return { ok: false, reason: "nonce" };
  const a = Buffer.from(cookieNonce);
  const b = Buffer.from(payload.nonce);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "nonce" };

  return { ok: true, payload };
}

export const NONCE_COOKIE = "demoriff_sso";

/**
 * The nonce cookie.
 *
 * `SameSite=Lax` rather than `Strict`: the callback arrives as a top-level
 * navigation from the identity provider, and a `Strict` cookie would not be
 * sent with it — the flow would fail for everyone, every time.
 */
export function serializeNonceCookie(nonce: string): string {
  const parts = [
    `${NONCE_COOKIE}=${nonce}`,
    "Path=/api/auth/authkit",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearNonceCookie(): string {
  return `${NONCE_COOKIE}=; Path=/api/auth/authkit; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readNonceCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === NONCE_COOKIE) return rest.join("=") || null;
  }
  return null;
}
