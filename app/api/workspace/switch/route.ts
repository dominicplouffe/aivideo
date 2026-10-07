import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { clientIp, needsDatabase } from "@/lib/api/guard";
import { readSessionCookie, serializeSessionCookie } from "@/lib/auth/cookies";
import { handOver, verify } from "@/lib/auth/sessions";
import { membershipsFor } from "@/lib/db/repositories/members";
import { recordQuietly } from "@/lib/audit/log";

/**
 * Switches this browser to another workspace the same person belongs to.
 *
 * The target must be one `membershipsFor` offers, which is where the rules
 * about single sign-on live; a workspace id the caller simply knows is not
 * enough.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const verdict = await verify(readSessionCookie(request));
  if (!verdict.ok) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  let body: { workspace_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const target = (await membershipsFor(verdict.actor)).find((m) => m.workspaceId === body.workspace_id);
  if (!target) return NextResponse.json({ error: "You are not a member of that workspace." }, { status: 404 });
  if (target.current) return NextResponse.json({ ok: true });

  const { token } = await handOver(verdict.session, { memberId: target.memberId, workspaceId: target.workspaceId }, "switched workspace");
  // So the next sign-in lands where they last were.
  await getDb().update(s.members).set({ lastActiveAt: new Date() }).where(eq(s.members.id, target.memberId));

  await recordQuietly({
    workspaceId: target.workspaceId,
    actor: { memberId: target.memberId, email: verdict.actor.email },
    action: "session.started",
    resourceType: "member",
    resourceId: target.memberId,
    ip: clientIp(request),
    metadata: { via: "workspace-switch", from: verdict.actor.workspaceId },
  });

  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", serializeSessionCookie(token));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
