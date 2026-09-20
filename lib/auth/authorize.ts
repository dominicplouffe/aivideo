import { can, type Permission, type Role } from "./roles";

/**
 * The authorisation seam.
 *
 * One function that every privileged path calls, and one error type that
 * every caller can map to a 403. The value is not the six lines of logic —
 * it is that "who checked this?" has exactly one answer, and that adding a
 * permission to the matrix is the only way to grant it.
 */

export interface Actor {
  memberId: string;
  workspaceId: string;
  email: string;
  role: Role;
  /** Set when the account came from a directory; denied write access here. */
  externalId?: string | null;
  deactivatedAt?: Date | null;
}

export class ForbiddenError extends Error {
  readonly status = 403;

  constructor(
    readonly detail: {
      permission: Permission;
      role: Role;
      workspaceId: string;
      memberId: string;
      reason: "role" | "deactivated" | "wrong-workspace";
    },
  ) {
    super(
      detail.reason === "deactivated"
        ? "This account has been deactivated."
        : detail.reason === "wrong-workspace"
          ? "This account does not belong to that workspace."
          : `A ${detail.role} may not ${detail.permission}.`,
    );
    this.name = "ForbiddenError";
  }
}

/**
 * Throws unless the actor may perform the action in that workspace.
 *
 * The workspace check is not redundant with the role check. A member of one
 * workspace holding `admin` there must not be able to act on another
 * workspace's project by passing its id, and that is a mistake a route
 * handler makes by omission rather than by intent — so it lives here, where
 * omitting it is impossible.
 */
export function authorize(
  actor: Actor,
  permission: Permission,
  scope: { workspaceId: string },
): void {
  if (actor.deactivatedAt) {
    throw new ForbiddenError({
      permission, role: actor.role, workspaceId: scope.workspaceId,
      memberId: actor.memberId, reason: "deactivated",
    });
  }
  if (actor.workspaceId !== scope.workspaceId) {
    throw new ForbiddenError({
      permission, role: actor.role, workspaceId: scope.workspaceId,
      memberId: actor.memberId, reason: "wrong-workspace",
    });
  }
  if (!can(actor.role, permission)) {
    throw new ForbiddenError({
      permission, role: actor.role, workspaceId: scope.workspaceId,
      memberId: actor.memberId, reason: "role",
    });
  }
}

/** The non-throwing form, for deciding whether to render a button. */
export function allowed(actor: Actor, permission: Permission, scope: { workspaceId: string }): boolean {
  try {
    authorize(actor, permission, scope);
    return true;
  } catch {
    return false;
  }
}
