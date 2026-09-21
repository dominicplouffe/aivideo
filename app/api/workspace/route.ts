import { NextResponse } from "next/server";
import { eq, and, ne } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { recordQuietly } from "@/lib/audit/log";
import { slugify } from "@/lib/utils";

/**
 * Workspace settings.
 *
 * The settings page had a "Save changes" button with no handler, over three
 * uncontrolled inputs. Typing a new workspace name and pressing Save did
 * nothing and said nothing — no error, no confirmation, no request.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "workspace.settings.edit");
  if ("response" in guard) return guard.response;

  const [row] = await getDb()
    .select()
    .from(s.workspaces)
    .where(eq(s.workspaces.id, guard.actor.workspaceId))
    .limit(1);
  if (!row) return NextResponse.json({ error: "No such workspace." }, { status: 404 });

  return NextResponse.json({
    workspace: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      plan: row.plan,
      region: row.region,
      share_domain: row.shareDomain,
      seats_total: row.seatsTotal,
      hard_stop_at_limit: row.hardStopAtLimit,
    },
  });
}

/** A share domain, or nothing. Never a scheme, a path or a port. */
function cleanDomain(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (host === "") return null;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)
    ? host
    : "";
}

export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "workspace.settings.edit");
  if ("response" in guard) return guard.response;

  let body: { name?: unknown; slug?: unknown; share_domain?: unknown; hard_stop_at_limit?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const db = getDb();
  const patch: Partial<typeof s.workspaces.$inferInsert> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json({ error: "A workspace name is 2 to 80 characters." }, { status: 422 });
    }
    patch.name = name;
  }

  if (typeof body.slug === "string") {
    const slug = slugify(body.slug);
    if (!slug) {
      return NextResponse.json({ error: "That URL is not usable." }, { status: 422 });
    }
    // Checked rather than left to the unique index: a constraint violation
    // reaches the browser as a 500 nobody can act on.
    const [clash] = await db
      .select({ id: s.workspaces.id })
      .from(s.workspaces)
      .where(and(eq(s.workspaces.slug, slug), ne(s.workspaces.id, guard.actor.workspaceId)))
      .limit(1);
    if (clash) {
      return NextResponse.json({ error: "That URL is already taken." }, { status: 409 });
    }
    patch.slug = slug;
  }

  if (typeof body.share_domain === "string") {
    const domain = cleanDomain(body.share_domain);
    if (domain === "") {
      return NextResponse.json({ error: "That does not look like a domain." }, { status: 422 });
    }
    patch.shareDomain = domain;
  }

  if (typeof body.hard_stop_at_limit === "boolean") {
    patch.hardStopAtLimit = body.hard_stop_at_limit;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 422 });
  }

  const [updated] = await db
    .update(s.workspaces)
    .set(patch)
    .where(eq(s.workspaces.id, guard.actor.workspaceId))
    .returning();

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "workspace.updated",
    resourceType: "workspace",
    resourceId: guard.actor.workspaceId,
    // The fields that changed, never their values: a workspace name is not
    // a secret, but "we log whatever was in the body" is how one ends up in
    // an audit trail that was not meant to hold it.
    metadata: { fields: Object.keys(patch) },
  });

  return NextResponse.json({
    workspace: {
      name: updated.name,
      slug: updated.slug,
      share_domain: updated.shareDomain,
      hard_stop_at_limit: updated.hardStopAtLimit,
    },
  });
}
