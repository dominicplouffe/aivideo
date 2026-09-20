import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { open as unseal } from "@/lib/crypto/secrets";
import type { Wire } from "@/lib/webhooks/transport";
import { record } from "./log";
import {
  FAILURE_LIMIT, activeDestinations, formatEntry, registerDestination, severityOf, streamBatch,
} from "./siem";

/**
 * The audit stream has one property that matters more than the rest: it does
 * not lose events. Everything here is that claim from a different angle —
 * the cursor, the failure path, and the escaping that stops an audit field
 * from becoming a second, fabricated record in somebody's SIEM.
 */

const RUN = isDatabaseConfigured();
const WS = "44444444-4444-4444-8444-444444444444";
const PUBLIC_DNS = async () => ["93.184.216.34"];

function wireReturning(status: number, body = "") {
  const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
  const wire: Wire = async (url, req) => {
    seen.push({ url: url.toString(), headers: req.headers, body: req.body });
    return { status, text: async () => body };
  };
  return { wire, seen };
}

// --- formatting (no database needed) ---------------------------------------

const entry = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: WS,
  actorId: null,
  actorEmail: "sam@meridian.com",
  action: "member.deactivated",
  resourceType: "member",
  resourceId: "m_1",
  ip: "203.0.113.9",
  metadata: { via: "scim", sessionsEnded: 3 },
  createdAt: new Date("2026-09-20T10:00:00.000Z"),
  seq: 412,
  prevHash: "abc",
  hash: "def",
} as typeof s.auditEvents.$inferSelect;

describe("formatting an entry", () => {
  it("carries the chain hashes, so a reader can verify from their own copy", () => {
    const json = JSON.parse(formatEntry(entry, "json"));
    assert.equal(json.hash, "def");
    assert.equal(json.prev_hash, "abc");
    assert.equal(json.seq, 412);

    const ecs = JSON.parse(formatEntry(entry, "ecs"));
    assert.equal(ecs["@timestamp"], "2026-09-20T10:00:00.000Z");
    assert.equal(ecs.event.action, "member.deactivated");
    assert.equal(ecs.demoriff.hash, "def");
  });

  it("ranks a deactivation above a read", () => {
    assert.ok(severityOf("member.deactivated") > severityOf("project.viewed"));
    assert.ok(severityOf("session.sso_refused") > severityOf("project.viewed"));
  });

  it("escapes a CEF header and a CEF extension by their different rules", () => {
    const line = formatEntry(entry, "cef");
    assert.ok(line.startsWith("CEF:0|DemoRiff|DemoRiff|1.0|member.deactivated|"));
    assert.match(line, /suser=sam@meridian\.com/);
    assert.match(line, /cs1=44444444-4444-4444-8444-444444444444/);
  });

  it("cannot be made to inject a second record", () => {
    // A newline in an audit field ends the CEF record early, and everything
    // after it reads as a new event. The pipe does the same to the header.
    const hostile = formatEntry(
      {
        ...entry,
        action: "a|b",
        resourceId: "x\nCEF:0|Acme|Acme|1.0|login|Login|0|",
        actorEmail: "sam=evil@meridian.com",
      } as typeof s.auditEvents.$inferSelect,
      "cef",
    );

    assert.equal(hostile.split("\n").length, 1);
    assert.match(hostile, /\|a\\\|b\|/);
    assert.match(hostile, /suser=sam\\=evil@meridian\.com/);
    assert.match(hostile, /\\nCEF:0/);
  });
});

// --- streaming (database) --------------------------------------------------

