import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { copyTitle, createProject, duplicateProject, getProjectById, replaceSegments } from "./projects";

/**
 * A copy exists so somebody can try a different cut without risking the one
 * they have. So the tests are about two things: the copy carries everything
 * the original has, and the original notices nothing.
 */

const RUN = isDatabaseConfigured();
const WS = "66666666-6666-4666-8666-666666666666";
const MEMBER = "66666666-6666-4666-8666-666666666667";

describe("copyTitle", () => {
  it("adds (copy), then counts", () => {
    assert.equal(copyTitle("Launch demo"), "Launch demo (copy)");
    assert.equal(copyTitle("Launch demo (copy)"), "Launch demo (copy 2)");
    assert.equal(copyTitle("Launch demo (copy 2)"), "Launch demo (copy 3)");
  });
  it("keeps the whole title within the length the create route allows", () => {
    assert.ok(copyTitle("x".repeat(140)).length <= 140);
    assert.ok(copyTitle("x".repeat(140)).endsWith(" (copy)"));
  });
});

describe("duplicateProject", { skip: !RUN && "DATABASE_URL not set" }, () => {
  before(async () => {
    const db = getDb();
    await eraseWorkspace(WS, "test setup");
    await db.insert(s.workspaces).values({ id: WS, slug: "copy-test", name: "Copy Test" });
    await db.insert(s.members).values({ id: MEMBER, workspaceId: WS, name: "Dana", email: "d@example.com", role: "creator" });
  });
  after(async () => {
    await eraseWorkspace(WS, "test teardown");
    await closeDb();
  });

  it("copies chapters, edit and voice under a new name, and leaves the original alone", async () => {
    const db = getDb();
    const [recording] = await db.insert(s.recordings).values({
      workspaceId: WS, source: "upload", status: "ready", mediaKey: `${WS}/take.webm`, durationSec: 30,
    }).returning();
    const original = await createProject({
      workspaceId: WS, recordingId: recording.id, ownerId: MEMBER, title: "Launch demo", collection: "Onboarding",
    });
    await replaceSegments(original.id, [
      { ordinal: 0, title: "Hello", startSec: 0, endSec: 10, action: null,
        words: [{ w: "Hello", t: 0, d: 0.5 }, { w: "there", t: 0.6, d: 0.4 }] },
      { ordinal: 1, title: "Next", startSec: 10, endSec: 30, action: "click → #go", words: [{ w: "Next", t: 10, d: 0.5 }] },
    ]);
    await db.update(s.segments).set({ zoom: { scale: 1.4, x: 0.5, y: 0.5 }, zoomInferred: true })
      .where(eq(s.segments.projectId, original.id));
    const editState = { cutWords: ["0:1"], sceneTiming: [[1, { mode: "hold", leadInSec: 0.5 }]] };
    await db.update(s.projects).set({ status: "published", editState }).where(eq(s.projects.id, original.id));

    const outcome = await duplicateProject(WS, original.id, MEMBER);
    assert.ok(outcome.ok, "the copy is made");
    const copy = outcome.project;

    assert.notEqual(copy.id, original.id);
    assert.equal(copy.title, "Launch demo (copy)");
    assert.notEqual(copy.slug, original.slug);
    assert.equal(copy.recordingId, recording.id, "the take is shared, not copied");
    assert.equal(copy.status, "ready", "a copy of a published project is not itself published");
    assert.equal(copy.collection, "Onboarding");
    assert.deepEqual(copy.editState, editState);
    assert.equal(copy.segments.length, 2);
    assert.deepEqual(copy.segments.map((seg) => seg.title), ["Hello", "Next"]);

    const copiedRows = await db.select().from(s.segments).where(eq(s.segments.projectId, copy.id)).orderBy(s.segments.ordinal);
    const originalRows = await db.select().from(s.segments).where(eq(s.segments.projectId, original.id)).orderBy(s.segments.ordinal);
    assert.equal(copiedRows.length, 2);
    assert.ok(copiedRows.every((row, i) => row.id !== originalRows[i].id), "chapters are their own rows");
    assert.deepEqual(copiedRows[1].words, originalRows[1].words);
    assert.deepEqual(copiedRows[1].zoom, originalRows[1].zoom);
    assert.equal(copiedRows[1].action, "click → #go");

    const untouched = await getProjectById(WS, original.id);
    assert.equal(untouched?.status, "published");
    assert.equal(untouched?.title, "Launch demo");
    assert.equal(untouched?.segments.length, 2);

    // A copy of the copy counts up rather than stacking suffixes.
    const again = await duplicateProject(WS, copy.id, MEMBER);
    assert.ok(again.ok);
    assert.equal(again.project.title, "Launch demo (copy 2)");
  });

  it("refuses while the original is still being processed", async () => {
    const pending = await createProject({ workspaceId: WS, recordingId: null, ownerId: MEMBER, title: "Not yet" });
    const outcome = await duplicateProject(WS, pending.id, MEMBER);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.status, 409);
  });

  it("does not see another workspace's project", async () => {
    const outcome = await duplicateProject("77777777-7777-4777-8777-777777777777", "00000000-0000-4000-8000-000000000000", null);
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.status, 404);
  });
});
