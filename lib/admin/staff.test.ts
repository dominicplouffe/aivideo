import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { isStaff, listedAsStaff, staffEmails } from "./staff";

const saved = process.env.DEMORIFF_STAFF_EMAILS;
afterEach(() => {
  if (saved === undefined) delete process.env.DEMORIFF_STAFF_EMAILS;
  else process.env.DEMORIFF_STAFF_EMAILS = saved;
});

const member = (email: string, extra: { deactivatedAt?: Date | null; workspaceId?: string } = {}) => ({
  email,
  deactivatedAt: null,
  workspaceId: SELF_SERVE,
  ...extra,
});

const SELF_SERVE = "55555555-5555-4555-8555-555555555555";
const ENTERPRISE = "55555555-5555-4555-8555-555555555556";

describe("the staff list", () => {
  it("is nobody when unset", () => {
    delete process.env.DEMORIFF_STAFF_EMAILS;
    assert.equal(staffEmails().size, 0);
    assert.equal(listedAsStaff(member("owner@demoriff.com")), false);
    assert.equal(listedAsStaff(null), false);
  });

  it("matches a listed address regardless of case and spacing", () => {
    process.env.DEMORIFF_STAFF_EMAILS = " Owner@DemoRiff.com , ops@demoriff.com,";
    assert.equal(listedAsStaff(member("owner@demoriff.com")), true);
    assert.equal(listedAsStaff(member("OPS@demoriff.com")), true);
    assert.equal(listedAsStaff(member("someone@demoriff.com")), false);
  });

  it("never counts a deactivated account", () => {
    process.env.DEMORIFF_STAFF_EMAILS = "owner@demoriff.com";
    assert.equal(listedAsStaff(member("owner@demoriff.com", { deactivatedAt: new Date() })), false);
  });
});

describe("staff and single sign-on", { skip: !isDatabaseConfigured() && "DATABASE_URL not set" }, () => {
  before(async () => {
    await eraseWorkspace(SELF_SERVE, "test setup");
    await eraseWorkspace(ENTERPRISE, "test setup");
    await getDb().insert(s.workspaces).values([
      { id: SELF_SERVE, slug: "staff-self-serve", name: "Self Serve" },
      { id: ENTERPRISE, slug: "staff-enterprise", name: "Enterprise" },
    ]);
    await getDb().insert(s.ssoConnections).values({ workspaceId: ENTERPRISE, connectionId: "conn_staff_test", organizationId: "org_staff_test" });
  });
  after(async () => {
    await eraseWorkspace(SELF_SERVE, "test teardown");
    await eraseWorkspace(ENTERPRISE, "test teardown");
    await closeDb();
  });

  it("is staff in a self-serve workspace, and not where a customer's identity provider asserts the address", async () => {
    process.env.DEMORIFF_STAFF_EMAILS = "owner@demoriff.com";
    assert.equal(await isStaff(member("owner@demoriff.com")), true);
    assert.equal(await isStaff(member("owner@demoriff.com", { workspaceId: ENTERPRISE })), false);
    assert.equal(await isStaff(member("someone@demoriff.com")), false);
  });
});
