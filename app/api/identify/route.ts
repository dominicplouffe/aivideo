import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { attachToSession, identify, plausibleEmail, verifyPersonalLink } from "@/lib/analytics/identity";

/**
 * The email gate, and personalised links.
 *
 * Public, because the person calling it is a viewer on somebody else's site
 * rather than a member of anything. Two consequences shape the whole
 * handler.
 *
 * **The workspace is never taken from the request.** The caller names an
 * asset by its public slug and the workspace is resolved from it. A body
 * carrying a workspace id would let anyone write a contact into any tenant.
 *
 * **The asset has to be gated.** An address submitted against an asset whose
 * access is `public` was not asked for, so accepting it would mean this
 * endpoint could be used to write arbitrary contacts into a workspace that
 * never turned the gate on.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: true, identified: false });
  }

  let body: {
    slug?: unknown;
    session_id?: unknown;
    email?: unknown;
    name?: unknown;
    company?: unknown;
    token?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });

  const db = getDb();
  // Joined to a live project: a deleted project's share link identifies nobody.
  const [found] = await db
    .select({ asset: s.assets })
    .from(s.assets)
    .innerJoin(s.projects, and(eq(s.projects.id, s.assets.projectId), isNull(s.projects.deletedAt)))
    .where(eq(s.assets.publicSlug, slug))
    .limit(1);
  const asset = found?.asset;

  if (!asset) return NextResponse.json({ error: "No such asset." }, { status: 404 });

  // The gate has to be on. Otherwise this endpoint is a way to write a
  // contact into any workspace that ever published anything.
  if (asset.access !== "email_gate" && asset.access !== "personalized") {
    return NextResponse.json(
      { error: "That asset does not ask viewers to identify themselves." },
      { status: 409 },
    );
  }

  let contactId: string | null = null;
  let source: "email_gate" | "personalized_link" = "email_gate";

  if (typeof body.token === "string" && body.token) {
    const verdict = verifyPersonalLink(body.token);
    if (!verdict.ok) {
      // A forwarded or edited link identifies nobody. The view still counts
      // anonymously, which is why this is a 200 rather than an error.
      return NextResponse.json({ ok: true, identified: false, reason: verdict.reason });
    }

    const [contact] = await db
      .select()
      .from(s.contacts)
      .where(
        and(eq(s.contacts.id, verdict.contactId), eq(s.contacts.workspaceId, asset.workspaceId)),
      )
      .limit(1);

    // A link signed for another workspace's contact resolves to nobody here.
    if (!contact || contact.erasedAt) {
      return NextResponse.json({ ok: true, identified: false, reason: "unknown" });
    }

    contactId = contact.id;
    source = "personalized_link";
  } else {
    const email = typeof body.email === "string" ? body.email : "";
    if (!plausibleEmail(email)) {
      return NextResponse.json({ error: "That does not look like an email address." }, { status: 422 });
    }

    const contact = await identify({
      workspaceId: asset.workspaceId,
      email,
      name: typeof body.name === "string" ? body.name.slice(0, 120) : null,
      company: typeof body.company === "string" ? body.company.slice(0, 120) : null,
      source: "email_gate",
    });
    contactId = contact.id;
  }

  const sessionId = typeof body.session_id === "string" && UUID.test(body.session_id)
    ? body.session_id
    : null;

  const attached = sessionId
    ? await attachToSession(asset.workspaceId, sessionId, contactId)
    : false;

  return NextResponse.json({ ok: true, identified: true, attached, source });
}
