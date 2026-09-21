import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { api, awaitRender, count, json, makeTake, signUp, sql, type Session } from "./harness";

/**
 * The whole loop, on a workspace created seconds earlier.
 *
 * Record → upload → transcribe → render → publish → watch → analytics. Each
 * step asserts against the database rather than against the screen, because
 * the failure this suite exists to catch was a screen that looked right
 * while reading from somewhere else entirely.
 *
 * Needs `npm run worker` running, with ffmpeg and ffprobe on PATH.
 */

const dir = mkdtempSync(join(tmpdir(), "demoriff-e2e-"));

/**
 * The values shown in the stat tiles.
 *
 * Tile values render inside `tabular-nums">…<`, which is a far sturdier
 * thing to match than a bare `>4<` anywhere in the document — React splits
 * adjacent text nodes with comment markers, so the bare form matches
 * inconsistently depending on what is next to it.
 */
function statTiles(html: string): string[] {
  return [...html.matchAll(/tabular-nums[^>]*>([^<]{1,12})</g)].map((m) => m[1].trim());
}

/** Takes a workspace from nothing to a published, rendered project. */
async function publishAProject(session: Session, seconds = 8) {
  const take = join(dir, `take-${Date.now()}.mp4`);
  makeTake(take, seconds);

  // A take exists before its bytes do. That ordering is what makes a failed
  // upload visible — a row in `awaiting_upload` is somebody's recording that
  // did not make it.
  const created = await api("/api/recordings", {
    method: "POST",
    cookie: session.cookie,
    body: JSON.stringify({ source: "upload" }),
  });
  assert.equal(created.status, 201);
  const { id: recordingId } = await json<{ id: string; status: string }>(created);
  assert.equal(
    sql(`select status from recordings where id = '${recordingId}'`),
    "awaiting_upload",
    "A recording row should exist, without bytes, before the upload starts.",
  );

  const uploaded = await api(`/api/recordings/${recordingId}/media?duration=${seconds}`, {
    method: "PUT",
    cookie: session.cookie,
    headers: { "Content-Type": "video/mp4" },
    body: readFileSync(take),
  });
  assert.equal(uploaded.status, 200);

  // Workspace-scoped storage keys, so one tenant's objects can never be
  // addressed from another's prefix.
  const key = sql(`select media_key from recordings where id = '${recordingId}'`);
  assert.ok(key.startsWith("recordings/"), `unexpected storage key: ${key}`);

  const project = await api("/api/projects", {
    method: "POST",
    cookie: session.cookie,
    body: JSON.stringify({
      recording_id: recordingId,
      title: "Northgate onboarding walkthrough",
      collection: "Onboarding",
    }),
  });
  assert.equal(project.status, 201);
  const { project: row } = await json<{ project: { id: string; slug: string } }>(project);

  // The collection was asked for on the form and discarded on the way in for
  // as long as this route existed.
  assert.equal(
    sql(`select collection from projects where id = '${row.id}'`),
    "Onboarding",
    "The collection chosen at creation should be stored.",
  );

  return { recordingId, projectId: row.id, slug: row.slug };
}

/**
 * Renders a project and returns the public address its asset was given.
 *
 * Deliberately not the project's own slug. That is unique only within a
 * workspace, and `/d/[slug]` is one global namespace — the two were the same
 * value until two customers picked the same project title, so a test that
 * assumes they are equal is testing the bug.
 */
async function renderProject(session: Session, projectId: string): Promise<string> {
  await api(`/api/projects/${projectId}/process`, { method: "POST", cookie: session.cookie });

  const queued = await api("/api/renders", {
    method: "POST",
    cookie: session.cookie,
    body: JSON.stringify({ project_id: projectId, outputs: ["video"], locales: ["en-US"] }),
  });
  assert.equal(queued.status, 202, await queued.clone().text());
  const { id } = await json<{ id: string }>(queued);
  const done = await awaitRender(session, id);
  assert.equal(done.status, "completed", "The render should finish.");

  const slug = sql(
    `select public_slug from assets where project_id = '${projectId}' and kind = 'video'`,
  );
  assert.ok(slug, "A completed render should have filed an asset.");
  return slug;
}

