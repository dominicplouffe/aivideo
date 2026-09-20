import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

/**
 * The credential a directory uses to talk to us.
 *
 * SCIM has no user in the loop. An identity provider holds a bearer token
 * and calls these endpoints on a schedule, which makes the token the entire
 * authentication story — and makes it a credential that can create and
 * deactivate accounts in one specific workspace. Three consequences:
 *
 *  1. **Only the hash is stored.** Same reasoning as the session table: a
 *     leaked backup should not hand the reader live access.
 *  2. **The comparison is constant-time**, and the lookup is by hash rather
 *     than by a prefix, so there is no per-character timing signal.
 *  3. **The token names the connection, and the connection names the
 *     workspace.** Nothing in a SCIM request selects a tenant. A directory
 *     that asks to deactivate a member in another workspace is asking about
 *     a member it cannot see.
 */

const PREFIX = "scim_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mints a token, returns it once, and stores only its hash. */
export async function issueScimToken(connectionId: string): Promise<{ token: string; hint: string }> {
  const token = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  const hint = token.slice(-6);

  await getDb()
    .update(s.ssoConnections)
    .set({ scimTokenHash: hashToken(token), scimTokenHint: hint, scimTokenIssuedAt: new Date() })
    .where(eq(s.ssoConnections.connectionId, connectionId));

  return { token, hint };
}

export async function revokeScimToken(connectionId: string): Promise<void> {
  await getDb()
    .update(s.ssoConnections)
    .set({ scimTokenHash: null, scimTokenHint: null, scimTokenIssuedAt: null })
    .where(eq(s.ssoConnections.connectionId, connectionId));
}

export interface ScimPrincipal {
  connection: typeof s.ssoConnections.$inferSelect;
  workspaceId: string;
}

/**
 * Resolves the Authorization header to a connection, or null.
 *
 * Null for every failure — no header, wrong scheme, unknown token, disabled
 * connection. A directory integration gets one answer to "is this token
 * good", because distinguishing "unknown token" from "token for a connection
 * somebody switched off" tells a guesser which half they got right.
 */
export async function authenticateScim(request: Request): Promise<ScimPrincipal | null> {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  if (!token) return null;

  const [connection] = await getDb()
    .select()
    .from(s.ssoConnections)
    .where(
      and(eq(s.ssoConnections.scimTokenHash, hashToken(token)), isNull(s.ssoConnections.disabledAt)),
    )
    .limit(1);

  if (!connection?.scimTokenHash) return null;

  // The lookup above already matched on the hash, so this is belt and
  // braces — but it is the comparison that would matter if the lookup ever
  // became a scan, and it costs nothing to be right by construction.
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(connection.scimTokenHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { connection, workspaceId: connection.workspaceId };
}
