import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { recordQuietly } from "@/lib/audit/log";
import { includedSeconds, normalizePlan, planFor, type Plan } from "@/lib/billing/plans";

/**
 * Staff access to every workspace: what each one is on, and changing it
 * without a payment.
 *
 * Writes the same columns the Stripe webhook writes, so every gate in
 * `lib/api/plan-gate.ts` reads a grant exactly as it reads a purchase. The
 * difference is the audit entry, which says who granted it and why.
 */

export interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  owner: string | null;
  members: number;
  projects: number;
  projectPacks: number;
  seatsTotal: number;
  videoSecondsLimit: number;
  videoSecondsUsed: number;
  topupSeconds: number;
  periodStartsAt: string;
  /** Set when Stripe bills this workspace, and will overwrite a grant on its next event. */
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
}

const LIST_LIMIT = 200;

/** Newest first, optionally narrowed by name, slug or a member's email. */
export async function listWorkspaces(query = ""): Promise<AdminWorkspace[]> {
  const term = query.trim();
  if (!term) return select();
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return select(
    or(
      ilike(s.workspaces.name, pattern),
      ilike(s.workspaces.slug, pattern),
      sql`exists (select 1 from ${s.members} where ${s.members.workspaceId} = ${s.workspaces.id} and ${s.members.email} ilike ${pattern})`,
    ),
  );
}

async function select(where?: SQL): Promise<AdminWorkspace[]> {
  const db = getDb();

  const members = db
    .select({ workspaceId: s.members.workspaceId, n: count().as("member_count") })
    .from(s.members)
    .where(isNull(s.members.deactivatedAt))
    .groupBy(s.members.workspaceId)
    .as("member_counts");
  const projects = db
    .select({ workspaceId: s.projects.workspaceId, n: count().as("project_count") })
    .from(s.projects)
    .where(isNull(s.projects.deletedAt))
    .groupBy(s.projects.workspaceId)
    .as("project_counts");

  const rows = await db
    .select({
      workspace: s.workspaces,
      members: members.n,
      projects: projects.n,
      owner: sql<string | null>`(select ${s.members.email} from ${s.members} where ${s.members.workspaceId} = ${s.workspaces.id} and ${s.members.role} = 'owner' order by ${s.members.createdAt} limit 1)`,
    })
    .from(s.workspaces)
    .leftJoin(members, eq(members.workspaceId, s.workspaces.id))
    .leftJoin(projects, eq(projects.workspaceId, s.workspaces.id))
    .where(and(isNull(s.workspaces.deletedAt), where))
    .orderBy(desc(s.workspaces.createdAt))
    .limit(LIST_LIMIT);

  return rows.map(({ workspace: w, members, projects, owner }) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    plan: normalizePlan(w.plan),
    owner,
    members: Number(members ?? 0),
    projects: Number(projects ?? 0),
    projectPacks: w.projectPacks,
    seatsTotal: w.seatsTotal,
    videoSecondsLimit: w.videoSecondsLimit,
    videoSecondsUsed: w.videoSecondsUsed,
    topupSeconds: w.topupSeconds,
    periodStartsAt: w.periodStartsAt.toISOString(),
    stripeSubscriptionId: w.stripeSubscriptionId,
    subscriptionStatus: w.subscriptionStatus,
    createdAt: w.createdAt.toISOString(),
  }));
}

export interface Grant {
  plan: Plan;
  /** Studio only; ignored on every other plan, as the webhook ignores it. */
  projectPacks?: number;
  seatsTotal?: number;
  /** The period's allowance. Defaults to what the plan and packs include. */
  videoSecondsLimit?: number;
  /** Added to the top-up balance, which carries across periods. */
  addTopupSeconds?: number;
  /** Starts a new period: used seconds and AI actions count from zero again. */
  resetUsage?: boolean;
  note?: string;
}

export type GrantOutcome = { ok: true; workspace: AdminWorkspace } | { ok: false; reason: "not-found" };

export async function grantAccess(
  workspaceId: string,
  grant: Grant,
  staff: { email: string },
): Promise<GrantOutcome> {
  const db = getDb();
  const [before] = await db
    .select()
    .from(s.workspaces)
    .where(and(eq(s.workspaces.id, workspaceId), isNull(s.workspaces.deletedAt)))
    .limit(1);
  if (!before) return { ok: false, reason: "not-found" };

  const definition = planFor(grant.plan);
  const packs = definition.projectPack ? (grant.projectPacks ?? 0) : 0;
  const seats = grant.seatsTotal ?? definition.seats ?? before.seatsTotal;
  const limit = grant.videoSecondsLimit ?? includedSeconds(grant.plan, packs);

  await db
    .update(s.workspaces)
    .set({
      plan: grant.plan,
      projectPacks: packs,
      seatsTotal: seats,
      videoSecondsLimit: limit,
      topupSeconds: sql`${s.workspaces.topupSeconds} + ${grant.addTopupSeconds ?? 0}`,
      // A granted plan has no paid term to sit out before cancelling.
      planTermEndsAt: before.stripeSubscriptionId ? before.planTermEndsAt : null,
      ...(grant.resetUsage ? { videoSecondsUsed: 0, periodStartsAt: new Date(), usageNoticeSentAt: null } : {}),
    })
    .where(eq(s.workspaces.id, workspaceId));

  await recordQuietly({
    workspaceId,
    actor: { memberId: null, email: staff.email },
    action: "billing.access_granted",
    resourceType: "workspace",
    resourceId: workspaceId,
    metadata: {
      via: "staff",
      from: {
        plan: before.plan,
        packs: before.projectPacks,
        seats: before.seatsTotal,
        videoSecondsLimit: before.videoSecondsLimit,
        topupSeconds: before.topupSeconds,
      },
      to: { plan: grant.plan, packs, seats, videoSecondsLimit: limit },
      addedTopupSeconds: grant.addTopupSeconds ?? 0,
      resetUsage: grant.resetUsage ?? false,
      note: grant.note?.trim() || null,
    },
  });

  const [after] = await select(eq(s.workspaces.id, workspaceId));
  return { ok: true, workspace: after };
}
