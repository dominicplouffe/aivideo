import { readJson, scimJson, withScim } from "@/lib/auth/scim/http";
import {
  LIST_SCHEMA, createUser, listUsers, markSynced, toScimUser, type ScimUserInput,
} from "@/lib/auth/scim/users";

/**
 * SCIM 2.0 `/Users`.
 *
 * Nothing in these requests selects a workspace. The bearer token names a
 * connection, the connection names the workspace, and every query is scoped
 * to it before a filter is even parsed — which is the only way a multi-tenant
 * SCIM endpoint is safe, because the directory on the other end is one
 * customer's and has no business seeing another's.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withScim(request, async (principal, base) => {
    const params = new URL(request.url).searchParams;
    const { total, startIndex, members } = await listUsers(principal, {
      filter: params.get("filter"),
      startIndex: Number(params.get("startIndex")) || 1,
      count: params.get("count") === null ? 100 : Number(params.get("count")),
    });
    await markSynced(principal);

    return scimJson({
      schemas: [LIST_SCHEMA],
      totalResults: total,
      startIndex,
      itemsPerPage: members.length,
      Resources: members.map((member) => toScimUser(member, base)),
    });
  });
}

export async function POST(request: Request) {
  return withScim(request, async (principal, base) => {
    const input = await readJson<ScimUserInput>(request);
    const { member, created } = await createUser(principal, input);
    await markSynced(principal);
    return scimJson(toScimUser(member, base), created ? 201 : 200);
  });
}
