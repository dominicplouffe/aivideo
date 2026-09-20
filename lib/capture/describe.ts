import type { CaptureBounds } from "./types";

/**
 * Describing what the person clicked.
 *
 * Everything here answers one question: six months from now, with the page
 * redesigned, what would let a human — or the direction engine — recognise
 * this element? A CSS path built from `div > div > div:nth-child(3)` answers
 * it badly. `[data-testid="save"]`, role `button`, named "Save changes"
 * answers it well, and it is also what the generated step-by-step guide
 * prints.
 */

/** Attributes a team chose deliberately, in the order we trust them. */
const TEST_ID_ATTRIBUTES = ["data-testid", "data-test-id", "data-test", "data-cy", "data-qa"];

/** Ids that look generated rather than authored, and so are not worth citing. */
const GENERATED_ID = /^(?:[a-z]*[-_]?)?(?:\d{3,}|[0-9a-f]{8,}|:r[0-9a-z]+:|radix-|headlessui-|mui-|react-aria-)/i;

const IMPLICIT_ROLES: Record<string, string> = {
  a: "link",
  button: "button",
  select: "combobox",
  textarea: "textbox",
  summary: "button",
  h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
  nav: "navigation",
  main: "main",
  form: "form",
  table: "table",
  dialog: "dialog",
  img: "img",
  li: "listitem",
  ul: "list",
  ol: "list",
};

const INPUT_ROLES: Record<string, string> = {
  button: "button",
  submit: "button",
  reset: "button",
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  search: "searchbox",
  email: "textbox",
  tel: "textbox",
  text: "textbox",
  url: "textbox",
  number: "spinbutton",
  password: "textbox",
};

/** The element's role: explicit if given, otherwise implied by its tag. */
export function roleOf(element: Element): string | undefined {
  const explicit = element.getAttribute("role");
  if (explicit) return explicit.trim().split(/\s+/)[0];

  const tag = element.tagName.toLowerCase();
  if (tag === "input") {
    const type = (element.getAttribute("type") ?? "text").toLowerCase();
    return INPUT_ROLES[type] ?? "textbox";
  }
  if (tag === "a") return element.hasAttribute("href") ? "link" : undefined;
  return IMPLICIT_ROLES[tag];
}

/** Collapses whitespace and caps length, because a name is a label not a paragraph. */
function tidy(text: string | null | undefined, max = 120): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/**
 * The element's accessible name.
 *
 * A pragmatic subset of the accname algorithm, in its precedence order. The
 * full specification handles cases this will not — nested labelling chains,
 * `aria-owns` reparenting — and getting those wrong costs a slightly worse
 * step title, which is the right amount to pay for a function that runs on
 * every click without blocking the page.
 */
export function accessibleName(element: Element): string | undefined {
  const label = tidy(element.getAttribute("aria-label"));
  if (label) return label;

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    const named = tidy(text);
    if (named) return named;
  }

  // A form control is named by its <label>, which is usually somewhere else
  // in the tree entirely.
  const id = element.getAttribute("id");
  if (id) {
    const escaped = cssEscape(id);
    const labelEl = element.ownerDocument.querySelector(`label[for="${escaped}"]`);
    const named = tidy(labelEl?.textContent);
    if (named) return named;
  }
  const wrapping = element.closest("label");
  if (wrapping) {
    const named = tidy(wrapping.textContent);
    if (named) return named;
  }

  const alt = tidy(element.getAttribute("alt"));
  if (alt) return alt;
  const title = tidy(element.getAttribute("title"));
  if (title) return title;
  const placeholder = tidy(element.getAttribute("placeholder"));
  if (placeholder) return placeholder;

  // A button's own text is its name. An input's *value* is not text content,
  // and for a submit button it is the label the user reads.
  if (element.tagName.toLowerCase() === "input") {
    const type = (element.getAttribute("type") ?? "").toLowerCase();
    if (type === "submit" || type === "button" || type === "reset") {
      return tidy(element.getAttribute("value"));
    }
    return undefined;
  }

  return tidy(element.textContent);
}

/** Minimal CSS identifier escaping, for environments without CSS.escape. */
export function cssEscape(value: string): string {
  const native = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS?.escape;
  if (native) return native(value);
  return value.replace(/["\\\]\[#.:>+~*^$|()=\s]/g, (c) => `\\${c}`);
}

function stableId(element: Element): string | null {
  const id = element.getAttribute("id");
  if (!id || GENERATED_ID.test(id)) return null;
  // An id is only useful if it is actually unique on the page.
  const matches = element.ownerDocument.querySelectorAll(`#${cssEscape(id)}`);
  return matches.length === 1 ? id : null;
}

/**
 * A selector that will still find this element after the next refactor.
 *
 * Preference order is a statement about what a team intended to be stable: a
 * test id first, then a hand-written id, then a positional path as the
 * fallback nobody wants. The path is capped in depth, because a
 * twelve-generation chain of `div:nth-of-type(2)` is not a selector, it is a
 * fingerprint of today's markup.
 */
export function cssPath(element: Element, maxDepth = 5): string {
  for (const attribute of TEST_ID_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value) return `[${attribute}="${value}"]`;
  }

  const id = stableId(element);
  if (id) return `#${cssEscape(id)}`;

  const parts: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < maxDepth && current.tagName.toLowerCase() !== "html") {
    const tag = current.tagName.toLowerCase();
    const ownId = stableId(current);
    if (ownId) {
      // An ancestor with a real id ends the chain: everything above it is
      // noise, and the selector is shorter and more durable for stopping.
      parts.unshift(`#${cssEscape(ownId)}`);
      break;
    }

    const parent: Element | null = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }

    const siblings = Array.from(parent.children).filter(
      (child) => child.tagName === current!.tagName,
    );
    parts.unshift(
      siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(current) + 1})` : tag,
    );

    current = parent;
    depth += 1;
  }

  return parts.join(" > ");
}

/**
 * Bounds normalised against the viewport.
 *
 * Stored as fractions so the log survives the window being resized between
 * capture and edit, and so a zoom anchor means the same thing at 720p as at
 * 4K. Clamped, because a partially off-screen target is common and an anchor
 * outside the frame renders as black.
 */
export function normalizeBounds(
  rect: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
): CaptureBounds | undefined {
  if (viewport.width <= 0 || viewport.height <= 0) return undefined;
  if (rect.width <= 0 || rect.height <= 0) return undefined;

  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const x = clamp(rect.x / viewport.width);
  const y = clamp(rect.y / viewport.height);

  return {
    x,
    y,
    w: clamp(rect.width / viewport.width - Math.max(0, -rect.x / viewport.width)),
    h: clamp(rect.height / viewport.height - Math.max(0, -rect.y / viewport.height)),
  };
}

/** The centre of a bounds box, which is what a zoom anchors on. */
export function centreOf(bounds: CaptureBounds): { x: number; y: number } {
  return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
}
