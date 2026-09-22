import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { createBrandKit, deleteBrandKit, getBrandKit, listBrandKits, setBrandKitLogo, updateBrandKit } from "./brand-kits";
import { createProject, saveBrandKit } from "./projects";

const RUN = isDatabaseConfigured();
const WS = "88888888-8888-4888-8888-888888888888";
const MEMBER = "88888888-8888-4888-8888-888888888889";

describe("brand kits", { skip: !RUN && "DATABASE_URL not set" }, () => {
  before(async () => {
    const db = getDb();
    await eraseWorkspace(WS, "test setup");
    await db.insert(s.workspaces).values({ id: WS, slug: "kit-test", name: "Kit Test" });
    await db.insert(s.members).values({ id: MEMBER, workspaceId: WS, name: "Ines", email: "i@example.com", role: "admin" });
  });
  after(async () => {
    await eraseWorkspace(WS, "test teardown");
    await closeDb();
  });

  it("versions every change, keeps the logo across a token save, and counts the projects wearing it", async () => {
    const kit = await createBrandKit({ workspaceId: WS, name: "Acme", tokens: { font: "Roboto" } });
    assert.equal(kit.version, 1);
    assert.equal(kit.usedBy, 0);

    const withLogo = await setBrandKitLogo(WS, kit.id, { key: `brand/${kit.id}/logo-1.png`, contentType: "image/png" });
    assert.equal(withLogo?.version, 2);
    assert.equal(withLogo?.tokens.logo?.key, `brand/${kit.id}/logo-1.png`);

    // The route keeps the logo when saving tokens; the repository stores what it is given.
    const recoloured = await updateBrandKit(WS, kit.id, { tokens: { ...withLogo!.tokens, colors: { accent: "#FF6A00", background: "#000000", text: "#FFFFFF" } } });
    assert.equal(recoloured?.version, 3);
    assert.equal(recoloured?.tokens.logo?.key, `brand/${kit.id}/logo-1.png`);
    assert.equal(recoloured?.tokens.font, "Roboto");

    const project = await createProject({ workspaceId: WS, recordingId: null, ownerId: MEMBER, title: "Wears it" });
    assert.ok(await saveBrandKit(WS, project.id, kit.id));
    const [listed] = await listBrandKits(WS);
    assert.equal(listed.usedBy, 1);

    // Deleting the kit releases the project rather than deleting it.
    assert.ok(await deleteBrandKit(WS, kit.id));
    const [row] = await getDb().select({ brandKitId: s.projects.brandKitId }).from(s.projects).where(eq(s.projects.id, project.id));
    assert.equal(row.brandKitId, null);
  });

  it("does not show another workspace's kit", async () => {
    const kit = await createBrandKit({ workspaceId: WS, name: "Private" });
    assert.equal(await getBrandKit("99999999-9999-4999-8999-999999999999", kit.id), null);
    assert.equal(await saveBrandKit("99999999-9999-4999-8999-999999999999", "00000000-0000-4000-8000-000000000000", kit.id), false);
  });
});
