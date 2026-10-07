import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { getExport, listExports, recordRenderedAsset, setPublished } from "@/lib/db/repositories/assets";
import type * as ResolveModule from "./resolve";

// `server-only` throws outside a bundler; resolve it to nothing, as the server build does.
const require_ = createRequire(import.meta.url);
require_.cache[require_.resolve("server-only")] = {
  id: "server-only", filename: "server-only", loaded: true, exports: {},
} as unknown as NodeJS.Module;

const RUN = isDatabaseConfigured();
const MINE = "5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5d01";
const THEIRS = "5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5d02";
const RENDERED = "5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5da1";
const UNRENDERED = "5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5da2";

let resolve: typeof ResolveModule;

describe("previewing a share page, and a project's exports", { skip: !RUN && "DATABASE_URL not set" }, () => {
  let jobId = "";

  before(async () => {
    resolve = await import("./resolve");
    for (const id of [MINE, THEIRS]) await eraseWorkspace(id, "test setup");
    const db = getDb();
    await db.insert(s.workspaces).values([
      { id: MINE, slug: "preview-mine", name: "Mine" },
      { id: THEIRS, slug: "preview-theirs", name: "Theirs" },
    ]);
    await db.insert(s.projects).values([
      { id: RENDERED, workspaceId: MINE, slug: "preview-rendered", title: "Rendered", status: "ready" },
      { id: UNRENDERED, workspaceId: MINE, slug: "preview-unrendered", title: "Unrendered", status: "ready" },
    ]);
    const [job] = await db
      .insert(s.jobs)
      .values({
        workspaceId: MINE,
        kind: "render",
        status: "completed",
        payload: {},
        result: { bytes: 2_500_000 },
        completedAt: new Date("2026-10-07T17:30:00Z"),
      })
      .returning();
    jobId = job.id;
    for (const [kind, file] of [["video", "render.mp4"], ["guide", "guide.json"]] as const) {
      await recordRenderedAsset({
        workspaceId: MINE,
        projectId: RENDERED,
        kind,
        locale: "en-US",
        storageKey: `${MINE}/renders/${jobId}/${file}`,
        publicSlug: "preview-rendered",
      });
    }
  });
  after(async () => {
    for (const id of [MINE, THEIRS]) await eraseWorkspace(id, "test teardown");
    await closeDb();
  });

  it("is a 404 to the public until published, and a preview to its own workspace", async () => {
    assert.equal(await resolve.resolveShare("preview-rendered"), null);

    const preview = await resolve.resolvePreview("preview-rendered", MINE);
    assert.equal(preview?.project.id, RENDERED);
    assert.match(preview?.videoUrl ?? "", /render\.mp4/);
    assert.equal(preview?.publishedAt, null);

    // Another workspace learns nothing, by slug or by id.
    assert.equal(await resolve.resolvePreview("preview-rendered", THEIRS), null);
    assert.equal(await resolve.resolvePreview(RENDERED, THEIRS), null);
  });

  it("previews a project with nothing rendered as exactly that", async () => {
    const preview = await resolve.resolvePreview("preview-unrendered", MINE);
    assert.equal(preview?.project.id, UNRENDERED);
    assert.equal(preview?.videoUrl, null);
  });

  it("lists a project's exports with when they were rendered, and finds them only in their workspace", async () => {
    const exports = await listExports(MINE, RENDERED);
    assert.deepEqual(
      exports.map((e) => [e.kind, e.locale, e.published, e.renderedAt, e.bytes]),
      [
        ["video", "en-US", false, "2026-10-07T17:30:00.000Z", 2_500_000],
        ["guide", "en-US", false, "2026-10-07T17:30:00.000Z", null],
      ],
    );
    assert.deepEqual(await listExports(THEIRS, RENDERED), []);

    const video = exports[0];
    assert.equal((await getExport(MINE, RENDERED, video.id))?.storageKey, `${MINE}/renders/${jobId}/render.mp4`);
    assert.equal(await getExport(THEIRS, RENDERED, video.id), null);
    assert.equal(await getExport(MINE, UNRENDERED, video.id), null);
  });

  it("publishing makes it public, and the list says so", async () => {
    await setPublished(MINE, RENDERED, true);
    assert.equal((await resolve.resolveShare("preview-rendered"))?.project.id, RENDERED);
    assert.equal((await listExports(MINE, RENDERED))[0].published, true);
  });
});
