import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { canonicalJson, hashEntry } from "./chain";
import { list, purgeForErasure, record, verifyChain } from "./log";

/**
 * The claims this log makes — append-only, chained, tamper-evident — are
 * claims about a database, so they are tested against one. A mock would
 * assert that the code calls the functions it calls, which is not the same
 * thing as the trigger being in force.
 */

const RUN = isDatabaseConfigured();
const ACTOR = { memberId: "77777777-7777-4777-8777-777777777777", email: "renata@example.com" };
const WS = "66666666-6666-4666-8666-666666666666";
const OTHER = "66666666-6666-4666-8666-666666666667";

before(async () => {
  if (!RUN) return;
  const db = getDb();
  for (const id of [WS, OTHER]) await eraseWorkspace(id, "test setup");
  await db.insert(s.workspaces).values([
    { id: WS, slug: "audit-test", name: "Audit Test" },
    { id: OTHER, slug: "audit-test-2", name: "Audit Test 2" },
  ]);
  await db.insert(s.members).values({
    id: ACTOR.memberId, workspaceId: WS, name: "Renata", email: ACTOR.email, role: "owner",
  });
});

after(async () => {
  if (!RUN) return;
  for (const id of [WS, OTHER]) await eraseWorkspace(id, "test teardown");
  await closeDb();
});

beforeEach(async () => {
  if (!RUN) return;
  await purge(WS);
  await purge(OTHER);
});

/**
 * Drizzle wraps driver errors, so the database's own message lives on the
 * cause chain rather than in `error.message`.
 */
function says(error: unknown, pattern: RegExp): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 6; depth++) {
    const e = current as { message?: string; cause?: unknown };
    if (e.message && pattern.test(e.message)) return true;
    current = e.cause;
  }
  return false;
}

