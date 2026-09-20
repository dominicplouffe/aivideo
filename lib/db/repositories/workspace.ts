import { eq, desc } from "drizzle-orm";
import { getDb } from "../client";
import * as s from "../schema";

export async function getWorkspace(slug: string) {
  const ws = await getDb().query.workspaces.findFirst({ where: eq(s.workspaces.slug, slug) });
  if (!ws) return null;
  return {
    id: ws.id,
    name: ws.name,
    plan: ws.plan,
    region: ws.region.toUpperCase(),
    seats: { total: ws.seatsTotal },
    // Stored in seconds; the UI talks in minutes.
    minutes: {
      used: Math.round(ws.videoSecondsUsed / 60),
      total: Math.round(ws.videoSecondsLimit / 60),
    },
    shareDomain: ws.shareDomain,
  };
}

export async function listMembers(workspaceSlug: string) {
  const ws = await getDb().query.workspaces.findFirst({ where: eq(s.workspaces.slug, workspaceSlug) });
  if (!ws) return [];
  return getDb()
    .select()
    .from(s.members)
    .where(eq(s.members.workspaceId, ws.id))
    .orderBy(s.members.createdAt);
}

export async function listBrandKits(workspaceSlug: string) {
  const ws = await getDb().query.workspaces.findFirst({ where: eq(s.workspaces.slug, workspaceSlug) });
  if (!ws) return [];
  return getDb().select().from(s.brandKits).where(eq(s.brandKits.workspaceId, ws.id));
}

export async function listAuditEvents(workspaceSlug: string, limit = 50) {
  const ws = await getDb().query.workspaces.findFirst({ where: eq(s.workspaces.slug, workspaceSlug) });
  if (!ws) return [];
  return getDb()
    .select()
    .from(s.auditEvents)
    .where(eq(s.auditEvents.workspaceId, ws.id))
    .orderBy(desc(s.auditEvents.createdAt))
    .limit(limit);
}
