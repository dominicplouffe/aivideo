import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { createRequire } from "node:module";
import { getProjectById, getProjectBySlug } from "@/lib/db/repositories/projects";
import type * as DataModule from "./data";

/**
 * `server-only` exists to make a bundler fail a build that pulls this module
 * into a client component. Outside a bundler it simply throws, so the test
 * run satisfies it the way the server build does — by resolving it to
 * nothing — rather than by dropping the guard from the module under test.
 */
const require_ = createRequire(import.meta.url);
require_.cache[require_.resolve("server-only")] = {
  id: "server-only", filename: "server-only", loaded: true,
  exports: {},
} as unknown as NodeJS.Module;

let data: typeof DataModule;

/**
 * The data access layer, and the two things it is for.
 *
 * An authorization check written in a route handler protects that route. One
 * written next to the query protects every caller that will ever exist,
 * including the page somebody adds in six months without reading the
 * comment above it.
 */

const RUN = isDatabaseConfigured();
const MINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const THEIRS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const MY_PROJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbc1";
const THEIR_PROJECT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbc2";
const MY_RECORDING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbd1";
const THEIR_RECORDING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbd2";

before(async () => {
  data = (await import("./data")) as typeof DataModule;
  if (!RUN) return;
  for (const id of [MINE, THEIRS]) await eraseWorkspace(id, "test setup");
});

after(async () => {
  if (!RUN) return;
  for (const id of [MINE, THEIRS]) await eraseWorkspace(id, "test teardown");
  await closeDb();
});

beforeEach(async () => {
  if (!RUN) return;
  const db = getDb();
  for (const id of [MINE, THEIRS]) await eraseWorkspace(id, "test reset");

  await db.insert(s.workspaces).values([
    { id: MINE, slug: "dal-mine", name: "Mine" },
    { id: THEIRS, slug: "dal-theirs", name: "Theirs" },
  ]);
  await db.insert(s.recordings).values([
    { id: MY_RECORDING, workspaceId: MINE, source: "upload", status: "ready", durationSec: 60 },
    { id: THEIR_RECORDING, workspaceId: THEIRS, source: "upload", status: "ready", durationSec: 60 },
  ]);
  await db.insert(s.projects).values([
    { id: MY_PROJECT, workspaceId: MINE, recordingId: MY_RECORDING, slug: "ours", title: "Ours", status: "published" },
    { id: THEIR_PROJECT, workspaceId: THEIRS, recordingId: THEIR_RECORDING, slug: "theirs", title: "Theirs", status: "published" },
  ]);
});

describe("tenant isolation in the repository", { skip: RUN ? false : "DATABASE_URL not set" }, () => {
  it("finds a project inside its own workspace", async () => {
    const project = await getProjectById(MINE, MY_PROJECT);
    assert.equal(project?.title, "Ours");
  });

  it("does not find another workspace's project by id", async () => {
    // Scoped in the query rather than filtered afterwards: an id-only
    // lookup reads across every tenant and leaves the caller to remember a
    // check that fails by returning the wrong customer's data.
    assert.equal(await getProjectById(MINE, THEIR_PROJECT), null);
  });

  it("does not find another workspace's project by slug either", async () => {
    assert.equal(await getProjectBySlug("dal-mine", "theirs"), null);
  });
});

describe("the data access layer", () => {
  it("returns nothing to a caller with no session", async () => {
    if (!RUN) {
      // Without a database the app runs on seeded fixtures with nobody
      // signed in, which is what keeps it explorable from a fresh clone.
      assert.equal((await data.getProjects()).length > 0, true);
      return;
    }

    // With a database there is somebody to be, and nobody is not them.
    assert.deepEqual(await data.getProjects(), []);
    assert.equal(await data.getProject(MY_PROJECT), null);
    assert.deepEqual(await data.getRetentionCurve(MY_PROJECT), []);
  });

  it("answers the same for a project that exists and one that does not", async () => {
    if (!RUN) return;
    // A different answer for a project in a workspace you cannot see is an
    // oracle for what that workspace contains.
    assert.equal(await data.getProject(THEIR_PROJECT), await data.getProject("does-not-exist"));
  });
});
