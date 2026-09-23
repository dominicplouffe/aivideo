import { NextResponse } from "next/server";
import { providersFor } from "@/lib/providers/for-workspace";
import { assertAiRoom, noteAiAction } from "@/lib/api/plan-gate";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { getProjectById } from "@/lib/db/repositories/projects";
import { hydrateEditState } from "@/lib/edit-state";
import { proposeCuts } from "@/lib/providers/cuts";
import { ProviderError } from "@/lib/providers/errors";
import { editDuration, optionFromProposal, spokenWordsOf, type SuggestGoal } from "@/lib/edit/suggest";

/**
 * Suggested cuts for a project: options a person previews and applies in
 * the Studio. Nothing here changes the edit.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();
  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  let body: { goal?: unknown; target_sec?: unknown; edit_state?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  let goal: SuggestGoal;
  if (body.goal === "tighten") goal = { kind: "tighten" };
  else if (body.goal === "target" && typeof body.target_sec === "number" && body.target_sec >= 5 && body.target_sec <= 3600) {
    goal = { kind: "target", targetSec: body.target_sec };
  } else {
    return NextResponse.json({ error: 'goal must be "tighten", or "target" with target_sec.' }, { status: 422 });
  }

  const capped = await assertAiRoom(guard.actor.workspaceId, "suggestion");
  if (capped) return capped;

  const { anthropic } = await providersFor(guard.actor.workspaceId);
  if (anthropic.key === null) {
    return NextResponse.json({ error: anthropic.reason }, { status: anthropic.reason.includes("Settings") ? 409 : 503 });
  }
  const key = anthropic.key;

  const { id } = await context.params;
  const project = await getProjectById(guard.actor.workspaceId, id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });
  const state = hydrateEditState(project.editState);
  const durationSec = editDuration(project, state);

  const chapters = project.segments
    .map((segment, ordinal) => {
      if (state.deletedSegments.has(ordinal)) return null;
      const spoken = spokenWordsOf(project, state, ordinal);
      // What dropping the chapter would actually save, measured the way the
      // Studio measures the edit, not the sum of its words: a narrated
      // chapter plays its footage whole.
      const without = { ...state, deletedSegments: new Set([...state.deletedSegments, ordinal]) };
      return {
        ordinal,
        title: segment.title,
        durationSec: Math.max(0, durationSec - editDuration(project, without)),
        text: spoken.map((w) => w.text).join(" "),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  if (chapters.every((c) => !c.text)) {
    return NextResponse.json({ error: "There is no speech in this project to cut." }, { status: 409 });
  }
  if (goal.kind === "target" && durationSec <= goal.targetSec) {
    return NextResponse.json({ options: [], note: "This video is already under the target.", before_sec: durationSec });
  }

  try {
    const request_ = { projectTitle: project.title, durationSec, chapters, goal };
    let proposal;
    try {
      proposal = await proposeCuts(request_, { apiKey: key });
    } catch (error) {
      // A reply that did not parse is the model's bad day, not the script's.
      // Once more before telling the person.
      if (error instanceof ProviderError && error.retryable) proposal = await proposeCuts(request_, { apiKey: key });
      else throw error;
    }
    const options = proposal.options
      .map((raw, i) => optionFromProposal(project, state, raw, goal, `${goal.kind}-${i}`))
      .filter((o): o is NonNullable<typeof o> => o !== null);
    await noteAiAction({ workspaceId: guard.actor.workspaceId, action: "suggestion", resourceId: id, key: `${id}:${Date.now()}` });
    return NextResponse.json({ options, note: proposal.note, before_sec: durationSec });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Suggestions could not be made." },
      { status: 502 },
    );
  }
}
