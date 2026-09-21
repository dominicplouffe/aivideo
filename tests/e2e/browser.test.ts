import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";
import { APP_PAGES, BASE, FIXTURE_STRINGS, signUp } from "./harness";

/**
 * The same pages, in a real browser.
 *
 * The HTTP checks in `honesty.test.ts` read server-rendered markup. This one
 * catches what that cannot: a value that only appears after hydration, a
 * component that throws on the client, and a layout that overflows at phone
 * width. `AnalyticsView` in particular is a client component, and the bug
 * that put 8.4k views on every workspace lived inside one.
 */

const CHROMIUM = process.env.CHROMIUM_PATH;

async function launch(): Promise<Browser> {
  return chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
}

test("every app page renders in a browser with no console errors, at both widths", async (t) => {
  let browser: Browser;
  try {
    browser = await launch();
  } catch (cause) {
    // A missing browser is a missing tool, not a failing product.
    t.skip(`Chromium is not available: ${(cause as Error).message}`);
    return;
  }

  try {
    const session = await signUp("browser");
    const token = session.cookie.split("=")[1];
    const cookie = {
      name: "demoriff_session",
      value: token,
      domain: new URL(BASE).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax" as const,
    };

    const problems: string[] = [];

    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.addCookies([cookie]);
      const page = await ctx.newPage();

      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(String(e)));

      for (const path of APP_PAGES) {
        errors.length = 0;
        const response = await page.goto(BASE + path, { waitUntil: "networkidle" });

        if (response?.status() !== 200) {
          problems.push(`${width}px ${path}: HTTP ${response?.status()}`);
          continue;
        }

        // Horizontal overflow is the layout bug a screenshot hides: the page
        // looks fine and the reader has to scroll sideways to find out.
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        );
        if (overflows) problems.push(`${width}px ${path}: scrolls horizontally`);

        if (errors.length > 0) problems.push(`${width}px ${path}: console error ${errors[0]}`);

        // Hydrated markup, which is where a client component's own data
        // would show up if it still had any.
        const text = await page.content();
        const hits = FIXTURE_STRINGS.filter((s) => text.toLowerCase().includes(s.toLowerCase()));
        if (hits.length > 0) problems.push(`${width}px ${path}: contains ${hits.join(", ")}`);
      }

      await ctx.close();
    }

    assert.deepEqual(problems, [], `Browser checks failed:\n  ${problems.join("\n  ")}`);
  } finally {
    await browser.close();
  }
});
