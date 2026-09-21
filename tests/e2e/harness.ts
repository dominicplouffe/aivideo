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
 * Every test creates its own workspace through the real signup route. None
 * of them seeds. A workspace that has just been created is precisely the
 * state that was broken, so it is the state worth testing from.
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
  return fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
}

export async function json<T = unknown>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/**
 * Creates a workspace through the signup route and returns its session.
 *
 * A fresh address every time. Signing up twice with the same one is a
 * conflict the product refuses on purpose, and a suite that reused an
 * address would be testing that refusal by accident on the second run.
 */
export async function signUp(label = "acct"): Promise<Session> {
  const id = randomUUID().slice(0, 8);
  const email = `${label}-${id}@e2e.test`;
  const name = `Test ${label} ${id}`;
  const workspace = `E2E ${id}`;

  const response = await api("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, name, workspace }),
  });
  if (response.status !== 201) {
    throw new Error(`signup failed: ${response.status} ${await response.text()}`);
  }

  const body = await json<{ workspace: { id: string }; member: { id: string } }>(response);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  if (!cookie.startsWith("demoriff_session=")) {
    throw new Error(`signup did not set a session cookie: ${setCookie}`);
  }

  return { cookie, workspaceId: body.workspace.id, memberId: body.member.id, email, name };
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
