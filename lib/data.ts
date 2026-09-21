import "server-only";
import { isDatabaseConfigured } from "@/lib/db/client";
import * as fixtures from "@/lib/app-data";
import * as agentFixtures from "@/lib/agent/fixtures";
import type { Project } from "@/lib/app-data";
import { getCurrentActor } from "@/lib/auth/current";
import { allowed, type Actor } from "@/lib/auth/authorize";
import type { Permission } from "@/lib/auth/roles";

/**
 * The data access layer.
 *
 * Every read of workspace data goes through here, and every read checks
 * whether the person asking is allowed to see it. That is the whole point of
 * the module existing: an authorization check written in a route handler
 * protects that route, while a check written next to the query protects
 * every caller that will ever exist — including the page somebody adds in
 * six months without reading this comment.
 *
 * Three rules hold throughout:
 *
 *  1. **Nothing is passed in.** The actor is read back from a cached helper
 *     rather than threaded through arguments, because a value passed from
 *     component to component is a value that eventually reaches a client
 *     component by accident.
 *  2. **Refusal returns nothing, never someone else's data.** A caller who
 *     may not see a project gets `null`, the same as for a project that does
 *     not exist — which is also the correct answer to "does this id exist in
 *     a workspace I cannot see".
 *  3. **No database means no authorization to do.** The app runs on seeded
 *     fixtures with nobody signed in, which is what keeps it explorable from
 *     a fresh clone. Requiring a session in that mode would mean nobody
 *     could ever see it.
 */

/**
 * The workspace served when nobody is signed in.
 *
 * Fixture mode only. Every authenticated read resolves the workspace from
 * the actor — the first version of this module used this constant on two of
 * three read paths, which meant a member of one workspace would have been
 * served another's projects the day real sign-in landed. The module's own
 * comment claimed otherwise, which is exactly how that kind of bug survives
 * a review.
 */
const FIXTURE_WORKSPACE = process.env.DEMORIFF_WORKSPACE_SLUG ?? "meridian";

/**
 * The actor, and whether they hold a permission.
 *
 * Returns `{ allowed: true, actor: null }` when there is no database: there
 * is no one to authorize and nothing tenant-scoped to protect.
 */
async function guard(
  permission: Permission,
): Promise<{ allowed: boolean; actor: Actor | null }> {
  if (!isDatabaseConfigured()) return { allowed: true, actor: null };

  const actor = await getCurrentActor();
  if (!actor) return { allowed: false, actor: null };

  // Note what this does *not* do: `authorize` also compares the actor's
  // workspace against a scope, and passing the actor's own workspace here
  // would compare it with itself — a check that reads like tenancy
  // enforcement while asserting nothing. Tenancy is enforced by scoping
  // every query to `actor.workspaceId` below, which is the only place it
  // can be enforced honestly.
  return {
    allowed: allowed(actor, permission, { workspaceId: actor.workspaceId }),
    actor,
  };
}

/** Which source is serving reads. Surfaced in the UI so it is never ambiguous. */
export function dataSource(): "postgres" | "fixtures" {
  return isDatabaseConfigured() ? "postgres" : "fixtures";
}

export async function getProjects(): Promise<Project[]> {
  const { allowed: may, actor } = await guard("project.view");
  // An empty list, not an error: a nav item that renders zero projects is a
  // better answer to "you are signed out" than a stack trace in a layout.
  if (!may) return [];

  if (!isDatabaseConfigured()) return fixtures.projects;
  try {
    const { listProjects, listProjectsForWorkspace } = await import("@/lib/db/repositories/projects");
    if (actor) {
      // A signed-in person sees their workspace and nothing else, empty
      // included. The fallback below used to apply here too, so the first
      // thing somebody saw after creating an account was another company's
      // demo projects presented as their own — and an empty workspace is a
      // legitimate state now that anybody can make one.
      return listProjectsForWorkspace(actor.workspaceId);
    }

    const rows = await listProjects(FIXTURE_WORKSPACE);
    // No actor and no rows means an unseeded database. Falling back beats
    // rendering an empty product and leaving the reader to guess why.
    return rows.length > 0 ? rows : fixtures.projects;
  } catch (error) {
    console.error("[data] project read failed, serving fixtures:", error);
    return fixtures.projects;
  }
}

