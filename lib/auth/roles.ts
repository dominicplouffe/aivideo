/**
 * Roles and what they may do.
 *
 * The matrix is data rather than a scattering of `if (role === "admin")`
 * checks, for one reason: a permission model you cannot read in one screen
 * is a permission model nobody audits, and the questions a customer's
 * security review actually asks — "can a reviewer delete a recording?",
 * "who can see billing?" — should be answerable by looking, not by grepping.
 *
 * Two rules shape the table:
 *
 *  1. **Publishing is not editing.** A reviewer approves; a creator makes.
 *     Conflating them is how a draft with a customer's production data in it
 *     ends up on a public share link.
 *  2. **Consent and billing are owner-level.** Revoking a voice clone and
 *     changing what the company is charged are both things that should
 *     require the person who signed for the account.
 */

export const ROLES = ["owner", "admin", "creator", "reviewer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // Content
  "recording.create",
  "recording.delete",
  "project.create",
  "project.edit",
  "project.delete",
  "project.publish",
  "project.comment",
  "project.view",
  "render.submit",
  // The agent
  "agent.run",
  "agent.approve",
  "agent.credentials.manage",
  // Brand and voice
  "brand.edit",
  "voice.clone",
  "voice.revoke",
  // Distribution
  "share.create",
  "share.revoke",
  "analytics.view",
  // Workspace
  "member.invite",
  "member.remove",
  "member.role.change",
  "masking.policy.edit",
  "workspace.settings.edit",
  "workspace.delete",
  // Money and evidence
  "billing.view",
  "billing.manage",
  "audit.view",
  "audit.export",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissions by role, written out in full.
 *
 * Deliberately not expressed as "admin inherits creator plus…". Inheritance
 * reads well and hides exactly the thing a reviewer needs to see: that a
 * role gained a permission because of a tier it was never meant to have.
 */
const MATRIX: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,

  admin: [
    "recording.create", "recording.delete",
    "project.create", "project.edit", "project.delete", "project.publish",
    "project.comment", "project.view", "render.submit",
    "agent.run", "agent.approve", "agent.credentials.manage",
    "brand.edit", "voice.clone",
    "share.create", "share.revoke", "analytics.view",
    "member.invite", "member.remove", "member.role.change",
    "masking.policy.edit", "workspace.settings.edit",
    "billing.view", "audit.view", "audit.export",
    // Not billing.manage: an admin runs the workspace, not the contract.
    // Not voice.revoke: withdrawing a person's consent is the account
    // owner's call, and irreversible for every future render.
    // Not workspace.delete.
  ],

  creator: [
    "recording.create", "recording.delete",
    "project.create", "project.edit", "project.delete",
    "project.comment", "project.view", "render.submit",
    "agent.run",
    "brand.edit",
    "share.create", "analytics.view",
    // Not project.publish: making and approving are different jobs, and a
    // draft holding production data must not reach a public link on one
    // person's say-so.
    // Not share.revoke: revoking someone else's link is a workspace action.
    // Not agent.approve, for the same reason as project.publish — and more
    // sharply: an agent run drives a browser with real credentials, and the
    // person who asked for it is the last person who should be the only one
    // to check it. Not agent.credentials.manage: storing a password the
    // agent will type is a workspace decision.
  ],

  reviewer: [
    "project.view", "project.comment", "project.publish",
    "agent.approve",
    "share.create", "analytics.view",
    // A reviewer approves and cannot edit. That is the whole point of the
    // role: the approval means something because the approver did not also
    // write the thing.
  ],

  viewer: ["project.view", "analytics.view"],
};

const LOOKUP: Record<Role, Set<Permission>> = Object.fromEntries(
  ROLES.map((role) => [role, new Set(MATRIX[role])]),
) as Record<Role, Set<Permission>>;

export function can(role: Role, permission: Permission): boolean {
  return LOOKUP[role]?.has(permission) ?? false;
}

/** Every permission a role holds, for rendering a settings screen honestly. */
export function permissionsFor(role: Role): Permission[] {
  return [...LOOKUP[role]];
}

/** Roles that hold a permission, for "who can do this?" in the UI. */
export function rolesWith(permission: Permission): Role[] {
  return ROLES.filter((role) => can(role, permission));
}

/**
 * Whether `actor` may set `target`'s role to `next`.
 *
 * Three rules, each of which exists because of a specific way this goes
 * wrong:
 *
 *  - Nobody may grant a role above their own. Otherwise an admin promotes
 *    themselves to owner in two steps via a colleague.
 *  - Nobody may change their own role. Self-demotion is how a workspace
 *    ends up with no owner; self-promotion needs no explanation.
 *  - Only an owner may create or remove another owner.
 */
const RANK: Record<Role, number> = { owner: 4, admin: 3, creator: 2, reviewer: 1, viewer: 0 };

export type RoleChangeRefusal =
  | "not-permitted"
  | "cannot-change-own-role"
  | "cannot-grant-above-own-role"
  | "only-an-owner-may-change-an-owner";

export function canChangeRole(input: {
  actorRole: Role;
  actorId: string;
  targetRole: Role;
  targetId: string;
  nextRole: Role;
}): { ok: true } | { ok: false; reason: RoleChangeRefusal } {
  if (!can(input.actorRole, "member.role.change")) {
    return { ok: false, reason: "not-permitted" };
  }
  if (input.actorId === input.targetId) {
    return { ok: false, reason: "cannot-change-own-role" };
  }
  if (input.targetRole === "owner" || input.nextRole === "owner") {
    if (input.actorRole !== "owner") {
      return { ok: false, reason: "only-an-owner-may-change-an-owner" };
    }
  }
  if (RANK[input.nextRole] > RANK[input.actorRole]) {
    return { ok: false, reason: "cannot-grant-above-own-role" };
  }
  return { ok: true };
}
