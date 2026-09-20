import { createHash } from "node:crypto";

/**
 * The guide, as a document.
 *
 * One vendor-neutral shape that every connector renders. Building a Zendesk
 * article and a Confluence page from the same structure is the only way the
 * two stay the same document; rendering each from its own code path means
 * they diverge within a release, and the customer who publishes to both is
 * the one who notices.
 *
 * Steps carry the *interaction*, not just a sentence. "Click **Save
 * changes**" is what a reader needs, and it is also what lets a re-render
 * update the wording without losing which element the step is about.
 */

export interface GuideStep {
  ordinal: number;
  title: string;
  /** Prose, already stripped of filler by the editor. */
  body: string;
  /** e.g. `click`, `type`, `navigate`. Rendered as the step's verb. */
  action?: string | null;
  /** The element, as `lib/capture/describe.ts` names it. */
  target?: string | null;
  screenshotUrl?: string | null;
  startSec?: number;
}

export interface GuideDocument {
  title: string;
  summary?: string | null;
  locale: string;
  steps: GuideStep[];
  /** Where the video lives, linked from the article's header. */
  videoUrl?: string | null;
  /** The interactive tour, when one was published. */
  tourUrl?: string | null;
  updatedAt: Date;
}

/* ------------------------------------------------------------- rendering */

/** HTML-escaped, always. A step title is customer-supplied text. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The article body, as HTML.
 *
 * Every help centre on the list accepts HTML; only some accept Markdown, and
 * the ones that do each accept a different dialect. Rendering HTML once and
 * converting where a vendor insists on blocks is fewer places to be wrong.
 *
 * No `<script>`, no inline event handlers, no `style` attributes — not
 * because a help centre would run ours, but because this text travels into
 * somebody else's site under their domain, and what we send them is our
 * responsibility.
 */
export function toHtml(document: GuideDocument): string {
  const parts: string[] = [];

  if (document.summary) parts.push(`<p>${escapeHtml(document.summary)}</p>`);

  if (document.videoUrl || document.tourUrl) {
    const links: string[] = [];
    if (document.videoUrl) links.push(`<a href="${escapeHtml(document.videoUrl)}">Watch the video</a>`);
    if (document.tourUrl) links.push(`<a href="${escapeHtml(document.tourUrl)}">Try the interactive demo</a>`);
    parts.push(`<p>${links.join(" &middot; ")}</p>`);
  }

  parts.push("<ol>");
  for (const step of document.steps) {
    const body: string[] = [`<p><strong>${escapeHtml(step.title)}</strong></p>`];
    if (step.body) body.push(`<p>${escapeHtml(step.body)}</p>`);
    if (step.screenshotUrl) {
      body.push(
        `<p><img src="${escapeHtml(step.screenshotUrl)}" alt="${escapeHtml(step.title)}" loading="lazy"></p>`,
      );
    }
    parts.push(`<li>${body.join("")}</li>`);
  }
  parts.push("</ol>");

  return parts.join("\n");
}

/** The same document as Markdown, for the vendors that prefer it. */
export function toMarkdown(document: GuideDocument): string {
  const lines: string[] = [`# ${document.title}`, ""];

  if (document.summary) lines.push(document.summary, "");
  if (document.videoUrl) lines.push(`[Watch the video](${document.videoUrl})`, "");
  if (document.tourUrl) lines.push(`[Try the interactive demo](${document.tourUrl})`, "");

  for (const step of document.steps) {
    lines.push(`${step.ordinal}. **${step.title}**`);
    if (step.body) lines.push("", `   ${step.body}`);
    if (step.screenshotUrl) lines.push("", `   ![${step.title}](${step.screenshotUrl})`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/* ---------------------------------------------------------------- hashing */

/**
 * One hash function, over visible text.
 *
 * Both sides of a two-way sync have to be measured the same way or the
 * comparison means nothing. Our side is rendered to HTML and hashed through
 * here; the help centre's side is fetched and hashed through here. That the
 * two are comparable is the entire basis of "did anybody change this".
 *
 * Visible text, not markup, because the comparison has to survive a round
 * trip through somebody else's editor: help centres reflow HTML, rewrite
 * entities, and wrap articles in templates of their own. Two articles hash
 * alike when they *read* alike, which is the only question worth asking.
 *
 * Nothing time-varying goes in. Re-rendering a guide updates its timestamp
 * on every run, and a hash that moved with it would report every project as
 * edited on every sync — which trains people to ignore the one time it is
 * true.
 */
export function textHash(html: string): string {
  return createHash("sha256").update(visibleText(html), "utf8").digest("hex");
}

/** The hash of a document as the help centre will hold it. */
export function documentHash(document: GuideDocument): string {
  return textHash(`${escapeHtml(document.title)} ${toHtml(document)}`);
}

export function visibleText(html: string): string {
  return normalise(
    html
      // Script and style contents are not visible text, and a help centre
      // that wraps our article in its own template would otherwise make
      // every article look changed.
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|li|h[1-6]|div|tr)>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#3?9;/gi, "'"),
  );
}

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
