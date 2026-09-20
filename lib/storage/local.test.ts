import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalStorage } from "./local";
import { resolveKey } from "./types";

const WS_A = "11111111-1111-4111-8111-111111111111";
const WS_B = "22222222-2222-4222-8222-222222222222";

let root: string;
let store: LocalStorage;

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "demoriff-storage-"));
  store = new LocalStorage(root, "test-secret");
});

after(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("key scoping", () => {
  it("prefixes every key with its workspace", () => {
    assert.equal(
      resolveKey({ workspaceId: WS_A, path: "recordings/a.webm" }),
      `${WS_A}/recordings/a.webm`,
    );
  });

  // A traversal here would read another tenant's recordings, so each of these
  // is a tenancy boundary rather than a input-validation nicety.
  for (const bad of ["../escape", "a/../../escape", "/etc/passwd", "a\u0000b", ""]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      assert.throws(() => resolveKey({ workspaceId: WS_A, path: bad }));
    });
  }

  it("rejects a workspace id that is not a uuid", () => {
    assert.throws(() => resolveKey({ workspaceId: "not-a-uuid", path: "a" }));
  });
});

describe("object round trip", () => {
  const body = new TextEncoder().encode("the quick brown fox");

  it("puts and gets the same bytes", async () => {
    await store.put({ workspaceId: WS_A, path: "notes/a.txt" }, body, "text/plain");
    const back = await store.get({ workspaceId: WS_A, path: "notes/a.txt" });
    assert.equal(new TextDecoder().decode(back), "the quick brown fox");
  });

  it("reports size via head", async () => {
    const stat = await store.head({ workspaceId: WS_A, path: "notes/a.txt" });
    assert.equal(stat?.bytes, body.byteLength);
  });

  it("returns null for a missing object", async () => {
    assert.equal(await store.head({ workspaceId: WS_A, path: "nope" }), null);
  });
});

describe("resumable upload", () => {
  it("assembles parts in order regardless of the order they are reported", async () => {
    const key = { workspaceId: WS_A, path: "recordings/big.webm" };
    const session = await store.createUpload({
      key,
      contentType: "video/webm",
      bytes: 20 * 1024 * 1024,
    });
    assert.equal(session.partUrls.length, 3);

    const dir = path.join(
      root, ".uploads", session.uploadId, encodeURIComponent(`${WS_A}/recordings/big.webm`),
    );
    for (let i = 1; i <= 3; i++) await fs.writeFile(path.join(dir, String(i)), `part${i}-`);

    // Deliberately out of order: a client uploading in parallel reports
    // completions as they finish, not sequentially.
    const done = await store.completeUpload(key, session.uploadId, [
      { partNumber: 3, etag: "c" },
      { partNumber: 1, etag: "a" },
      { partNumber: 2, etag: "b" },
    ]);

    const assembled = new TextDecoder().decode(await store.get(key));
    assert.equal(assembled, "part1-part2-part3-");
    assert.equal(done.bytes, 18);

    const scratchExists = await fs
      .stat(path.join(root, ".uploads", session.uploadId))
      .then(() => true)
      .catch(() => false);
    assert.equal(scratchExists, false, "upload scratch directory should be cleaned up");
  });
});

describe("signed reads", () => {
  it("verifies a valid signature and rejects every forgery", async () => {
    const signed = await store.signedReadUrl({ workspaceId: WS_A, path: "notes/a.txt" }, 60);
    const url = new URL(signed.url, "http://placeholder");
    const key = url.searchParams.get("key")!;
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig")!;

    assert.ok(store.verify(`read:${key}`, exp, sig));
    assert.ok(!store.verify(`read:${key}`, exp, sig.replace(/.$/, "0")), "tampered signature");
    assert.ok(!store.verify(`read:${WS_B}/notes/a.txt`, exp, sig), "signature reused for another key");
    assert.ok(!store.verify(`read:${key}`, exp, "abc"), "length mismatch must not throw");
  });

  it("rejects an expired url even with a correct signature", () => {
    const past = Date.now() - 1000;
    const subject = `read:${WS_A}/notes/a.txt`;
    const sig = store.sign(subject, new Date(past));
    assert.ok(!store.verify(subject, past, sig));
  });
});

describe("tenant deletion", () => {
  it("removes everything under one workspace and nothing under another", async () => {
    const body = new TextEncoder().encode("x");
    await store.put({ workspaceId: WS_B, path: "x/1.txt" }, body, "text/plain");
    await store.put({ workspaceId: WS_B, path: "x/y/2.txt" }, body, "text/plain");

    assert.equal(await store.removeWorkspace(WS_B), 2);
    assert.notEqual(await store.head({ workspaceId: WS_A, path: "notes/a.txt" }), null);
  });

  it("refuses a workspace id that is not a uuid", async () => {
    await assert.rejects(() => store.removeWorkspace("../.."));
  });
});
