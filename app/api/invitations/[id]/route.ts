import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { clientIp, membershipRefusal, needsDatabase, requireActor, siteOrigin } from "@/lib/api/guard";
import { renewInvitation, revokeInvitation } from "@/lib/db/repositories/invitations";
import { deliverInvitation } from "@/lib/email/invitation";

/** One invitation: send it again with a fresh link, or withdraw it. */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "No such invitation in this workspace." }, { status: 404 });

export async function POST(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "member.invite");
  if ("response" in guard) return guard.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return notFound();

  try {
    const { invitation, token } = await renewInvitation({ actor: guard.actor, id, ip: clientIp(request) });
    const delivery = await deliverInvitation({ invitation, token, origin: siteOrigin(request) });
    return NextResponse.json({ invitation, ...delivery });
  } catch (error) {
    return membershipRefusal(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "member.invite");
  if ("response" in guard) return guard.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return notFound();

  try {
    await revokeInvitation({ actor: guard.actor, id, ip: clientIp(request) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return membershipRefusal(error);
  }
}
