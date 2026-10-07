import type { Actor } from "@/lib/auth/authorize";
import { usesSingleSignOn } from "@/lib/auth/sso";

/**
 * DemoRiff staff: the people who run the service, as opposed to the owners
 * and admins of a customer's workspace.
 *
 * Named in configuration and nowhere else. A staff flag in the database is
 * one bad UPDATE, or one route that forgets to refuse a field, away from
 * being granted by a customer; a list in the deployment's environment
 * cannot be changed from inside the application at all.
 */
export function staffEmails(): Set<string> {
  return new Set(
    (process.env.DEMORIFF_STAFF_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** The address test alone, without the workspace lookup. */
export function listedAsStaff(actor: Pick<Actor, "email" | "deactivatedAt"> | null): boolean {
  if (!actor || actor.deactivatedAt) return false;
  return staffEmails().has(actor.email.trim().toLowerCase());
}

/**
 * Whether this member is staff.
 *
 * An address alone is not enough. A workspace with single sign-on takes
 * whatever address its customer's identity provider asserts, so a member of
 * one is never staff, however its address reads. A self-serve workspace is
 * only created for an address the provider says is verified.
 */
export async function isStaff(actor: Pick<Actor, "email" | "deactivatedAt" | "workspaceId"> | null): Promise<boolean> {
  if (!listedAsStaff(actor)) return false;
  return !(await usesSingleSignOn(actor!.workspaceId));
}