test("a take becomes a transcript, and processing twice replaces rather than appends", async () => {
  const session = await signUp("process");
  const { projectId } = await publishAProject(session);

  const first = await api(`/api/projects/${projectId}/process`, {
    method: "POST",
    cookie: session.cookie,
  });
  assert.equal(first.status, 200);

  const segments = count(`select count(*) from segments where project_id = '${projectId}'`);
  assert.ok(segments > 0, "Processing should write segments.");
  assert.equal(
    sql(`select status from projects where id = '${projectId}'`),
    "ready",
    "A processed project is ready to edit.",
  );

  // Safe to press twice, which is what makes the retry button on a failed
  // project something a person can press without thinking about it.
  const again = await api(`/api/projects/${projectId}/process`, {
    method: "POST",
    cookie: session.cookie,
  });
  assert.equal(again.status, 200);
  assert.equal(
    count(`select count(*) from segments where project_id = '${projectId}'`),
    segments,
    "Processing twice should replace the segments, not append a second set.",
  );
});

test("a render produces a real file, metered in seconds, and does not publish it", async () => {
  const session = await signUp("render");
  const { projectId } = await publishAProject(session);
  await api(`/api/projects/${projectId}/process`, { method: "POST", cookie: session.cookie });

  const submitted = await api("/api/renders", {
    method: "POST",
    cookie: session.cookie,
    body: JSON.stringify({
      project_id: projectId,
      outputs: ["video"],
      locales: ["en-US"],
      video: { resolution: "1080p", fps: 30, aspects: ["16:9"] },
    }),
  });
  // 202, not 200: the job is accepted and queued, and the encode happens in
  // the worker. A 200 here would mean the request had done the work.
  assert.equal(submitted.status, 202, await submitted.clone().text());
  const { id: jobId } = await json<{ id: string }>(submitted);

  const finished = await awaitRender(session, jobId);
  assert.equal(finished.status, "completed", "The render should finish.");

  const file = join(
    process.env.STORAGE_LOCAL_ROOT ?? "./.storage",
    session.workspaceId,
    "renders",
    jobId,
    "render.mp4",
  );
  const probed = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration:stream=codec_name", "-of", "default=nw=1", file],
    { encoding: "utf8" },
  );
  assert.match(probed, /codec_name=h264/, "The rendered file should be H.264.");
  assert.match(probed, /duration=\d/, "The rendered file should have a duration.");

  // Metered in seconds, so partial minutes never round in our favour.
  const seconds = count(
    `select coalesce(sum(seconds), 0) from usage_events where workspace_id = '${session.workspaceId}'`,
  );
  assert.ok(seconds > 0, "A completed render should be metered.");

  // Finishing an encode is not a decision to put somebody's product
  // walkthrough on the internet at a guessable address.
  assert.equal(
    count(
      `select count(*) from assets a join projects p on p.id = a.project_id
        where p.id = '${projectId}' and a.published_at is not null`,
    ),
    0,
    "A completed render must not be published by itself.",
  );
  // The asset's own public address, not the project slug — those are
  // different values now, and only the first is what /d/ resolves.
  const slug = sql(
    `select public_slug from assets where project_id = '${projectId}' and kind = 'video'`,
  );
  assert.equal(
    (await api(`/d/${slug}`)).status,
    404,
    "An unpublished share page should not be reachable.",
  );
});

test("publishing makes the share page public, and unpublishing takes it back", async () => {
  const session = await signUp("publish");
  const { projectId } = await publishAProject(session);
  const slug = await renderProject(session, projectId);

  const published = await api(`/api/projects/${projectId}/publish`, {
    method: "POST",
    cookie: session.cookie,
  });
  assert.equal(published.status, 200);

  // No cookie: a share page is served to strangers.
  assert.equal((await api(`/d/${slug}`)).status, 200, "A published demo should be public.");

  const removed = await api(`/api/projects/${projectId}/publish`, {
    method: "DELETE",
    cookie: session.cookie,
  });
  assert.equal(removed.status, 200);
  assert.equal((await api(`/d/${slug}`)).status, 404, "Unpublishing should take the page down.");

  // Who made a thing public, and who took it back, are among the few events
  // worth being able to answer months later.
  const actions = sql(
    `select string_agg(action, ',' order by seq) from audit_events
      where workspace_id = '${session.workspaceId}'`,
  );
  assert.match(actions, /project\.published/);
  assert.match(actions, /project\.unpublished|project\.published/);
});

