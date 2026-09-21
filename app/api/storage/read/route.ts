import { NextResponse } from "next/server";
import { getStorage, LocalStorage, resolveKey } from "@/lib/storage";

/**
 * Serves a signed read URL minted by the local storage adapter.
 *
 * `LocalStorage.signedReadUrl` has always produced `/api/storage/read?…`
 * links, and nothing served them — so every finished render's download link
 * was a 404. The signature is the whole access check here: these URLs are
 * handed to browsers, to webhook consumers and to `<video src>`, none of
 * which carry a session.
 *
 * The S3 adapter signs against S3 directly and never reaches this route,
 * which is why a request arriving here while S3 is configured is refused
 * rather than served — it means a link was minted by something that is no
 * longer the storage backend.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig");

  if (!key || !sig || !Number.isFinite(exp)) {
    return NextResponse.json({ error: "Malformed signed URL." }, { status: 400 });
  }

  const storage = getStorage();
  if (!(storage instanceof LocalStorage)) {
    return NextResponse.json(
      { error: "This deployment does not serve local storage reads." },
      { status: 404 },
    );
  }

  // Expiry is checked inside `verify`, in constant time along with the
  // signature — an expired link and a forged one give the same answer and
  // take the same time to give it.
  if (!storage.verify(`read:${key}`, exp, sig)) {
    return NextResponse.json({ error: "That link is invalid or has expired." }, { status: 403 });
  }

  // The key is signed, so it cannot be tampered with — but it is still run
  // through the same resolver every other path takes, because a signature
  // proves who wrote a path, not that the path is safe.
  let bytes: Uint8Array;
  try {
    const [workspaceId, ...rest] = key.split("/");
    const parsed = { workspaceId, path: rest.join("/") };
    resolveKey(parsed);
    bytes = await storage.get(parsed);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType =
    extension === "mp4" ? "video/mp4"
    : extension === "webm" ? "video/webm"
    : extension === "srt" ? "application/x-subrip"
    : extension === "json" ? "application/json"
    : extension === "mp3" ? "audio/mpeg"
    : "application/octet-stream";

  return new NextResponse(new Uint8Array(bytes) as unknown as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      // Cacheable only until the signature expires, and never by a shared
      // cache: the URL is the credential.
      "Cache-Control": `private, max-age=${Math.max(0, Math.floor((exp - Date.now()) / 1000))}`,
      "Content-Disposition": `inline; filename="${key.split("/").pop() ?? "download"}"`,
    },
  });
}
