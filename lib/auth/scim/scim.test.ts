import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { issue, listForMember } from "../sessions";
import { authenticateScim, hashToken, issueScimToken, revokeScimToken } from "./tokens";
import {
  ScimError, createUser, deleteUser, getUser, listUsers, parseFilter, patchUser,
  replaceUser, toScimUser,
} from "./users";

/**
 * Directory sync is worth having for one half of what it does: removing
 * access on the day somebody leaves. These tests are mostly that half, plus
 * the tenancy question a multi-tenant SCIM endpoint has to answer — nothing
 * in a SCIM request names a workspace, so the token had better.
 */

const RUN = isDatabaseConfigured();
const WS = "66666666-6666-4666-8666-666666666666";
const OTHER_WS = "66666666-6666-4666-8666-666666666667";
const OWNER = "66666666-6666-4666-8666-666666666001";
const STRANGER = "66666666-6666-4666-8666-666666666002";
const CONNECTION = "conn_scim_test";
const OTHER_CONNECTION = "conn_scim_other";

// --- the filter parser (no database needed) --------------------------------

describe("the SCIM filter", () => {
  it("reads the one form every directory sends", () => {
    assert.deepEqual(parseFilter('userName eq "Sam@Meridian.com"'), {
      field: "email",
      value: "sam@meridian.com",
    });
    assert.deepEqual(parseFilter('externalId eq "idp_7"'), { field: "externalId", value: "idp_7" });
    assert.equal(parseFilter(null), null);
  });

  it("refuses an expression it does not implement rather than guessing", () => {
    // A half-implemented filter evaluator returns the wrong set quietly,
    // which in a provisioning endpoint means acting on the wrong person.
    for (const filter of [
      'userName sw "sam"',
      'active eq true',
      'userName eq "a" and active eq true',
      'userName eq "a" or userName eq "b"',
    ]) {
      assert.throws(() => parseFilter(filter), ScimError, filter);
    }
  });
});

// --- everything else (database) --------------------------------------------

