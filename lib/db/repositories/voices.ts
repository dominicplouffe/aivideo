import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

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
