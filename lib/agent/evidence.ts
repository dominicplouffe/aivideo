import type { Page } from "playwright";
import { getStorage } from "@/lib/storage";
import { recordAction, type Run } from "./run";

/**
 * What the browser was showing when something went wrong.
 *
 * A trail line that says "the site did not accept the sign-in" or "not
 * found on the page" is a conclusion; the person reading it needs the
 * evidence to act on it. So at a failure the agent keeps a screenshot and
 * the page's own error text — "Invalid email or password", "Something went
 * wrong" — beside the line, stored under the workspace like a recording and
 * shown only to it.
 *
 * Best effort: evidence that cannot be taken never turns a failure into a
 * different one.
 */

/** Text a page shows to explain a failure: alerts, error messages, toasts. */
async function errorTextOn(page: Page): Promise<string | null> {
  return page
    .evaluate(() => {
      const selectors = [
        '[role="alert"]',
        '[aria-live="assertive"]',
        '[aria-live="polite"]',
        '[class*="error" i]',
        '[class*="alert" i]',
        '[class*="toast" i]',
        '[class*="invalid" i]',
        '[data-error]',
      ];
      const seen = new Set<string>();
      for (const selector of selectors) {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
          const text = (el.innerText || "").replace(/\s+/g, " ").trim();
          if (text && text.length < 300 && (el.offsetWidth || el.offsetHeight)) seen.add(text);
        }
      }
      return [...seen].slice(0, 3).join(" · ") || null;
    })
    .catch(() => null);
}

export async function keepEvidence(
  run: Run,
  page: Page,
  input: { outlineOrdinal?: number | null; startedAt: number; what: string },
): Promise<{ key: string | null; pageText: string | null }> {
  let key: string | null = null;
  const pageText = await errorTextOn(page);
  try {
    const png = await page.screenshot({ type: "png", fullPage: false });
    key = `agent/${run.id}/${Date.now().toString(36)}.png`;
    await getStorage().put({ workspaceId: run.workspaceId, path: key }, new Uint8Array(png), "image/png");
  } catch {
    key = null;
  }
  await recordAction(run.id, {
    kind: "screenshot",
    outlineOrdinal: input.outlineOrdinal ?? null,
    url: page.url(),
    target: input.what,
    detail: { evidence: key, pageText, title: await page.title().catch(() => null) },
    atMs: Date.now() - input.startedAt,
  }).catch(() => {});
  return { key, pageText };
}
