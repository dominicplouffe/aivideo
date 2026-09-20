import { readJson, scimJson, withScim } from "@/lib/auth/scim/http";
import { createGroup, listGroups, membersOf, toScimGroup, type ScimGroupInput } from "@/lib/auth/scim/groups";
import { LIST_SCHEMA, markSynced } from "@/lib/auth/scim/users";

/**
 * SCIM 2.0 `/Groups`.
 *
 * Groups are here for one reason: they decide roles. A directory that moves
 * somebody from `demo-viewers` to `demo-admins` is deciding what they may
 * do, and the point of syncing groups is that the decision takes effect
 * without anybody re-typing it.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withScim(request, async (principal, base) => {
    const params = new URL(request.url).searchParams;
    const groups = await listGroups(principal, { filter: params.get("filter") });
    await markSynced(principal);

    return scimJson({
      schemas: [LIST_SCHEMA],
      totalResults: groups.length,
      startIndex: 1,
      itemsPerPage: groups.length,
      Resources: groups.map(({ group, members }) => toScimGroup(group, members, base)),
    });
  });
}

export async function POST(request: Request) {
  return withScim(request, async (principal, base) => {
    const input = await readJson<ScimGroupInput>(request);
    const group = await createGroup(principal, input);
    await markSynced(principal);
    return scimJson(toScimGroup(group, await membersOf(group.id), base), 201);
  });
}
