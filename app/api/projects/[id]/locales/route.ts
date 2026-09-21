import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { getProjectById } from "@/lib/db/repositories/projects";
import { addLocales, listLocalesForProject, removeLocale } from "@/lib/db/repositories/locales";
import { isSupportedLocale, SOURCE_LOCALE } from "@/lib/locales";
import { recordQuietly } from "@/lib/audit/log";

/**
 * The languages a project is translated into.
 *
 * Until this existed, the localization screen was the `localeMatrix`
 * fixture: twelve languages with statuses attached, identical on every
 * workspace, above an "Add languages" button with no handler. The `locales`
 * table it should have been writing to had never had a row inserted.
 *
 * Adding a language queues it. It does not render anything here — a
 * translation is vendor work and belongs on the durable queue, and doing it
 * inside a request would hold the connection open for as long as the model
 * takes and lose the work if the tab closed.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  const rows = await listLocalesForProject(guard.actor.workspaceId, id);
  return NextResponse.json({ object: "list", data: rows, has_more: false });
}

export async function POST(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  let body: { codes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const requested = Array.isArray(body.codes) ? body.codes.filter((c) => typeof c === "string") : [];
  if (requested.length === 0) {
    return NextResponse.json({ error: "codes must be a non-empty array." }, { status: 422 });
  }

  // Refused rather than stored. An unrecognised tag would sit in the table
  // as a language nothing can ever translate into, and the row would look
  // identical to a real one on the screen that lists them.
  const unknown = requested.filter((c) => !isSupportedLocale(c));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Not a supported language: ${unknown.join(", ")}.` },
      { status: 422 },
    );
  }

  const { id } = await context.params;
  const project = await getProjectById(guard.actor.workspaceId, id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  // The source language is not a translation of itself.
  const codes = requested.filter((c) => c !== SOURCE_LOCALE);
  const rows = await addLocales(guard.actor.workspaceId, id, codes);
  if (!rows) return NextResponse.json({ error: "No such project." }, { status: 404 });

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "project.locales_added",
    resourceType: "project",
    resourceId: id,
    metadata: { codes },
  });

  return NextResponse.json({ object: "list", data: rows, has_more: false }, { status: 201 });
}

export async function DELETE(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  const localeId = new URL(request.url).searchParams.get("locale");
  if (!localeId) {
    return NextResponse.json({ error: "locale is required." }, { status: 400 });
  }

  const removed = await removeLocale(guard.actor.workspaceId, localeId);
  if (!removed) return NextResponse.json({ error: "No such language." }, { status: 404 });

  const { id } = await context.params;
  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "project.locale_removed",
    resourceType: "project",
    resourceId: id,
    metadata: { localeId },
  });

  return new NextResponse(null, { status: 204 });
}
