import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";

import { normaliseEntry, normaliseList, withinAllowlist } from "./allowlist";
import { credentialForOrigin, CredentialError, revokeCredential, storeCredential } from "./credentials";
import { MockPlanner, shapePlan } from "./outline";
import {
  ApprovalError, TRANSITIONS, actionsFor, approve, beginOutline,
  beginRecording, canTransition, createRun, failRun, outlineHash, proposeOutline, recordAction,
  retryRun, updateRequest,
} from "./run";

/**
 * The agent's whole security story is four sentences, and this file is those
 * four sentences:
 *
 *   Nothing records without a person's approval.
 *   It cannot reach an origin nobody approved.
 *   A password is only typed into the site it was stored for.
 *   Everything it did — and everything it was refused — is in the log.
 */

const RUN = isDatabaseConfigured();
const WS = "22222222-2222-4222-8222-222222222222";
const REQUESTER = "22222222-2222-4222-8222-222222222001";
const APPROVER = "22222222-2222-4222-8222-222222222002";

const requester = { memberId: REQUESTER, email: "sam@acme.com" };
const approver = { memberId: APPROVER, email: "lead@acme.com" };

/* ------------------------------------------------------------- allowlist */

describe("the environment allowlist", () => {
  const allowed = normaliseList(["https://app.acme.com", "*.demo.acme.com", "https://Acme.io/"]);

  it("normalises entries so trailing slashes and case do not matter", () => {
    assert.deepEqual(allowed, ["*.demo.acme.com", "https://acme.io", "https://app.acme.com"]);
    assert.equal(normaliseEntry("  https://app.acme.com/path  "), "https://app.acme.com");
    assert.equal(normaliseEntry("not a url"), null);
    assert.equal(normaliseEntry("ftp://acme.com"), null);
  });

  it("admits exactly what was listed", () => {
    assert.equal(withinAllowlist("https://app.acme.com/shipments?x=1", allowed).ok, true);
    assert.equal(withinAllowlist("https://eu.demo.acme.com/", allowed).ok, true);
  });

  it("does not admit a downgrade to http", () => {
    // A downgrade is how a credential ends up on the wire.
    const verdict = withinAllowlist("http://app.acme.com/", allowed);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok === false && verdict.reason, "not-allowed");
  });

  it("does not admit a lookalike host", () => {
    for (const hostile of [
      // The classic: ends with the allowed string, is a different site.
      "https://app.acme.com.evil.example/",
      "https://demo.acme.com.evil.example/",
      "https://evil.example/?x=https://app.acme.com",
      "https://acme.com/",
      "https://notapp.acme.com/",
      // A wildcard covers subdomains, not the apex.
      "https://demo.acme.com/",
    ]) {
      assert.equal(withinAllowlist(hostile, allowed).ok, false, hostile);
    }
  });

  it("refuses schemes the agent has no business following", () => {
    for (const url of ["file:///etc/passwd", "chrome://settings", "javascript:alert(1)"]) {
      const verdict = withinAllowlist(url, allowed);
      assert.equal(verdict.ok, false, url);
    }
  });

  it("refuses an empty list rather than treating it as permissive", () => {
    assert.equal(withinAllowlist("https://app.acme.com/", []).ok, false);
  });
});

/* ------------------------------------------------------------ the planner */

describe("planning a run", () => {
  const allowed = ["https://app.acme.com"];

  it("drops a step outside the allowlist, and says it did", async () => {
    const plan = shapePlan(
      [
        { intent: "Open shipments", url: "https://app.acme.com/shipments" },
        { intent: "Check the status page", url: "https://status.other.example" },
      ],
      allowed,
    );

    assert.equal(plan.outline.length, 1);
    // Removed and reported, never silently trimmed: a plan that reads as
    // approvable while hiding a step nobody would approve is exactly what
    // the gate exists to prevent.
    assert.equal(plan.removed.length, 1);
    assert.match(plan.removed[0].reason, /allowlist/);
  });

  it("renumbers what survives, so the outline has no gaps", async () => {
    const plan = shapePlan(
      [
        { intent: "Off-list", url: "https://evil.example" },
        { intent: "Open shipments", url: "https://app.acme.com/shipments" },
        { intent: "Create one" },
      ],
      allowed,
    );
    assert.deepEqual(plan.outline.map((step) => step.ordinal), [0, 1]);
  });

  it("caps a run at a reviewable length", async () => {
    const steps = Array.from({ length: 30 }, (_, i) => ({ intent: `Step ${i}` }));
    const plan = shapePlan(steps, allowed, 12);
    assert.equal(plan.outline.length, 12);
    assert.equal(plan.removed.length, 18);
  });

  it("produces a plan without a vendor account", async () => {
    const plan = await new MockPlanner().plan({
      brief: "Open the shipments list. Create a shipment. Show the tracking page.",
      allowedOrigins: allowed,
    });
    assert.equal(plan.outline.length, 3);
    assert.equal(plan.outline[0].url, "https://app.acme.com");
  });
});