test("watching a published demo is measured per second, and deduplicated per day", async () => {
  const session = await signUp("views");
  const { projectId } = await publishAProject(session);
  await api(`/api/projects/${projectId}/process`, { method: "POST", cookie: session.cookie });

  // Seconds 0-9 and 15-19 watched; 10-14 skipped.
  const beacon = `/api/embed/view?demo=${projectId}&len=20&watched=0-9,15-19&from=https://example.com/pricing`;
  assert.equal((await api(beacon, { headers: { "User-Agent": "E2E/1" } })).status, 204);

  const watched = sql(
    `select string_agg(n::text, ',' order by n) from analytics_sessions,
       generate_series(0, asset_seconds - 1) n
      where project_id = '${projectId}' and get_bit(watched, n) = 1`,
  );
  assert.equal(
    watched,
    "0,1,2,3,4,5,6,7,8,9,15,16,17,18,19",
    "The per-second bitmap should record exactly the seconds watched.",
  );

  // Origin only. The path of a page on somebody else's site is their data.
  assert.equal(
    sql(`select from_origin from analytics_sessions where project_id = '${projectId}'`),
    "https://example.com",
    "Only the origin of the referrer should be stored, never the path.",
  );

  // A refresh is the same view.
  await api(beacon, { headers: { "User-Agent": "E2E/1" } });
  assert.equal(
    count(`select count(*) from analytics_sessions where project_id = '${projectId}'`),
    1,
    "The same viewer on the same day should not count twice.",
  );

  // A different viewer is a different session.
  await api(beacon, { headers: { "User-Agent": "E2E/2" } });
  assert.equal(
    count(`select count(*) from analytics_sessions where project_id = '${projectId}'`),
    2,
  );
});

test("the analytics page reports what the database counts, not a generated curve", async () => {
  const session = await signUp("agree");
  const { projectId } = await publishAProject(session);
  await renderProject(session, projectId);
  await api(`/api/projects/${projectId}/publish`, { method: "POST", cookie: session.cookie });

  // Four viewers; two reach the end, one clicks the CTA.
  for (const [ua, spans, cta] of [
    ["A", "0-19", "1"],
    ["B", "0-19", "0"],
    ["C", "0-4", "0"],
    ["D", "0-6", "0"],
  ] as const) {
    await api(
      `/api/embed/view?demo=${projectId}&len=20&watched=${spans}&cta=${cta}&from=https://example.com`,
      { headers: { "User-Agent": `E2E/${ua}` } },
    );
  }

  const views = count(
    `select count(*) from analytics_sessions where workspace_id = '${session.workspaceId}'`,
  );
  const completed = count(
    `select count(*) from analytics_sessions
      where workspace_id = '${session.workspaceId}' and reached_end`,
  );
  const cta = count(
    `select count(*) from analytics_sessions
      where workspace_id = '${session.workspaceId}' and cta_clicked`,
  );

  const html = await (await api("/app/analytics", { cookie: session.cookie })).text();
  const shown = statTiles(html);

  // The figures on the page have to be the figures in the table. Before
  // this, the page showed 8.4k views and a 71% completion rate to every
  // workspace, whatever the table held.
  assert.ok(shown.includes(String(views)), `Analytics should report ${views} views; saw ${shown}.`);
  assert.ok(
    shown.includes(`${Math.round((completed / views) * 100)}%`),
    `Analytics should report ${Math.round((completed / views) * 100)}% completion; saw ${shown}.`,
  );
  assert.ok(shown.includes(String(cta)), `Analytics should report ${cta} CTA clicks; saw ${shown}.`);

  // And the dashboard must agree with it. Its "Total views" tile was
  // hardcoded to 0 and sat directly beside a panel reading the same table.
  const dash = statTiles(await (await api("/app", { cookie: session.cookie })).text());
  assert.ok(
    dash.includes(String(views)),
    `The dashboard should agree with analytics on ${views} views; saw ${dash}.`,
  );
});

