import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { list } from "@/lib/audit/log";
import type { Actor } from "@/lib/auth/authorize";
import { provision } from "@/lib/auth/identity/provisioning";
import {
  acceptInvitation,
  createInvitation,
  findInvitation,
  listInvitations,
  renewInvitation,
  revokeInvitation,
  seats,
} from "./invitations";
import { MemberChangeError, membershipsFor } from "./members";

const RUN = isDatabaseConfigured();
const WS = "4e4e4e4e-4e4e-4e4e-8e4e-4e4e4e4e4e01";
const OTHER = "4e4e4e4e-4e4e-4e4e-8e4e-4e4e4e4e4e02";
const SSO_WS = "4e4e4e4e-4e4e-4e4e-8e4e-4e4e4e4e4e03";
const OWNER = "4e4e4e4e-4e4e-4e4e-8e4e-4e4e4e4eaaaa";
const ADMIN = "4e4e4e4e-4e4e-4e4e-8e4e-4e4e4e4ebbbb";
const CREATOR = "4e4e4e4e-4e4e-4e4e-8e4e-4e4e4e4ecccc";
// Unique per run, so a newcomer never matches a row some other test left.
const NEWCOMER = `new-${randomUUID().slice(0, 8)}@invite-test.example`;

const actor = (memberId: string, role: Actor["role"], workspaceId = WS, email = `${role}@invite-test.example`): Actor => ({
  memberId,
  workspaceId,
  email,
  role,
  externalId: null,
  deactivatedAt: null,
});
const owner = actor(OWNER, "owner");

async function refused(work: Promise<unknown>, reason: string) {
  await assert.rejects(work, (error: unknown) => error instanceof MemberChangeError && error.reason === reason);
}

