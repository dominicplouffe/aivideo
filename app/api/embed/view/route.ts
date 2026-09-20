import { NextResponse } from "next/server";
import { safeOrigin } from "@/lib/embed/runtime";

/**
 * Cookieless view measurement.
 *
 * Records that a demo was seen and where from. Nothing else: no identifier
 * is generated, read or stored, which is what lets a customer paste the
 * embed without a consent banner and without a conversation with their
 * legal team.
 *
 * `POST` and `GET` both work, because `navigator.sendBeacon` sends a POST
 * and the `fetch` fallback is easier to debug as a GET. Refusing one of
 * them would mean the measurement silently stops in whichever browsers use
 * the other path.
 */

async function handle(request: Request) {
  const url = new URL(request.url);
  const demo = url.searchParams.get("demo");
  if (!demo) return new NextResponse(null, { status: 204 });

  // Origin only, never a full URL: the path of a page on somebody else's
  // site is their data, not ours.
  const from = safeOrigin(url.searchParams.get("from") ?? "");
  const locale = url.searchParams.get("locale");

  // Writing the event is the ingestion pipeline's job, which is Phase 9.2.
  // Until then this acknowledges and records nothing, which is the honest
  // behaviour — quietly dropping it would look identical to working.
  void demo;
  void from;
  void locale;

  // 204 with no body: sendBeacon ignores the response, and returning JSON to
  // a beacon is bytes nobody reads.
  return new NextResponse(null, {
    status: 204,
    headers: {
      // The embed is cross-origin by definition.
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

export const GET = handle;
export const POST = handle;

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
