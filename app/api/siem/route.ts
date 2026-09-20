import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { recordQuietly } from "@/lib/audit/log";
import { activeDestinations, registerDestination, type SiemFormat } from "@/lib/audit/siem";

/**
 * Audit streaming destinations.
 *
 * Registering one means handing us a URL that a worker on our private
 * network will dial, and a credential we will store — so this route is
 * behind `workspace.settings.edit` and every read is scoped to the actor's
 * own workspace.
 *
 * The credential is never read back. It goes in once, is sealed, and is
 * presented to the collector; an endpoint that returns it would turn one
 * compromised admin session into a copy of somebody's Splunk token.
 */
export const dynamic = "force-dynamic";

const FORMATS = new Set<SiemFormat>(["json", "cef", "ecs"]);

async function actorFor(request: Request, permission: Parameters<typeof authorize>[1]) {
  const actor = await resolveActor(request);
  authorize(actor, permission, { workspaceId: actor.workspaceId });
  return actor;
}

function handle(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  throw error;
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Audit streaming requires a database." }, { status: 503 });
  }

  try {
    const actor = await actorFor(request, "audit.view");
    const destinations = await activeDestinations(actor.workspaceId);

    return NextResponse.json({
      destinations: destinations.map((destination) => ({
        id: destination.id,
        name: destination.name,
        format: destination.format,
        url: destination.url,
        // Whether a credential is set, never what it is.
        authenticated: destination.authValueSealed !== null,
        last_sequence: destination.lastSeq,
        last_delivered_at: destination.lastDeliveredAt?.toISOString() ?? null,
        last_error: destination.lastError,
        consecutive_failures: destination.consecutiveFailures,
      })),
    });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Audit streaming requires a database." }, { status: 503 });
  }

  let body: {
    name?: unknown;
    url?: unknown;
    format?: unknown;
    auth_header?: unknown;
    auth_value?: unknown;
    from_start?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  try {
    const actor = await actorFor(request, "workspace.settings.edit");

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!name || !url) {
      return NextResponse.json({ error: "name and url are both required." }, { status: 400 });
    }

    const format = typeof body.format === "string" && FORMATS.has(body.format as SiemFormat)
      ? (body.format as SiemFormat)
      : "json";

    let destination;
    try {
      destination = await registerDestination({
        workspaceId: actor.workspaceId,
        name,
        url,
        format,
        authHeaderName: typeof body.auth_header === "string" ? body.auth_header : undefined,
        authValue: typeof body.auth_value === "string" ? body.auth_value : undefined,
        fromStart: body.from_start === true,
      });
    } catch (error) {
      // A refused URL is the caller's mistake, not a server failure, and it
      // is worth saying which mistake.
      return NextResponse.json({ error: String((error as Error).message) }, { status: 422 });
    }

    await recordQuietly({
      workspaceId: actor.workspaceId,
      actor,
      action: "audit.stream_added",
      resourceType: "siem_destination",
      resourceId: destination.id,
      metadata: { name, format, url },
    });

    return NextResponse.json(
      {
        id: destination.id,
        name: destination.name,
        format: destination.format,
        // Where the stream starts, so an admin knows whether history is
        // coming or only what happens next.
        from_sequence: destination.lastSeq,
      },
      { status: 201 },
    );
  } catch (error) {
    return handle(error);
  }
}

/** Stops a stream. The row is kept, so its cursor survives a re-enable. */
export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Audit streaming requires a database." }, { status: 503 });
  }

  const id = new URL(request.url).searchParams.get("id");
  // Checked before it reaches the query: ids are UUIDs, and anything else
  // would be a database error rendered as a 500 rather than a 404.
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "A destination id is required." }, { status: 400 });
  }

  try {
    const actor = await actorFor(request, "workspace.settings.edit");

    const [updated] = await getDb()
      .update(s.siemDestinations)
      .set({ disabledAt: new Date() })
      .where(
        and(
          eq(s.siemDestinations.id, id),
          // Scoped in the statement. A destination in another workspace is
          // one this actor cannot see, and must not be able to switch off.
          eq(s.siemDestinations.workspaceId, actor.workspaceId),
        ),
      )
      .returning();

    if (!updated) return NextResponse.json({ error: "No such destination." }, { status: 404 });

    await recordQuietly({
      workspaceId: actor.workspaceId,
      actor,
      action: "audit.stream_removed",
      resourceType: "siem_destination",
      resourceId: updated.id,
      metadata: { name: updated.name, lastSequence: updated.lastSeq },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
