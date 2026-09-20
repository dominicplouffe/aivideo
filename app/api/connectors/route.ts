import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { recordQuietly } from "@/lib/audit/log";
import { VENDORS, getConnector, type ConnectorVendor } from "@/lib/connectors";
import { contextFor, installationsFor, sealCredentials } from "@/lib/connectors/sync";
import { checkDestination, describeRefusal } from "@/lib/webhooks/destinations";

/**
 * Help-centre connectors.
 *
 * Installing one means handing us a URL that a worker will dial and a token
 * that can write to a customer's public documentation. Both are behind
 * `workspace.settings.edit`, and the token is sealed on the way in and never
 * readable on the way out.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    return NextResponse.json({ vendors: VENDORS, installations: [] });
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "project.view", { workspaceId: actor.workspaceId });

    const installations = await installationsFor(actor.workspaceId);
    const links = installations.length
      ? await getDb()
          .select()
          .from(s.connectorLinks)
          .where(eq(s.connectorLinks.installationId, installations[0].id))
      : [];

    return NextResponse.json({
      vendors: VENDORS,
      installations: installations.map((installation) => ({
        id: installation.id,
        vendor: installation.vendor,
        base_url: installation.baseUrl,
        container: installation.containerName ?? installation.containerId,
        // Whether a credential is set, never what it is.
        authenticated: installation.credentialsSealed !== null,
        last_sync_at: installation.lastSyncAt?.toISOString() ?? null,
        last_error: installation.lastError,
        disabled: installation.disabledAt !== null,
        links: links
          .filter((link) => link.installationId === installation.id)
          .map((link) => ({
            project_id: link.projectId,
            locale: link.locale,
            external_url: link.externalUrl,
            state: link.state,
            last_pushed_at: link.lastPushedAt?.toISOString() ?? null,
          })),
      })),
    });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Connectors require a database." }, { status: 503 });
  }

  let body: {
    vendor?: unknown;
    base_url?: unknown;
    container_id?: unknown;
    container_name?: unknown;
    credentials?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "workspace.settings.edit", { workspaceId: actor.workspaceId });

    const vendor = typeof body.vendor === "string" ? body.vendor : "";
    if (!(vendor in VENDORS)) {
      return NextResponse.json(
        { error: `vendor must be one of: ${Object.keys(VENDORS).join(", ")}` },
        { status: 422 },
      );
    }

    const baseUrl = typeof body.base_url === "string" ? body.base_url.trim() : "";
    const verdict = await checkDestination(baseUrl);
    if (!verdict.ok) {
      return NextResponse.json({ error: describeRefusal(verdict.reason) }, { status: 422 });
    }

    const credentials =
      body.credentials && typeof body.credentials === "object"
        ? (body.credentials as Record<string, string>)
        : {};

    const missing = VENDORS[vendor as ConnectorVendor].credentials.filter((name) => !credentials[name]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `${vendor} needs: ${missing.join(", ")}` },
        { status: 422 },
      );
    }

    const [installation] = await getDb()
      .insert(s.connectorInstallations)
      .values({
        workspaceId: actor.workspaceId,
        vendor: vendor as ConnectorVendor,
        baseUrl: verdict.url.origin + verdict.url.pathname.replace(/\/$/, ""),
        containerId: typeof body.container_id === "string" ? body.container_id : null,
        containerName: typeof body.container_name === "string" ? body.container_name : null,
        credentialsSealed: sealCredentials(credentials),
      })
      .returning();

    await recordQuietly({
      workspaceId: actor.workspaceId,
      actor,
      action: "connector.installed",
      resourceType: "connector_installation",
      resourceId: installation.id,
      metadata: { vendor, baseUrl: installation.baseUrl },
    });

    return NextResponse.json(
      { id: installation.id, vendor: installation.vendor, base_url: installation.baseUrl },
      { status: 201 },
    );
  } catch (error) {
    return handle(error);
  }
}

/** The containers a new article can be filed under, for the setup screen. */
export async function PATCH(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Connectors require a database." }, { status: 503 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) {
    return NextResponse.json({ error: "An installation id is required." }, { status: 400 });
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "workspace.settings.edit", { workspaceId: actor.workspaceId });

    const [installation] = await getDb()
      .select()
      .from(s.connectorInstallations)
      .where(
        and(
          eq(s.connectorInstallations.id, id),
          // Scoped in the statement: an installation in another workspace is
          // one this actor cannot see.
          eq(s.connectorInstallations.workspaceId, actor.workspaceId),
        ),
      )
      .limit(1);

    if (!installation) return NextResponse.json({ error: "No such installation." }, { status: 404 });

    const connector = getConnector(installation.vendor as ConnectorVendor);
    const containers = await connector.listContainers(contextFor(installation));

    return NextResponse.json({
      label: VENDORS[installation.vendor as ConnectorVendor].containerLabel,
      containers,
    });
  } catch (error) {
    return handle(error);
  }
}

export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Connectors require a database." }, { status: 503 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !UUID.test(id)) {
    return NextResponse.json({ error: "An installation id is required." }, { status: 400 });
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "workspace.settings.edit", { workspaceId: actor.workspaceId });

    const [updated] = await getDb()
      .update(s.connectorInstallations)
      // Disabled, not deleted: the link rows carry which article each
      // project became, and losing them would mean a reconnect creates a
      // second copy of every article.
      .set({ disabledAt: new Date(), credentialsSealed: null })
      .where(
        and(
          eq(s.connectorInstallations.id, id),
          eq(s.connectorInstallations.workspaceId, actor.workspaceId),
        ),
      )
      .returning();

    if (!updated) return NextResponse.json({ error: "No such installation." }, { status: 404 });

    await recordQuietly({
      workspaceId: actor.workspaceId,
      actor,
      action: "connector.removed",
      resourceType: "connector_installation",
      resourceId: updated.id,
      metadata: { vendor: updated.vendor },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
