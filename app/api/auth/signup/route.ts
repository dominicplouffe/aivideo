import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { originAllowed, serializeSessionCookie } from "@/lib/auth/cookies";
import { issue } from "@/lib/auth/sessions";
import { recordQuietly } from "@/lib/audit/log";
import { slugify } from "@/lib/utils";

/**
 * Create a workspace and its first member.
 *
 * Until this existed, the only way into the application was to be a row the
 * seed script had written: the signup form collected a name and a password,
 * discarded both, and posted the email to the sign-in endpoint — which
 * answered "No active account for that address." A form that asks somebody
 * to choose a password and then throws it away is worse than one that does
 * not work at all, because they will believe that password is protecting
 * something.
 *
 * No password is taken here either, and that is deliberate rather than
 * unfinished: this build authenticates by single sign-on, with email-only
 * sign-in as a development convenience. Storing a credential the login path
 * cannot check would be theatre. The form says so instead.
 *
 * Refused in production for the same reason email sign-in is: there is no
 * verification that the person typing an address owns it.
 */
export const dynamic = "force-dynamic";

const SSO_PENDING =
  "Self-serve signup needs single sign-on, which is not wired up yet. This build " +
  "cannot create an account on a production deployment.";

/** A slug nobody else in the table holds, derived from what they typed. */
async function uniqueSlug(base: string): Promise<string> {
  const rows = await getDb().select({ slug: s.workspaces.slug }).from(s.workspaces);
  const taken = new Set(rows.map((row) => row.slug));
  let slug = base || "workspace";
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export async function POST(request: Request) {
  if (!originAllowed(request)) {
    return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403 });
  }
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: SSO_PENDING }, { status: 501 });
  }
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Signup needs a database. Set DATABASE_URL in .env.local and run " +
          "`npm run db:migrate`, then try again.",
      },
      { status: 503 },
    );
  }

  let body: { email?: unknown; name?: unknown; workspace?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "A valid work email is required." }, { status: 422 });
  }
  if (name.length < 2) {
    return NextResponse.json({ error: "Your name is required." }, { status: 422 });
  }

  const db = getDb();

  // Refused rather than silently signing them in. Quietly logging somebody
  // into an existing account because the address matched is how one person
  // ends up inside another company's workspace.
  const [existing] = await db
    .select({ id: s.members.id })
    .from(s.members)
    .where(eq(s.members.email, email))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "That address already has an account. Sign in instead." },
      { status: 409 },
    );
  }

  // Named after the company in their email when they did not say, because
  // "Alex Morgan's workspace" is a name nobody keeps.
  const suggested =
    typeof body.workspace === "string" && body.workspace.trim()
      ? body.workspace.trim()
      : (email.split("@")[1]?.split(".")[0] ?? "workspace");

  const [workspace] = await db
    .insert(s.workspaces)
    .values({
      name: suggested.charAt(0).toUpperCase() + suggested.slice(1),
      slug: await uniqueSlug(slugify(suggested)),
      plan: "free",
      seatsTotal: 1,
    })
    .returning();

  const [member] = await db
    .insert(s.members)
    .values({
      workspaceId: workspace.id,
      email,
      name,
      // The first member owns the workspace. Somebody has to be able to
      // invite the second one and cancel the plan.
      role: "owner",
    })
    .returning();

  const { token, session } = await issue({
    memberId: member.id,
    workspaceId: workspace.id,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
  });

  await recordQuietly({
    workspaceId: workspace.id,
    actor: { memberId: member.id, email: member.email },
    action: "workspace.created",
    resourceType: "workspace",
    resourceId: workspace.id,
    metadata: { slug: workspace.slug },
  });

  const response = NextResponse.json(
    {
      workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
      member: { id: member.id, email: member.email, role: member.role },
      expires_at: session.absoluteExpiresAt.toISOString(),
    },
    { status: 201 },
  );
  response.headers.set("Set-Cookie", serializeSessionCookie(token));
  return response;
}
