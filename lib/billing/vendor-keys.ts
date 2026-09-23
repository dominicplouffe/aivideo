import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { open, seal } from "@/lib/crypto/secrets";

/**
 * A workspace's own vendor keys, for the Bring-your-own-keys plan.
 *
 * Sealed at rest with the same AES-256-GCM the connectors use, opened only
 * on the way to the vendor, and shown back as the last four characters.
 * Each key is checked against its vendor when saved, so a typo is caught
 * at the form rather than at the first render.
 */

export { VENDORS, VENDOR_LABELS, type Vendor } from "./vendors";
import { VENDORS, VENDOR_LABELS, type Vendor } from "./vendors";

export interface VendorKeySummary {
  vendor: Vendor;
  last4: string;
  verifiedAt: string | null;
  updatedAt: string;
}

export async function listVendorKeys(workspaceId: string): Promise<VendorKeySummary[]> {
  const rows = await getDb().select().from(s.workspaceVendorKeys).where(eq(s.workspaceVendorKeys.workspaceId, workspaceId));
  return rows
    .filter((row): row is typeof row & { vendor: Vendor } => (VENDORS as readonly string[]).includes(row.vendor))
    .map((row) => ({
      vendor: row.vendor,
      last4: row.last4,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));
}

/** The key itself, opened. Null when the workspace has none for the vendor. */
export async function vendorKey(workspaceId: string, vendor: Vendor): Promise<string | null> {
  const [row] = await getDb()
    .select({ sealed: s.workspaceVendorKeys.keySealed })
    .from(s.workspaceVendorKeys)
    .where(and(eq(s.workspaceVendorKeys.workspaceId, workspaceId), eq(s.workspaceVendorKeys.vendor, vendor)))
    .limit(1);
  if (!row) return null;
  try {
    return open(row.sealed) || null;
  } catch {
    return null;
  }
}

/** Every key the workspace holds, opened, keyed by vendor. */
export async function vendorKeys(workspaceId: string): Promise<Partial<Record<Vendor, string>>> {
  const rows = await getDb().select().from(s.workspaceVendorKeys).where(eq(s.workspaceVendorKeys.workspaceId, workspaceId));
  const out: Partial<Record<Vendor, string>> = {};
  for (const row of rows) {
    if (!(VENDORS as readonly string[]).includes(row.vendor)) continue;
    try {
      const value = open(row.keySealed);
      if (value) out[row.vendor as Vendor] = value;
    } catch {
      // An unopenable key is the same as no key: the person re-enters it.
    }
  }
  return out;
}

export async function saveVendorKey(input: {
  workspaceId: string;
  vendor: Vendor;
  key: string;
  verified: boolean;
  createdBy: string | null;
}): Promise<VendorKeySummary> {
  const key = input.key.trim();
  const values = {
    workspaceId: input.workspaceId,
    vendor: input.vendor,
    keySealed: seal(key),
    last4: key.slice(-4),
    verifiedAt: input.verified ? new Date() : null,
    createdBy: input.createdBy,
    updatedAt: new Date(),
  };
  const [row] = await getDb()
    .insert(s.workspaceVendorKeys)
    .values(values)
    .onConflictDoUpdate({
      target: [s.workspaceVendorKeys.workspaceId, s.workspaceVendorKeys.vendor],
      set: { keySealed: values.keySealed, last4: values.last4, verifiedAt: values.verifiedAt, updatedAt: values.updatedAt },
    })
    .returning();
  return { vendor: input.vendor, last4: row.last4, verifiedAt: row.verifiedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString() };
}

export async function removeVendorKey(workspaceId: string, vendor: Vendor): Promise<boolean> {
  const rows = await getDb()
    .delete(s.workspaceVendorKeys)
    .where(and(eq(s.workspaceVendorKeys.workspaceId, workspaceId), eq(s.workspaceVendorKeys.vendor, vendor)))
    .returning({ id: s.workspaceVendorKeys.id });
  return rows.length > 0;
}

/**
 * Asks the vendor whether the key works, with the cheapest call each has.
 * Returns the reason when it does not, in words a person can act on.
 */
export async function verifyVendorKey(
  vendor: Vendor,
  key: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const request: { url: string; headers: Record<string, string> } =
    vendor === "deepgram"
      ? { url: "https://api.deepgram.com/v1/projects", headers: { Authorization: `Token ${key}` } }
      : vendor === "elevenlabs"
        ? { url: "https://api.elevenlabs.io/v1/user", headers: { "xi-api-key": key } }
        : { url: "https://api.anthropic.com/v1/models", headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } };
  try {
    const response = await fetchImpl(request.url, { headers: request.headers, signal: AbortSignal.timeout(10_000) });
    if (response.ok) return { ok: true };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: `${VENDOR_LABELS[vendor].name} did not accept this key.` };
    }
    return { ok: false, reason: `${VENDOR_LABELS[vendor].name} answered ${response.status} while checking the key. Try again in a moment.` };
  } catch {
    return { ok: false, reason: `${VENDOR_LABELS[vendor].name} could not be reached to check the key.` };
  }
}
