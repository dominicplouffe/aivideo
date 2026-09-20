import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { activityFor, erase, signPersonalLink } from "@/lib/analytics/identity";

/**
 * Known viewers.
 *
 * Behind `analytics.view`, and every read is scoped to the actor's own
 * workspace in the query rather than filtered afterwards. Erasure is behind
 * `workspace.settings.edit`, because honouring a deletion request is an
 * administrative act and the audit log should name who performed it.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handle(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  throw error;
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Known viewers require a database." }, { status: 503 });
  }

  const id = new URL(request.url).searchParams.get("id");

  try {
    const actor = await resolveActor(request);
    authorize(actor, "analytics.view", { workspaceId: actor.workspaceId });

    if (id) {
      if (!UUID.test(id)) return NextResponse.json({ error: "No such contact." }, { status: 404 });
      const activity = await activityFor(actor.workspaceId, id);
      if (!activity) return NextResponse.json({ error: "No such contact." }, { status: 404 });

      return NextResponse.json({
        contact: {
          id: activity.contact.id,
          email: activity.contact.erasedAt ? null : activity.contact.email,
          name: activity.contact.name,
          company: activity.contact.company,
          source: activity.contact.source,
          identified_at: activity.contact.identifiedAt.toISOString(),
          erased: activity.contact.erasedAt !== null,
          // Made on demand rather than stored: a link in a database is a
          // link that outlives the reason it was created.
          personal_link: activity.contact.erasedAt ? null : signPersonalLink(activity.contact.id),
        },
        sessions: activity.sessions.map((session) => ({
          project_id: session.projectId,
          started_at: session.startedAt.toISOString(),
          watched_seconds: session.watchedSeconds,
          asset_seconds: session.assetSeconds,
          reached_end: session.reachedEnd,
          cta_clicked: session.ctaClicked,
        })),
      });
    }

    const rows = await getDb()
      .select()
      .from(s.contacts)
      .where(and(eq(s.contacts.workspaceId, actor.workspaceId), isNull(s.contacts.erasedAt)))
      .orderBy(desc(s.contacts.identifiedAt))
      .limit(200);

    return NextResponse.json({
      contacts: rows.map((contact) => ({
        id: contact.id,
        email: contact.email,
        name: contact.name,
        company: contact.company,
        source: contact.source,
        identified_at: contact.identifiedAt.toISOString(),
        last_seen_at: contact.lastSeenAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return handle(error);
  }
}

/** Honours a deletion request. The name goes; the counts stay. */
export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Known viewers require a database." }, { status: 503 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) {
    return NextResponse.json({ error: "A contact id is required." }, { status: 400 });
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "workspace.settings.edit", { workspaceId: actor.workspaceId });

    const erased = await erase(actor.workspaceId, id, actor);
    if (!erased) {
      // Already erased, or never here. The same answer either way: a
      // different one would confirm that an address was in this workspace.
      return NextResponse.json({ error: "No such contact." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
