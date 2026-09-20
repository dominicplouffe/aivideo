import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { issue, listForMember } from "../sessions";
import {
  createGroup, deleteGroup, getGroup, listGroups, membersOf, parseGroupFilter,
  patchGroup, replaceGroup,
} from "./groups";
import { authenticateScim, issueScimToken } from "./tokens";
import { ScimError } from "./users";

/**
 * Groups are worth syncing because they decide roles. So these tests are
 * about the role, not about the group: what happens to somebody's
 * privileges when a directory moves them, and what happens to the session
 * they already have open.
 */

const RUN = isDatabaseConfigured();
const WS = "55555555-5555-4555-8555-555555555511";
const OTHER_WS = "55555555-5555-4555-8555-555555555512";
const SAM = "55555555-5555-4555-8555-555555555501";
const OWNER = "55555555-5555-4555-8555-555555555502";
const STRANGER = "55555555-5555-4555-8555-555555555503";
const CONNECTION = "conn_groups_test";

describe("the group filter", () => {
  it("reads the one form a directory sends", () => {
    assert.equal(parseGroupFilter('displayName eq "demo-admins"'), "demo-admins");
    assert.equal(parseGroupFilter(null), null);
    assert.throws(() => parseGroupFilter('displayName sw "demo"'), ScimError);
  });
});

