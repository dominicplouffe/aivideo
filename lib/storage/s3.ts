import {
  resolveKey, type CompletedPart, type StorageAdapter, type StorageKey,
  type StoredObject, type SignedUrl, type UploadInit, type UploadSession,
} from "./types";

/**
 * S3-backed storage.
 *
 * Written against the same contract as the local adapter. The AWS SDK is
 * imported dynamically so a deployment using local storage never pays for
 * loading it, and so the package stays an optional dependency.
 *
 * Not exercised in this repository's test run — there is no bucket to point
 * it at. The contract and the call shapes are correct; treat the first
 * deployment against a real bucket as the point where it is proven.
 */
export interface S3Config {
  bucket: string;
  region: string;
  /** For S3-compatible stores (R2, MinIO). Omit for AWS. */
  endpoint?: string;
  forcePathStyle?: boolean;
}

type S3Module = typeof import("@aws-sdk/client-s3");
type PresignModule = typeof import("@aws-sdk/s3-request-presigner");

export class S3Storage implements StorageAdapter {
  readonly name = "s3";
  private clientPromise: Promise<{ client: unknown; sdk: S3Module; presign: PresignModule }> | null = null;

  constructor(private readonly config: S3Config) {}

  private async sdk() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const sdk = (await import("@aws-sdk/client-s3")) as S3Module;
        const presign = (await import("@aws-sdk/s3-request-presigner")) as PresignModule;
        const client = new sdk.S3Client({
          region: this.config.region,
          endpoint: this.config.endpoint,
          forcePathStyle: this.config.forcePathStyle,
        });
        return { client, sdk, presign };
      })().catch((error) => {
        this.clientPromise = null;
        throw new Error(
          "S3 storage requires @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner. " +
            `Install them or set STORAGE_DRIVER=local. Cause: ${String(error)}`,
        );
      });
    }
    return this.clientPromise;
  }

  async createUpload(init: UploadInit): Promise<UploadSession> {
    const { client, sdk, presign } = await this.sdk();
    const Key = resolveKey(init.key);
    const created = await (client as InstanceType<S3Module["S3Client"]>).send(
      new sdk.CreateMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key,
        ContentType: init.contentType,
        // Media at rest is encrypted by the bucket policy; this makes the
        // intent explicit rather than relying on a default staying set.
        ServerSideEncryption: "AES256",
      }),
    );

    const partSizeBytes = 8 * 1024 * 1024;
    const total = init.bytes ?? partSizeBytes;
    const partCount = Math.max(1, Math.ceil(total / partSizeBytes));
    const ttlSeconds = 6 * 60 * 60;

    const partUrls = await Promise.all(
      Array.from({ length: partCount }, (_, i) =>
        presign.getSignedUrl(
          client as InstanceType<S3Module["S3Client"]>,
          new sdk.UploadPartCommand({
            Bucket: this.config.bucket,
            Key,
            UploadId: created.UploadId,
            PartNumber: i + 1,
          }),
          { expiresIn: ttlSeconds },
        ),
      ),
    );

    return {
      uploadId: created.UploadId ?? "",
      partUrls,
      partSizeBytes,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  async completeUpload(
    key: StorageKey,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<StoredObject> {
    const { client, sdk } = await this.sdk();
    const Key = resolveKey(key);
    await (client as InstanceType<S3Module["S3Client"]>).send(
      new sdk.CompleteMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
    const stat = await this.head(key);
    return (
      stat ?? { key: Key, bytes: 0, contentType: "application/octet-stream", createdAt: new Date() }
    );
  }

  async abortUpload(key: StorageKey, uploadId: string): Promise<void> {
    const { client, sdk } = await this.sdk();
    await (client as InstanceType<S3Module["S3Client"]>).send(
      new sdk.AbortMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: resolveKey(key),
        UploadId: uploadId,
      }),
    );
  }

  async put(key: StorageKey, body: Uint8Array, contentType: string): Promise<StoredObject> {
    const { client, sdk } = await this.sdk();
    const Key = resolveKey(key);
    await (client as InstanceType<S3Module["S3Client"]>).send(
      new sdk.PutObjectCommand({
        Bucket: this.config.bucket,
        Key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      }),
    );
    return { key: Key, bytes: body.byteLength, contentType, createdAt: new Date() };
  }

  async get(key: StorageKey): Promise<Uint8Array> {
    const { client, sdk } = await this.sdk();
    const res = await (client as InstanceType<S3Module["S3Client"]>).send(
      new sdk.GetObjectCommand({ Bucket: this.config.bucket, Key: resolveKey(key) }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Empty object: ${resolveKey(key)}`);
    return bytes;
  }

  async signedReadUrl(key: StorageKey, ttlSeconds = 900): Promise<SignedUrl> {
    const { client, sdk, presign } = await this.sdk();
    const url = await presign.getSignedUrl(
      client as InstanceType<S3Module["S3Client"]>,
      new sdk.GetObjectCommand({ Bucket: this.config.bucket, Key: resolveKey(key) }),
      { expiresIn: ttlSeconds },
    );
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  async head(key: StorageKey): Promise<StoredObject | null> {
    const { client, sdk } = await this.sdk();
    try {
      const res = await (client as InstanceType<S3Module["S3Client"]>).send(
        new sdk.HeadObjectCommand({ Bucket: this.config.bucket, Key: resolveKey(key) }),
      );
      return {
        key: resolveKey(key),
        bytes: res.ContentLength ?? 0,
        contentType: res.ContentType ?? "application/octet-stream",
        createdAt: res.LastModified ?? new Date(),
      };
    } catch {
      return null;
    }
  }

  async remove(key: StorageKey): Promise<void> {
    const { client, sdk } = await this.sdk();
    await (client as InstanceType<S3Module["S3Client"]>).send(
      new sdk.DeleteObjectCommand({ Bucket: this.config.bucket, Key: resolveKey(key) }),
    );
  }

  async removeWorkspace(workspaceId: string): Promise<number> {
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) {
      throw new Error(`Invalid workspace id: ${workspaceId}`);
    }
    const { client, sdk } = await this.sdk();
    const s3 = client as InstanceType<S3Module["S3Client"]>;
    let removed = 0;
    let token: string | undefined;

    do {
      const listed = await s3.send(
        new sdk.ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: `${workspaceId}/`,
          ContinuationToken: token,
        }),
      );
      const objects = (listed.Contents ?? [])
        .filter((o): o is { Key: string } => typeof o.Key === "string")
        .map((o) => ({ Key: o.Key }));
      if (objects.length) {
        await s3.send(
          new sdk.DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: { Objects: objects },
          }),
        );
        removed += objects.length;
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);

    return removed;
  }
}
