import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { safeOrigin } from "@/lib/embed/runtime";

/**
 * Cookieless view measurement.
 *
 * Records that a demo was opened, and — when the tab goes away — the whole
 * watch pattern in one request. No identifier is generated, read or stored:
 * the viewer is deduplicated within a day by a hash whose salt rotates
 * daily and is never written down. See `lib/analytics/visitor.ts`.
 *
 * `POST` and `GET` both work, because `navigator.sendBeacon` sends a POST
 * and the `fetch` fallback is easier to debug as a GET. Refusing one would
 * mean measurement silently stopping in whichever browsers use the other.
 */

const ACK = {
  status: 204,
  headers: {
    // The embed is cross-origin by definition.
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  },
} as const;

function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("demo");
  if (!projectId) return new NextResponse(null, ACK);

  // Without a database there is nowhere to put it, and acknowledging is
  // still the right answer — a beacon has no way to act on an error and
  // retrying would only lose the same request twice.
  if (!isDatabaseConfigured()) return new NextResponse(null, ACK);

  const input = {
    projectId,
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
    // Origin only, never the path: the URL of a page on somebody else's
    // site is their data, not ours.
    fromOrigin: safeOrigin(url.searchParams.get("from") ?? ""),
    locale: url.searchParams.get("locale"),
  };

  try {
    const { getDb } = await import("@/lib/db/client");
    const s = await import("@/lib/db/schema");
    const { and, eq, isNull } = await import("drizzle-orm");

    const [project] = await getDb()
      .select({
        workspaceId: s.projects.workspaceId,
        sourceDurationSec: s.projects.sourceDurationSec,
      })
      .from(s.projects)
      .where(and(eq(s.projects.id, projectId), isNull(s.projects.deletedAt)))
      .limit(1);

    // An unknown or deleted demo id is not an error worth reporting to a
    // beacon: it is a stale embed on a page somebody forgot about.
    if (!project) return new NextResponse(null, ACK);

    // The player reports its own length, because the finished duration is
    // derived from the surviving segments rather than stored — computing it
    // on a beacon would mean a join on the hot path. It is clamped when the
    // bitmap is built, and kept per session, so a later re-edit does not
    // rewrite what an earlier viewer actually saw.
    const reported = Number(url.searchParams.get("len"));
    const assetSeconds = Math.max(
      1,
      Math.ceil(
        Number.isFinite(reported) && reported > 0 ? reported : (project.sourceDurationSec ?? 1),
      ),
    );
    const analytics = await import("@/lib/analytics/ingest");
    const spans = url.searchParams.get("watched");

    if (spans) {
      await analytics.recordSummary({
        ...input,
        workspaceId: project.workspaceId,
        assetSeconds,
        spans,
        ctaClicked: url.searchParams.get("cta") === "1",
      });
    } else if (url.searchParams.get("cta") === "1") {
      await analytics.recordCta({ ...input, workspaceId: project.workspaceId, assetSeconds });
    } else {
      await analytics.recordView({ ...input, workspaceId: project.workspaceId, assetSeconds });
    }
  } catch (error) {
    // Measurement must never be a reason a customer's page misbehaves, and
    // a beacon cannot act on a 500 anyway. Loud in our logs, silent to them.
    console.error(`[analytics] could not record a view of ${projectId}:`, error);
  }

  // 204 with no body: sendBeacon ignores the response, and returning JSON to
  // a beacon is bytes nobody reads.
  return new NextResponse(null, ACK);
}

export const GET = handle;
export const POST = handle;

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
