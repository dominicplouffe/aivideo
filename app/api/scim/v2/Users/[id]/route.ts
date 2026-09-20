import { NextResponse } from "next/server";
import { readJson, scimJson, withScim } from "@/lib/auth/scim/http";
import {
  deleteUser, getUser, markSynced, patchUser, replaceUser, toScimUser,
  type PatchOperation, type ScimUserInput,
} from "@/lib/auth/scim/users";

/**
 * One SCIM user.
 *
 * `DELETE` deactivates rather than removing the row: audit entries,
 * recordings and render approvals all point at a member, and deleting it
 * would either cascade away evidence or leave the trail pointing at nothing.
 * Directories express "gone" as `active: false` anyway.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return withScim(request, async (principal, base) =>
    scimJson(toScimUser(await getUser(principal, id), base)),
  );
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  return withScim(request, async (principal, base) => {
    const input = await readJson<ScimUserInput>(request);
    const member = await replaceUser(principal, id, input);
    await markSynced(principal);
    return scimJson(toScimUser(member, base));
  });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return withScim(request, async (principal, base) => {
    const body = await readJson<{ Operations?: PatchOperation[]; operations?: PatchOperation[] }>(request);
    // Case varies by vendor, and the specification's own examples are
    // inconsistent. Accepting both is cheaper than a support ticket.
    const operations = body.Operations ?? body.operations ?? [];
    const member = await patchUser(principal, id, operations);
    await markSynced(principal);
    return scimJson(toScimUser(member, base));
  });
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return withScim(request, async (principal) => {
    await deleteUser(principal, id);
    await markSynced(principal);
    // 204, with no body: SCIM says so, and a directory that receives JSON
    // here logs a parse failure and retries.
    return new NextResponse(null, { status: 204 });
  });
}
