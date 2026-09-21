import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import type { CatalogueVoice } from "@/lib/providers/types";

/**
 * Voice records, and the one rule that makes them different from every other
 * row in this database: consent can be withdrawn, and withdrawing it has to
 * mean something.
 *
 * A revoked voice is not deleted. The consent record, the sample key and the
 * revocation timestamp all stay, because the question a year from now is not
 * "does this voice exist" but "was this video made with permission, and when
 * did that permission end". Deleting the row destroys the only evidence that
 * answers it.
 */

export interface VoiceRecord {
  id: string;
  workspaceId: string | null;
  providerVoiceId: string;
  name: string;
  descriptor: string | null;
  accent: string | null;
  previewUrl: string | null;
  /** False for a studio voice the vendor no longer offers. */
  available: boolean;
  kind: "studio" | "clone";
  consentRecordedAt: Date | null;
  revokedAt: Date | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toVoice(row: typeof s.voices.$inferSelect): VoiceRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    providerVoiceId: row.providerVoiceId,
    name: row.name,
    descriptor: row.descriptor,
    accent: row.accent,
    previewUrl: row.previewUrl,
    available: row.available,
    kind: row.kind,
    consentRecordedAt: row.consentRecordedAt,
    revokedAt: row.revokedAt,
  };
}

/** Looks a voice up by our id or by the vendor's. */
export async function getVoice(idOrProviderId: string): Promise<VoiceRecord | null> {
  const isUuid = UUID.test(idOrProviderId);
  const [row] = await getDb()
    .select()
    .from(s.voices)
    .where(
      isUuid
        ? or(eq(s.voices.id, idOrProviderId), eq(s.voices.providerVoiceId, idOrProviderId))
        : eq(s.voices.providerVoiceId, idOrProviderId),
    )
    .limit(1);
  return row ? toVoice(row) : null;
}

/**
 * Withdraws consent for a cloned voice.
 *
 * Idempotent: revoking twice keeps the first timestamp, because the moment
 * consent ended is a fact about the person, not about how many times someone
 * clicked the button.
 */
export async function revokeVoice(voiceId: string, at = new Date()): Promise<VoiceRecord | null> {
  const [row] = await getDb()
    .update(s.voices)
    .set({ revokedAt: at })
    .where(and(eq(s.voices.id, voiceId), isNull(s.voices.revokedAt)))
    .returning();

  if (row) return toVoice(row);
  // Already revoked, or no such voice.
  return getVoice(voiceId);
}

/** Restores a voice whose owner has given consent again. */
export async function reinstateVoice(voiceId: string): Promise<VoiceRecord | null> {
  const [row] = await getDb()
    .update(s.voices)
    .set({ revokedAt: null })
    .where(eq(s.voices.id, voiceId))
    .returning();
  return row ? toVoice(row) : null;
}

/**
 * Returns the ids among `voiceIds` that may no longer be used.
 *
 * A voice this database has never heard of is *not* reported as revoked. The
 * seeded studio voices and a fresh vendor id both fall in that gap, and
 * failing every render in a deployment whose voices are not yet imported
 * would be a worse bug than the one this guards against.
 */
export async function findRevoked(voiceIds: string[]): Promise<VoiceRecord[]> {
  const ids = [...new Set(voiceIds.filter(Boolean))];
  if (ids.length === 0) return [];

  // Only uuid-shaped values may be compared against the id column. Passing a
  // vendor id like "voice_abc" to a uuid comparison is not a miss, it is a
  // Postgres cast error that fails the whole query.
  const uuids = ids.filter((id) => UUID.test(id));
  const conditions = [inArray(s.voices.providerVoiceId, ids)];
  if (uuids.length > 0) conditions.push(inArray(s.voices.id, uuids));

  const rows = await getDb().select().from(s.voices).where(or(...conditions));

  return rows.filter((row) => row.revokedAt !== null).map(toVoice);
}

/**
 * Brings the studio library in line with the vendor's catalogue.
 *
 * Studio voices are global rows — no workspace — licensed by the vendor to
 * everybody, so one sync serves every tenant. Matched on the vendor's id: a
 * voice already here has its name and notes refreshed and is marked
 * available again, a new one is added, and one the vendor no longer offers
 * is removed — unless a project still points at it, in which case it stays,
 * marked unavailable, so that project keeps a visible choice and fails at
 * render time with a reason rather than silently reverting to the recorded
 * voice. Unlike a clone, a studio row is not consent evidence; there is
 * nothing to preserve by keeping a voice nobody can use.
 *
 * Clones from the catalogue are skipped. They were made from somebody's
 * recording, and the consent record that has to accompany one cannot be
 * imported from a listing.
 */
export async function syncStudioVoices(
  catalogue: CatalogueVoice[],
): Promise<{ added: number; refreshed: number; removed: number; withdrawn: number }> {
  const studio = catalogue.filter((voice) => voice.kind === "studio");
  if (studio.length === 0) return { added: 0, refreshed: 0, removed: 0, withdrawn: 0 };

  const db = getDb();
  const existing = await db
    .select({ id: s.voices.id, providerVoiceId: s.voices.providerVoiceId })
    .from(s.voices)
    .where(and(isNull(s.voices.workspaceId), eq(s.voices.kind, "studio")));
  const byProviderId = new Map(existing.map((row) => [row.providerVoiceId, row.id]));

  let added = 0;
  let refreshed = 0;
  for (const voice of studio) {
    const values = {
      name: voice.name,
      descriptor: voice.descriptor ?? null,
      accent: voice.accent ?? null,
      previewUrl: voice.previewUrl ?? null,
      available: true,
    };
    const id = byProviderId.get(voice.id);
    if (id) {
      await db.update(s.voices).set(values).where(eq(s.voices.id, id));
      refreshed += 1;
    } else {
      await db.insert(s.voices).values({
        ...values,
        workspaceId: null,
        providerVoiceId: voice.id,
        kind: "studio",
      });
      added += 1;
    }
  }

  const offered = studio.map((voice) => voice.id);
  const referenced = db
    .select({ id: s.projects.voiceId })
    .from(s.projects)
    .where(sql`${s.projects.voiceId} IS NOT NULL`);
  const stale = await db
    .delete(s.voices)
    .where(
      and(
        isNull(s.voices.workspaceId),
        eq(s.voices.kind, "studio"),
        notInArray(s.voices.providerVoiceId, offered),
        notInArray(s.voices.id, referenced),
      ),
    )
    .returning({ id: s.voices.id });

  const withdrawn = await db
    .update(s.voices)
    .set({ available: false })
    .where(
      and(
        isNull(s.voices.workspaceId),
        eq(s.voices.kind, "studio"),
        eq(s.voices.available, true),
        notInArray(s.voices.providerVoiceId, offered),
      ),
    )
    .returning({ id: s.voices.id });

  return { added, refreshed, removed: stale.length, withdrawn: withdrawn.length };
}

/** Every voice a workspace can use, including the studio library. */
export async function listVoicesForWorkspace(workspaceId: string): Promise<VoiceRecord[]> {
  const rows = await getDb()
    .select()
    .from(s.voices)
    // A studio voice has no workspace — it is licensed to everybody — so
    // both are in scope and only clones are tenant-owned.
    .where(or(isNull(s.voices.workspaceId), eq(s.voices.workspaceId, workspaceId)));
  return rows.map(toVoice);
}
