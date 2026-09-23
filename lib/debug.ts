/**
 * Debug mode: features that exist in the code but are not ready to be
 * shown. Toggled with ⌘/ (Ctrl+/ elsewhere) anywhere in the app, held in a
 * cookie so server pages, API routes and the client all agree on it.
 *
 * Currently behind it: the Riff Agent, which works in parts but needs a
 * proper design pass before anybody relies on it.
 */
export const DEBUG_COOKIE = "demoriff_debug";

/** From a request's Cookie header: for API routes and the proxy. */
export function debugFromCookieHeader(header: string | null): boolean {
  return (header ?? "").split(";").some((part) => part.trim() === `${DEBUG_COOKIE}=1`);
}

/** For server components. */
export async function debugEnabled(): Promise<boolean> {
  const { cookies } = await import("next/headers");
  return (await cookies()).get(DEBUG_COOKIE)?.value === "1";
}
