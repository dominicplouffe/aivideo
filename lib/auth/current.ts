import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Actor } from "./authorize";
import { cookieName } from "./cookies";
import { verify } from "./sessions";

/**
 * Who is making this request, for server components.
 *
 * Wrapped in React's `cache`, so a page, its layout and every data read
 * inside one render share a single session lookup rather than each making
 * their own. The framework's own guidance is to read the session back from a
 * cached helper instead of passing it down the tree: a value threaded
 * through props is a value that eventually gets handed to a client
 * component by accident.
 *
 * Route handlers use `resolveActor(request)` instead — they have a `Request`
 * and no render pass to cache against. Both resolve the same session the
 * same way.
 */

export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const { isDatabaseConfigured } = await import("@/lib/db/client");
  // Without a database there are no members to be, and the app runs on
  // fixtures. Returning null rather than throwing keeps that mode working.
  if (!isDatabaseConfigured()) return null;

  let token: string | null = null;
  try {
    const store = await cookies();
    token = store.get(cookieName())?.value ?? null;
  } catch {
    // Called outside a request — a script, a worker, a test. There is no
    // session to read, and "nobody" is the safe answer: every check
    // downstream denies, rather than throwing an exception about a React
    // cache that says nothing about what actually went wrong.
    return null;
  }

  const verdict = await verify(token);
  return verdict.ok ? verdict.actor : null;
});

/** True when this deployment expects people to be signed in. */
export async function authRequired(): Promise<boolean> {
  const { isDatabaseConfigured } = await import("@/lib/db/client");
  return isDatabaseConfigured();
}