describe("invitations", { skip: !RUN && "DATABASE_URL not set" }, () => {
  before(async () => {
    for (const id of [OTHER, SSO_WS]) await eraseWorkspace(id, "test setup");
    await getDb().insert(s.workspaces).values([
      { id: OTHER, slug: "invite-test-other", name: "Other Place", plan: "free", seatsTotal: 1 },
      { id: SSO_WS, slug: "invite-test-sso", name: "Enterprise Co", plan: "enterprise" },
    ]);
    await getDb().insert(s.ssoConnections).values({ workspaceId: SSO_WS, connectionId: "conn_invite_test", organizationId: "org_invite_test" });
  });
  // A fresh workspace each time: the audit log is append-only, so the rows
  // a test leaves behind are erased with their workspace rather than deleted.
  beforeEach(async () => {
    await eraseWorkspace(WS, "test reset");
    const db = getDb();
    await db.insert(s.workspaces).values({ id: WS, slug: "invite-test", name: "Invite Test", plan: "studio", seatsTotal: 4 });
    await db.insert(s.members).values([
      { id: OWNER, workspaceId: WS, name: "Olive", email: "owner@invite-test.example", role: "owner" },
      { id: ADMIN, workspaceId: WS, name: "Ada", email: "admin@invite-test.example", role: "admin" },
      { id: CREATOR, workspaceId: WS, name: "Cy", email: "creator@invite-test.example", role: "creator" },
    ]);
  });
  after(async () => {
    for (const id of [WS, OTHER, SSO_WS]) await eraseWorkspace(id, "test teardown");
    await closeDb();
  });

  it("invites, reserves a seat, and audits it", async () => {
    const { invitation, token } = await createInvitation({ actor: owner, email: ` ${NEWCOMER.toUpperCase()} `, role: "creator" });
    assert.equal(invitation.email, NEWCOMER);
    assert.ok(token.length > 30);

    const room = await seats(WS);
    assert.deepEqual(room, { limit: 4, members: 3, invited: 1 });

    const [entry] = await list(WS, { limit: 1 });
    assert.equal(entry.action, "member.invited");
    assert.equal((entry.metadata as { email: string }).email, NEWCOMER);
  });

  it("refuses a role above the inviter's, a creator inviting at all, and a duplicate", async () => {
    await refused(createInvitation({ actor: actor(ADMIN, "admin"), email: NEWCOMER, role: "owner" }), "cannot-grant-above-own-role");
    await assert.rejects(createInvitation({ actor: actor(CREATOR, "creator"), email: NEWCOMER, role: "viewer" }), /may not member.invite/);
    await refused(createInvitation({ actor: owner, email: "admin@invite-test.example", role: "viewer" }), "already-member");
    await createInvitation({ actor: owner, email: NEWCOMER, role: "viewer" });
    await refused(createInvitation({ actor: owner, email: NEWCOMER, role: "viewer" }), "already-invited");
  });

  it("stops at the seat limit, counting open invitations", async () => {
    await createInvitation({ actor: owner, email: NEWCOMER, role: "viewer" });
    await refused(createInvitation({ actor: owner, email: "fifth@invite-test.example", role: "viewer" }), "no-seats");

    const free = actor(randomUUID(), "owner", OTHER, "solo@invite-test.example");
    await getDb().insert(s.members).values({ id: free.memberId, workspaceId: OTHER, name: "Solo", email: free.email, role: "owner" });
    await refused(createInvitation({ actor: free, email: NEWCOMER, role: "viewer" }), "no-seats");
  });

  it("refuses to invite into a workspace that uses single sign-on", async () => {
    await refused(createInvitation({ actor: actor(randomUUID(), "owner", SSO_WS), email: NEWCOMER, role: "viewer" }), "single-sign-on");
  });

  it("resending replaces the link; revoking frees the seat", async () => {
    const first = await createInvitation({ actor: owner, email: NEWCOMER, role: "viewer" });
    const renewed = await renewInvitation({ actor: owner, id: first.invitation.id });
    assert.notEqual(renewed.token, first.token);
    assert.deepEqual(await findInvitation(first.token), { ok: false, reason: "not-found" });
    assert.equal((await findInvitation(renewed.token)).ok, true);

    await revokeInvitation({ actor: owner, id: first.invitation.id });
    assert.deepEqual(await findInvitation(renewed.token), { ok: false, reason: "used" });
    assert.equal((await listInvitations(WS)).length, 0);
    assert.equal((await seats(WS)).invited, 0);
  });

  it("reports an expired link, and will not accept it", async () => {
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const { invitation, token } = await createInvitation({ actor: owner, email: NEWCOMER, role: "viewer", now: past });
    assert.deepEqual(await findInvitation(token), { ok: false, reason: "expired" });
    assert.deepEqual(await acceptInvitation({ invitationId: invitation.id, email: NEWCOMER, name: "N" }), { ok: false, reason: "expired" });
  });

  it("is accepted only by the address it was sent to", async () => {
    const { invitation, token } = await createInvitation({ actor: owner, email: NEWCOMER, role: "reviewer" });
    assert.deepEqual(await acceptInvitation({ invitationId: invitation.id, email: "someone@else.example", name: "X" }), {
      ok: false,
      reason: "wrong-email",
    });

    const accepted = await acceptInvitation({ invitationId: invitation.id, email: NEWCOMER, name: "Nia" });
    assert.ok(accepted.ok);
    assert.equal(accepted.member.workspaceId, WS);
    assert.equal(accepted.member.role, "reviewer");
    assert.deepEqual(await findInvitation(token), { ok: false, reason: "used" });
    assert.deepEqual(await seats(WS), { limit: 4, members: 4, invited: 0 });
  });

  it("brings back a removed colleague at the invited role instead of duplicating them", async () => {
    const [removed] = await getDb()
      .insert(s.members)
      .values({ workspaceId: WS, name: "Nia", email: NEWCOMER, role: "admin", deactivatedAt: new Date() })
      .returning();
    const { invitation } = await createInvitation({ actor: owner, email: NEWCOMER, role: "viewer" });
    const accepted = await acceptInvitation({ invitationId: invitation.id, email: NEWCOMER, name: "Nia" });
    assert.ok(accepted.ok);
    assert.equal(accepted.member.id, removed.id);
    assert.equal(accepted.member.role, "viewer");
    assert.equal(accepted.member.deactivatedAt, null);
  });

  it("a first sign-in joins the inviting workspace instead of making a new one", async () => {
    await createInvitation({ actor: owner, email: NEWCOMER, role: "creator" });
    const result = await provision({
      externalId: `user_${randomUUID()}`,
      email: NEWCOMER,
      name: "Nia Newcomer",
      emailVerified: true,
      authenticationMethod: "Password",
      groups: [],
      provider: "mock",
    });
    assert.ok(result.ok);
    assert.equal(result.workspaceCreated, false);
    assert.equal(result.member.workspaceId, WS);
    assert.equal(result.member.role, "creator");
    assert.equal(result.member.name, "Nia Newcomer");

    const memberships = await getDb().select().from(s.members).where(eq(s.members.email, NEWCOMER));
    assert.equal(memberships.length, 1, "No workspace of their own was created.");
  });

  it("an unverified first sign-in accepts nothing", async () => {
    await createInvitation({ actor: owner, email: NEWCOMER, role: "creator" });
    const result = await provision({
      externalId: `user_${randomUUID()}`,
      email: NEWCOMER,
      name: "Nia",
      emailVerified: false,
      authenticationMethod: "Password",
      groups: [],
      provider: "mock",
    });
    assert.equal(result.ok, false);
    assert.equal((await listInvitations(WS)).length, 1);
  });

  it("lists the workspaces somebody can switch between, never one with single sign-on", async () => {
    const db = getDb();
    const [elsewhere] = await db.insert(s.members).values({ workspaceId: OTHER, name: "Olive", email: owner.email, role: "viewer" }).returning();
    const [enterprise] = await db.insert(s.members).values({ workspaceId: SSO_WS, name: "Olive", email: owner.email, role: "viewer" }).returning();
    try {
      const fromHere = await membershipsFor(owner);
      assert.deepEqual(fromHere.map((m) => m.workspaceId).sort(), [WS, OTHER].sort());
      assert.equal(fromHere.find((m) => m.current)?.workspaceId, WS);

      // From inside the single sign-on workspace, nowhere else is offered.
      const fromSso = await membershipsFor(actor(enterprise.id, "viewer", SSO_WS, owner.email));
      assert.deepEqual(fromSso.map((m) => m.workspaceId), [SSO_WS]);
    } finally {
      await db.delete(s.members).where(eq(s.members.id, elsewhere.id));
      await db.delete(s.members).where(eq(s.members.id, enterprise.id));
    }
  });
});