export async function getProject(idOrSlug: string): Promise<Project | null> {
  const { allowed: may, actor } = await guard("project.view");
  // Indistinguishable from "no such project", on purpose: a different
  // answer for a project that exists in a workspace you cannot see is an
  // oracle for what that workspace contains.
  if (!may) return null;

  if (!isDatabaseConfigured()) return fixtures.getProject(idOrSlug) ?? null;
  try {
    const repo = await import("@/lib/db/repositories/projects");
    const bySlug = actor
      ? await repo.getProjectBySlugForWorkspace(actor.workspaceId, idOrSlug)
      : await repo.getProjectBySlug(FIXTURE_WORKSPACE, idOrSlug);
    if (bySlug) return bySlug;
    // Ids are UUIDs in the database; anything else cannot be one.
    const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    // Scoped in the query rather than filtered afterwards: an id-only
    // lookup reads across every tenant and leaves the caller to remember a
    // check that fails silently, by returning the wrong customer's data.
    const byId =
      looksLikeUuid && actor ? await repo.getProjectById(actor.workspaceId, idOrSlug) : null;
    if (byId) return byId;

    // No fixture fallback once somebody is signed in. Falling through to the
    // seeded demos meant a member of a brand-new workspace could open
    // `/app/studio/prj_4b91de` and be shown another company's project as
    // though it were theirs.
    if (actor) return null;
    return fixtures.getProject(idOrSlug) ?? null;
  } catch (error) {
    console.error("[data] project read failed, serving fixtures:", error);
    return actor ? null : (fixtures.getProject(idOrSlug) ?? null);
  }
}

export async function getWorkspace() {
  const { allowed: may, actor } = await guard("project.view");
  if (!may) return null;

  if (!isDatabaseConfigured()) return fixtures.workspace;
  try {
    const { getWorkspace: read, getWorkspaceById } = await import("@/lib/db/repositories/workspace");
    const ws = actor ? await getWorkspaceById(actor.workspaceId) : await read(FIXTURE_WORKSPACE);
    return ws ?? fixtures.workspace;
  } catch (error) {
    console.error("[data] workspace read failed, serving fixtures:", error);
    return fixtures.workspace;
  }
}

/**
 * A project's retention curve, as fractions of viewers still watching.
 *
 * Returns real measurement when a database has any, and the seeded fixture
 * otherwise — the same fallback every other read here uses, and what keeps
 * the product explorable from a fresh clone.
 *
 * Resampled to `points` because a chart has a few dozen pixels per second
 * at best: drawing 2,400 points into 600 pixels is slower and no more
 * truthful. The maximum within each bucket is taken rather than the mean,
 * because a rewatched span is the signal and averaging flattens it.
 */
export async function getRetentionCurve(projectId: string, points = 48): Promise<number[]> {
  const { allowed: may, actor } = await guard("analytics.view");
  if (!may) return [];

  if (!isDatabaseConfigured()) return fixtures.retentionCurve(projectId, points);

  try {
    const { retentionCurve } = await import("@/lib/analytics/ingest");
    // Scoped to the actor's workspace: a project id is not a secret, and
    // without this anybody signed in anywhere could read anybody's curve.
    const curve = await retentionCurve(projectId, { workspaceId: actor?.workspaceId });
    if (curve.length === 0) return fixtures.retentionCurve(projectId, points);

    const bucket = curve.length / points;
    return Array.from({ length: points }, (_, i) => {
      const from = Math.floor(i * bucket);
      const to = Math.max(from + 1, Math.floor((i + 1) * bucket));
      let peak = 0;
      for (let n = from; n < to && n < curve.length; n++) {
        peak = Math.max(peak, curve[n].fraction);
      }
      return peak;
    });
  } catch {
    return fixtures.retentionCurve(projectId, points);
  }
}

/* ------------------------------------------------------------ the agent */

/**
 * Agent runs, for the workspace shell.
 *
 * Behind `project.view` rather than `agent.run`: seeing that a run exists,
 * what it plans to do and what it was refused is exactly the transparency
 * the feature is sold on, and a workspace where only the people who can
 * start runs can see them is a workspace where nobody notices a bad one.
 * Starting and approving are the privileged actions, and they are checked
 * where they happen.
 */
export async function getAgentRuns() {
  const { allowed: may, actor } = await guard("project.view");
  if (!may) return [];

  if (!isDatabaseConfigured()) return agentFixtures.agentRuns;
  try {
    const { getDb } = await import("@/lib/db/client");
    const schema = await import("@/lib/db/schema");
    const { desc, eq } = await import("drizzle-orm");

    const rows = actor
      ? await getDb()
          .select()
          .from(schema.agentRuns)
          .where(eq(schema.agentRuns.workspaceId, actor.workspaceId))
          .orderBy(desc(schema.agentRuns.createdAt))
          .limit(50)
      : [];

    return rows.length > 0 ? rows.map(toViewRun) : agentFixtures.agentRuns;
  } catch (error) {
    console.error("[data] agent run read failed, serving fixtures:", error);
    return agentFixtures.agentRuns;
  }
}

