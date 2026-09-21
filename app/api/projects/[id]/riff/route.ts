import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { getProjectById } from "@/lib/db/repositories/projects";
import {
  createAnthropicAssistant,
  offlineAssistant,
  type AssistantChapter,
} from "@/lib/providers/assistant";
import { hydrateEditState, isWordRemoved, type EditState } from "@/components/app/studio/types";
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

/** The words a chapter still speaks under this edit: fillers and hand cuts removed. */
function spokenWords(words: Segment["words"], segIndex: number, state: EditState) {
  return words.filter((w, wordIndex) => !isWordRemoved(state, segIndex, wordIndex, w));
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

  const state = hydrateEditState(project.editState);

  const chapters: AssistantChapter[] = project.segments.map((segment, ordinal) => {
    const spoken = spokenWords(segment.words, ordinal, state);
    return {
      ordinal,
      title: segment.title,
      durationSec: spoken.reduce((n, w) => n + w.d, 0),
      text: spoken.map((w) => w.w).join(" "),
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

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  const assistant = key ? createAnthropicAssistant({ apiKey: key }) : offlineAssistant;

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
