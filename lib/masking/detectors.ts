import type { TextBox } from "./types";

/**
 * What counts as sensitive.
 *
 * Every rule here errs towards masking. That asymmetry is the whole design:
 * an over-masked frame is a blurred order number somebody complains about,
 * and an under-masked frame is a customer's card number in a video on a
 * marketing site. Those are not comparable mistakes, so nothing in this file
 * is allowed to *exclude* a match — checks like Luhn raise confidence and
 * never veto.
 */

export type DetectorName =
  | "email" | "phone" | "card" | "iban" | "ssn" | "ip" | "postal" | "name" | "secret";

export interface DetectorHit {
  detector: DetectorName;
  /** The matched span within the box's text, for sub-box narrowing. */
  start: number;
  end: number;
  confidence: number;
}

/** Digits only, so spacing and separators do not matter. */
function digits(value: string): string {
  return value.replace(/\D+/g, "");
}

/**
 * Luhn.
 *
 * Used to *raise* confidence on a card-shaped number, never to reject one.
 * A card number typed into a demo is often fake and often fails Luhn, and a
 * detector that only masks valid cards would leave a real one through the
 * moment a digit was misread by OCR — which is exactly when it matters.
 */
export function luhn(value: string): boolean {
  const d = digits(value);
  if (d.length < 12) return false;

  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

interface Pattern {
  detector: DetectorName;
  regex: RegExp;
  confidence: number;
  /** Optional refinement, which may only raise confidence. */
  boost?: (match: string) => number;
}

/**
 * The patterns.
 *
 * Written against text that has been through OCR, which is why several are
 * looser than a validator would be. OCR reads `O` for `0`, `l` for `1` and
 * drops spaces, so a pattern tuned to well-formed input misses precisely the
 * frames where the text was hard to read — and hard to read is not the same
 * as unreadable, especially when a viewer can pause.
 */
const PATTERNS: Pattern[] = [
  {
    detector: "email",
    // Deliberately permissive on both sides of the @: OCR mangles long
    // domains, a half-read address is still an address, and `a@b.com` is a
    // perfectly ordinary one that a `{2,}` local part would walk past.
    regex: /[A-Za-z0-9._%+-]+\s?@\s?[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    confidence: 0.95,
  },
  {
    detector: "card",
    // Four groups of four, or a run of 13–19 digits. Separators optional
    // because OCR loses them.
    regex: /\b(?:[0-9OlI]{4}[ -]?){3}[0-9OlI]{1,7}\b/g,
    confidence: 0.7,
    boost: (match) => (luhn(match.replace(/[OlI]/g, (c) => (c === "O" ? "0" : "1"))) ? 0.99 : 0.7),
  },
  {
    detector: "iban",
    regex: /\b[A-Z]{2}[0-9]{2}[ ]?(?:[A-Z0-9]{4}[ ]?){2,7}[A-Z0-9]{1,4}\b/g,
    confidence: 0.9,
  },
  {
    detector: "ssn",
    regex: /\b[0-9]{3}[- ][0-9]{2}[- ][0-9]{4}\b/g,
    confidence: 0.95,
  },
  {
    detector: "phone",
    regex: /(?:\+[0-9]{1,3}[ -]?)?(?:\([0-9]{2,4}\)[ -]?)?[0-9]{3,4}[ -][0-9]{3,4}(?:[ -][0-9]{2,4})?/g,
    confidence: 0.6,
  },
  {
    detector: "ip",
    regex: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
    confidence: 0.8,
  },
  {
    detector: "secret",
    // The shapes that are unambiguously a credential wherever they appear.
    regex: /\b(?:sk|pk|rk|whsec|ghp|gho|xox[baprs])[-_][A-Za-z0-9_-]{16,}|\bBearer\s+[A-Za-z0-9._-]{20,}/g,
    confidence: 0.99,
  },
  {
    detector: "postal",
    regex: /\b[0-9]{5}(?:-[0-9]{4})?\b|\b[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}\b/g,
    confidence: 0.5,
  },
];

/** Every detector hit in one text run. */
export function detectorsIn(text: string, enabled: DetectorName[]): DetectorHit[] {
  const wanted = new Set(enabled);
  const hits: DetectorHit[] = [];

  for (const pattern of PATTERNS) {
    if (!wanted.has(pattern.detector)) continue;

    // A fresh regex per pass: a shared /g/ carries lastIndex between calls,
    // which silently skips matches in every text after the first.
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    for (const match of text.matchAll(regex)) {
      if (match.index === undefined) continue;
      hits.push({
        detector: pattern.detector,
        start: match.index,
        end: match.index + match[0].length,
        confidence: pattern.boost ? pattern.boost(match[0]) : pattern.confidence,
      });
    }
  }

  return hits.sort((a, b) => a.start - b.start);
}

/**
 * Narrows a box to the part of its text that matched.
 *
 * OCR returns a box per line, and blurring a whole line to hide six digits
 * of it destroys the demo's readability for no security gain. The narrowing
 * is proportional — a monospace assumption — and is deliberately generous at
 * both ends, because a proportional estimate over a proportional font is
 * approximate and an approximate mask that stops one character short is not
 * a mask.
 */
export function narrow(box: TextBox, start: number, end: number, padChars = 1.5): TextBox {
  const length = box.text.length;
  if (length === 0) return box;

  const [x, y, w, h] = box.rect;
  const from = Math.max(0, (start - padChars) / length);
  const to = Math.min(1, (end + padChars) / length);

  return {
    ...box,
    rect: [x + w * from, y, Math.max(0.002, w * (to - from)), h],
  };
}