async function purge(workspaceId: string) {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('demoriff.audit_purge', 'on', true)`);
    await tx.delete(s.auditEvents).where(eq(s.auditEvents.workspaceId, workspaceId));
  });
}

// --- the hash itself (no database needed) ----------------------------------

describe("the chain hash", () => {
  it("does not depend on the order keys were written in", () => {
    // JSON.stringify preserves insertion order, so without canonicalisation
    // two identical payloads hash differently and the chain fails for a
    // reason that has nothing to do with tampering.
    assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
    assert.equal(canonicalJson({ a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4}}');
    assert.equal(canonicalJson([{ b: 1, a: 2 }]), '[{"a":2,"b":1}]');
  });

  it("cannot be forged by choosing field values that look like delimiters", () => {
    const base = {
      workspaceId: WS, seq: 1, prevHash: "genesis",
      createdAt: new Date("2026-01-01T00:00:00Z"), metadata: null,
    };
    // With a printable separator these two would produce the same payload.
    const a = hashEntry({ ...base, action: "a|b", resourceType: "c" });
    const b = hashEntry({ ...base, action: "a", resourceType: "b|c" });
    assert.notEqual(a, b);
  });

  it("changes when any covered field changes", () => {
    const base = {
      workspaceId: WS, seq: 1, prevHash: "genesis", action: "project.publish",
      resourceType: "project", resourceId: "p1", actorId: "m1",
      actorEmail: "a@b.c", ip: "10.0.0.1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      metadata: { locale: "en-US" },
    };
    const original = hashEntry(base);
    assert.notEqual(hashEntry({ ...base, action: "project.unpublish" }), original);
    assert.notEqual(hashEntry({ ...base, actorEmail: "someone@else.com" }), original);
    assert.notEqual(hashEntry({ ...base, metadata: { locale: "de-DE" } }), original);
    assert.notEqual(hashEntry({ ...base, createdAt: new Date("2026-01-01T00:00:01Z") }), original);
    assert.notEqual(hashEntry({ ...base, prevHash: "something-else" }), original);
  });
});

// --- against a real database -----------------------------------------------

describe("the audit log", { skip: RUN ? false : "DATABASE_URL not set" }, () => {
  it("numbers entries from one and links each to the last", async () => {
    const first = await record({ workspaceId: WS, action: "project.create", resourceType: "project", actor: ACTOR });
    const second = await record({ workspaceId: WS, action: "project.publish", resourceType: "project", actor: ACTOR });

    assert.equal(first.seq, 1);
    assert.equal(first.prevHash, "genesis");
    assert.equal(second.seq, 2);
    assert.equal(second.prevHash, first.hash);

    assert.deepEqual(await verifyChain(WS), { ok: true, entries: 2, head: second.hash });
  });

  it("keeps each workspace's chain to itself", async () => {
    await record({ workspaceId: WS, action: "a", resourceType: "x" });
    const other = await record({ workspaceId: OTHER, action: "a", resourceType: "x" });

    // A tenant's numbering must not reveal, or depend on, another's volume.
    assert.equal(other.seq, 1);
    assert.equal(other.prevHash, "genesis");
    assert.equal((await verifyChain(WS)).ok, true);
    assert.equal((await verifyChain(OTHER)).ok, true);
  });

  it("serialises concurrent writers instead of forking the chain", async () => {
    const written = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        record({ workspaceId: WS, action: `bulk.${i}`, resourceType: "test", actor: ACTOR }),
      ),
    );

    // Without the advisory lock two writers read the same tail, and either
    // one loses to the unique index or the chain forks silently.
    const seqs = written.map((e) => e.seq).sort((a, b) => a - b);
    assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    assert.equal((await verifyChain(WS)).ok, true);
  });

  it("refuses an update, from anyone, for any reason", async () => {
    const entry = await record({ workspaceId: WS, action: "project.delete", resourceType: "project" });

    // Every codebase grows a path that "just fixes up" a row. There is no
    // such path here.
    await assert.rejects(
      () => getDb().update(s.auditEvents).set({ action: "project.archive" }).where(eq(s.auditEvents.id, entry.id)),
      (error: unknown) => says(error, /append-only/),
    );
  });

  it("refuses a delete that has not declared itself an erasure", async () => {
    const entry = await record({ workspaceId: WS, action: "member.remove", resourceType: "member" });
    await assert.rejects(
      () => getDb().delete(s.auditEvents).where(eq(s.auditEvents.id, entry.id)),
      (error: unknown) => says(error, /append-only/),
    );
  });

  it("refuses to erase the trail when a workspace is deleted routinely", async () => {
    await record({ workspaceId: OTHER, action: "workspace.created", resourceType: "workspace" });

    // "Deleting the workspace erased the evidence of who deleted it" is not
    // a property to ship by accident. The cascade has declared nothing, so
    // it fails loudly.
    await assert.rejects(
      () => getDb().delete(s.workspaces).where(eq(s.workspaces.id, OTHER)),
      (error: unknown) => says(error, /append-only/),
    );
  });

  it("allows erasure when it is declared, and says what it destroyed", async () => {
    await record({ workspaceId: WS, action: "a", resourceType: "x" });
    await record({ workspaceId: WS, action: "b", resourceType: "x" });

    const result = await purgeForErasure(WS, "customer exercised right to erasure");
    assert.equal(result.deleted, 2);
    assert.deepEqual(await verifyChain(WS), { ok: true, entries: 0, head: null });
  });

  it("will not erase without a stated reason", async () => {
    await assert.rejects(() => purgeForErasure(WS, "   "), /requires a stated reason/);
  });

  // --- detection -----------------------------------------------------------

  it("detects an entry altered with privileges high enough to drop the trigger", async () => {
    await record({ workspaceId: WS, action: "project.create", resourceType: "project", actor: ACTOR });
    const target = await record({ workspaceId: WS, action: "project.publish", resourceType: "project", actor: ACTOR });
    await record({ workspaceId: WS, action: "share.create", resourceType: "share", actor: ACTOR });

    // Simulate an attacker who disabled the trigger first: the chain is the
    // control that still works afterwards.
    await getDb().transaction(async (tx) => {
      await tx.execute(sql`ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update`);
      await tx.execute(sql`UPDATE audit_events SET action = 'project.view' WHERE id = ${target.id}`);
      await tx.execute(sql`ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_update`);
    });

    const verdict = await verifyChain(WS);
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.equal(verdict.problem, "hash-mismatch");
    // The first divergence is the useful fact: intact before, unprovable
    // after, and this is where to look.
    assert.equal(verdict.brokenAt.seq, 2);
  });

  it("detects an entry removed from the middle", async () => {
    await record({ workspaceId: WS, action: "a", resourceType: "x" });
    const removed = await record({ workspaceId: WS, action: "b", resourceType: "x" });
    await record({ workspaceId: WS, action: "c", resourceType: "x" });

    await getDb().transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('demoriff.audit_purge', 'on', true)`);
      await tx.delete(s.auditEvents).where(eq(s.auditEvents.id, removed.id));
    });

    const verdict = await verifyChain(WS);
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.equal(verdict.problem, "sequence-gap");
    assert.equal(verdict.brokenAt.seq, 3);
  });

  it("reads back newest first", async () => {
    await record({ workspaceId: WS, action: "first", resourceType: "x" });
    await record({ workspaceId: WS, action: "second", resourceType: "x" });
    const rows = await list(WS, { limit: 10 });
    assert.deepEqual(rows.map((r) => r.action), ["second", "first"]);
  });

  it("survives an entry written before the chain existed", async () => {
    await record({ workspaceId: WS, action: "chained", resourceType: "x" });
    // A row from before the migration: no seq, no hash, no honest claim to
    // integrity. It must not break verification of the entries that do.
    await getDb().insert(s.auditEvents).values({
      workspaceId: WS, action: "legacy", resourceType: "x",
    });

    assert.equal((await verifyChain(WS)).ok, true);
    assert.equal((await list(WS, { limit: 10 })).length, 2);
  });
});