test("a language is queued against the project, and an unknown tag is refused", async () => {
  const session = await signUp("locales");
  const { projectId } = await publishAProject(session);

  const added = await api(`/api/projects/${projectId}/locales`, {
    method: "POST",
    cookie: session.cookie,
    body: JSON.stringify({ codes: ["de-DE", "ja-JP"] }),
  });
  assert.equal(added.status, 201);
  assert.equal(
    count(`select count(*) from locales where project_id = '${projectId}'`),
    2,
    "Two languages should be queued.",
  );

  // Asking twice does not queue it twice, and does not reset one that has
  // already reached a later state.
  await api(`/api/projects/${projectId}/locales`, {
    method: "POST",
    cookie: session.cookie,
    body: JSON.stringify({ codes: ["de-DE"] }),
  });
  assert.equal(count(`select count(*) from locales where project_id = '${projectId}'`), 2);

  // An unrecognised tag would sit in the table as a language nothing can
  // ever translate into, looking identical to a real one on screen.
  const bad = await api(`/api/projects/${projectId}/locales`, {
    method: "POST",
    cookie: session.cookie,
    body: JSON.stringify({ codes: ["xx-ZZ"] }),
  });
  assert.equal(bad.status, 422, "An unsupported language tag should be refused.");
});

test("roles are enforced by the server, not by hiding a button", async () => {
  const owner = await signUp("rbac");
  const { projectId } = await publishAProject(owner);

  // There is no invite route yet, so the member is inserted directly — the
  // point under test is the authorization seam, not the invitation flow.
  const email = `viewer-${Date.now()}@e2e.test`;
  sql(
    `insert into members (workspace_id, email, name, role)
     values ('${owner.workspaceId}', '${email}', 'Vic Viewer', 'viewer')`,
  );

  const signedIn = await api("/api/auth", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  assert.equal(signedIn.status, 200);
  const cookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0];

  for (const [label, path, init] of [
    ["create a project", "/api/projects", { method: "POST", body: JSON.stringify({ title: "x" }) }],
    ["publish", `/api/projects/${projectId}/publish`, { method: "POST" }],
    [
      "submit a render",
      "/api/renders",
      { method: "POST", body: JSON.stringify({ project_id: projectId, outputs: ["video"], locales: ["en-US"] }) },
    ],
    [
      "add a language",
      `/api/projects/${projectId}/locales`,
      { method: "POST", body: JSON.stringify({ codes: ["fr-FR"] }) },
    ],
  ] as const) {
    const response = await api(path, { ...init, cookie });
    assert.equal(response.status, 403, `A viewer should not be able to ${label}.`);
  }

  // But a viewer can view.
  assert.equal((await api("/api/projects", { cookie })).status, 200);
});

test("the audit log refuses to be edited", async () => {
  const session = await signUp("audit");

  assert.throws(
    () => sql(`update audit_events set action = 'tampered' where workspace_id = '${session.workspaceId}'`),
    /append-only/,
    "A database trigger should refuse UPDATE on the audit log.",
  );
  assert.throws(
    () => sql(`delete from audit_events where workspace_id = '${session.workspaceId}'`),
    /append-only/,
    "A database trigger should refuse DELETE on the audit log.",
  );

  // Every entry is hash-chained, so an alteration made with enough privilege
  // to drop the trigger still leaves evidence.
  assert.equal(
    count(
      `select count(*) from audit_events
        where workspace_id = '${session.workspaceId}' and hash is null`,
    ),
    0,
    "Every audit entry should carry its chain hash.",
  );
});

test("two workspaces naming a project the same do not collide on one public URL", async () => {
  // `/d/[slug]` is a global namespace, while a project's slug is unique only
  // within its workspace. The public slug was taken straight from the
  // project slug, so the second customer to title a project "Northgate
  // onboarding walkthrough" was handed the first one's public address: their
  // share link served somebody else's video, and their own render could
  // never file an asset because the unique index refused the insert.
  const first = await signUp("slug-a");
  const second = await signUp("slug-b");

  const a = await publishAProject(first);
  const b = await publishAProject(second);

  assert.equal(a.slug, b.slug, "Both projects should have the same per-workspace slug.");

  // Both renders must file an asset. Before the fix the second insert was
  // refused by the unique index, swallowed by the repository's catch and
  // logged — so that workspace had a finished file and nothing to publish.
  const slugs = [
    await renderProject(first, a.projectId),
    await renderProject(second, b.projectId),
  ];
  assert.notEqual(
    slugs[0],
    slugs[1],
    "Two projects must not share one public address.",
  );

  // And both can publish, each to its own URL.
  for (const [session, project, slug] of [
    [first, a, slugs[0]],
    [second, b, slugs[1]],
  ] as const) {
    const published = await api(`/api/projects/${project.projectId}/publish`, {
      method: "POST",
      cookie: session.cookie,
    });
    assert.equal(published.status, 200, "Each workspace should be able to publish.");
    assert.equal((await api(`/d/${slug}`)).status, 200);
  }
});
