import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { clientIp, needsDatabase } from "@/lib/api/guard";
import { readSessionCookie, serializeSessionCookie } from "@/lib/auth/cookies";
import { handOver, verify } from "@/lib/auth/sessions";
import { usesSingleSignOn } from "@/lib/auth/sso";
import { acceptInvitation, findInvitation } from "@/lib/db/repositories/invitations";
import { getMember } from "@/lib/db/repositories/members";
import { recordQuietly } from "@/lib/audit/log";

/**
 * Accepts an invitation as the person signed in, and switches them into it.
 *
 * Somebody signing in for the first time never gets here: their sign-in
 * accepts it. This is for people who already belong somewhere.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const verdict = await verify(readSessionCookie(request));
  if (!verdict.ok) return NextResponse.json({ error: "Sign in to accept this invitation." }, { status: 401 });

  let body: { token?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const found = await findInvitation(typeof body.token === "string" ? body.token : "");
  if (!found.ok) {
    return NextResponse.json(
      { error: found.reason === "expired" ? "This invitation has expired. Ask for a new one." : "This invitation is no longer valid." },
      { status: 410 },
    );
  }

  // The address on this session is only proof of the inbox when a provider
  // verified it for us, which is not true of a customer's own single sign-on.
  if (await usesSingleSignOn(verdict.actor.workspaceId)) {
    return NextResponse.json(
      { error: `Sign out, then sign in with ${found.invitation.email} directly to accept.` },
      { status: 403 },
    );
  }
  if (verdict.actor.email.toLowerCase() !== found.invitation.email) {
    return NextResponse.json(
      { error: `This invitation is for ${found.invitation.email}. You are signed in as ${verdict.actor.email}.` },
      { status: 403 },
    );
  }

  const accepted = await acceptInvitation({
    invitationId: found.invitation.id,
    email: verdict.actor.email,
    // The name they already go by in their other workspace.
    name: (await getMember(verdict.actor.memberId))?.name ?? "",
    externalId: verdict.actor.externalId,
  });
  if (!accepted.ok) return NextResponse.json({ error: "This invitation is no longer valid." }, { status: 410 });

  const { token } = await handOver(verdict.session, { memberId: accepted.member.id, workspaceId: accepted.member.workspaceId }, "joined another workspace");
  await recordQuietly({
    workspaceId: accepted.member.workspaceId,
    actor: { memberId: accepted.member.id, email: accepted.member.email },
    action: "session.started",
    resourceType: "member",
    resourceId: accepted.member.id,
    ip: clientIp(request),
    metadata: { via: "invitation", from: verdict.actor.workspaceId },
  });

  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", serializeSessionCookie(token));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
