import type { MaskRule } from "./types";

/**
 * Masking at capture time.
 *
 * The rule this whole module exists to enforce: **the unmasked pixels never
 * exist in a file**. Blurring in post means there is a moment — on disk, in a
 * bucket, in a render worker's scratch directory — when the customer's
 * production data is sitting there in full resolution, and every one of those
 * moments is a breach waiting for a misconfiguration.
 *
 * So the page itself is altered before the frame is encoded. A CSS filter is
 * applied by the browser during paint; the compositor never produces a clear
 * frame to capture.
 */

const STYLE_ID = "demoriff-capture-mask";

export interface AppliedMask {
  /** The selectors that were actually written into the stylesheet. */
  selectors: string[];
  /** Removes the mask. Called when capture stops, never while it runs. */
  revert(): void;
}

function declarationFor(style: MaskRule["style"]): string {
  switch (style) {
    case "redact":
      // A solid block, not a dark tint: a 90%-opaque overlay still leaks the
      // shape of the text underneath, and shapes of digits are readable.
      return "background: #000 !important; color: transparent !important; text-shadow: none !important;";
    case "pixelate":
      // No CSS pixelate exists. A heavy blur plus contrast is the closest
      // honest approximation, and it destroys strictly more information.
      return "filter: blur(8px) contrast(0.6) !important;";
    case "blur":
    default:
      return "filter: blur(10px) !important;";
  }
}

/**
 * Applies masks to a document and returns a teardown.
 *
 * Invalid selectors are dropped rather than thrown: a workspace policy is
 * edited by humans, and one typo in a rule must not leave the other nine
 * unapplied. The selectors that survive are reported so the recording's
 * manifest can state exactly what was hidden.
 */
export function applyCaptureMasks(doc: Document, rules: MaskRule[]): AppliedMask {
  const valid: MaskRule[] = [];

  for (const rule of rules) {
    if (!rule.selector) continue;
    try {
      doc.querySelector(rule.selector);
      valid.push(rule);
    } catch {
      // Not a selector. Skipping it is right; failing the recording is not.
    }
  }

  const css = valid
    .map((rule) => `${rule.selector} { ${declarationFor(rule.style)} }`)
    .join("\n");

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  // `documentElement` rather than `head`: a page mid-navigation may not have
  // a head yet, and a mask that is not applied yet is a mask that failed.
  (doc.head ?? doc.documentElement).appendChild(style);

  return {
    selectors: valid.map((rule) => rule.selector),
    revert() {
      style.remove();
    },
  };
}

/** True when the document currently has capture masks applied. */
export function masksApplied(doc: Document): boolean {
  return doc.getElementById(STYLE_ID) !== null;
}
