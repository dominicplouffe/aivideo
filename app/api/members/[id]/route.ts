import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { clientIp, membershipRefusal, needsDatabase, requireActor } from "@/lib/api/guard";
import { changeRole, deactivate } from "@/lib/db/repositories/members";
import { ROLES, type Role } from "@/lib/auth/roles";

/**
 * One member: change their role, or remove them.
 *
 * The rules — no promoting past your own role, no changing your own, always
 * one owner left — and ending the person's sessions all live in the
 * repository, so this route cannot get them wrong.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "No such member in this workspace." }, { status: 404 });

export async function PATCH(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "member.role.change");
  if ("response" in guard) return guard.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return notFound();

  let body: { role?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.role !== "string" || !(ROLES as readonly string[]).includes(body.role)) {
    return NextResponse.json({ error: `Role must be one of ${ROLES.join(", ")}.` }, { status: 422 });
  }

  try {
    const member = await changeRole({ actor: guard.actor, memberId: id, nextRole: body.role as Role, ip: clientIp(request) });
    return NextResponse.json({ member: { id: member.id, role: member.role } });
  } catch (error) {
    return membershipRefusal(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "member.remove");
  if ("response" in guard) return guard.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return notFound();

  try {
    await deactivate({ actor: guard.actor, memberId: id, ip: clientIp(request) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return membershipRefusal(error);
  }
}
