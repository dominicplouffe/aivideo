import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

/**
 * Whether a workspace signs people in through its own identity provider.
 *
 * Disabled connections count. Such a workspace's members carry whatever
 * address their customer's provider asserted, so their address is not
 * evidence of anything outside that workspace: not of being staff, not of
 * being the person an invitation elsewhere was sent to.
 */
export async function usesSingleSignOn(workspaceId: string): Promise<boolean> {
  const [connection] = await getDb()
    .select({ id: s.ssoConnections.id })
    .from(s.ssoConnections)
    .where(eq(s.ssoConnections.workspaceId, workspaceId))
    .limit(1);
  return Boolean(connection);
}
