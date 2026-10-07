import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { clientIp, membershipRefusal, needsDatabase, requireActor, siteOrigin } from "@/lib/api/guard";
import { createInvitation } from "@/lib/db/repositories/invitations";
import { deliverInvitation } from "@/lib/email/invitation";
import { ROLES, type Role } from "@/lib/auth/roles";

/** Inviting somebody into this workspace. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "member.invite");
  if ("response" in guard) return guard.response;

  let body: { email?: unknown; role?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.email !== "string") return NextResponse.json({ error: "Enter an email address." }, { status: 422 });
  if (typeof body.role !== "string" || !(ROLES as readonly string[]).includes(body.role)) {
    return NextResponse.json({ error: `Role must be one of ${ROLES.join(", ")}.` }, { status: 422 });
  }

  try {
    const { invitation, token } = await createInvitation({
      actor: guard.actor,
      email: body.email,
      role: body.role as Role,
      ip: clientIp(request),
    });
    const delivery = await deliverInvitation({ invitation, token, origin: siteOrigin(request) });
    return NextResponse.json({ invitation, ...delivery }, { status: 201 });
  } catch (error) {
    return membershipRefusal(error);
  }
}
