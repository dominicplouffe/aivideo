import { NextResponse } from "next/server";
import { requireActor } from "@/lib/api/guard";
import { providerReport } from "@/lib/providers";

/**
 * Which capabilities are real here, and what is missing where they are not.
 *
 * This exists because the honest answer to "why is my transcript wrong" was
 * previously unavailable anywhere in the product. The mock providers are a
 * good thing — they make the whole app explorable from a fresh clone — but
 * only if the app admits when it is using them.
 *
 * Authenticated: the list of environment variables a deployment has not set
 * is a small map of it, and not something to hand to anyone who asks.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;

  const report = providerReport();
  return NextResponse.json({
    capabilities: report,
    all_live: report.length > 0 && report.every((entry) => entry.live),
  });
}
