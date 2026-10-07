import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { list } from "@/lib/audit/log";
import { includedSeconds } from "@/lib/billing/plans";
import { grantAccess, listWorkspaces } from "./workspaces";

const RUN = isDatabaseConfigured();
const WS = "77777777-7777-4777-8777-777777777777";
const STAFF = { email: "staff@demoriff.test" };

describe("staff grants", { skip: !RUN && "DATABASE_URL not set" }, () => {
  before(async () => {
    await eraseWorkspace(WS, "test setup");
    await getDb().insert(s.workspaces).values({ id: WS, slug: "grant-test", name: "Grant Test", videoSecondsUsed: 420, topupSeconds: 60 });
    await getDb().insert(s.members).values({ workspaceId: WS, name: "Gia", email: "gia@grant-test.example", role: "owner" });
  });
  after(async () => {
    await eraseWorkspace(WS, "test teardown");
    await closeDb();
  });

  it("finds a workspace by a member's email", async () => {
    const [found] = await listWorkspaces("gia@grant-test");
    assert.equal(found?.id, WS);
    assert.equal(found.owner, "gia@grant-test.example");
    assert.equal(found.members, 1);
  });

  it("writes the plan's own allowance, adds top-up, resets usage, and audits it", async () => {
    const outcome = await grantAccess(WS, { plan: "studio", projectPacks: 2, addTopupSeconds: 600, resetUsage: true, note: "design partner" }, STAFF);
    assert.ok(outcome.ok);
    assert.equal(outcome.workspace.plan, "studio");
    assert.equal(outcome.workspace.projectPacks, 2);
    assert.equal(outcome.workspace.videoSecondsLimit, includedSeconds("studio", 2));
    assert.equal(outcome.workspace.topupSeconds, 660);
    assert.equal(outcome.workspace.videoSecondsUsed, 0);

    const [entry] = await list(WS, { limit: 1 });
    assert.equal(entry.action, "billing.access_granted");
    assert.equal(entry.actorEmail, STAFF.email);
    assert.equal((entry.metadata as { note?: string }).note, "design partner");
  });

  it("drops packs on a plan without them and honours an explicit allowance", async () => {
    const outcome = await grantAccess(WS, { plan: "byok", projectPacks: 5, videoSecondsLimit: 90_000, seatsTotal: 12 }, STAFF);
    assert.ok(outcome.ok);
    assert.equal(outcome.workspace.projectPacks, 0);
    assert.equal(outcome.workspace.videoSecondsLimit, 90_000);
    assert.equal(outcome.workspace.seatsTotal, 12);

    const [row] = await getDb().select().from(s.workspaces).where(eq(s.workspaces.id, WS));
    assert.equal(row.planTermEndsAt, null);
  });

  it("reports a workspace that does not exist", async () => {
    const outcome = await grantAccess("77777777-7777-4777-8777-000000000000", { plan: "studio" }, STAFF);
    assert.deepEqual(outcome, { ok: false, reason: "not-found" });
  });
});
