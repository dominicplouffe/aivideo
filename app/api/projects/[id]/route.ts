import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { getProjectById, saveEditState } from "@/lib/db/repositories/projects";

/**
 * One project: read it, and save what the Studio did to it.
 *
 * The Studio used to show "Saved" after a 650ms timeout and write nothing
 * anywhere — every decision a person made was lost on reload, including
 * which chapters they had deleted. This is the endpoint that makes the
 * indicator tell the truth.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  const project = await getProjectById(guard.actor.workspaceId, id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });

  return NextResponse.json({ project });
}

/**
 * What the Studio is allowed to store.
 *
 * An allowlist rather than "whatever the client sent". `edit_state` is JSON
 * written straight into a column and read back by the editor on every load;
 * without this, one stray field from a future branch becomes permanent in
 * every customer's row, and a large one becomes permanent everywhere.
 */
const FLAGS = ["removeFillers", "studioSound", "captions", "music", "presenter", "zoomEnabled"] as const;

/** A chapter list longer than this is not an edit, it is a mistake. */
const MAX_SEGMENTS = 2000;

function sanitize(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const flag of FLAGS) {
    if (typeof input[flag] === "boolean") out[flag] = input[flag];
  }

  if (Array.isArray(input.deletedSegments)) {
    if (input.deletedSegments.length > MAX_SEGMENTS) return null;
    const indices = input.deletedSegments.filter(
      (n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < MAX_SEGMENTS,
    );
    out.deletedSegments = [...new Set(indices)].sort((a, b) => a - b);
  }

  return out;
}

export async function PATCH(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  let body: { edit_state?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const editState = sanitize(body.edit_state);
  if (!editState) {
    return NextResponse.json({ error: "edit_state is malformed." }, { status: 422 });
  }

  const { id } = await context.params;
  const saved = await saveEditState(guard.actor.workspaceId, id, editState);
  if (!saved) return NextResponse.json({ error: "No such project." }, { status: 404 });

  // No audit entry. An editor autosaves on every keystroke-adjacent change,
  // and an audit log that records each one buries the entries that matter.
  return NextResponse.json({ edit_state: editState });
}
