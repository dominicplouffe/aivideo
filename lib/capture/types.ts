/**
 * The capture wire format.
 *
 * A recording is two things: pixels, and a record of what the person did to
 * produce them. The second is what separates this product from a screen
 * recorder. A click that carries its target's selector, role, accessible name
 * and bounds lets the editor say "zoom here, hold until the sentence about it
 * ends, and label this step 'Save changes'" — none of which is recoverable
 * from the video afterwards at any price.
 *
 * Times are in **seconds from the start of capture**, matching
 * `InteractionEvent` in the provider layer. Milliseconds would be the
 * natural unit for a browser API and the wrong one here: a conversion at the
 * boundary is one more place for a factor of a thousand to hide.
 */

export type CaptureEventKind =
  | "click"
  | "key"
  | "input"
  | "scroll"
  | "route"
  | "mutation"
  | "focus";

export interface CaptureBounds {
  /** Normalised 0..1 against the viewport, so the log survives a resize. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CaptureEvent {
  at: number;
  kind: CaptureEventKind;
  selector?: string;
  role?: string;
  accessibleName?: string;
  bounds?: CaptureBounds;
  /**
   * Kind-dependent detail: the key name, the new URL, the scroll offset.
   * Never the contents of a field — see `redacted`.
   */
  value?: string;
  /**
   * True when the detail was deliberately withheld. A redacted event still
   * carries its timing and its target, because "they typed here for four
   * seconds" is exactly what the editor needs and "they typed hunter2" is
   * exactly what it must never hold.
   */
  redacted?: boolean;
}

export interface CaptureViewport {
  width: number;
  height: number;
  devicePixelRatio: number;
}

/** What the recorder hands the platform when a session ends. */
export interface CaptureManifest {
  /** Client-generated, so an upload can be resumed after a crash. */
  sessionId: string;
  startedAt: string;
  durationSec: number;
  url: string;
  title: string;
  viewport: CaptureViewport;
  events: CaptureEvent[];
  /** Selectors masked during capture, for the audit trail. */
  maskedSelectors: string[];
  /** Extension version, for reading a bug report six months from now. */
  recorder: { name: string; version: string };
}

export interface MaskRule {
  /** CSS selector whose matches are obscured before encoding. */
  selector: string;
  style?: "blur" | "pixelate" | "redact";
}
