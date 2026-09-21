import { NextResponse } from "next/server";
import { authorize, ForbiddenError, type Actor } from "@/lib/auth/authorize";
import { resolveActor, UnauthenticatedError } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/roles";

/**
 * The shape every authenticated route repeats.
 *
 * Extracted after writing it for the eighth time. The repetition was not the
 * problem — the risk is that the ninth copy is subtly different, and an
 * authorization check that differs between routes is one that is wrong in at
 * least one of them.
 */
export async function requireActor(
  request: Request,
  permission: Permission,
): Promise<{ actor: Actor } | { response: NextResponse }> {
  try {
    const actor = await resolveActor(request);
    authorize(actor, permission, { workspaceId: actor.workspaceId });
    return { actor };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { response: NextResponse.json({ error: error.message }, { status: 401 }) };
    }
    if (error instanceof ForbiddenError) {
      return { response: NextResponse.json({ error: error.message }, { status: 403 }) };
    }
    throw error;
  }
}

/** One message, so every route tells somebody the same three commands. */
export function needsDatabase(): NextResponse {
  return NextResponse.json(
    {
      error:
        "This needs a database. Set DATABASE_URL in .env.local, run `npm run db:migrate` " +
        "and `npm run db:seed`, then restart the dev server.",
    },
    { status: 503 },
  );
}
