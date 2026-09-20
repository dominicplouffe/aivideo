import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import {
  activityFor, attachToSession, erase, identify, plausibleEmail,
  signPersonalLink, verifyPersonalLink,
} from "./identity";

/**
 * Everything else in analytics is built so nobody can be identified. This
 * module is the one exception, so the tests are mostly about its edges: that
 * identity is given rather than inferred, that it never reaches backwards,
 * and that forgetting somebody does not quietly restate last quarter.
 */

const RUN = isDatabaseConfigured();
const WS = "11111111-1111-4111-8111-111111111112";
const OTHER_WS = "11111111-1111-4111-8111-111111111113";
const PROJECT = "11111111-1111-4111-8111-111111111114";

/* ------------------------------------------- personalised links (no db) */

describe("a personalised link", () => {
  it("round-trips the contact it was made for", () => {
    const token = signPersonalLink("c_1");
    assert.deepEqual(verifyPersonalLink(token), { ok: true, contactId: "c_1" });
  });

  it("cannot be edited to point at somebody else", () => {
    // An unsigned id in a URL is an invitation to iterate, and a viewer who
    // could edit it would attach their watching to another person's record.
    const token = signPersonalLink("c_1");
    const [body, signature] = token.split(".");
    const forged = Buffer.from("c_2.1789000000000", "utf8").toString("base64url");

    assert.equal(verifyPersonalLink(`${forged}.${signature}`).ok, false);
    assert.equal(verifyPersonalLink(`${body}.${signature}x`).ok, false);
    assert.equal(verifyPersonalLink("nonsense").ok, false);
    assert.equal(verifyPersonalLink("").ok, false);
  });

  it("expires, because a forwarded link is opened by somebody else", () => {
    const token = signPersonalLink("c_1", Date.now() - 200 * 24 * 60 * 60 * 1000);
    const verdict = verifyPersonalLink(token);
    // Recording a forward as the original recipient is worse than recording
    // nobody.
    assert.equal(verdict.ok === false && verdict.reason, "expired");
  });
});

describe("what counts as an address", () => {
  it("accepts ordinary ones and rejects obvious rubbish", () => {
    for (const good of ["sam@meridian.com", "a@b.co", "sam.taylor+demo@sub.meridian.com"]) {
      assert.equal(plausibleEmail(good), true, good);
    }
    for (const bad of ["", "sam", "sam@", "@meridian.com", "sam @meridian.com", `${"a".repeat(250)}@b.com`]) {
      assert.equal(plausibleEmail(bad), false, bad);
    }
  });
});

/* --------------------------------------------------------- the database */

