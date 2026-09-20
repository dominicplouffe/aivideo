import { NextResponse } from "next/server";
import { readJson, scimJson, withScim } from "@/lib/auth/scim/http";
import {
  deleteGroup, getGroup, membersOf, patchGroup, replaceGroup, toScimGroup,
  type GroupPatch, type ScimGroupInput,
} from "@/lib/auth/scim/groups";
import { markSynced } from "@/lib/auth/scim/users";

/**
 * One SCIM group.
 *
 * `DELETE` recomputes every member's role *before* removing the rows,
 * because afterwards there is nothing left to recompute from — and a group
 * deletion that leaves ten people holding an admin role it granted is the
 * worst possible outcome of tidying up a directory.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return withScim(request, async (principal, base) => {
    const group = await getGroup(principal, id);
    return scimJson(toScimGroup(group, await membersOf(group.id), base));
  });
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return withScim(request, async (principal, base) => {
    const input = await readJson<ScimGroupInput>(request);
    const group = await replaceGroup(principal, id, input);
    await markSynced(principal);
    return scimJson(toScimGroup(group, await membersOf(group.id), base));
  });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return withScim(request, async (principal, base) => {
    const body = await readJson<{ Operations?: GroupPatch[]; operations?: GroupPatch[] }>(request);
    // Case varies by vendor, and the specification's own examples are
    // inconsistent. Accepting both is cheaper than a support ticket.
    const group = await patchGroup(principal, id, body.Operations ?? body.operations ?? []);
    await markSynced(principal);
    return scimJson(toScimGroup(group, await membersOf(group.id), base));
  });
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return withScim(request, async (principal) => {
    await deleteGroup(principal, id);
    await markSynced(principal);
    return new NextResponse(null, { status: 204 });
  });
}
