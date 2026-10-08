/**
 * What a stored take is, from its first bytes.
 *
 * Every take is stored under `source.webm` whatever it is, and the local
 * adapter does not keep the type it was uploaded with, so neither the key
 * nor the store can say. An imported MP4 served as `video/webm` plays in
 * Chromium, which sniffs, and not in Safari, which believes the header.
 * The container's own signature is the one answer that cannot drift.
 */

/** Bytes needed to tell the containers below apart. */
export const MEDIA_SNIFF_BYTES = 12;

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** The media type of a file that starts with `head`, or null when it is none we recognise. */
export function sniffMediaType(head: Uint8Array): string | null {
  // EBML: WebM, and Matroska, which browsers play under the same type.
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return "video/webm";
  }
  // ISO base media: an `ftyp` box first, then the brand.
  if (head.length >= MEDIA_SNIFF_BYTES && ascii(head, 4, 8) === "ftyp") {
    return ascii(head, 8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  }
  return null;
}
