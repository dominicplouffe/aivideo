import { NextResponse } from "next/server";
import { providersFor } from "@/lib/providers/for-workspace";
import { assertAiRoom, noteAiAction } from "@/lib/api/plan-gate";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { getProjectById } from "@/lib/db/repositories/projects";
import {
  createAnthropicAssistant,
  offlineAssistant,
  type AssistantChapter,
} from "@/lib/providers/assistant";
import { hydrateEditState, isWordRemoved, resolveWords, type EditState } from "@/lib/edit-state";
import type { Segment } from "@/lib/app-data";

/**
 * Ask Riff about the cut.
 *
 * It answers, and sometimes proposes a change. It never makes one: the
 * response carries an edit-state patch the Studio shows behind an Accept
 * button, so a model's suggestion and a person's decision stay separate
 * events. The panel this replaced fabricated both — it reported edits it had
 * not made, from a hardcoded list of four replies.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** The words a chapter still shows under this edit: rewritten, then fillers and hand cuts removed. */
function spokenWords(segment: Pick<Segment, "words">, segIndex: number, state: EditState) {
  return resolveWords(segment, segIndex, state).filter(
    (w) => !isWordRemoved(state, segIndex, w.wordIndex, w),
  );
}

export async function POST(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.edit");
  if ("response" in guard) return guard.response;

  let body: { message?: unknown; history?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Say something first." }, { status: 422 });
  if (message.length > 2000) {
    return NextResponse.json({ error: "That message is too long." }, { status: 422 });
  }

  const { id } = await context.params;
  const project = await getProjectById(guard.actor.workspaceId, id);
  if (!project) return NextResponse.json({ error: "No such project." }, { status: 404 });
  const capped = await assertAiRoom(guard.actor.workspaceId, "riff");
  if (capped) return capped;

  const state = hydrateEditState(project.editState);

  const chapters: AssistantChapter[] = project.segments.map((segment, ordinal) => {
    const spoken = spokenWords(segment, ordinal, state);
    return {
      ordinal,
      title: segment.title,
      durationSec: spoken.reduce((n, w) => n + w.d, 0),
      text: spoken.map((w) => w.text).join(" "),
      deleted: state.deletedSegments.has(ordinal),
    };
  });

  const history = Array.isArray(body.history)
    ? (body.history as unknown[])
        .filter(
          (turn): turn is { role: "user" | "assistant"; text: string } =>
            typeof turn === "object" &&
            turn !== null &&
            ((turn as { role?: unknown }).role === "user" ||
              (turn as { role?: unknown }).role === "assistant") &&
            typeof (turn as { text?: unknown }).text === "string",
        )
        .slice(-8)
    : [];

  const { anthropic } = await providersFor(guard.actor.workspaceId);
  if (anthropic.key === null && anthropic.reason.includes("Settings")) {
    return NextResponse.json({ error: anthropic.reason }, { status: 409 });
  }
  const assistant = anthropic.key ? createAnthropicAssistant({ apiKey: anthropic.key }) : offlineAssistant;

  try {
    const reply = await assistant.respond({
      projectTitle: project.title,
      durationSec: project.durationSec,
      sourceDurationSec: project.sourceDurationSec,
      removeFillers: state.removeFillers,
      chapters,
      history,
      message,
    });

    await noteAiAction({ workspaceId: guard.actor.workspaceId, action: "riff", resourceId: id, key: `${id}:${Date.now()}` });
    return NextResponse.json({
      reply: reply.text,
      proposal: reply.proposal ?? null,
      proposal_summary: reply.proposalSummary ?? null,
      // Named, so the panel can say when there is no model behind it rather
      // than passing off arithmetic as a conversation.
      provider: assistant.name,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Riff could not answer." },
      { status: 502 },
    );
  }
}
