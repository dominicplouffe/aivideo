import assert from "node:assert/strict";
import test from "node:test";
import { ForbiddenError, allowed, authorize, type Actor } from "./authorize";
import { ROLES, can, canChangeRole, permissionsFor, rolesWith, type Role } from "./roles";

/**
 * A permission matrix is only worth having if the claims it makes are
 * checked. These tests read as the answers to a security questionnaire,
 * which is what they are for.
 */

function actor(role: Role, overrides: Partial<Actor> = {}): Actor {
  return {
    memberId: "m1",
    workspaceId: "ws1",
    email: "person@example.com",
    role,
    ...overrides,
  };
}

test("a reviewer approves and cannot edit", () => {
  // The approval means something because the approver did not write it.
  assert.equal(can("reviewer", "project.publish"), true);
  assert.equal(can("reviewer", "project.edit"), false);
  assert.equal(can("reviewer", "project.create"), false);
  assert.equal(can("reviewer", "project.delete"), false);
});

test("a creator makes and cannot publish", () => {
  assert.equal(can("creator", "project.create"), true);
  assert.equal(can("creator", "project.edit"), true);
  // A draft holding production data must not reach a public link on one
  // person's say-so.
  assert.equal(can("creator", "project.publish"), false);
});

test("a viewer can only look", () => {
  assert.deepEqual(permissionsFor("viewer").sort(), ["analytics.view", "project.view"]);
});

test("only the owner controls money and consent", () => {
  assert.deepEqual(rolesWith("billing.manage"), ["owner"]);
  // Withdrawing a person's consent is irreversible for every future render.
  assert.deepEqual(rolesWith("voice.revoke"), ["owner"]);
  assert.deepEqual(rolesWith("workspace.delete"), ["owner"]);
});

test("an admin runs the workspace but not the contract", () => {
  assert.equal(can("admin", "member.remove"), true);
  assert.equal(can("admin", "billing.view"), true);
  assert.equal(can("admin", "billing.manage"), false);
});

test("the owner holds every permission, and no other role does", () => {
  const everything = permissionsFor("owner");
  for (const role of ROLES) {
    const count = permissionsFor(role).length;
    if (role === "owner") assert.equal(count, everything.length);
    else assert.equal(count < everything.length, true, `${role} holds everything`);
  }
});

test("every role can see a project, because a workspace member who cannot is not a member", () => {
  for (const role of ROLES) assert.equal(can(role, "project.view"), true);
});

// --- changing roles --------------------------------------------------------

test("nobody may promote themselves", () => {
  const result = canChangeRole({
    actorRole: "admin", actorId: "m1",
    targetRole: "admin", targetId: "m1",
    nextRole: "owner",
  });
  assert.deepEqual(result, { ok: false, reason: "cannot-change-own-role" });
});

test("nobody may grant a role above their own", () => {
  // Otherwise an admin reaches owner in two steps, via a colleague.
  const result = canChangeRole({
    actorRole: "admin", actorId: "m1",
    targetRole: "creator", targetId: "m2",
    nextRole: "owner",
  });
  assert.equal(result.ok, false);
});

test("only an owner may appoint or demote an owner", () => {
  assert.deepEqual(
    canChangeRole({ actorRole: "admin", actorId: "m1", targetRole: "owner", targetId: "m2", nextRole: "admin" }),
    { ok: false, reason: "only-an-owner-may-change-an-owner" },
  );
  assert.deepEqual(
    canChangeRole({ actorRole: "owner", actorId: "m1", targetRole: "owner", targetId: "m2", nextRole: "admin" }),
    { ok: true },
  );
});

test("a creator may not change anyone's role at all", () => {
  assert.deepEqual(
    canChangeRole({ actorRole: "creator", actorId: "m1", targetRole: "viewer", targetId: "m2", nextRole: "admin" }),
    { ok: false, reason: "not-permitted" },
  );
});

test("an admin may move people around below themselves", () => {
  assert.deepEqual(
    canChangeRole({ actorRole: "admin", actorId: "m1", targetRole: "viewer", targetId: "m2", nextRole: "creator" }),
    { ok: true },
  );
});

// --- the authorisation seam ------------------------------------------------

test("authorize throws a 403-shaped error naming the permission", () => {
  try {
    authorize(actor("viewer"), "project.edit", { workspaceId: "ws1" });
    assert.fail("should have thrown");
  } catch (error) {
    assert.equal(error instanceof ForbiddenError, true);
    const forbidden = error as ForbiddenError;
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.detail.permission, "project.edit");
    assert.equal(forbidden.detail.reason, "role");
    assert.match(forbidden.message, /viewer may not project\.edit/);
  }
});

test("an admin of one workspace is nobody in another", () => {
  // The mistake a route handler makes by omission, so it lives where
  // omitting it is impossible.
  assert.throws(
    () => authorize(actor("admin"), "project.edit", { workspaceId: "ws2" }),
    (error: unknown) => error instanceof ForbiddenError && error.detail.reason === "wrong-workspace",
  );
});

test("a deactivated owner is refused before their role is even consulted", () => {
  assert.throws(
    () => authorize(actor("owner", { deactivatedAt: new Date() }), "project.view", { workspaceId: "ws1" }),
    (error: unknown) => error instanceof ForbiddenError && error.detail.reason === "deactivated",
  );
});

test("allowed answers the same question without throwing", () => {
  assert.equal(allowed(actor("creator"), "project.edit", { workspaceId: "ws1" }), true);
  assert.equal(allowed(actor("creator"), "project.publish", { workspaceId: "ws1" }), false);
  assert.equal(allowed(actor("owner"), "project.publish", { workspaceId: "ws2" }), false);
});
