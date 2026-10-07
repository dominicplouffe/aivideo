import { NextResponse } from "next/server";
import { getStorage, LocalStorage, resolveKey } from "@/lib/storage";
import { mediaResponse } from "@/lib/api/media";

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
  const [workspaceId, ...rest] = key.split("/");
  const parsed = { workspaceId, path: rest.join("/") };

  let totalBytes: number;
  try {
    resolveKey(parsed);
    const stat = await storage.head(parsed);
    if (!stat) return NextResponse.json({ error: "Not found." }, { status: 404 });
    totalBytes = stat.bytes;
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType =
    {
      mp4: "video/mp4",
      webm: "video/webm",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      srt: "application/x-subrip",
      vtt: "text/vtt",
      json: "application/json",
      // `charset` matters: a guide is UTF-8 and somebody's product name is
      // not always ASCII.
      md: "text/markdown; charset=utf-8",
      txt: "text/plain; charset=utf-8",
      mp3: "audio/mpeg",
      wav: "audio/wav",
    }[extension] ?? "application/octet-stream";

  return mediaResponse({
    storage,
    key: parsed,
    totalBytes,
    contentType,
    request,
    // Cacheable only until the signature expires, and never by a shared
    // cache: the URL is the credential.
    cacheControl: `private, max-age=${Math.max(0, Math.floor((exp - Date.now()) / 1000))}`,
    // What a download is saved as. Outside the signature on purpose: it
    // changes only the suggested filename, never which file is served, and
    // it is reduced to plain characters so it cannot break the header.
    filename: url.searchParams.get("name")?.replace(/[^\w.-]+/g, "-").slice(0, 120) || (key.split("/").pop() ?? "download"),
  });
}
