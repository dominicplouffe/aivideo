import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { buildEvent, deliver, deliverWebhookJob } from "./outbound";
import type { Wire } from "./transport";
import {
  DEFAULT_TOLERANCE_SEC, SIGNATURE_HEADER, signPayload, verifySignature,
} from "./signing";
import type { Job } from "@/lib/jobs/queue";

/**
 * Three things are under test: that a captured delivery cannot be replayed,
 * that the retry decision matches what each failure actually means, and that
 * a customer-supplied destination cannot aim the worker at our own network.
 */

const SECRET = "whsec_test";
const BODY = JSON.stringify({ id: "evt_1", type: "render.completed" });

test("a signature verifies against the body it was made for", () => {
  const header = signPayload(SECRET, BODY, 1_700_000_000);
  const result = verifySignature(SECRET, BODY, header, { nowSec: 1_700_000_000 });
  assert.equal(result.ok, true);
});

test("a captured signature goes stale rather than working forever", () => {
  const header = signPayload(SECRET, BODY, 1_700_000_000);
  // Replayed an hour later. A body-only HMAC would still verify here, which
  // is exactly the attack the timestamp exists to stop.
  const result = verifySignature(SECRET, BODY, header, {
    nowSec: 1_700_000_000 + DEFAULT_TOLERANCE_SEC + 1,
  });
  assert.deepEqual(result, { ok: false, reason: "stale" });
});

test("a sender whose clock runs ahead is still accepted inside the window", () => {
  const header = signPayload(SECRET, BODY, 1_700_000_060);
  const result = verifySignature(SECRET, BODY, header, { nowSec: 1_700_000_000 });
  assert.equal(result.ok, true);
});

test("changing one byte of the body invalidates the signature", () => {
  const header = signPayload(SECRET, BODY, 1_700_000_000);
  const tampered = BODY.replace("completed", "completeD");
  const result = verifySignature(SECRET, tampered, header, { nowSec: 1_700_000_000 });
  assert.deepEqual(result, { ok: false, reason: "mismatch" });
});

test("moving the timestamp invalidates the signature", () => {
  const header = signPayload(SECRET, BODY, 1_700_000_000).replace("t=1700000000", "t=1700000100");
  const result = verifySignature(SECRET, BODY, header, { nowSec: 1_700_000_100 });
  assert.deepEqual(result, { ok: false, reason: "mismatch" });
});

test("a malformed or missing header is refused, not crashed on", () => {
  assert.deepEqual(verifySignature(SECRET, BODY, null), { ok: false, reason: "malformed" });
  assert.deepEqual(verifySignature(SECRET, BODY, "garbage"), { ok: false, reason: "malformed" });
  assert.deepEqual(verifySignature(SECRET, BODY, "t=abc,v1=ff"), { ok: false, reason: "malformed" });
  // A short signature must not throw inside the constant-time comparison.
  assert.deepEqual(
    verifySignature(SECRET, BODY, `t=${Math.floor(Date.now() / 1000)},v1=ff`),
    { ok: false, reason: "mismatch" },
  );
});

// --- delivery --------------------------------------------------------------

/** A stub resolver, so no test in this file touches real DNS. */
const PUBLIC_DNS = async () => ["93.184.216.34"];

/** A stub wire that records the request and answers with a fixed status. */
function wireReturning(status: number, body = "") {
  const seen: { url: string; headers: Record<string, string>; body: string; address: string }[] = [];
  const wire: Wire = async (url, req) => {
    seen.push({ url: url.toString(), headers: req.headers, body: req.body, address: req.address });
    return { status, text: async () => body };
  };
  return { wire, seen };
}

test("a delivery is signed and labelled with its event", async () => {
  const event = buildEvent("render.completed", { renderId: "ren_1" });
  const { wire, seen } = wireReturning(204);

  await deliver("https://hooks.example/demoriff", event, {
    secret: SECRET,
    resolve: PUBLIC_DNS,
    wire,
  });

  const request = seen[0];
  assert.equal(request.headers["DemoRiff-Event-Type"], "render.completed");
  assert.equal(request.headers["DemoRiff-Event-Id"], event.id);
  const verified = verifySignature(SECRET, request.body, request.headers[SIGNATURE_HEADER]);
  assert.equal(verified.ok, true);
});

test("a delivery connects to the address the check approved", async () => {
  const { wire, seen } = wireReturning(200);
  await deliver("https://hooks.example/x", buildEvent("project.ready", {}), {
    // Public first, private second. A filter that stops at the first answer
    // would let this through; the address handed to the wire must come from
    // the set that was checked, not from a second lookup.
    resolve: async () => ["93.184.216.34"],
    wire,
  });
  assert.equal(seen[0].address, "93.184.216.34");
});

