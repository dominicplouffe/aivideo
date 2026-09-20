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

function request(method: string, origin?: string, url = "http://localhost:3000/api/billing") {
  return new NextRequest(url, {
    method,
    headers: origin ? { origin } : {},
  });
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

test("a write from the deployment's own host is allowed", () => {
  // A preview URL or a customer's own domain must not be locked out of
  // itself because it is not in an environment variable.
  const response = proxy(request("POST", "https://preview-abc.example.app", "https://preview-abc.example.app/api/auth"));
  assert.equal(response.status, 200);
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
