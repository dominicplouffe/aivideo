import path from "node:path";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";
import type { StorageAdapter } from "./types";

export * from "./types";
export { LocalStorage } from "./local";
export { S3Storage } from "./s3";

let cached: StorageAdapter | null = null;

/**
 * Resolves the storage adapter for this environment.
 *
 * Defaults to local so the project runs with no cloud account, matching the
 * provider layer's posture: infrastructure is swappable, never required.
 */
export function getStorage(): StorageAdapter {
  if (cached) return cached;

  const driver = process.env.STORAGE_DRIVER ?? "local";

  if (driver === "s3") {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION;
    if (!bucket || !region) {
      throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET and S3_REGION.");
    }
    cached = new S3Storage({
      bucket,
      region,
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    });
    return cached;
  }

  const root = process.env.STORAGE_LOCAL_ROOT ?? path.join(process.cwd(), ".storage");
  const secret = process.env.STORAGE_SIGNING_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "STORAGE_SIGNING_SECRET must be set in production — signed read URLs are " +
        "forgeable without it.",
    );
  }
  cached = new LocalStorage(root, secret ?? "dev-only-insecure-secret");
  return cached;
}

/** Test seam. */
export function setStorage(adapter: StorageAdapter | null) {
  cached = adapter;
}
