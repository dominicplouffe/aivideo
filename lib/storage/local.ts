import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  resolveKey, type CompletedPart, type StorageAdapter, type StorageKey,
  type StoredObject, type SignedUrl, type UploadInit, type UploadSession,
} from "./types";

/**
 * Filesystem-backed storage for local development and self-hosted single-node
 * deployments. Implements the same contract as S3, including signed reads and
 * resumable multipart uploads, so behaviour does not diverge between
 * environments — a signature bug here would otherwise only surface in
 * production.
 */
/** Upload ids are minted with `randomUUID()`; nothing else is one. */
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class LocalStorage implements StorageAdapter {
  readonly name = "local";

  constructor(
    private readonly root: string,
    private readonly secret: string,
    /** Base URL the signed paths are served from. */
    private readonly baseUrl: string = "/api/storage",
  ) {}

  private abs(key: StorageKey): string {
    const resolved = resolveKey(key);
    const full = path.join(this.root, resolved);
    // Defence in depth: resolveKey already rejects traversal, but a symlink
    // in the tree could still escape. Verify the final path stays inside.
    const normalisedRoot = path.resolve(this.root);
    if (!path.resolve(full).startsWith(normalisedRoot + path.sep)) {
      throw new Error("Resolved storage path escaped the root");
    }
    return full;
  }

  /**
   * The directory holding an in-flight upload's parts.
   *
   * `uploadId` and the part numbers become path segments, so both are checked
   * rather than trusted. Today every caller is internal and passes back a
   * `randomUUID()` this class minted — but "the only caller is trusted" is a
   * property of the code as it stands, not of the method, and the first HTTP
   * handler that resumes an upload will hand these straight through from a
   * request body. Checking here means that handler cannot get it wrong.
   */
  private partsDir(key: StorageKey, uploadId: string): string {
    if (!UPLOAD_ID.test(uploadId)) {
      throw new Error(`Invalid upload id: ${uploadId}`);
    }
    return path.join(this.root, ".uploads", uploadId, encodeURIComponent(resolveKey(key)));
  }

  async createUpload(init: UploadInit): Promise<UploadSession> {
    const uploadId = randomUUID();
    const partSizeBytes = 8 * 1024 * 1024;
    const total = init.bytes ?? partSizeBytes;
    const partCount = Math.max(1, Math.ceil(total / partSizeBytes));
    await fs.mkdir(this.partsDir(init.key, uploadId), { recursive: true });

    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const resolved = resolveKey(init.key);
    const partUrls = Array.from({ length: partCount }, (_, i) => {
      const sig = this.sign(`upload:${uploadId}:${resolved}:${i + 1}`, expiresAt);
      return `${this.baseUrl}/upload/${uploadId}/${i + 1}?key=${encodeURIComponent(resolved)}&exp=${expiresAt.getTime()}&sig=${sig}`;
    });

    return { uploadId, partUrls, partSizeBytes, expiresAt };
  }

  async completeUpload(
    key: StorageKey,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<StoredObject> {
    const dir = this.partsDir(key, uploadId);
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);

    const chunks: Buffer[] = [];
    for (const part of ordered) {
      // A part number is a filename. `../../etc/passwd` is a perfectly good
      // JSON number field until it is a path segment.
      if (!Number.isInteger(part.partNumber) || part.partNumber < 1) {
        throw new Error(`Invalid part number: ${part.partNumber}`);
      }
      const buf = await fs.readFile(path.join(dir, String(part.partNumber)));
      chunks.push(buf);
    }
    const body = Buffer.concat(chunks);

    const target = this.abs(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    await fs.rm(this.uploadDir(uploadId), { recursive: true, force: true });

    return {
      key: resolveKey(key),
      bytes: body.byteLength,
      contentType: "application/octet-stream",
      createdAt: new Date(),
    };
  }

  async abortUpload(_key: StorageKey, uploadId: string): Promise<void> {
    // Recursive and forced: the id is checked first, because this is the one
    // method here that deletes a whole tree.
    await fs.rm(this.uploadDir(uploadId), { recursive: true, force: true });
  }

  private uploadDir(uploadId: string): string {
    if (!UPLOAD_ID.test(uploadId)) {
      throw new Error(`Invalid upload id: ${uploadId}`);
    }
    return path.join(this.root, ".uploads", uploadId);
  }

  async put(key: StorageKey, body: Uint8Array, _contentType: string): Promise<StoredObject> {
    const target = this.abs(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return {
      key: resolveKey(key),
      bytes: body.byteLength,
      contentType: _contentType,
      createdAt: new Date(),
    };
  }

  async get(key: StorageKey): Promise<Uint8Array> {
    return new Uint8Array(await fs.readFile(this.abs(key)));
  }

  /**
   * Reads only the requested bytes off disk.
   *
   * A file handle rather than `readFile(...).slice(...)`: the point of a
   * range request is to avoid holding a gigabyte in memory to answer it.
   */
  async getRange(key: StorageKey, start: number, end: number): Promise<Uint8Array> {
    const handle = await fs.open(this.abs(key), "r");
    try {
      const length = Math.max(0, end - start + 1);
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      return new Uint8Array(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }

  async signedReadUrl(key: StorageKey, ttlSeconds = 900): Promise<SignedUrl> {
    const resolved = resolveKey(key);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const sig = this.sign(`read:${resolved}`, expiresAt);
    return {
      url: `${this.baseUrl}/read?key=${encodeURIComponent(resolved)}&exp=${expiresAt.getTime()}&sig=${sig}`,
      expiresAt,
    };
  }

  async head(key: StorageKey): Promise<StoredObject | null> {
    try {
      const stat = await fs.stat(this.abs(key));
      return {
        key: resolveKey(key),
        bytes: stat.size,
        contentType: "application/octet-stream",
        createdAt: stat.birthtime,
      };
    } catch {
      return null;
    }
  }

  async remove(key: StorageKey): Promise<void> {
    await fs.rm(this.abs(key), { force: true });
  }

  async removeWorkspace(workspaceId: string): Promise<number> {
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
      throw new Error(`Invalid workspace id: ${workspaceId}`);
    }
    const dir = path.join(this.root, workspaceId);
    let count = 0;
    const walk = async (d: string) => {
      let entries;
      try {
        entries = await fs.readdir(d, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) await walk(full);
        else count += 1;
      }
    };
    await walk(dir);
    await fs.rm(dir, { recursive: true, force: true });
    return count;
  }

  /* ---------------------------------------------------------- signing */

  sign(subject: string, expiresAt: Date): string {
    return createHmac("sha256", this.secret)
      .update(`${subject}:${expiresAt.getTime()}`)
      .digest("hex");
  }

  /** Constant-time verification, so a signature cannot be guessed by timing. */
  verify(subject: string, expiresAtMs: number, signature: string): boolean {
    if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) return false;
    const expected = Buffer.from(this.sign(subject, new Date(expiresAtMs)));
    const given = Buffer.from(signature);
    if (expected.length !== given.length) return false;
    return timingSafeEqual(expected, given);
  }
}
