import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { findRevoked, getVoice, reinstateVoice, revokeVoice } from "./voices";

/**
 * Consent is the one thing in this schema that a person can take back. These
 * tests are about what "taking it back" actually does.
 */

const RUN = isDatabaseConfigured();
const WS = "55555555-5555-4555-8555-555555555555";
const MEMBER = "55555555-5555-4555-8555-555555555556";

let cloneId = "";
let studioId = "";

before(async () => {
  if (!RUN) return;
  const db = getDb();
  await eraseWorkspace(WS, "test setup");
  await db.insert(s.workspaces).values({ id: WS, slug: "voice-test", name: "Voice Test" });
  await db.insert(s.members).values({
    id: MEMBER, workspaceId: WS, name: "Renata", email: "r@example.com", role: "creator",
  });
});

after(async () => {
  if (!RUN) return;
  const db = getDb();
  await db.delete(s.voices).where(eq(s.voices.workspaceId, WS));
  await eraseWorkspace(WS, "test teardown");
  await closeDb();
});

beforeEach(async () => {
  if (!RUN) return;
  const db = getDb();
  await db.delete(s.voices).where(eq(s.voices.workspaceId, WS));

  const [clone] = await db.insert(s.voices).values({
    workspaceId: WS,
    providerVoiceId: "el_clone_renata",
    name: "Renata",
    kind: "clone",
    consentSubjectId: MEMBER,
    consentRecordedAt: new Date("2026-03-04T00:00:00Z"),
    consentAudioKey: `${WS}/consent/renata.wav`,
  }).returning();
  cloneId = clone.id;

  const [studio] = await db.insert(s.voices).values({
    workspaceId: WS,
    providerVoiceId: "el_studio_avery",
    name: "Avery",
    kind: "studio",
  }).returning();
  studioId = studio.id;
});

/** Walks the cause chain for the Postgres constraint that rejected a write. */
function constraintOf(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const e = current as { constraint_name?: string; cause?: unknown };
    if (e.constraint_name) return e.constraint_name;
    current = e.cause;
  }
  return null;
}

describe("voice consent", { skip: RUN ? false : "DATABASE_URL not set" }, () => {
  it("refuses to store a clone with no consent record", async () => {
    // The guarantee lives in the schema, not in application code, so no
    // forgotten code path can route around it.
    await assert.rejects(
      () =>
        getDb().insert(s.voices).values({
          workspaceId: WS,
          providerVoiceId: "el_clone_nobody",
          name: "Nobody",
          kind: "clone",
        }),
      // Drizzle wraps the driver error, so the constraint name is on the
      // cause rather than in the message.
      (error: unknown) => constraintOf(error) === "voices_clone_requires_consent",
    );
  });

  it("revokes without deleting the evidence", async () => {
    const revoked = await revokeVoice(cloneId);
    assert.notEqual(revoked?.revokedAt, null);

    const [row] = await getDb().select().from(s.voices).where(eq(s.voices.id, cloneId));
    // The row, the consent timestamp and the sample key all survive: the
    // question later is not "does this voice exist" but "was this made with
    // permission, and when did that permission end".
    assert.equal(row.consentRecordedAt?.toISOString(), "2026-03-04T00:00:00.000Z");
    assert.equal(row.consentAudioKey, `${WS}/consent/renata.wav`);
    assert.notEqual(row.revokedAt, null);
  });

  it("keeps the first revocation timestamp when revoked twice", async () => {
    const first = await revokeVoice(cloneId, new Date("2026-06-01T00:00:00Z"));
    const second = await revokeVoice(cloneId, new Date("2026-07-01T00:00:00Z"));
    // The moment consent ended is a fact about the person, not a record of
    // how many times someone clicked the button.
    assert.equal(second?.revokedAt?.toISOString(), first?.revokedAt?.toISOString());
    assert.equal(second?.revokedAt?.toISOString(), "2026-06-01T00:00:00.000Z");
  });

  it("can be reinstated when consent is given again", async () => {
    await revokeVoice(cloneId);
    const restored = await reinstateVoice(cloneId);
    assert.equal(restored?.revokedAt, null);
  });

  it("finds revoked voices by our id and by the vendor's", async () => {
    await revokeVoice(cloneId);
    assert.equal((await findRevoked([cloneId])).length, 1);
    assert.equal((await findRevoked(["el_clone_renata"])).length, 1);
    assert.equal((await findRevoked([studioId])).length, 0);
  });

  it("does not treat an unknown voice as revoked", async () => {
    // Unknown is not the same as revoked. Conflating them fails every render
    // in a deployment whose voices have not been imported yet.
    assert.deepEqual(await findRevoked(["voice_we_have_never_seen"]), []);
    assert.deepEqual(await findRevoked(["11111111-2222-4333-8444-555555555555"]), []);
  });

  it("survives a mix of uuid and vendor ids in one lookup", async () => {
    await revokeVoice(cloneId);
    // A vendor id compared against a uuid column is a Postgres cast error,
    // not a miss — it would fail the whole query rather than one row.
    const found = await findRevoked([cloneId, "el_clone_renata", "voice_abc", studioId]);
    assert.equal(found.length, 1);
    assert.equal(found[0].id, cloneId);
  });

  it("looks a voice up by either identifier", async () => {
    assert.equal((await getVoice(cloneId))?.providerVoiceId, "el_clone_renata");
    assert.equal((await getVoice("el_clone_renata"))?.id, cloneId);
    assert.equal(await getVoice("nope"), null);
  });
});
