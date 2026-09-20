/**
 * Deciding what must never be recorded.
 *
 * The threat here is not exotic. Someone records a demo of their admin
 * console, types their own password into a re-auth prompt halfway through,
 * and publishes the video. The recorder's job is to make that impossible by
 * default rather than to offer a checkbox they will remember to tick on the
 * second take.
 *
 * Detection is deliberately over-broad. A field wrongly treated as sensitive
 * costs a blurred rectangle in one demo. A field wrongly treated as safe
 * costs a customer their credentials, in a video they published themselves.
 * Those are not comparable, so this errs in one direction only.
 */

/** Autocomplete tokens that name a secret outright. */
const SENSITIVE_AUTOCOMPLETE = new Set([
  "current-password",
  "new-password",
  "one-time-code",
  "cc-number",
  "cc-csc",
  "cc-exp",
  "cc-exp-month",
  "cc-exp-year",
]);

/** Names and ids that mean the same thing in every codebase. */
const SENSITIVE_NAME = /(pass(word|wd|phrase)?|secret|token|api[-_]?key|auth|ssn|social[-_]?security|credit[-_]?card|card[-_]?number|cvv|cvc|security[-_]?code|routing|iban|account[-_]?number|pin\b|otp|mfa|2fa|seed[-_]?phrase|private[-_]?key)/i;

/** Attributes a team can add to opt a field out of capture explicitly. */
const OPT_OUT_ATTRIBUTES = ["data-private", "data-sensitive", "data-demoriff-mask"];

export function isSensitiveField(element: Element): boolean {
  const tag = element.tagName.toLowerCase();

  for (const attribute of OPT_OUT_ATTRIBUTES) {
    if (element.hasAttribute(attribute)) return true;
    if (element.closest(`[${attribute}]`)) return true;
  }

  if (tag === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    if (type === "password") return true;
    // A masked field's neighbours are usually part of the same secret.
    if (type === "hidden") return true;
  }

  const autocomplete = (element.getAttribute("autocomplete") ?? "").toLowerCase();
  for (const token of autocomplete.split(/\s+/)) {
    if (SENSITIVE_AUTOCOMPLETE.has(token)) return true;
  }

  for (const attribute of ["name", "id", "aria-label", "placeholder"]) {
    const value = element.getAttribute(attribute);
    if (value && SENSITIVE_NAME.test(value)) return true;
  }

  return false;
}

/**
 * Selectors masked in every recording unless a workspace turns them off.
 *
 * These are pixels, not just log entries: they are blurred in the page before
 * the frame is encoded, so the unblurred version never exists in a file
 * anyone could recover.
 */
export function defaultMaskSelectors(): string[] {
  return [
    'input[type="password"]',
    'input[autocomplete="current-password"]',
    'input[autocomplete="new-password"]',
    'input[autocomplete="one-time-code"]',
    'input[autocomplete^="cc-"]',
    "[data-private]",
    "[data-sensitive]",
    "[data-demoriff-mask]",
  ];
}

/**
 * True when a key press is safe to record verbatim.
 *
 * Navigation and command keys describe *what the person did* and carry no
 * content: "they pressed Enter" is the step. Printable characters are
 * content, and content is never recorded — not the letters of a password,
 * and not the letters of anything else, because the recorder has no way to
 * know which document on screen was confidential.
 */
const RECORDABLE_KEYS = new Set([
  "Enter", "Tab", "Escape", "Backspace", "Delete",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown",
]);

export function isRecordableKey(key: string, hasModifier: boolean): boolean {
  if (RECORDABLE_KEYS.has(key)) return true;
  // A shortcut is an action: Cmd-S is "they saved", not "they typed s".
  if (hasModifier && key.length === 1) return true;
  return false;
}
