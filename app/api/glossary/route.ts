import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { recordQuietly } from "@/lib/audit/log";
import { listGlossary, removeGlossaryTerm, upsertGlossaryTerm } from "@/lib/db/repositories/glossary";
import { MAX_EDIT_TEXT } from "@/lib/edit-state";

/**
 * The workspace glossary. Anybody who can view projects can read it; adding
 * or removing a term is a brand decision, so it takes `brand.edit`.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;
  const data = await listGlossary(guard.actor.workspaceId);
  return NextResponse.json({ object: "list", data, has_more: false });
}

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "brand.edit");
  if ("response" in guard) return guard.response;

  let body: { heard?: unknown; text?: unknown; spoken?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  const field = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const heard = field(body.heard);
  const text = field(body.text);
  const spoken = field(body.spoken);
  if (!heard || !text) {
    return NextResponse.json({ error: "heard and text are both required." }, { status: 422 });
  }
  if ([heard, text, spoken].some((value) => value.length > MAX_EDIT_TEXT)) {
    return NextResponse.json({ error: "A term is a word or a short phrase." }, { status: 422 });
  }

  const entry = await upsertGlossaryTerm(guard.actor.workspaceId, {
    heard,
    text,
    spoken: spoken && spoken !== text ? spoken : null,
    createdBy: guard.actor.memberId,
  });
  if (!entry) return NextResponse.json({ error: "heard must contain a word." }, { status: 422 });

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "glossary.term.saved",
    resourceType: "glossary_term",
    resourceId: entry.id,
    metadata: { heard: entry.heard, text: entry.text, spoken: entry.spoken },
  });
  return NextResponse.json(entry);
}

export async function DELETE(request: Request) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "brand.edit");
  if ("response" in guard) return guard.response;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "id must be a term id." }, { status: 422 });
  const removed = await removeGlossaryTerm(guard.actor.workspaceId, id);
  if (!removed) return NextResponse.json({ error: "No such term." }, { status: 404 });

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "glossary.term.removed",
    resourceType: "glossary_term",
    resourceId: id,
    metadata: {},
  });
  return NextResponse.json({ removed: true });
}