describe("groups deciding roles", { skip: !RUN }, () => {
  let token = "";

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
      { id: WS, slug: "groups-test", name: "Groups Test" },
      { id: OTHER_WS, slug: "groups-other", name: "Someone Else" },
    ]);
    await db.insert(s.members).values([
      { id: SAM, workspaceId: WS, name: "Sam", email: "sam@acme.com", role: "viewer" },
      { id: OWNER, workspaceId: WS, name: "Owner", email: "owner@acme.com", role: "owner" },
      { id: STRANGER, workspaceId: OTHER_WS, name: "Stranger", email: "x@other.com", role: "admin" },
    ]);
    await db.insert(s.ssoConnections).values({
      workspaceId: WS,
      connectionId: CONNECTION,
      domains: ["acme.com"],
      defaultRole: "viewer",
      roleMappings: { "demo-admins": "admin", "support-leads": "admin", creators: "creator" },
    });
    token = (await issueScimToken(CONNECTION)).token;
  });

  async function principal() {
    return (await authenticateScim(
      new Request("https://demoriff.com/api/scim/v2/Groups", {
        headers: { authorization: `Bearer ${token}` },
      }),
    ))!;
  }

  async function roleOf(memberId: string) {
    const [row] = await getDb().select().from(s.members).where(eq(s.members.id, memberId));
    return row.role;
  }

  it("raises a role when a directory adds somebody to a mapped group", async () => {
    const p = await principal();
    const group = await createGroup(p, { displayName: "demo-admins", members: [{ value: SAM }] });

    assert.equal(await roleOf(SAM), "admin");
    assert.deepEqual((await membersOf(group.id)).map((m) => m.email), ["sam@acme.com"]);
  });

  it("ends every open session when the role changes", async () => {
    const p = await principal();
    await issue({ memberId: SAM, workspaceId: WS, ip: null, userAgent: null });
    assert.equal((await listForMember(SAM)).length, 1);

    await createGroup(p, { displayName: "demo-admins", members: [{ value: SAM }] });

    // A demotion that waits for the next sign-in takes effect exactly when
    // it matters least; the same is true of a promotion somebody should not
    // keep using an old session to exercise.
    assert.equal((await listForMember(SAM)).length, 0);
  });

  it("recomputes from every group, not from the one that changed", async () => {
    const p = await principal();
    const admins = await createGroup(p, { displayName: "demo-admins", members: [{ value: SAM }] });
    await createGroup(p, { displayName: "support-leads", members: [{ value: SAM }] });
    assert.equal(await roleOf(SAM), "admin");

    await patchGroup(p, admins.id, [
      { op: "remove", path: "members", value: [{ value: SAM }] },
    ]);

    // Still in support-leads, which also maps to admin. Applying the delta
    // instead of recomputing is the bug everybody writes.
    assert.equal(await roleOf(SAM), "admin");
  });

  it("falls back to the connection default when the last group goes", async () => {
    const p = await principal();
    const group = await createGroup(p, { displayName: "demo-admins", members: [{ value: SAM }] });
    await patchGroup(p, group.id, [{ op: "remove", path: "members", value: [{ value: SAM }] }]);
    assert.equal(await roleOf(SAM), "viewer");
  });

  it("reads a removal encoded in the path, the way Entra sends it", async () => {
    const p = await principal();
    const group = await createGroup(p, { displayName: "demo-admins", members: [{ value: SAM }] });

    // No value at all: the member is in the filter expression.
    await patchGroup(p, group.id, [{ op: "remove", path: `members[value eq "${SAM}"]` }]);

    assert.equal(await roleOf(SAM), "viewer");
    assert.equal((await membersOf(group.id)).length, 0);
  });

  it("handles a replace of the whole member list, both ways", async () => {
    const p = await principal();
    const group = await createGroup(p, { displayName: "demo-admins", members: [{ value: SAM }] });
    assert.equal(await roleOf(SAM), "admin");

    await replaceGroup(p, group.id, { displayName: "demo-admins", members: [] });
    // A replace both grants and removes, so the people who left need
    // recomputing just as much as the people who joined.
    assert.equal(await roleOf(SAM), "viewer");
  });

  it("takes the most privileged mapping when groups disagree", async () => {
    const p = await principal();
    await createGroup(p, { displayName: "creators", members: [{ value: SAM }] });
    assert.equal(await roleOf(SAM), "creator");

    await createGroup(p, { displayName: "demo-admins", members: [{ value: SAM }] });
    assert.equal(await roleOf(SAM), "admin");
  });

  it("never changes the owner's role", async () => {
    const p = await principal();
    await createGroup(p, { displayName: "creators", members: [{ value: OWNER }] });
    // Ownership is a billing and deletion relationship. A group name must
    // not take a workspace from the person paying for it.
    assert.equal(await roleOf(OWNER), "owner");
  });

  it("recomputes before deleting a group, not after", async () => {
    const p = await principal();
    const group = await createGroup(p, { displayName: "demo-admins", members: [{ value: SAM }] });
    assert.equal(await roleOf(SAM), "admin");

    await deleteGroup(p, group.id);

    // After the rows are gone there is nothing left to recompute from, and
    // a deletion that leaves people holding a role it granted is the worst
    // outcome of tidying up a directory.
    assert.equal(await roleOf(SAM), "viewer");
    await assert.rejects(() => getGroup(p, group.id), /No such group/);
  });

  it("cannot add a member belonging to another workspace", async () => {
    const p = await principal();
    const group = await createGroup(p, { displayName: "demo-admins", members: [{ value: STRANGER }] });

    assert.equal((await membersOf(group.id)).length, 0);
    const [stranger] = await getDb().select().from(s.members).where(eq(s.members.id, STRANGER));
    assert.equal(stranger.role, "admin");
  });

  it("returns the existing group when a restarted directory re-sends it", async () => {
    const p = await principal();
    const first = await createGroup(p, { displayName: "demo-admins", externalId: "g1" });
    const second = await createGroup(p, { displayName: "demo-admins", externalId: "g1" });
    // A 409 it retries forever helps nobody.
    assert.equal(second.id, first.id);
    assert.equal((await listGroups(p)).length, 1);
  });

  it("lists only its own connection's groups", async () => {
    const p = await principal();
    await createGroup(p, { displayName: "demo-admins" });
    await createGroup(p, { displayName: "creators" });

    assert.equal((await listGroups(p)).length, 2);
    assert.equal((await listGroups(p, { filter: 'displayName eq "creators"' })).length, 1);
  });

  it("records the role change with the groups that caused it", async () => {
    const p = await principal();
    await createGroup(p, { displayName: "demo-admins", members: [{ value: SAM }] });

    const [entry] = await getDb()
      .select()
      .from(s.auditEvents)
      .where(eq(s.auditEvents.action, "member.role_changed"));

    assert.equal(entry.actorEmail, "sam@acme.com");
    assert.equal(entry.metadata?.to, "admin");
    assert.deepEqual(entry.metadata?.groups, ["demo-admins"]);
  });
});
