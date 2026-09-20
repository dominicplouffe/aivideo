import { NextResponse } from "next/server";
import { getProviders, type RenderOutput } from "@/lib/providers";
import { getProject } from "@/lib/app-data";

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

  if (!body.project_id || !getProject(body.project_id)) {
    return NextResponse.json({ error: "Unknown project_id." }, { status: 404 });
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

  const providers = getProviders();
  const job = await providers.render.submit({
    projectId: body.project_id,
    outputs,
    locales: body.locales ?? ["en-US"],
    brandKitId: body.brand_kit ?? "kit_meridian_primary",
    video: body.video as never,
    webhookUrl: body.webhook_url,
    idempotencyKey: request.headers.get("Idempotency-Key") ?? undefined,
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
