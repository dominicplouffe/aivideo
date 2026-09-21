import { NextResponse } from "next/server";
import type { StorageAdapter, StorageKey } from "@/lib/storage";

/**
 * Serves a stored file to a `<video>` element.
 *
 * Browsers request video with `Range`, and a server that answers every one
 * of them with the whole file gives a player no way to seek: dragging the
 * scrubber to the last minute of a talk means downloading the first
 * fifty-nine. Chromium will also sit on a spinner rather than play a
 * response it cannot range over.
 *
 * `Accept-Ranges` is advertised only when the adapter can actually honour a
 * range, because claiming support and then ignoring it is worse than saying
 * "none" — the player plans around the promise.
 */

export interface MediaResponseInput {
  storage: StorageAdapter;
  key: StorageKey;
  totalBytes: number;
  contentType: string;
  request: Request;
  /** Goes on the response verbatim. `private` for anything workspace-scoped. */
  cacheControl: string;
  filename?: string;
}

/** Parses a single-range `Range` header. Multi-range is not worth supporting. */
export function parseRange(
  header: string | null,
  totalBytes: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;

  // `bytes=-500` means the last 500 bytes, not "up to byte 500". Getting
  // this backwards serves the wrong part of the file with a 206 that looks
  // perfectly healthy.
  if (rawStart === "") {
    if (rawEnd === "") return null;
    const suffix = Number(rawEnd);
    if (suffix <= 0) return "unsatisfiable";
    const start = Math.max(0, totalBytes - suffix);
    return { start, end: totalBytes - 1 };
  }

  const start = Number(rawStart);
  if (start >= totalBytes) return "unsatisfiable";
  const end = rawEnd === "" ? totalBytes - 1 : Math.min(Number(rawEnd), totalBytes - 1);
  if (end < start) return "unsatisfiable";
  return { start, end };
}

export async function mediaResponse(input: MediaResponseInput): Promise<NextResponse> {
  const { storage, key, totalBytes, contentType, request, cacheControl } = input;
  const rangeable = typeof storage.getRange === "function";

  const disposition = input.filename
    ? `inline; filename="${input.filename.replace(/["\\]/g, "")}"`
    : undefined;

  const base: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    "Accept-Ranges": rangeable ? "bytes" : "none",
  };
  if (disposition) base["Content-Disposition"] = disposition;

  const requested = rangeable ? parseRange(request.headers.get("range"), totalBytes) : null;

  if (requested === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: { ...base, "Content-Range": `bytes */${totalBytes}` },
    });
  }

  if (requested) {
    const bytes = await storage.getRange!(key, requested.start, requested.end);
    return new NextResponse(new Uint8Array(bytes) as unknown as BodyInit, {
      status: 206,
      headers: {
        ...base,
        "Content-Range": `bytes ${requested.start}-${requested.end}/${totalBytes}`,
        "Content-Length": String(bytes.byteLength),
      },
    });
  }

  const bytes = await storage.get(key);
  return new NextResponse(new Uint8Array(bytes) as unknown as BodyInit, {
    headers: { ...base, "Content-Length": String(bytes.byteLength) },
  });
}