/* ------------------------------------------------- the transition table */

describe("the approval gate, as a table", () => {
  it("has exactly one way into recording, and it is through approved", () => {
    const into = (Object.keys(TRANSITIONS) as (keyof typeof TRANSITIONS)[]).filter((from) =>
      TRANSITIONS[from].includes("recording"),
    );
    // This is the product's central promise, expressed as an assertion
    // somebody can read in one line.
    assert.deepEqual(into, ["approved"]);
  });

  it("does not let a run reach recording from awaiting_approval", () => {
    assert.equal(canTransition("awaiting_approval", "recording"), false);
    assert.equal(canTransition("outlining", "recording"), false);
    assert.equal(canTransition("drafted", "recording"), false);
  });

  it("keeps a recorded run final, and lets a stopped run go back only for approval", () => {
    assert.deepEqual(TRANSITIONS.recorded, []);
    // Fixed and retried, a stopped run is approved again before anything
    // records: its only way out is back to awaiting_approval.
    assert.deepEqual(TRANSITIONS.failed, ["awaiting_approval"]);
    assert.deepEqual(TRANSITIONS.cancelled, ["awaiting_approval"]);
  });

  it("fingerprints what the agent does and which account it uses, not what is said", () => {
    const base = [{ ordinal: 0, intent: "Ask", action: { kind: "fill" as const, target: "Question", value: "Top campaigns?" } }];
    const hash = outlineHash(base);
    assert.notEqual(hash, outlineHash([{ ...base[0], action: { kind: "fill", target: "Question", value: "Delete my account" } }]), "what is typed");
    assert.notEqual(hash, outlineHash([{ ...base[0], action: { kind: "click", target: "Question" } }]), "the kind of action");
    assert.notEqual(hash, outlineHash(base, { "https://app.acme.com": "app.acme.com · other@acme.com" }), "the account");
    assert.equal(hash, outlineHash([{ ...base[0], narration: "Reworded." }]), "narration does not change what the browser does");
  });

  it("hashes an outline by what it says, not how it is ordered in memory", () => {
    const a = outlineHash([
      { ordinal: 0, intent: "Open shipments", url: "https://app.acme.com" },
      { ordinal: 1, intent: "Create one" },
    ]);
    const b = outlineHash([
      { ordinal: 1, intent: "Create one" },
      { ordinal: 0, intent: "Open shipments", url: "https://app.acme.com" },
    ]);
    assert.equal(a, b);
    assert.notEqual(a, outlineHash([{ ordinal: 0, intent: "Delete everything" }]));
  });
});

/* ------------------------------------------------------ the run (database) */