describe("streaming to a collector", { skip: !RUN }, () => {
  before(async () => {
    await eraseWorkspace(WS, "test setup");
  });

  after(async () => {
    await eraseWorkspace(WS, "test teardown");
    await closeDb();
  });

  beforeEach(async () => {
    await eraseWorkspace(WS, "test reset");
    await getDb().insert(s.workspaces).values({ id: WS, slug: "siem-test", name: "SIEM Test" });
  });

  async function writeEvents(count: number) {
    for (let i = 0; i < count; i++) {
      await record({
        workspaceId: WS,
        action: "project.published",
        resourceType: "project",
        resourceId: `p_${i}`,
        actor: { memberId: null, email: "sam@meridian.com" },
      });
    }
  }

  async function destination(over: Partial<Parameters<typeof registerDestination>[0]> = {}) {
    return registerDestination({
      workspaceId: WS,
      name: `collector-${Math.random().toString(36).slice(2, 8)}`,
      url: "https://collector.example/hec",
      fromStart: true,
      resolve: PUBLIC_DNS,
      ...over,
    });
  }

  async function reload(id: string) {
    const [row] = await getDb().select().from(s.siemDestinations).where(eq(s.siemDestinations.id, id));
    return row;
  }

  it("seals the collector credential rather than storing it", async () => {
    const row = await destination({ authValue: "Splunk hec-token-123" });
    assert.notEqual(row.authValueSealed, null);
    assert.equal(row.authValueSealed?.includes("hec-token-123"), false);
    // It has to come back out: unlike every other credential here, this one
    // is presented to somebody else's collector on every delivery.
    assert.equal(unseal(row.authValueSealed!), "Splunk hec-token-123");
    assert.equal(row.authHeaderName, "Authorization");
  });

  it("refuses a destination on the private network at registration", async () => {
    // The same check the webhook worker uses, for the same reason.
    await assert.rejects(
      () => destination({ url: "http://169.254.169.254/latest/meta-data/" }),
      /private or loopback|https/,
    );
  });

  it("starts from now by default, so a new collector is not flooded", async () => {
    await writeEvents(5);
    const fresh = await destination({ fromStart: false });
    assert.equal(fresh.lastSeq, 5);

    const { wire, seen } = wireReturning(200);
    const outcome = await streamBatch(fresh, { wire, resolve: PUBLIC_DNS });
    assert.equal(outcome.delivered, 0);
    assert.equal(seen.length, 0);
  });

  it("delivers a batch, and advances the cursor only afterwards", async () => {
    await writeEvents(3);
    const row = await destination({ authValue: "hec-token-123" });
    const { wire, seen } = wireReturning(200);

    const outcome = await streamBatch(row, { wire, resolve: PUBLIC_DNS });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.delivered, 3);
    assert.equal(outcome.toSeq, 3);

    assert.equal(seen[0].headers["Authorization"], "hec-token-123");
    assert.equal(seen[0].headers["DemoRiff-Sequence-Range"], "1-3");
    assert.equal(seen[0].body.split("\n").length, 3);

    const after = await reload(row.id);
    assert.equal(after.lastSeq, 3);
    assert.equal(after.consecutiveFailures, 0);
  });

  it("sends each event exactly once across passes", async () => {
    await writeEvents(2);
    const row = await destination();
    const { wire, seen } = wireReturning(200);

    await streamBatch(row, { wire, resolve: PUBLIC_DNS });
    await writeEvents(2);
    await streamBatch(await reload(row.id), { wire, resolve: PUBLIC_DNS });

    const delivered = seen.flatMap((call) => call.body.split("\n")).map((line) => JSON.parse(line).seq);
    assert.deepEqual(delivered, [1, 2, 3, 4]);
  });

  it("does not advance past a batch the collector refused", async () => {
    await writeEvents(3);
    const row = await destination();

    const outcome = await streamBatch(row, { wire: wireReturning(503, "busy").wire, resolve: PUBLIC_DNS });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.status, 503);

    const after = await reload(row.id);
    // Advancing on failure loses events, and an audit stream with holes is
    // worse than none because it looks complete.
    assert.equal(after.lastSeq, 0);
    assert.equal(after.consecutiveFailures, 1);
    assert.match(after.lastError ?? "", /503/);

    // The same events are still waiting on the next pass.
    const { wire, seen } = wireReturning(200);
    const retry = await streamBatch(await reload(row.id), { wire, resolve: PUBLIC_DNS });
    assert.equal(retry.delivered, 3);
    assert.equal(seen[0].body.split("\n").length, 3);
  });

  it("does not advance when the connection never completes", async () => {
    await writeEvents(2);
    const row = await destination();

    const outcome = await streamBatch(row, {
      wire: async () => {
        throw new Error("ETIMEDOUT");
      },
      resolve: PUBLIC_DNS,
    });
    assert.equal(outcome.ok, false);
    assert.equal((await reload(row.id)).lastSeq, 0);
  });

  it("stops trying a collector that has been gone long enough", async () => {
    await writeEvents(1);
    const row = await destination();
    await getDb()
      .update(s.siemDestinations)
      .set({ consecutiveFailures: FAILURE_LIMIT - 1 })
      .where(eq(s.siemDestinations.id, row.id));

    await streamBatch(await reload(row.id), { wire: wireReturning(500).wire, resolve: PUBLIC_DNS });

    const after = await reload(row.id);
    assert.notEqual(after.disabledAt, null);
    // The events are not lost: the cursor never moved, so re-enabling it
    // catches up.
    assert.equal(after.lastSeq, 0);
    assert.equal((await activeDestinations(WS)).length, 0);
  });

  it("caps a batch, leaving the rest for the next pass", async () => {
    await writeEvents(5);
    const row = await destination();
    const { wire } = wireReturning(200);

    const first = await streamBatch(row, { wire, resolve: PUBLIC_DNS, batchSize: 2 });
    assert.deepEqual([first.delivered, first.toSeq], [2, 2]);
    const second = await streamBatch(await reload(row.id), { wire, resolve: PUBLIC_DNS, batchSize: 2 });
    assert.deepEqual([second.delivered, second.fromSeq, second.toSeq], [2, 2, 4]);
  });
});
