import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isStaff, staffEmails } from "./staff";

const saved = process.env.DEMORIFF_STAFF_EMAILS;
afterEach(() => {
  if (saved === undefined) delete process.env.DEMORIFF_STAFF_EMAILS;
  else process.env.DEMORIFF_STAFF_EMAILS = saved;
});

const member = (email: string, extra: { externalId?: string | null; deactivatedAt?: Date | null } = {}) => ({
  email,
  externalId: null,
  deactivatedAt: null,
  ...extra,
});

describe("DemoRiff staff", () => {
  it("is nobody when the list is unset", () => {
    delete process.env.DEMORIFF_STAFF_EMAILS;
    assert.equal(staffEmails().size, 0);
    assert.equal(isStaff(member("owner@demoriff.com")), false);
    assert.equal(isStaff(null), false);
  });

  it("matches a listed address regardless of case and spacing", () => {
    process.env.DEMORIFF_STAFF_EMAILS = " Owner@DemoRiff.com , ops@demoriff.com,";
    assert.equal(isStaff(member("owner@demoriff.com")), true);
    assert.equal(isStaff(member("OPS@demoriff.com")), true);
    assert.equal(isStaff(member("someone@demoriff.com")), false);
  });

  it("never counts a directory account or a deactivated one", () => {
    process.env.DEMORIFF_STAFF_EMAILS = "owner@demoriff.com";
    assert.equal(isStaff(member("owner@demoriff.com", { externalId: "scim-123" })), false);
    assert.equal(isStaff(member("owner@demoriff.com", { deactivatedAt: new Date() })), false);
  });
});
