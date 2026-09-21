/**
 * Storage abstraction for recording media and rendered output.
 *
 * Media is the most sensitive thing this product holds — a screen recording
 * of a customer's product is a recording of *their* customers. Three rules
 * are baked into this contract rather than left to callers:
 *
 *  1. Keys are always workspace-scoped, so a path traversal or an off-by-one
 *     in a caller cannot read another tenant's media.
 *  2. Reads are signed and time-limited. There are no public object URLs.
 *  3. Uploads are resumable, because a four-hour 4K recording will not
 *     survive a single HTTP request on a hotel wifi connection.
 */

export interface StorageKey {
  workspaceId: string;
  /** Path beneath the workspace prefix, e.g. "recordings/abc/source.webm". */
  path: string;
}

export interface UploadInit {
  key: StorageKey;
  contentType: string;
  /** Total size when known; enables part-size planning and quota checks. */
  bytes?: number;
}

export interface UploadSession {
  uploadId: string;
  /** Where to PUT each part, in order. */
  partUrls: string[];
  partSizeBytes: number;
  expiresAt: Date;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface StoredObject {
  key: string;
  bytes: number;
  contentType: string;
  createdAt: Date;
}

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

export interface StorageAdapter {
  readonly name: string;

  /** Begins a resumable upload. */
  createUpload(init: UploadInit): Promise<UploadSession>;

  /** Finalises a resumable upload into a single object. */
  completeUpload(
    key: StorageKey,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<StoredObject>;

  /** Abandons an upload and releases any partial data. */
  abortUpload(key: StorageKey, uploadId: string): Promise<void>;

  /** Writes a whole object in one call. For small derived assets. */
  put(key: StorageKey, body: Uint8Array, contentType: string): Promise<StoredObject>;

  /** Reads a whole object. For small derived assets. */
  get(key: StorageKey): Promise<Uint8Array>;

  /**
   * Reads a byte range, inclusive of both ends, as HTTP defines it.
   *
   * Optional because not every adapter needs it, but a video route that
   * lacks it has to hold a whole file in memory to serve the first frame —
   * and without range replies a browser cannot seek at all.
   */
  getRange?(key: StorageKey, start: number, end: number): Promise<Uint8Array>;

  /** A time-limited read URL. Never returns a permanent public URL. */
  signedReadUrl(key: StorageKey, ttlSeconds?: number): Promise<SignedUrl>;

  head(key: StorageKey): Promise<StoredObject | null>;

  /** Removes an object. Deletion must be real, not a tombstone. */
  remove(key: StorageKey): Promise<void>;

  /** Removes everything under a workspace. Used on account deletion. */
  removeWorkspace(workspaceId: string): Promise<number>;
}

/** Rejects traversal and absolute paths before a key reaches an adapter. */
export function resolveKey(key: StorageKey): string {
  const { workspaceId, path } = key;
  if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    throw new Error(`Invalid workspace id in storage key: ${workspaceId}`);
  }
  if (path.startsWith("/") || path.includes("..") || path.includes("\0")) {
    throw new Error(`Unsafe storage path: ${path}`);
  }
  const clean = path.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (!clean) throw new Error("Storage path may not be empty");
  return `${workspaceId}/${clean}`;
}