describe("directory sync", { skip: !RUN }, () => {
  let token = "";
  let otherToken = "";

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
      { id: WS, slug: "scim-test", name: "SCIM Test" },
      { id: OTHER_WS, slug: "scim-other", name: "Someone Else" },
    ]);
    await db.insert(s.members).values([
      { id: OWNER, workspaceId: WS, name: "Owner", email: "owner@meridian.com", role: "owner" },
      { id: STRANGER, workspaceId: OTHER_WS, name: "Stranger", email: "stranger@other.com", role: "admin" },
    ]);
    await db.insert(s.ssoConnections).values([
      {
        workspaceId: WS,
        connectionId: CONNECTION,
        domains: ["meridian.com"],
        defaultRole: "viewer",
        roleMappings: { "demo-admins": "admin" },
      },
      { workspaceId: OTHER_WS, connectionId: OTHER_CONNECTION, domains: ["other.com"] },
    ]);
    token = (await issueScimToken(CONNECTION)).token;
    otherToken = (await issueScimToken(OTHER_CONNECTION)).token;
  });

  const bearer = (value: string) =>
    new Request("https://demoriff.com/api/scim/v2/Users", {
      headers: { authorization: `Bearer ${value}` },
    });

  /* ------------------------------------------------------------ the token */

  it("stores only the hash of a token it issued", async () => {
    const [connection] = await getDb()
      .select()
      .from(s.ssoConnections)
      .where(eq(s.ssoConnections.connectionId, CONNECTION));
    assert.equal(connection.scimTokenHash, hashToken(token));
    // A leaked backup should not hand the reader live provisioning access.
    assert.equal(connection.scimTokenHash?.includes(token), false);
    assert.equal(connection.scimTokenHint, token.slice(-6));
  });

  it("resolves a good token to exactly one workspace", async () => {
    const principal = await authenticateScim(bearer(token));
    assert.equal(principal?.workspaceId, WS);
    const other = await authenticateScim(bearer(otherToken));
    assert.equal(other?.workspaceId, OTHER_WS);
  });

  it("refuses everything else the same way", async () => {
    const requests = [
      new Request("https://demoriff.com/api/scim/v2/Users"),
      bearer("scim_not-a-real-token"),
      new Request("https://demoriff.com/api/scim/v2/Users", {
        headers: { authorization: `Basic ${token}` },
      }),
      bearer(""),
    ];
    for (const request of requests) {
      assert.equal(await authenticateScim(request), null);
    }
  });

  it("stops working the moment the token is revoked", async () => {
    await revokeScimToken(CONNECTION);
    assert.equal(await authenticateScim(bearer(token)), null);
  });

  it("stops working when the connection is switched off", async () => {
    await getDb()
      .update(s.ssoConnections)
      .set({ disabledAt: new Date() })
      .where(eq(s.ssoConnections.connectionId, CONNECTION));
    assert.equal(await authenticateScim(bearer(token)), null);
  });

  /* ------------------------------------------------------------- tenancy */

  it("cannot see, change or delete a member of another workspace", async () => {
    const principal = (await authenticateScim(bearer(token)))!;

    // The same answer as for an id that does not exist. Anything else lets
    // a directory enumerate another tenant's members by id.
    await assert.rejects(() => getUser(principal, STRANGER), /No such user/);
    await assert.rejects(() => deleteUser(principal, STRANGER), /No such user/);
    await assert.rejects(
      () => patchUser(principal, STRANGER, [{ op: "replace", path: "active", value: false }]),
      /No such user/,
    );

    const [stranger] = await getDb().select().from(s.members).where(eq(s.members.id, STRANGER));
    assert.equal(stranger.deactivatedAt, null);
  });

  it("lists only its own workspace, filter or no filter", async () => {
    const principal = (await authenticateScim(bearer(token)))!;
    const all = await listUsers(principal, {});
    assert.deepEqual(all.members.map((m) => m.email), ["owner@meridian.com"]);

    // A filter naming somebody real, in a workspace this token cannot see.
    const filtered = await listUsers(principal, { filter: 'userName eq "stranger@other.com"' });
    assert.equal(filtered.total, 0);
    assert.equal(filtered.members.length, 0);
  });

  /* -------------------------------------------------------- provisioning */

  it("creates a member with the role its groups map to", async () => {
    const principal = (await authenticateScim(bearer(token)))!;
    const { member, created } = await createUser(principal, {
      userName: "Sam@Meridian.com",
      externalId: "idp_sam",
      name: { givenName: "Sam", familyName: "Taylor" },
      groups: [{ display: "demo-admins" }],
      active: true,
    });

    assert.equal(created, true);
    assert.equal(member.workspaceId, WS);
    assert.equal(member.email, "sam@meridian.com");
    assert.equal(member.name, "Sam Taylor");
    assert.equal(member.role, "admin");
    assert.equal(member.deactivatedAt, null);
  });

  it("reactivates rather than failing when a directory re-sends a create", async () => {
    const principal = (await authenticateScim(bearer(token)))!;
    const first = await createUser(principal, { userName: "sam@meridian.com" });
    const second = await createUser(principal, { userName: "sam@meridian.com" });
    // A restarted directory is not an attacker, and a 409 it retries
    // forever helps nobody.
    assert.equal(second.created, false);
    assert.equal(second.member.id, first.member.id);
  });

  it("never lets a directory take the owner's role", async () => {
    const principal = (await authenticateScim(bearer(token)))!;
    const { member } = await createUser(principal, {
      userName: "owner@meridian.com",
      groups: [{ display: "nothing" }],
    });
    assert.equal(member.role, "owner");

    const replaced = await replaceUser(principal, OWNER, { userName: "owner@meridian.com" });
    assert.equal(replaced.role, "owner");
  });

  it("refuses a create with no usable email address", async () => {
    const principal = (await authenticateScim(bearer(token)))!;
    await assert.rejects(() => createUser(principal, { userName: "sam" }), ScimError);
    await assert.rejects(() => createUser(principal, {}), ScimError);
  });

  /* ------------------------------------------------------- deprovisioning */

  async function provisionedWithSession(principal: Awaited<ReturnType<typeof authenticateScim>>) {
    const { member } = await createUser(principal!, {
      userName: "sam@meridian.com",
      externalId: "idp_sam",
    });
    await issue({ memberId: member.id, workspaceId: WS, ip: null, userAgent: null });
    assert.equal((await listForMember(member.id)).length, 1);
    return member;
  }

  it("ends every live session when a directory deactivates somebody", async () => {
    const principal = (await authenticateScim(bearer(token)))!;
    const member = await provisionedWithSession(principal);

    await patchUser(principal, member.id, [{ op: "replace", path: "active", value: false }]);

    const [row] = await getDb().select().from(s.members).where(eq(s.members.id, member.id));
    assert.notEqual(row.deactivatedAt, null);
    // The half that is easy to leave out and the only half that matters: a
    // deactivated member whose tab still works has been marked, not
    // offboarded.
    assert.equal((await listForMember(member.id)).length, 0);
  });

  it("reads every spelling of 'active: false' a directory sends", async () => {
    const principal = (await authenticateScim(bearer(token)))!;

    const shapes = [
      [{ op: "replace", path: "active", value: false }],
      // Entra sends the string, and reading it as truthy is how an
      // offboarding silently does nothing.
      [{ op: "replace", path: "active", value: "False" }],
      [{ op: "Replace", value: { active: false } }],
    ];

    for (const [index, operations] of shapes.entries()) {
      const { member } = await createUser(principal, { userName: `sam${index}@meridian.com` });
      await patchUser(principal, member.id, operations);
      const [row] = await getDb().select().from(s.members).where(eq(s.members.id, member.id));
      assert.notEqual(row.deactivatedAt, null, JSON.stringify(operations));
    }
  });

  it("deactivates on DELETE rather than removing the row", async () => {
    const principal = (await authenticateScim(bearer(token)))!;
    const member = await provisionedWithSession(principal);

    await deleteUser(principal, member.id);

    const [row] = await getDb().select().from(s.members).where(eq(s.members.id, member.id));
    // The audit trail, the recordings and the render approvals all point at
    // this row. Removing it would cascade away evidence.
    assert.notEqual(row, undefined);
    assert.notEqual(row.deactivatedAt, null);
    assert.equal((await listForMember(member.id)).length, 0);
  });

  it("brings somebody back when the directory reactivates them", async () => {
    const principal = (await authenticateScim(bearer(token)))!;
    const member = await provisionedWithSession(principal);
    await deleteUser(principal, member.id);

    const restored = await patchUser(principal, member.id, [
      { op: "replace", path: "active", value: true },
    ]);
    assert.equal(restored.deactivatedAt, null);
    // Reactivating does not hand back the sessions that were ended.
    assert.equal((await listForMember(member.id)).length, 0);
  });

  it("answers with the fields a directory reads back", async () => {
    const principal = (await authenticateScim(bearer(token)))!;
    const { member } = await createUser(principal, {
      userName: "sam@meridian.com",
      name: { formatted: "Sam Taylor" },
      externalId: "idp_sam",
    });

    const user = toScimUser(member, "https://demoriff.com/api/scim/v2");
    assert.equal(user.userName, "sam@meridian.com");
    assert.equal(user.externalId, "idp_sam");
    assert.equal(user.active, true);
    assert.equal(user.meta.location, `https://demoriff.com/api/scim/v2/Users/${member.id}`);
    assert.equal(user.emails[0].primary, true);
  });
});