describe("knowing who watched", { skip: !RUN }, () => {
  before(async () => {
    await eraseWorkspace(WS, "test setup");
    await eraseWorkspace(OTHER_WS, "test setup");
  });

  after(async () => {
    await eraseWorkspace(WS, "test teardown");
    await eraseWorkspace(OTHER_WS, "test teardown");
    await closeDb();
  });

  beforeEach(async () => {
    await eraseWorkspace(WS, "test reset");
    await eraseWorkspace(OTHER_WS, "test reset");
    const db = getDb();
    await db.insert(s.workspaces).values([
      { id: WS, slug: "identity-test", name: "Identity Test" },
      { id: OTHER_WS, slug: "identity-other", name: "Someone Else" },
    ]);
    await db.insert(s.projects).values({
      id: PROJECT, workspaceId: WS, slug: "shipments", title: "Shipments",
    });
  });

  async function session(over: Partial<typeof s.analyticsSessions.$inferInsert> = {}) {
    const [row] = await getDb()
      .insert(s.analyticsSessions)
      .values({
        workspaceId: WS,
        projectId: PROJECT,
        visitorKey: `vk_${Math.random().toString(36).slice(2)}`,
        day: new Date().toISOString().slice(0, 10),
        assetSeconds: 120,
        watchedSeconds: 90,
        ...over,
      })
      .returning();
    return row;
  }

  it("creates a contact only when somebody gives an address", async () => {
    const contact = await identify({
      workspaceId: WS, email: "Sam@Meridian.com", name: "Sam", source: "email_gate",
    });

    assert.equal(contact.email, "sam@meridian.com");
    // The answer to "why do you have my email" is stored with it. A row
    // without one should not exist.
    assert.equal(contact.source, "email_gate");
    assert.notEqual(contact.identifiedAt, null);
  });

  it("refuses something that is not an address", async () => {
    await assert.rejects(
      () => identify({ workspaceId: WS, email: "not-an-address", source: "email_gate" }),
      /does not look like an email/,
    );
  });

  it("treats a second gate as the same person, and does not lose what it knew", async () => {
    const first = await identify({
      workspaceId: WS, email: "sam@meridian.com", name: "Sam Taylor", company: "Meridian", source: "email_gate",
    });
    const second = await identify({
      workspaceId: WS, email: "sam@meridian.com", source: "email_gate",
    });

    assert.equal(second.id, first.id);
    // A later gate that asks for less must not erase what an earlier one
    // collected.
    assert.equal(second.name, "Sam Taylor");
    assert.equal(second.company, "Meridian");
  });

  it("attaches to the session it was given in, and to no other", async () => {
    const earlier = await session();
    const now = await session();
    const contact = await identify({ workspaceId: WS, email: "sam@meridian.com", source: "email_gate" });

    assert.equal(await attachToSession(WS, now.id, contact.id), true);

    const [before] = await getDb()
      .select()
      .from(s.analyticsSessions)
      .where(eq(s.analyticsSessions.id, earlier.id));
    // The daily key is irreversible, so earlier sessions cannot be found —
    // and an address given for one demo is not consent to be matched
    // against every anonymous view in the table.
    assert.equal(before.contactId, null);
  });

  it("will not overwrite whose session one already was", async () => {
    const row = await session();
    const sam = await identify({ workspaceId: WS, email: "sam@meridian.com", source: "email_gate" });
    const dana = await identify({ workspaceId: WS, email: "dana@meridian.com", source: "email_gate" });

    assert.equal(await attachToSession(WS, row.id, sam.id), true);
    assert.equal(await attachToSession(WS, row.id, dana.id), false);

    const [after] = await getDb()
      .select()
      .from(s.analyticsSessions)
      .where(eq(s.analyticsSessions.id, row.id));
    assert.equal(after.contactId, sam.id);
  });

  it("cannot attach a session belonging to another workspace", async () => {
    const row = await session();
    const contact = await identify({ workspaceId: WS, email: "sam@meridian.com", source: "email_gate" });
    assert.equal(await attachToSession(OTHER_WS, row.id, contact.id), false);
  });

  it("reports what a known viewer watched", async () => {
    const contact = await identify({ workspaceId: WS, email: "sam@meridian.com", source: "crm_link" });
    const row = await session({ watchedSeconds: 110, reachedEnd: true, ctaClicked: true });
    await attachToSession(WS, row.id, contact.id);

    const activity = await activityFor(WS, contact.id);
    assert.equal(activity?.sessions.length, 1);
    assert.equal(activity?.sessions[0].watchedSeconds, 110);
    assert.equal(activity?.sessions[0].ctaClicked, true);

    // And not across a tenant boundary.
    assert.equal(await activityFor(OTHER_WS, contact.id), null);
  });

  it("forgets the name and keeps the count", async () => {
    const contact = await identify({ workspaceId: WS, email: "sam@meridian.com", name: "Sam", source: "email_gate" });
    const row = await session({ watchedSeconds: 75 });
    await attachToSession(WS, row.id, contact.id);

    assert.equal(await erase(WS, contact.id, { memberId: null, email: "admin@meridian.com" }), true);

    const [after] = await getDb().select().from(s.contacts).where(eq(s.contacts.id, contact.id));
    assert.equal(after.email.startsWith("erased:"), true);
    assert.equal(after.name, null);
    assert.notEqual(after.erasedAt, null);

    // The session survives with its numbers. A deletion request is about a
    // person's name, not about restating last quarter.
    const [session_] = await getDb()
      .select()
      .from(s.analyticsSessions)
      .where(eq(s.analyticsSessions.id, row.id));
    assert.equal(session_.watchedSeconds, 75);
    assert.equal(session_.contactId, contact.id);
  });

  it("lets two people be erased without colliding", async () => {
    // The unique index is on the address, so a null or a shared placeholder
    // would make the second erasure fail.
    const sam = await identify({ workspaceId: WS, email: "sam@meridian.com", source: "email_gate" });
    const dana = await identify({ workspaceId: WS, email: "dana@meridian.com", source: "email_gate" });

    assert.equal(await erase(WS, sam.id, { memberId: null, email: "a@b.com" }), true);
    assert.equal(await erase(WS, dana.id, { memberId: null, email: "a@b.com" }), true);
    // And erasing twice is not an error, it is a no-op.
    assert.equal(await erase(WS, sam.id, { memberId: null, email: "a@b.com" }), false);
  });

  it("records the consent in the audit log, without the address in the metadata", async () => {
    await identify({ workspaceId: WS, email: "sam@meridian.com", source: "personalized_link" });

    const [entry] = await getDb()
      .select()
      .from(s.auditEvents)
      .where(and(eq(s.auditEvents.workspaceId, WS), eq(s.auditEvents.action, "contact.identified")));

    assert.equal(entry.actorEmail, "sam@meridian.com");
    assert.deepEqual(entry.metadata, { source: "personalized_link" });
  });
});
