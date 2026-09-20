/**
 * Frame-level masking.
 *
 * Capture-time masking (`lib/capture/masking.ts`) is the first and best
 * defence: the page is altered before the compositor paints, so unmasked
 * pixels never exist in a file. It can only reach what a CSS selector can
 * name, which means it cannot reach an email address inside a canvas, a
 * customer's name baked into a chart, a card number in a PDF preview, or
 * anything on a page the recorder did not instrument.
 *
 * This is the second line: find the text *in the frames* and hide it there.
 * It is strictly worse than the first — the clear pixels did exist, briefly,
 * in the source file — and it is the only option for the cases above. Both
 * are offered, and the product says which one a rule used.
 */

/** A normalised rectangle: x, y, w, h in 0..1 of the frame. */
export type Rect = [number, number, number, number];

export interface TextBox {
  text: string;
  rect: Rect;
  /** 0..1. Low-confidence text is masked anyway; see `detect.ts`. */
  confidence: number;
}

export interface Frame {
  /** Seconds into the source. */
  atSec: number;
  /** PNG bytes. */
  png: Buffer;
}

/**
 * Something that finds text in a frame.
 *
 * Deliberately narrow: locating text is a different job from deciding what
 * is sensitive, and keeping them apart means the sensitivity rules are
 * testable without an OCR engine and the OCR engine is swappable without
 * touching them.
 */
export interface TextLocator {
  readonly name: string;
  locate(frame: Frame): Promise<TextBox[]>;
}

export interface DetectedRegion {
  at: number;
  until: number;
  rect: Rect;
  style: "blur" | "pixelate" | "redact";
  /** Which rule matched, for the recording's manifest. */
  reason: string;
  /** What kind of thing was found. Never the value itself. */
  category: string;
}
