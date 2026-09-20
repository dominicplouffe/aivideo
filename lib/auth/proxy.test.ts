import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import proxy from "../../proxy";

/**
 * The cross-origin guard, tested at the layer that actually applies it.
 *
 * The first version of this check lived inside the sign-in route, and a
 * cross-origin PATCH to the billing route went straight through, because
 * that route had not been told to call it. These tests exist so the guard
 * cannot quietly stop covering a route again.
 */

/**
 * Note what this helper does *not* do: set a `Host` header from `url`.
 *
 * That omission is deliberate, and it is the whole lesson of the bug these
 * tests missed. The guard used to consult `request.nextUrl.origin`, which a
 * `NextRequest` built here reports as whatever URL it was constructed with —
 * so a test asserting "the deployment's own origin is allowed" passed
 * happily. In the real Next 16 runtime `nextUrl.origin` reports the
 * *configured* origin instead, so it always read `http://localhost:3000` and
 * signing in worked on that port and nowhere else. A constructor that is
 * more generous than the runtime is a test that proves the wrong thing.
 */
function request(
  method: string,
  origin?: string,
  url = "http://localhost:3000/api/billing",
  host?: string,
) {
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  if (host) headers.host = host;
  return new NextRequest(url, { method, headers });
}

test("a cross-origin write is refused", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = proxy(request(method, "https://evil.test"));
    assert.equal(response.status, 403, `${method} was allowed`);
    assert.deepEqual(await response.json(), { error: "Cross-origin request refused." });
  }
});

test("a same-origin write is allowed", () => {
  assert.equal(proxy(request("PATCH", "http://localhost:3000")).status, 200);
});

test("a write from the host the browser connected to is allowed in development", () => {
  // The host, not `nextUrl`. This is what makes a fresh clone work on any
  // port — running on 3301 and signing in used to fail with "Cross-origin
  // request refused" and nothing to suggest what to change.
  const response = proxy(
    request("POST", "http://localhost:3301", "http://localhost:3301/api/auth", "localhost:3301"),
  );
  assert.equal(response.status, 200);
});

test("a spoofed Host cannot widen the allowlist in production", async () => {
  // `Host` is attacker-controlled behind a permissive proxy, so production
  // trusts configuration and nothing else. A deployment reachable on an
  // address that is not configured is a deployment that should configure it,
  // via NEXT_PUBLIC_SITE_URL or DEMORIFF_TRUSTED_ORIGINS.
  const previous = process.env.NODE_ENV;
  // Assigned rather than redefined: `process.env` rejects a property
  // descriptor that is not a plain writable data descriptor.
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  try {
    const response = proxy(
      request("POST", "https://evil.test", "https://demoriff.com/api/auth", "evil.test"),
    );
    assert.equal(response.status, 403);
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = previous;
  }
});

test("a write with no Origin is allowed", () => {
  // Browsers send it on every state-changing request. The ones without it
  // are server-to-server calls that authenticate with a key, not a cookie.
  assert.equal(proxy(request("POST")).status, 200);
});

test("a malformed Origin is refused rather than parsed hopefully", () => {
  assert.equal(proxy(request("POST", "not-a-url")).status, 403);
});

test("reads are never blocked", () => {
  // A GET from anywhere is not a CSRF; blocking it would break embeds and
  // every link into the product.
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(proxy(request(method, "https://evil.test")).status, 200);
  }
});
