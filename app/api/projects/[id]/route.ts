import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { getProjectById, saveEditState, saveVoice } from "@/lib/db/repositories/projects";
import { recordQuietly } from "@/lib/audit/log";
import { parseStoredWordEdit } from "@/lib/edit-state";

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
/** Likewise for words cut by hand — and the ceiling on a word's index. */
const MAX_CUT_WORDS = 20_000;

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

  if (Array.isArray(input.cutWords)) {
    if (input.cutWords.length > MAX_CUT_WORDS) return null;
    const pairs = input.cutWords.filter(
      (pair): pair is [number, number] =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        Number.isInteger(pair[0]) &&
        pair[0] >= 0 &&
        pair[0] < MAX_SEGMENTS &&
        Number.isInteger(pair[1]) &&
        pair[1] >= 0 &&
        pair[1] < MAX_CUT_WORDS,
    );
    const unique = new Map(pairs.map((pair) => [`${pair[0]}:${pair[1]}`, pair]));
    out.cutWords = [...unique.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  if (Array.isArray(input.wordEdits)) {
    if (input.wordEdits.length > MAX_CUT_WORDS) return null;
    const edits = new Map<string, Record<string, unknown>>();
    for (const entry of input.wordEdits) {
      const parsed = parseStoredWordEdit(entry);
      if (!parsed || parsed.s >= MAX_SEGMENTS || parsed.w >= MAX_CUT_WORDS) continue;
      const { key, ...stored } = parsed;
      edits.set(key, stored);
    }
    out.wordEdits = [...edits.values()].sort(
      (a, b) => (a.s as number) - (b.s as number) || (a.w as number) - (b.w as number),
    );
  }

  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Two things the Studio saves here: the edit, on nearly every change, and
 * the narrating voice, when a person picks one. Either or both may be sent.
 */
export async function PATCH(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  let body: { edit_state?: unknown; voice_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const hasEdit = body.edit_state !== undefined;
  const hasVoice = body.voice_id !== undefined;
  if (!hasEdit && !hasVoice) {
    return NextResponse.json({ error: "Send edit_state, voice_id, or both." }, { status: 422 });
  }

  const editState = hasEdit ? sanitize(body.edit_state) : null;
  if (hasEdit && !editState) {
    return NextResponse.json({ error: "edit_state is malformed." }, { status: 422 });
  }
  if (hasVoice && body.voice_id !== null && !(typeof body.voice_id === "string" && UUID.test(body.voice_id))) {
    return NextResponse.json({ error: "voice_id must be a voice id or null." }, { status: 422 });
  }

  const { id } = await context.params;
  const response: Record<string, unknown> = {};

  if (editState) {
    const saved = await saveEditState(guard.actor.workspaceId, id, editState);
    if (!saved) return NextResponse.json({ error: "No such project." }, { status: 404 });
    // No audit entry. An editor autosaves on every keystroke-adjacent change,
    // and an audit log that records each one buries the entries that matter.
    response.edit_state = editState;
  }

  if (hasVoice) {
    const voiceId = body.voice_id as string | null;
    let voice: { id: string; name: string } | null = null;
    if (voiceId) {
      // A voice this workspace may actually use: the studio library, or one
      // of its own clones whose consent still stands. Anything else is
      // refused here rather than at render time, when the person who chose
      // it is no longer looking.
      const { getVoice } = await import("@/lib/db/repositories/voices");
      const found = await getVoice(voiceId);
      if (!found || (found.workspaceId !== null && found.workspaceId !== guard.actor.workspaceId)) {
        return NextResponse.json({ error: "No such voice." }, { status: 404 });
      }
      if (found.revokedAt) {
        return NextResponse.json(
          { error: `${found.name} has withdrawn consent and cannot narrate.` },
          { status: 409 },
        );
      }
      if (!found.available) {
        return NextResponse.json(
          { error: `${found.name} is no longer offered by the synthesis provider.` },
          { status: 409 },
        );
      }
      voice = { id: found.id, name: found.name };
    }
    const saved = await saveVoice(guard.actor.workspaceId, id, voiceId);
    if (!saved) return NextResponse.json({ error: "No such project." }, { status: 404 });
    // Audited, unlike the edit: replacing whose voice a video speaks with is
    // a decision somebody may need to account for later.
    await recordQuietly({
      workspaceId: guard.actor.workspaceId,
      actor: guard.actor,
      action: "project.voice.changed",
      resourceType: "project",
      resourceId: id,
      metadata: { voiceId, voiceName: voice?.name ?? null },
    });
    response.voice = voice;
  }

  return NextResponse.json(response);
}