describe("a run, end to end", { skip: !RUN }, () => {
  before(async () => {
    await eraseWorkspace(WS, "test setup");
  });

  after(async () => {
    await eraseWorkspace(WS, "test teardown");
    await closeDb();
  });

  beforeEach(async () => {
    await eraseWorkspace(WS, "test reset");
    const db = getDb();
    await db.insert(s.workspaces).values({ id: WS, slug: "agent-test", name: "Agent Test" });
    await db.insert(s.members).values([
      { id: REQUESTER, workspaceId: WS, name: "Sam", email: "sam@acme.com", role: "creator" },
      { id: APPROVER, workspaceId: WS, name: "Lead", email: "lead@acme.com", role: "admin" },
    ]);
  });

  it("numbers a burst of trail lines without clashing", async () => {
    const run = await upToApproval();
    const recording = await beginRecording(await approve(run, approver));
    // A page load fires its refused requests all at once.
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        recordAction(recording.id, { kind: "refused", url: `https://tracker.example/${i}`, refusedReason: "script: not-allowed" }),
      ),
    );
    const trail = await actionsFor(recording.id);
    assert.equal(trail.length, 12);
    assert.deepEqual(trail.map((a) => a.ordinal), Array.from({ length: 12 }, (_, i) => i));
    assert.deepEqual(trail.map((a) => a.url), Array.from({ length: 12 }, (_, i) => `https://tracker.example/${i}`), "in the order they were asked for");
  });

  it("edits a waiting run in place, and a changed plan needs the new approval", async () => {
    const run = await upToApproval();
    const edited = await updateRequest(
      run,
      {
        brief: "Demo the shipments flow, briefly.",
        allowedOrigins: ["https://app.acme.com"],
        requestOrigins: [],
        entryUrl: "https://app.acme.com/shipments",
        outline: [{ ordinal: 0, intent: "Open shipments", url: "https://app.acme.com/shipments" }],
        signIns: {},
      },
      requester,
    );
    assert.equal(edited.id, run.id);
    assert.equal(edited.status, "awaiting_approval");
    assert.equal(edited.entryUrl, "https://app.acme.com/shipments");
    assert.equal((edited.outline ?? []).length, 1);
    const approved = await approve(edited, approver);
    await assert.rejects(() => updateRequest(approved, { brief: "x", allowedOrigins: [], requestOrigins: [], entryUrl: null, outline: [], signIns: {} }, requester));
  });

  it("retries a stopped run as itself, one attempt later, back to approval", async () => {
    const run = await upToApproval();
    const approved = await approve(run, approver);
    const recording = await beginRecording(approved);
    await recordAction(recording.id, { kind: "navigate", url: "https://app.acme.com/login" });
    const failed = await failRun(recording, "The site did not accept the sign-in.");

    const retried = await retryRun(
      failed,
      { brief: failed.brief, allowedOrigins: ["https://app.acme.com"], requestOrigins: [], entryUrl: null, outline, signIns: {} },
      requester,
    );
    assert.equal(retried.id, run.id, "the same run");
    assert.equal(retried.attempt, 2);
    assert.equal(retried.status, "awaiting_approval");
    assert.equal(retried.approvedBy, null, "the old approval does not carry over");
    assert.equal(retried.error, null);
    await assert.rejects(() => beginRecording(retried), ApprovalError, "nothing records before the fix is approved");

    await recordAction(retried.id, { kind: "navigate", url: "https://app.acme.com/shipments" });
    const trail = await actionsFor(run.id);
    assert.deepEqual(trail.map((a) => a.attempt), [1, 2], "each line knows its attempt");
  });

  it("queues each attempt of a retried run as its own job", async () => {
    // Keyed on the run alone, the second attempt matched the first attempt's
    // finished job and nothing was queued. Keyed on the attempt, each gets one.
    const { enqueue } = await import("@/lib/jobs/queue");
    const key = (attempt: number) => `agent:run-x:${attempt}`;
    const first = await enqueue({ workspaceId: WS, kind: "agent", payload: { runId: "run-x" }, idempotencyKey: key(1), maxAttempts: 1 });
    const again = await enqueue({ workspaceId: WS, kind: "agent", payload: { runId: "run-x" }, idempotencyKey: key(1), maxAttempts: 1 });
    const second = await enqueue({ workspaceId: WS, kind: "agent", payload: { runId: "run-x" }, idempotencyKey: key(2), maxAttempts: 1 });
    assert.equal(first.created, true);
    assert.equal(again.created, false, "approving the same attempt twice queues it once");
    assert.equal(second.created, true, "the retry gets a job of its own");
    assert.notEqual(second.job.id, first.job.id);
  });

  it("will not reopen a run that made a project", async () => {
    const run = await upToApproval();
    const recording = await beginRecording(await approve(run, approver));
    const [project] = await getDb().insert(s.projects).values({ workspaceId: WS, slug: `p-${Date.now()}`, title: "Made" }).returning();
    await getDb().update(s.agentRuns).set({ projectId: project.id }).where(eq(s.agentRuns.id, recording.id));
    const failed = await failRun({ ...recording, projectId: project.id }, "later failure");
    await assert.rejects(
      () => retryRun(failed, { brief: failed.brief, allowedOrigins: ["https://app.acme.com"], requestOrigins: [], entryUrl: null, outline, signIns: {} }, requester),
      ApprovalError,
    );
  });

  it("lets a requester approve their own run only when nobody else could", async () => {
    const { hasOtherApprover } = await import("./run");
    // Sam asked; Lead, an admin, could approve: the two-person rule holds.
    assert.equal(await hasOtherApprover(WS, REQUESTER), true);
    // Lead alone, as the only approver in the workspace, has nobody else.
    assert.equal(await hasOtherApprover(WS, APPROVER), false);
    // A second admin joins, and the rule is back for Lead too.
    await getDb().insert(s.members).values({ workspaceId: WS, name: "Kim", email: "kim@acme.com", role: "admin" });
    assert.equal(await hasOtherApprover(WS, APPROVER), true);
    // Kim leaves; a deactivated member approves nothing.
    await getDb().update(s.members).set({ deactivatedAt: new Date() }).where(eq(s.members.email, "kim@acme.com"));
    assert.equal(await hasOtherApprover(WS, APPROVER), false);
  });

  const outline = [
    { ordinal: 0, intent: "Open shipments", url: "https://app.acme.com/shipments" },
    { ordinal: 1, intent: "Create a shipment" },
  ];

  async function upToApproval() {
    let run = await createRun({ workspaceId: WS, brief: "Demo the shipments flow.", actor: requester });
    run = await beginOutline(run);
    run = await proposeOutline(run, outline, ["https://app.acme.com"]);
    return run;
  }

  it("cannot start recording before anybody has approved", async () => {
    const run = await upToApproval();
    assert.equal(run.status, "awaiting_approval");

    // Two independent refusals, and both matter. The approval check fires
    // first and names the actual problem; the state machine underneath it
    // has no edge from awaiting_approval to recording at all, so removing
    // the check would not open a path.
    await assert.rejects(() => beginRecording(run), ApprovalError);
    assert.equal(canTransition("awaiting_approval", "recording"), false);

    const [unchanged] = await getDb().select().from(s.agentRuns).where(eq(s.agentRuns.id, run.id));
    assert.equal(unchanged.status, "awaiting_approval");
    assert.equal(unchanged.startedAt, null);
  });

  it("cannot be approved by the person who asked for it", async () => {
    const run = await upToApproval();
    await assert.rejects(() => approve(run, requester), ApprovalError);
    // The gate exists to put a second pair of eyes on a plan that will run
    // unattended with real credentials.
    const approved = await approve(run, approver);
    assert.equal(approved.status, "approved");
    assert.equal(approved.approvedByEmail, "lead@acme.com");
  });

  it("refuses an approval with no person behind it", async () => {
    const run = await upToApproval();
    await assert.rejects(
      () => approve(run, { memberId: null, email: "ci@acme.com" }),
      ApprovalError,
    );
  });

  it("refuses to record an outline that changed after it was approved", async () => {
    const run = await upToApproval();
    const approved = await approve(run, approver);

    // Somebody edits the plan after the approval. The status still says
    // approved; the hash says otherwise.
    await getDb()
      .update(s.agentRuns)
      .set({ outline: [{ ordinal: 0, intent: "Delete every shipment" }] })
      .where(eq(s.agentRuns.id, approved.id));

    const [edited] = await getDb().select().from(s.agentRuns).where(eq(s.agentRuns.id, approved.id));
    await assert.rejects(() => beginRecording(edited), ApprovalError);
  });

  it("records once, even if two callers try at the same moment", async () => {
    const run = await upToApproval();
    const approved = await approve(run, approver);

    const results = await Promise.allSettled([beginRecording(approved), beginRecording(approved)]);
    const started = results.filter((result) => result.status === "fulfilled");
    // The status is part of the update predicate, so the loser updates zero
    // rows and is told the transition is illegal — which it now is.
    assert.equal(started.length, 1);
  });

  it("writes the approval to the audit log with a name against it", async () => {
    const run = await upToApproval();
    await approve(run, approver);

    // This workspace's entries only: the audit table is shared with every
    // other run on the database, including real ones.
    const entries = await getDb()
      .select()
      .from(s.auditEvents)
      .where(and(eq(s.auditEvents.action, "agent.run_approved"), eq(s.auditEvents.workspaceId, WS)));

    assert.equal(entries.length, 1);
    assert.equal(entries[0].actorEmail, "lead@acme.com");
    assert.equal(entries[0].resourceId, run.id);
  });

  it("keeps the refusals, not just the actions", async () => {
    const run = await upToApproval();
    const approved = await approve(run, approver);
    const recording = await beginRecording(approved);

    await recordAction(recording.id, { kind: "navigate", url: "https://app.acme.com/shipments" });
    await recordAction(recording.id, {
      kind: "refused",
      url: "https://telemetry.other.example/collect",
      refusedReason: "xhr: not-allowed",
    });

    const actions = await actionsFor(recording.id);
    assert.deepEqual(actions.map((a) => a.ordinal), [0, 1]);
    // "What did it try to do" is the question a reviewer asks, and a
    // silently aborted request cannot answer it.
    assert.equal(actions[1].kind, "refused");
    assert.match(actions[1].refusedReason ?? "", /not-allowed/);
  });

  /* --------------------------------------------------------- credentials */

  it("seals a credential and binds it to one exact origin", async () => {
    const credential = await storeCredential({
      workspaceId: WS,
      label: "acme-demo",
      origin: "https://app.acme.com",
      username: "demo@acme.com",
      secret: "hunter2-but-longer",
      actor: approver,
    });

    assert.equal(credential.secretSealed.includes("hunter2"), false);

    const resolved = await credentialForOrigin(WS, "https://app.acme.com");
    assert.equal(resolved?.secret, "hunter2-but-longer");

    // The whole point: an agent talked into visiting another page cannot be
    // talked into typing the password there.
    assert.equal(await credentialForOrigin(WS, "https://evil.example"), null);
    assert.equal(await credentialForOrigin(WS, "http://app.acme.com"), null);
    assert.equal(await credentialForOrigin(WS, "https://app.acme.com.evil.example"), null);
  });

  it("refuses a credential scoped to a wildcard or to plain http", async () => {
    for (const origin of ["*.acme.com", "http://app.acme.com"]) {
      await assert.rejects(
        () =>
          storeCredential({
            workspaceId: WS, label: "bad", origin, secret: "x", actor: approver,
          }),
        CredentialError,
        origin,
      );
    }
  });

  it("rotates in place, so nothing that references it has to change", async () => {
    const first = await storeCredential({
      workspaceId: WS, label: "acme-demo", origin: "https://app.acme.com", secret: "old", actor: approver,
    });
    const second = await storeCredential({
      workspaceId: WS, label: "acme-demo", origin: "https://app.acme.com", secret: "new", actor: approver,
    });

    assert.equal(second.id, first.id);
    assert.notEqual(second.rotatedAt, null);
    assert.equal((await credentialForOrigin(WS, "https://app.acme.com"))?.secret, "new");
  });

  it("stops working the moment it is revoked, and leaves no ciphertext", async () => {
    await storeCredential({
      workspaceId: WS, label: "acme-demo", origin: "https://app.acme.com", secret: "old", actor: approver,
    });

    assert.equal(await revokeCredential(WS, "acme-demo", approver), true);
    assert.equal(await credentialForOrigin(WS, "https://app.acme.com"), null);

    const [row] = await getDb()
      .select()
      .from(s.agentCredentials)
      .where(eq(s.agentCredentials.label, "acme-demo"));
    // Cleared, not merely flagged: a revoked credential whose ciphertext is
    // still in the table comes back if anybody un-sets the flag.
    const { open } = await import("@/lib/crypto/secrets");
    assert.equal(open(row.secretSealed), "");
  });

  it("records that a credential was used, so an unused one is visible", async () => {
    await storeCredential({
      workspaceId: WS, label: "acme-demo", origin: "https://app.acme.com", secret: "x", actor: approver,
    });
    await credentialForOrigin(WS, "https://app.acme.com");

    const [row] = await getDb()
      .select()
      .from(s.agentCredentials)
      .where(eq(s.agentCredentials.label, "acme-demo"));
    assert.notEqual(row.lastUsedAt, null);
  });

  it("never writes a secret into the audit log", async () => {
    await storeCredential({
      workspaceId: WS,
      label: "acme-demo",
      origin: "https://app.acme.com",
      username: "demo@acme.com",
      secret: "hunter2-but-longer",
      actor: approver,
    });

    const entries = await getDb().select().from(s.auditEvents);
    const serialised = JSON.stringify(entries);
    assert.equal(serialised.includes("hunter2"), false);
    assert.match(serialised, /acme-demo/);
  });
});
