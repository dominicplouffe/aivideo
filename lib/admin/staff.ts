import type { Actor } from "@/lib/auth/authorize";

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

/**
 * Whether this member is staff.
 *
 * An address alone is not enough. A member provisioned by a customer's
 * directory carries whatever address that directory asserted, so a
 * directory account is never staff, however its address reads.
 */
export function isStaff(actor: Pick<Actor, "email" | "externalId" | "deactivatedAt"> | null): boolean {
  if (!actor || actor.externalId || actor.deactivatedAt) return false;
  return staffEmails().has(actor.email.trim().toLowerCase());
}
