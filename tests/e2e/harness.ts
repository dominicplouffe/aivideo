/**
 * Shared machinery for the end-to-end suite.
 *
 * These tests drive a running server over HTTP and check the database
 * directly, because the bug they exist to prevent was invisible from either
 * side alone: the pages rendered beautifully and the tables were correct;
 * what was wrong was that the pages were not reading the tables. A test that
 * only asserted "the dashboard shows a number" would have passed against the
 * fixture that started all this.
 *
 * Every test creates its own workspace by signing in for the first time,
 * through the real routes. None of them seeds. A workspace that has just
 * been created is precisely the state that was broken, so it is the state
 * worth testing from.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** The origin header the app's CSRF guard expects on writes. */
const ORIGIN = { Origin: BASE };

export interface Session {
  cookie: string;
  workspaceId: string;
  memberId: string;
  email: string;
  name: string;
}

/** One SQL query, as the postgres superuser, returning raw rows. */
export function sql(query: string): string {
  const url = process.env.DATABASE_URL ?? "";
  return execFileSync("psql", [url, "-tAc", query], { encoding: "utf8" }).trim();
}

/** A count, which is what most assertions here actually want. */
export function count(query: string): number {
  return Number(sql(query) || 0);
}

export async function api(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    ...ORIGIN,
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.cookie) headers.Cookie = init.cookie;
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const started = Date.now();
  try {
    return await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  } catch (cause) {
    // A request that never reaches the server throws `TypeError: fetch
    // failed` and names neither the route nor the reason. That is how a
    // ten-second connect timeout once surfaced as an unexplained failure in
    // a test about transcripts, with nothing in the server log to match it
    // against — because nothing had arrived. Say what was asked for, how
    // long it waited, and what the socket did.
    const code = (cause as { cause?: { code?: string } }).cause?.code ?? (cause as Error).name;
    const waited = Date.now() - started;
    const hint =
      code === "UND_ERR_CONNECT_TIMEOUT"
        ? "The server never accepted the connection, so it never saw this request. " +
          "That means it was saturated, not that it answered wrongly."
        : "Is the server still running?";
    throw new Error(
      `${init.method ?? "GET"} ${path} never completed: ${code} after ${waited}ms. ${hint}`,
      { cause },
    );
  }
}

export async function json<T = unknown>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/**
 * Creates a workspace by signing in, and returns the session.
 *
 * This drives the real AuthKit flow rather than a test-only door: the
 * authorize route, the signed state, the nonce cookie, the callback and
 * provisioning all run exactly as they do for a person. The development
 * identity provider stands in for WorkOS, which is the one substitution —
 * `POST /api/auth/signup` used to exist for this and is gone, because a
 * second account-creating door that takes an unverified address is the thing
 * the whole change was about removing.
 *
 * A fresh address every time. Two runs sharing one would be signing the
 * second one *in* rather than up, and testing the wrong branch by accident.
 */
export async function signUp(label = "acct", method = "google"): Promise<Session> {
  const id = randomUUID().slice(0, 8);
  const email = `${label}-${id}@e2e.test`;

  const start = await api(`/api/auth/authkit?method=${method}&email=${encodeURIComponent(email)}`);
  if (start.status !== 302) {
    throw new Error(`authorize failed: ${start.status} ${await start.text()}`);
  }

  // The mock provider hands the browser straight back to our own callback,
  // so following the redirect is following it into the flow rather than out
  // to a vendor.
  const to = start.headers.get("location");
  const nonce = (start.headers.get("set-cookie") ?? "").split(";")[0];
  if (!to || !nonce.startsWith("demoriff_sso=")) {
    throw new Error(`authorize did not start a flow: ${to} / ${nonce}`);
  }

  const back = await api(new URL(to).pathname + new URL(to).search, { cookie: nonce });
  if (back.status !== 302) {
    throw new Error(`callback failed: ${back.status} ${await back.text()}`);
  }

  const cookie = (back.headers.getSetCookie?.() ?? [])
    .map((value) => value.split(";")[0])
    .find((value) => value.startsWith("demoriff_session="));
  if (!cookie) {
    const where = back.headers.get("location") ?? "";
    throw new Error(`callback set no session cookie; it redirected to ${where}`);
  }

  const memberId = sql(`select id from members where email = '${email}' limit 1`);
  const workspaceId = sql(`select workspace_id from members where email = '${email}' limit 1`);
  if (!memberId || !workspaceId) throw new Error(`no member row for ${email}`);

  const name = sql(`select name from members where email = '${email}' limit 1`);
  return { cookie, workspaceId, memberId, email, name };
}

/** Polls a render job to a terminal state, or throws with what it last saw. */
export async function awaitRender(
  session: Session,
  jobId: string,
  timeoutMs = 90_000,
): Promise<{ status: string; outputs?: Record<string, { key?: string; url?: string }> }> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const body = await json<{ status: string; outputs?: Record<string, { key?: string }> }>(
      await api(`/api/renders?id=${jobId}`, { cookie: session.cookie }),
    );
    last = body.status;
    if (body.status === "completed" || body.status === "failed") return body;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `render ${jobId} did not finish within ${timeoutMs}ms (last status: ${last}). ` +
      "Is `npm run worker` running, and are ffmpeg and ffprobe on PATH?",
  );
}

/** A small valid MP4, so the pipeline has real bytes to work on. */
export function makeTake(path: string, seconds = 8): void {
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", `testsrc=size=1280x720:rate=30:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
    path,
  ]);
}

/** The strings that exist only in the seeded workspace. */
export const FIXTURE_STRINGS = [
  "Meridian",
  "Renata",
  "Daniel Okafor",
  "Jonas Weber",
  "cardinal.com",
  "northwind.io",
  "halcyon.security",
  "Pricing page embed",
  "Direct share link",
  "Rate shopping",
  "Meridian Dark",
];

/** Every page inside the signed-in workspace. */
export const APP_PAGES = [
  "/app",
  "/app/projects",
  "/app/analytics",
  "/app/localization",
  "/app/team",
  "/app/billing",
  "/app/brand",
  "/app/voices",
  "/app/guides",
  "/app/demos",
  "/app/agent",
  "/app/settings",
  "/app/new",
];
