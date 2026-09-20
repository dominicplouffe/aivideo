import { NextResponse } from "next/server";
import { authenticateScim, type ScimPrincipal } from "./tokens";
import { ERROR_SCHEMA, ScimError } from "./users";

/**
 * The shape every SCIM response shares.
 *
 * SCIM insists on `application/scim+json` and on its own error envelope.
 * Directories do check: Entra treats a bare JSON error as a transport
 * failure and retries it forever, which turns one bad request into a loop
 * nobody notices until the logs are large.
 */

export const SCIM_CONTENT_TYPE = "application/scim+json; charset=utf-8";

export function scimJson(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Content-Type", SCIM_CONTENT_TYPE);
  // Directory responses describe people. Nothing caches them.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function scimError(status: number, detail: string, scimType?: string): NextResponse {
  return scimJson(
    { schemas: [ERROR_SCHEMA], status: String(status), detail, ...(scimType ? { scimType } : {}) },
    status,
  );
}

/**
 * Authenticates, runs the handler, and turns a thrown `ScimError` into the
 * envelope a directory expects.
 *
 * The `WWW-Authenticate` header on a 401 is not decoration: it is what tells
 * an identity provider that its token was rejected rather than its request
 * malformed, which is the difference between an admin seeing "reconnect" and
 * seeing nothing at all.
 */
export async function withScim(
  request: Request,
  handler: (principal: ScimPrincipal, baseUrl: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  const principal = await authenticateScim(request);
  if (!principal) {
    const response = scimError(401, "A valid SCIM bearer token is required.");
    response.headers.set("WWW-Authenticate", 'Bearer realm="scim"');
    return response;
  }

  try {
    return await handler(principal, baseUrl(request));
  } catch (error) {
    if (error instanceof ScimError) {
      return scimError(error.status, error.message, error.scimType);
    }
    // Never the message. A directory's logs are read by its administrator,
    // who is not necessarily somebody entitled to our stack traces.
    console.error("[scim] request failed:", error);
    return scimError(500, "The request could not be completed.");
  }
}

export function baseUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const origin = configured ?? new URL(request.url).origin;
  return new URL("/api/scim/v2", origin).toString().replace(/\/$/, "");
}

/** Bodies are small; a directory sending a large one is not a directory. */
export async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (text.length > 256 * 1024) {
    throw new ScimError(413, "That request body is larger than any directory sends.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ScimError(400, "Body must be valid JSON.", "invalidSyntax");
  }
}
