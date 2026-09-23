import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { authorize, ForbiddenError } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import { normaliseList, withinAllowlist } from "@/lib/agent/allowlist";
import { getPlanner } from "@/lib/agent/outline";
import { providersFor } from "@/lib/providers/for-workspace";
import { assertFeature } from "@/lib/api/plan-gate";

/**
 * Plans steps from a brief, and saves nothing.
 *
 * The editor shows the steps before any run exists or changes, so a person
 * reads and fixes the plan first. What is saved later is checked again on
 * the server; this only proposes.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "The agent requires a database." }, { status: 503 });
  let body: { brief?: unknown; allowed_origins?: unknown; entry_url?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
  try {
    const actor = await resolveActor(request);
    authorize(actor, "agent.run", { workspaceId: actor.workspaceId });
    const outside = await assertFeature(actor.workspaceId, "agent", "The Riff Agent");
    if (outside) return outside;

    const brief = typeof body.brief === "string" ? body.brief.trim() : "";
    if (brief.length < 10) return NextResponse.json({ error: "Say what to demonstrate, in a sentence or two." }, { status: 422 });
    const origins = normaliseList(Array.isArray(body.allowed_origins) ? (body.allowed_origins as string[]) : []);
    if (origins.length === 0) return NextResponse.json({ error: "Name at least one site the agent may go to." }, { status: 422 });
    const entryUrl = typeof body.entry_url === "string" && body.entry_url.trim() ? body.entry_url.trim() : undefined;
    if (entryUrl && !withinAllowlist(entryUrl, origins).ok) {
      return NextResponse.json({ error: "The start page has to be on one of the sites." }, { status: 422 });
    }
    const plan = await getPlanner((await providersFor(actor.workspaceId)).anthropic.key).plan({ brief, allowedOrigins: origins, entryUrl });
    return NextResponse.json({ outline: plan.outline, removed: plan.removed });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "The steps could not be planned." }, { status: 502 });
  }
}
