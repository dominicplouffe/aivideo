import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { needsDatabase, requireActor } from "@/lib/api/guard";
import { attachMedia, getRecording, mediaKeyFor } from "@/lib/db/repositories/recordings";
import { getStorage } from "@/lib/storage";
import { mediaResponse } from "@/lib/api/media";
import { recordQuietly } from "@/lib/audit/log";

/**
 * The bytes of a take: in, and back out again.
 *
 * `PUT` accepts the recording itself. `GET` streams it back for the Studio's
 * player — through this route rather than as a public URL, because a
 * recording of somebody's product is a recording of their customers, and a
 * guessable path to it is the same as no access control at all. The
 * workspace check happens on every read.
 */
export const dynamic = "force-dynamic";

/**
 * A ceiling on a single upload.
 *
 * The body is buffered to hand to the storage adapter, so this is a memory
 * bound and not a product limit. Beyond it the multipart path in
 * `lib/storage` is the right answer; a take that long should be chunked
 * anyway so a dropped connection does not cost the whole thing.
 */
const MAX_BYTES = 512 * 1024 * 1024;

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "recording.create");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  const recording = await getRecording(guard.actor.workspaceId, id);
  if (!recording) return NextResponse.json({ error: "No such recording." }, { status: 404 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json(
      { error: `That take is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB.` },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (declared > 0 && bytes.byteLength !== declared) {
    // Fewer bytes than the browser said it was sending is not a take, it is
    // the first part of one. Next's proxy buffering does exactly this past
    // its body-size limit and reports nothing to the client, which is how a
    // nine-minute recording was stored, transcribed and edited as thirty
    // seconds. Refused loudly, with the number, so the cause is findable.
    return NextResponse.json(
      {
        error:
          `The upload arrived incomplete: ${bytes.byteLength} of ${declared} bytes. ` +
          "The server is cutting request bodies short — check its body-size limit — and the take was not stored.",
      },
      { status: 400 },
    );
  }
  if (bytes.byteLength === 0) {
    // A zero-byte take is a capture that failed, and storing it would leave
    // a project that plays nothing with no sign of why.
    return NextResponse.json({ error: "That take contains no data." }, { status: 422 });
  }
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "That take is too large." }, { status: 413 });
  }

  const key = mediaKeyFor(recording);
  await getStorage().put(
    { workspaceId: guard.actor.workspaceId, path: key },
    bytes,
    request.headers.get("content-type") || "video/webm",
  );

  // The browser knows the duration and the frame size; the server would have
  // to probe the file to find out. Taken as hints and bounded, because they
  // arrive from the client and only affect display.
  const url = new URL(request.url);
  const duration = Number(url.searchParams.get("duration"));
  const width = Number(url.searchParams.get("width"));
  const height = Number(url.searchParams.get("height"));

  const updated = await attachMedia(recording.id, {
    mediaKey: key,
    bytes: bytes.byteLength,
    durationSec: Number.isFinite(duration) && duration > 0 ? Math.min(duration, 86_400) : null,
    width: Number.isFinite(width) && width > 0 ? Math.min(width, 16_384) : null,
    height: Number.isFinite(height) && height > 0 ? Math.min(height, 16_384) : null,
  });

  await recordQuietly({
    workspaceId: guard.actor.workspaceId,
    actor: guard.actor,
    action: "recording.uploaded",
    resourceType: "recording",
    resourceId: recording.id,
    metadata: { bytes: bytes.byteLength, durationSec: updated.durationSec },
  });

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    bytes: updated.bytes,
    duration_sec: updated.durationSec,
  });
}

export async function GET(request: Request, context: Context) {
  if (!isDatabaseConfigured()) return needsDatabase();

  const guard = await requireActor(request, "project.view");
  if ("response" in guard) return guard.response;

  const { id } = await context.params;
  const recording = await getRecording(guard.actor.workspaceId, id);
  if (!recording?.mediaKey) {
    return NextResponse.json({ error: "No such recording." }, { status: 404 });
  }

  const storage = getStorage();
  const key = { workspaceId: guard.actor.workspaceId, path: recording.mediaKey };

  const stat = await storage.head(key).catch(() => null);
  if (!stat) {
    // The row says there are bytes and there are not. Reported as a 404
    // rather than a 500: from the caller's side the media is missing either
    // way, and a stack trace tells them nothing they can act on.
    return NextResponse.json({ error: "That recording's media is missing." }, { status: 404 });
  }

  return mediaResponse({
    storage,
    key,
    totalBytes: stat.bytes,
    contentType: "video/webm",
    request,
    // Private: this is a recording of a customer's product, and a shared
    // cache is somewhere it must never sit.
    cacheControl: "private, max-age=3600",
  });
}
