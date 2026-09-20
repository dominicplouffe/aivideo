import assert from "node:assert/strict";
import test from "node:test";
import { buildEvent, deliver, deliverWebhookJob } from "./outbound";
import {
  DEFAULT_TOLERANCE_SEC, SIGNATURE_HEADER, signPayload, verifySignature,
} from "./signing";
import type { Job } from "@/lib/jobs/queue";

/**
 * Two things are under test: that a captured delivery cannot be replayed,
 * and that the retry decision matches what each failure actually means.
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

test("a delivery is signed and labelled with its event", async () => {
  let seen: { url: string; headers: Record<string, string>; body: string } | null = null;
  const event = buildEvent("render.completed", { renderId: "ren_1" });

  await deliver("https://hooks.example/demoriff", event, {
    secret: SECRET,
    fetchImpl: async (url, init) => {
      seen = {
        url: String(url),
        headers: init?.headers as Record<string, string>,
        body: String(init?.body),
      };
      return new Response("", { status: 204 });
    },
  });

  const request = seen!;
  assert.equal(request.headers["DemoRiff-Event-Type"], "render.completed");
  assert.equal(request.headers["DemoRiff-Event-Id"], event.id);
  const verified = verifySignature(SECRET, request.body, request.headers[SIGNATURE_HEADER]);
  assert.equal(verified.ok, true);
});

test("a delivery is never followed through a redirect", async () => {
  let redirect: RequestRedirect | undefined;
  await deliver("https://hooks.example/x", buildEvent("project.ready", {}), {
    fetchImpl: async (_url, init) => {
      redirect = init?.redirect;
      return new Response("", { status: 200 });
    },
  });
  // Following one would hand the signature, and the payload, to another origin.
  assert.equal(redirect, "manual");
});

test("the retry decision matches what each failure means", async () => {
  const outcomes = await Promise.all(
    [200, 204, 400, 404, 410, 408, 429, 500, 503].map(async (status) => {
      const result = await deliver("https://hooks.example/x", buildEvent("project.ready", {}), {
        // 204 is a null-body status; constructing one with a body throws.
        fetchImpl: async () => new Response(status === 204 ? null : "no", { status }),
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
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.deepEqual([result.ok, result.retryable, result.status], [false, true, null]);
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
    () => deliverWebhookJob(job, { fetchImpl: async () => new Response("gone", { status: 410 }) }),
    (error: unknown) => error instanceof Error && error.message.startsWith("permanent:"),
  );
});

test("a transient delivery failure is not labelled permanent", async () => {
  const job = webhookJob({ url: "https://hooks.example/x", event: buildEvent("project.ready", {}) });
  await assert.rejects(
    () => deliverWebhookJob(job, { fetchImpl: async () => new Response("busy", { status: 503 }) }),
    (error: unknown) => error instanceof Error && !error.message.startsWith("permanent:"),
  );
});

test("a malformed webhook job fails rather than posting nowhere", async () => {
  await assert.rejects(
    () => deliverWebhookJob(webhookJob({ url: "https://hooks.example/x" })),
    /missing a url or an event/,
  );
});
