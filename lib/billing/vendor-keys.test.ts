import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { listVendorKeys, removeVendorKey, saveVendorKey, vendorKey, vendorKeys, verifyVendorKey } from "./vendor-keys";

const RUN = isDatabaseConfigured();
const WS = "99999999-9999-4999-8999-999999999991";

describe("verifyVendorKey", () => {
  it("asks each vendor with its own header and reads the answer", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push({ url, headers: init?.headers as Record<string, string> });
      return new Response("{}", { status: url.includes("elevenlabs") ? 401 : 200 });
    }) as typeof fetch;
    assert.deepEqual(await verifyVendorKey("deepgram", "dg", fetchImpl), { ok: true });
    assert.equal((await verifyVendorKey("elevenlabs", "el", fetchImpl)).ok, false);
    assert.deepEqual(await verifyVendorKey("anthropic", "an", fetchImpl), { ok: true });
    assert.equal(seen[0].headers.Authorization, "Token dg");
    assert.equal(seen[1].headers["xi-api-key"], "el");
    assert.equal(seen[2].headers["x-api-key"], "an");
  });
});

describe("vendor keys", { skip: !RUN && "DATABASE_URL not set" }, () => {
  before(async () => {
    await eraseWorkspace(WS, "test setup");
    await getDb().insert(s.workspaces).values({ id: WS, slug: "keys-test", name: "Keys Test" });
  });
  after(async () => {
    await eraseWorkspace(WS, "test teardown");
    await closeDb();
  });

  it("stores a key sealed, shows its last four, and gives it back whole", async () => {
    const saved = await saveVendorKey({ workspaceId: WS, vendor: "elevenlabs", key: "sk_el_abcdef1234", verified: true, createdBy: null });
    assert.equal(saved.last4, "1234");
    const [row] = await getDb().select().from(s.workspaceVendorKeys);
    assert.notEqual(row.keySealed, "sk_el_abcdef1234", "not stored in the clear");
    assert.equal(await vendorKey(WS, "elevenlabs"), "sk_el_abcdef1234");
    assert.equal(await vendorKey(WS, "deepgram"), null);

    await saveVendorKey({ workspaceId: WS, vendor: "elevenlabs", key: "sk_el_replaced9999", verified: false, createdBy: null });
    const listed = await listVendorKeys(WS);
    assert.equal(listed.length, 1, "replacing keeps one row per vendor");
    assert.equal(listed[0].last4, "9999");
    assert.equal(listed[0].verifiedAt, null);
    assert.deepEqual(await vendorKeys(WS), { elevenlabs: "sk_el_replaced9999" });

    assert.equal(await removeVendorKey(WS, "elevenlabs"), true);
    assert.equal(await vendorKey(WS, "elevenlabs"), null);
  });
});
