import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { CredentialError, listCredentials, revokeCredential, storeCredential } from "@/lib/agent/credentials";

/**
 * Credentials the agent may use.
 *
 * Write-only from the outside: a secret goes in and is never returned,
 * because an endpoint that hands back a password turns one compromised admin
 * session into a copy of a customer's demo account. Rotation is the same
 * call with the same label — one row, one new secret, nothing that
 * references it has to change, which is what makes rotation something a
 * person will actually do.
 */
export const dynamic = "force-dynamic";

function handle(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof CredentialError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  throw error;
}

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "The agent requires a database." }, { status: 503 });
  }

  try {
    const actor = await resolveActor(request);
    // Listing shows labels, sites and emails, never a secret: anybody who
    // can request a run needs it to choose which account the run uses.
    authorize(actor, "agent.run", { workspaceId: actor.workspaceId });
    return NextResponse.json({ credentials: await listCredentials(actor.workspaceId) });
  } catch (error) {
    return handle(error);
  }
}

export async function PUT(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "The agent requires a database." }, { status: 503 });
  }

  let body: { label?: unknown; origin?: unknown; username?: unknown; secret?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  try {
    const actor = await resolveActor(request);
    authorize(actor, "agent.credentials.manage", { workspaceId: actor.workspaceId });

    const label = typeof body.label === "string" ? body.label.trim() : "";
    const origin = typeof body.origin === "string" ? body.origin.trim() : "";
    const secret = typeof body.secret === "string" ? body.secret : "";

    if (!label || !origin || !secret) {
      return NextResponse.json(
        { error: "label, origin and secret are all required." },
        { status: 400 },
      );
    }

    const credential = await storeCredential({
      workspaceId: actor.workspaceId,
      label,
      origin,
      username: typeof body.username === "string" ? body.username : null,
      secret,
      actor,
    });

    return NextResponse.json(
      // Never the secret, and never an echo of it.
      { id: credential.id, label: credential.label, origin: credential.origin },
      { status: credential.rotatedAt ? 200 : 201 },
    );
  } catch (error) {
    return handle(error);
  }
}

export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "The agent requires a database." }, { status: 503 });
  }

  const label = new URL(request.url).searchParams.get("label");
  if (!label) return NextResponse.json({ error: "A label is required." }, { status: 400 });

  try {
    const actor = await resolveActor(request);
    authorize(actor, "agent.credentials.manage", { workspaceId: actor.workspaceId });

    const revoked = await revokeCredential(actor.workspaceId, label, actor);
    if (!revoked) return NextResponse.json({ error: "No such credential." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handle(error);
  }
}
