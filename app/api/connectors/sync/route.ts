import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { documentFor, syncProject, type SyncOutcome } from "@/lib/connectors/sync";

/**
 * Publish a project's guide to every connected help centre.
 *
 * Behind `project.publish`, because that is what this is — the article
 * appears on a page the customer's own customers read. A sync that would
 * discard an edit made in the help centre is *held* and reported rather than
 * performed; `force` is the explicit override, and it lands in the audit log
 * with a name against it.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Connectors require a database." }, { status: 503 });
  }

  let body: { project_id?: unknown; locale?: unknown; force?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "project.publish", { workspaceId: actor.workspaceId });

    const projectId = typeof body.project_id === "string" ? body.project_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      return NextResponse.json({ error: "A project_id is required." }, { status: 400 });
    }

    const db = getDb();
    const [project] = await db
      .select()
      .from(s.projects)
      .where(
        and(
          eq(s.projects.id, projectId),
          // Scoped in the query. A project id is not a secret, and reading
          // one across tenants is how a publish lands in the wrong company's
          // documentation.
          eq(s.projects.workspaceId, actor.workspaceId),
          isNull(s.projects.deletedAt),
        ),
      )
      .limit(1);

    if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

    const segments = await db
      .select()
      .from(s.segments)
      .where(eq(s.segments.projectId, project.id));

    if (segments.length === 0) {
      return NextResponse.json(
        { error: "That project has no steps yet, so there is no guide to publish." },
        { status: 422 },
      );
    }

    const installations = await db
      .select()
      .from(s.connectorInstallations)
      .where(
        and(
          eq(s.connectorInstallations.workspaceId, actor.workspaceId),
          isNull(s.connectorInstallations.disabledAt),
        ),
      );

    const document = documentFor(project, segments, {
      locale: typeof body.locale === "string" ? body.locale : "en-US",
    });

    const results: SyncOutcome[] = [];
    for (const installation of installations) {
      try {
        results.push(
          await syncProject(installation, project, document, {
            force: body.force === true,
            actor,
          }),
        );
      } catch (error) {
        // One broken help centre must not stop the others. The failure is
        // recorded against its installation and reported alongside the rest.
        const message = error instanceof Error ? error.message : String(error);
        await db
          .update(s.connectorInstallations)
          .set({ lastError: message.slice(0, 500) })
          .where(eq(s.connectorInstallations.id, installation.id));

        results.push({
          projectId: project.id,
          linkId: null,
          state: "unlinked",
          action: "held",
          reason: message.slice(0, 200),
        });
      }
    }

    for (const installation of installations) {
      await db
        .update(s.connectorInstallations)
        .set({ lastSyncAt: new Date() })
        .where(eq(s.connectorInstallations.id, installation.id));
    }

    return NextResponse.json({
      project_id: project.id,
      results: results.map((result) => ({
        state: result.state,
        action: result.action,
        external_url: result.externalUrl ?? null,
        reason: result.reason ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