export async function getAgentRunDetail(id: string) {
  const { allowed: may, actor } = await guard("project.view");
  if (!may) return null;

  if (!isDatabaseConfigured()) {
    const run = agentFixtures.getAgentRun(id);
    return run ? { run, actions: run.actions } : null;
  }

  try {
    const { getRun, actionsFor } = await import("@/lib/agent/run");
    if (!actor) return null;

    const run = await getRun(actor.workspaceId, id);
    if (!run) {
      // Fixture ids still resolve, so a seeded deployment that has a
      // database but no runs of its own is still explorable.
      const seeded = agentFixtures.getAgentRun(id);
      return seeded ? { run: seeded, actions: seeded.actions } : null;
    }

    const actions = await actionsFor(run.id);
    return {
      run: toViewRun(run),
      actions: actions.map((action) => ({
        ordinal: action.ordinal,
        kind: action.kind,
        outlineOrdinal: action.outlineOrdinal,
        url: action.url,
        target: action.target,
        detail: action.detail,
        refusedReason: action.refusedReason,
        atMs: action.atMs,
      })) as agentFixtures.FixtureAction[],
    };
  } catch (error) {
    console.error("[data] agent run read failed, serving fixtures:", error);
    const seeded = agentFixtures.getAgentRun(id);
    return seeded ? { run: seeded, actions: seeded.actions } : null;
  }
}

/** One shape for the screen, whichever source served it. */
function toViewRun(row: {
  id: string;
  brief: string;
  status: string;
  outline: unknown;
  allowedOrigins: string[];
  requestedByEmail: string | null;
  approvedByEmail: string | null;
  approvedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  createdAt: Date;
}): agentFixtures.FixtureRun {
  return {
    id: row.id,
    brief: row.brief,
    status: row.status as agentFixtures.FixtureStatus,
    outline: (row.outline ?? []) as agentFixtures.FixtureRun["outline"],
    removed: [],
    allowedOrigins: row.allowedOrigins ?? [],
    requestedByEmail: row.requestedByEmail ?? "",
    approvedByEmail: row.approvedByEmail,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    actions: [],
  };
}

/**
 * The workspace's real metered usage, for the sidebar meter.
 *
 * Returns null when there is nothing measured to show, and the meter renders
 * nothing rather than a number. It used to display `164/240` from the
 * fixtures on every page of the application — beside a project list served
 * from Postgres — plus "resets in 10 days", which was a constant string.
 */
export async function getUsage(): Promise<{
  usedSeconds: number;
  allowanceSeconds: number;
  fractionUsed: number;
  periodStartsAt: string;
  plan: string;
} | null> {
  const { allowed: may, actor } = await guard("billing.view");
  if (!may || !actor || !isDatabaseConfigured()) return null;

  try {
    const { usage } = await import("@/lib/billing/metering");
    const snapshot = await usage(actor.workspaceId);
    return {
      usedSeconds: snapshot.usedSeconds,
      allowanceSeconds: snapshot.limitSeconds + snapshot.topupSeconds,
      fractionUsed: snapshot.fractionUsed,
      periodStartsAt: snapshot.periodStartsAt.toISOString(),
      plan: snapshot.plan,
    };
  } catch (error) {
    console.error("[data] usage read failed:", error);
    return null;
  }
}

/** The signed-in member, for the shell's avatar and workspace name. */
export async function getViewer(): Promise<{
  name: string;
  email: string;
  role: string;
  workspaceName: string;
  workspaceSlug: string;
  plan: string;
  region: string;
} | null> {
  if (!isDatabaseConfigured()) return null;
  const actor = await getCurrentActor();
  if (!actor) return null;

  try {
    const { getWorkspaceById } = await import("@/lib/db/repositories/workspace");
    const ws = await getWorkspaceById(actor.workspaceId);
    if (!ws) return null;
    return {
      // The Actor carries identity, not a display name — the shell falls
      // back to the address rather than inventing one.
      name: actor.email.split("@")[0],
      email: actor.email,
      role: actor.role,
      workspaceName: ws.name,
      workspaceSlug: ws.slug,
      plan: ws.plan,
      region: ws.region,
    };
  } catch (error) {
    console.error("[data] viewer read failed:", error);
    return null;
  }
}
