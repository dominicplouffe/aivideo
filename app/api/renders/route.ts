import { NextResponse } from "next/server";
import { getProviders, type RenderOutput } from "@/lib/providers";
import { getProject } from "@/lib/data";
import { isDatabaseConfigured } from "@/lib/db/client";
import { authorize, ForbiddenError, type Actor } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { checkDestination, describeRefusal } from "@/lib/webhooks/destinations";
import { getRecording, mediaKeyFor } from "@/lib/db/repositories/recordings";
import { hydrateEditState } from "@/components/app/studio/types";
import { buildEdl } from "@/lib/render/edl";
import type { Project } from "@/lib/app-data";

const VALID_OUTPUTS: RenderOutput[] = ["video", "guide", "interactive", "clips"];

interface RenderPayload {
  project_id?: string;
  outputs?: string[];
  locales?: string[];
  brand_kit?: string;
  video?: { resolution?: string; fps?: number; aspects?: string[] };
  webhook_url?: string;
}

export async function POST(request: Request) {
  let body: RenderPayload;
  try {
    body = (await request.json()) as RenderPayload;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }

  // Submitting a render creates database rows, spends a workspace's quota
  // and — via webhook_url — makes this worker dial a destination somebody
  // else chose. Every sibling route resolves an actor; this one did not,
  // which made it the anonymous door into all three.
  let actor: Actor | null = null;
  if (isDatabaseConfigured()) {
    try {
      actor = await resolveActor(request);
      authorize(actor, "render.submit", { workspaceId: actor.workspaceId });
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error instanceof ForbiddenError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }
  }

  // Through the data access layer. This read used to go to the fixtures,
  // which meant a project you had actually recorded came back as "Unknown
  // project_id" while three demo rows rendered perfectly.
  const project: Project | null = body.project_id ? await getProject(body.project_id) : null;
  if (!project) {
    return NextResponse.json({ error: "Unknown project_id." }, { status: 404 });
  }

  // Refused here as well as at delivery, so a bad URL is a 422 somebody can
  // read rather than a job that quietly dead-letters an hour later.
  if (body.webhook_url) {
    const destination = await checkDestination(body.webhook_url);
    if (!destination.ok) {
      return NextResponse.json({ error: describeRefusal(destination.reason) }, { status: 422 });
    }
  }

  const outputs = (body.outputs ?? ["video"]).filter((o): o is RenderOutput =>
    VALID_OUTPUTS.includes(o as RenderOutput),
  );
  if (outputs.length === 0) {
    return NextResponse.json(
      { error: `outputs must contain at least one of: ${VALID_OUTPUTS.join(", ")}` },
      { status: 422 },
    );
  }

  // The EDL is resolved here, not in the worker, and travels with the job.
  // It is the edit as it stood when the button was pressed; a worker that
  // rebuilds it an hour later renders whatever the project has become since.
  let edl: unknown = null;
  if (actor && project.recordingId) {
    const recording = await getRecording(actor.workspaceId, project.recordingId);
    if (!recording?.mediaKey) {
      return NextResponse.json(
        { error: "That project's recording has no media to render." },
        { status: 409 },
      );
    }

    const state = hydrateEditState(project.editState);
    edl = buildEdl({
      project,
      // Not a signed URL: the worker reads storage directly. See the
      // `storage://` branch in lib/render/worker.ts.
      sourceUrl: `storage://${actor.workspaceId}/${mediaKeyFor(recording)}`,
      removeFillers: state.removeFillers,
      deletedSegments: state.deletedSegments,
      captions: state.captions,
      zoomEnabled: state.zoomEnabled,
      resolution: (body.video?.resolution as "1080p") ?? "1080p",
      fps: (body.video?.fps as 30) ?? 30,
    });
  }

  const providers = getProviders();
  const job = await providers.render.submit({
    projectId: project.id,
    title: project.title,
    outputs,
    locales: body.locales ?? ["en-US"],
    brandKitId: body.brand_kit ?? "kit_meridian_primary",
    video: body.video as never,
    webhookUrl: body.webhook_url,
    idempotencyKey: request.headers.get("Idempotency-Key") ?? undefined,
    workspaceId: actor?.workspaceId,
    edl,
  });

  return NextResponse.json(
    {
      id: job.id,
      status: job.status,
      // Only finished video minutes are metered. Guides, tours, clips and
      // every localized variant are free by design.
      minutes_billed: job.minutesBilled,
      outputs: job.outputs,
      provider: providers.render.name,
    },
    { status: 202 },
  );
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query parameter is required." }, { status: 400 });

  try {
    const job = await getProviders().render.get(id);
    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      minutes_billed: job.minutesBilled,
      outputs: job.outputs,
    });
  } catch {
    return NextResponse.json({ error: "Unknown render job." }, { status: 404 });
  }
}