test("a destination on the private network is refused, and never retried", async () => {
  const cases = [
    // The literal forms, which skip DNS entirely.
    "http://127.0.0.1/x",
    "https://[::1]/x",
    "https://169.254.169.254/latest/meta-data/",
    // The scheme escapes.
    "file:///etc/passwd",
    "gopher://internal/x",
  ];

  for (const url of cases) {
    const result = await deliver(url, buildEvent("project.ready", {}), { resolve: PUBLIC_DNS });
    assert.equal(result.ok, false, url);
    // Retrying a refused destination would turn one bad URL into a scanner.
    assert.equal(result.retryable, false, url);
    assert.equal(result.status, null, url);
  }
});

test("a hostname that resolves to any private address is refused", async () => {
  let dialled = false;
  const result = await deliver("https://rebind.example/x", buildEvent("project.ready", {}), {
    // One public record and one private one: the oldest way past a check
    // that inspects only the first answer.
    resolve: async () => ["93.184.216.34", "10.0.0.7"],
    wire: async () => {
      dialled = true;
      return { status: 200, text: async () => "" };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(dialled, false);
});

test("the retry decision matches what each failure means", async () => {
  const outcomes = await Promise.all(
    [200, 204, 400, 404, 410, 408, 429, 500, 503].map(async (status) => {
      const result = await deliver("https://hooks.example/x", buildEvent("project.ready", {}), {
        resolve: PUBLIC_DNS,
        wire: wireReturning(status, "no").wire,
      });
      return [status, result.ok, result.retryable] as const;
    }),
  );

  assert.deepEqual(outcomes, [
    [200, true, false],
    [204, true, false],
    // A receiver bug is not fixed by repeating ourselves.
    [400, false, false],
    [404, false, false],
    [410, false, false],
    // These are conditions that pass.
    [408, false, true],
    [429, false, true],
    [500, false, true],
    [503, false, true],
  ]);
});

test("a refused connection is retryable rather than fatal", async () => {
  const result = await deliver("https://hooks.example/x", buildEvent("project.ready", {}), {
    resolve: PUBLIC_DNS,
    wire: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.deepEqual([result.ok, result.retryable, result.status], [false, true, null]);
});

test("the real transport reaches the receiver and is not followed anywhere else", async () => {
  const received: { host?: string; body: string; path: string }[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received.push({ host: req.headers.host, body, path: req.url ?? "" });
      // A receiver answering a webhook with a redirect is misconfigured.
      // Chasing it would hand the signature to another origin, so the
      // transport treats the 302 as the final answer.
      res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
      res.end("moved");
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as AddressInfo).port;

  try {
    const event = buildEvent("render.completed", { renderId: "ren_2" });
    const result = await deliver(`http://localhost:${port}/hook`, event, {
      secret: SECRET,
      // Loopback is the point of the test, so the guard stands down here and
      // only here.
      allowInsecure: true,
    });

    assert.equal(result.status, 302);
    assert.equal(result.ok, false);
    assert.equal(received.length, 1);
    // The Host header carries the name, not the pinned address: that is what
    // keeps TLS SNI and certificate validation honest in production.
    assert.equal(received[0].host, `localhost:${port}`);
    assert.equal(received[0].path, "/hook");
    assert.equal(JSON.parse(received[0].body).id, event.id);
  } finally {
    server.close();
  }
});

// --- the job wrapper -------------------------------------------------------

function webhookJob(payload: Record<string, unknown>): Job {
  return {
    id: "job_1",
    workspaceId: "ws_1",
    kind: "webhook",
    status: "running",
    payload,
    result: null,
    attempts: 1,
    maxAttempts: 8,
    lastError: null,
    runAfter: new Date(),
    createdAt: new Date(),
    webhookUrl: null,
  };
}

test("a permanent delivery failure is labelled so the queue stops retrying", async () => {
  const job = webhookJob({ url: "https://hooks.example/x", event: buildEvent("project.ready", {}) });
  await assert.rejects(
    () =>
      deliverWebhookJob(job, { resolve: PUBLIC_DNS, wire: wireReturning(410, "gone").wire }),
    (error: unknown) => error instanceof Error && error.message.startsWith("permanent:"),
  );
});

test("a transient delivery failure is not labelled permanent", async () => {
  const job = webhookJob({ url: "https://hooks.example/x", event: buildEvent("project.ready", {}) });
  await assert.rejects(
    () =>
      deliverWebhookJob(job, { resolve: PUBLIC_DNS, wire: wireReturning(503, "busy").wire }),
    (error: unknown) => error instanceof Error && !error.message.startsWith("permanent:"),
  );
});

test("a malformed webhook job fails rather than posting nowhere", async () => {
  await assert.rejects(
    () => deliverWebhookJob(webhookJob({ url: "https://hooks.example/x" })),
    /missing a url or an event/,
  );
});
