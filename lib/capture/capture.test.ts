import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import path from "node:path";
import type { Browser, Page } from "playwright";
import type { CaptureEvent } from "./types";

/**
 * Capture is DOM code, so it is tested in a DOM.
 *
 * These run the *shipped bundle* — the same file the extension injects —
 * inside a real Chromium, against real clicks and real keystrokes. A test
 * against a re-implementation, or against a simulated `click()` on a fake
 * element, would prove something about the test rather than about the
 * recorder.
 */

const CHROMIUM = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  process.env.CHROMIUM_PATH ?? "",
].find((candidate) => candidate && existsSync(candidate));

const RUN = Boolean(CHROMIUM);

let browser: Browser | null = null;
let bundle = "";

const PAGE = `
<!doctype html>
<html><body>
  <header><h1 id="title">Meridian</h1></header>
  <main>
    <button data-testid="save" aria-label="Save changes">Save</button>
    <button id="publish">Publish</button>
    <label for="email">Work email</label>
    <input id="email" name="email" type="email" />
    <input id="pw" name="password" type="password" placeholder="Password" />
    <div class="row"><span>a</span><span>b</span><span id="target">c</span></div>
    <div style="height: 3000px"></div>
  </main>
</body></html>`;

before(async () => {
  if (!RUN) return;
  const { buildCaptureBundle } = await import("../../scripts/build-capture.mjs" as string) as typeof import("../../scripts/build-capture");
  const outfile = path.join(process.cwd(), "extension/dist/capture.js");
  await buildCaptureBundle(outfile);
  bundle = readFileSync(outfile, "utf8");

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ executablePath: CHROMIUM });
});

after(async () => {
  await browser?.close();
});

/**
 * Serves the fixture from a real origin.
 *
 * `setContent` leaves the page on `about:blank`, where `pushState` with a URL
 * is a SecurityError — so the single-page routing test would fail for a
 * reason that has nothing to do with the recorder.
 */
async function openPage(): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1000, height: 800 } });
  await page.route("https://demo.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: PAGE }),
  );
  await page.goto("https://demo.test/");
  await page.addScriptTag({ content: bundle });
  return page;
}

async function startRecording(page: Page) {
  await page.evaluate(() => {
    const api = (globalThis as unknown as { DemoRiffCapture: typeof import("./index") }).DemoRiffCapture;
    const observer = api.createObserver();
    (globalThis as unknown as { __obs: ReturnType<typeof api.createObserver> }).__obs = observer;
    observer.start();
  });
}

async function readEvents(page: Page): Promise<CaptureEvent[]> {
  return page.evaluate(() => {
    const observer = (globalThis as unknown as { __obs: { stop(): void; events: unknown[] } }).__obs;
    observer.stop();
    return observer.events as never;
  });
}

describe("capture", { skip: RUN ? false : "Chromium is not available" }, () => {
  it("describes a click by what a person would call it, not by its position", async () => {
    const page = await openPage();
    await startRecording(page);
    await page.click('[data-testid="save"]');
    const events = await readEvents(page);

    const click = events.find((e) => e.kind === "click")!;
    // A team that wrote a test id meant it to be the stable handle.
    assert.equal(click.selector, '[data-testid="save"]');
    assert.equal(click.role, "button");
    assert.equal(click.accessibleName, "Save changes");
    await page.close();
  });

  it("falls back from a test id to an id to a path", async () => {
    const page = await openPage();
    const described = await page.evaluate(() => {
      const api = (globalThis as unknown as { DemoRiffCapture: typeof import("./index") }).DemoRiffCapture;
      return {
        testId: api.cssPath(document.querySelector('[data-testid="save"]')!),
        id: api.cssPath(document.querySelector("#publish")!),
        path: api.cssPath(document.querySelector("#target")!),
        unnamed: api.cssPath(document.querySelectorAll(".row span")[1]!),
      };
    });

    assert.equal(described.testId, '[data-testid="save"]');
    assert.equal(described.id, "#publish");
    assert.equal(described.path, "#target");
    // No id anywhere: a positional path, and it actually resolves.
    assert.match(described.unnamed, /span:nth-of-type\(2\)/);
    await page.close();
  });

  it("names a form control by its label, which lives elsewhere in the tree", async () => {
    const page = await openPage();
    const name = await page.evaluate(() => {
      const api = (globalThis as unknown as { DemoRiffCapture: typeof import("./index") }).DemoRiffCapture;
      return api.accessibleName(document.querySelector("#email")!);
    });
    assert.equal(name, "Work email");
    await page.close();
  });

  it("records that typing happened and never what was typed", async () => {
    const page = await openPage();
    await startRecording(page);
    await page.click("#email");
    await page.type("#email", "renata@example.com");
    const events = await readEvents(page);

    const typing = events.filter((e) => e.kind === "input");
    assert.equal(typing.length > 0, true, "typing must be visible as an action");
    assert.equal(typing.every((e) => e.redacted === true), true);
    // The letters must not be anywhere in the log, in any field.
    const serialised = JSON.stringify(events);
    assert.equal(serialised.includes("renata"), false);
    assert.equal(serialised.includes("example.com"), false);
    await page.close();
  });

  it("records a password field's clicks without naming or valuing it", async () => {
    const page = await openPage();
    await startRecording(page);
    await page.click("#pw");
    await page.type("#pw", "hunter2");
    const events = await readEvents(page);

    const serialised = JSON.stringify(events);
    assert.equal(serialised.includes("hunter2"), false);
    // The placeholder says "Password"; even the *name* of the field is
    // withheld, because a step titled "type your password" in a published
    // guide is a step pointing at the credential prompt.
    const pwEvents = events.filter((e) => e.selector === "#pw");
    assert.equal(pwEvents.length > 0, true);
    assert.equal(pwEvents.every((e) => e.accessibleName === undefined), true);
    await page.close();
  });

  it("keeps command keys, which are actions rather than content", async () => {
    const page = await openPage();
    await startRecording(page);
    await page.click("#email");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+s");
    const events = await readEvents(page);

    const keys = events.filter((e) => e.kind === "key").map((e) => e.value);
    assert.equal(keys.includes("Enter"), true);
    assert.equal(keys.some((k) => k?.includes("Ctrl+s")), true);
    await page.close();
  });

  it("suppresses a double click into one intention", async () => {
    const page = await openPage();
    await startRecording(page);
    await page.dblclick('[data-testid="save"]');
    const events = await readEvents(page);

    // Two pushes 80ms apart is a twitch, not a camera move.
    assert.equal(events.filter((e) => e.kind === "click").length, 1);
    await page.close();
  });

  it("records bounds as viewport fractions, so a resize does not move them", async () => {
    const page = await openPage();
    await startRecording(page);
    await page.click("#publish");
    const events = await readEvents(page);

    const bounds = events.find((e) => e.kind === "click")!.bounds!;
    for (const value of [bounds.x, bounds.y, bounds.w, bounds.h]) {
      assert.equal(value >= 0 && value <= 1, true, `${value} is not a fraction`);
    }
    assert.equal(bounds.w > 0 && bounds.h > 0, true);
    await page.close();
  });

  it("sees a single-page route change that fires no navigation event", async () => {
    const page = await openPage();
    await startRecording(page);
    await page.evaluate(() => history.pushState({}, "", "/projects/onboarding"));
    const events = await readEvents(page);

    const routes = events.filter((e) => e.kind === "route").map((e) => e.value);
    // Without patching history the log would show a click and then, with no
    // explanation, a different screen.
    assert.equal(routes.some((url) => url?.endsWith("/projects/onboarding")), true);
    await page.close();
  });

  it("restores history when it stops, leaving the page as it found it", async () => {
    const page = await openPage();
    await startRecording(page);
    const patched = await page.evaluate(() => history.pushState.toString().includes("native code"));
    await readEvents(page);
    const restored = await page.evaluate(() => history.pushState.toString().includes("native code"));

    assert.equal(patched, false, "history should be patched while recording");
    assert.equal(restored, true, "and returned to the page untouched afterwards");
    await page.close();
  });

  it("throttles scroll instead of emitting one event per frame", async () => {
    const page = await openPage();
    await startRecording(page);
    await page.evaluate(async () => {
      for (let i = 0; i < 40; i++) {
        window.scrollTo(0, i * 50);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    });
    await page.waitForTimeout(250);
    const events = await readEvents(page);

    const scrolls = events.filter((e) => e.kind === "scroll").length;
    assert.equal(scrolls > 0, true, "scrolling must be visible");
    assert.equal(scrolls < 10, true, `40 scroll ticks produced ${scrolls} events`);
    await page.close();
  });

  it("sees an application that calls stopPropagation on its own clicks", async () => {
    const page = await openPage();
    await startRecording(page);
    await page.evaluate(() => {
      document.querySelector("#publish")!.addEventListener("click", (event) => {
        event.stopPropagation();
        event.stopImmediatePropagation();
      });
    });
    await page.click("#publish");
    const events = await readEvents(page);

    // Capture phase is why this works. A bubble-phase listener would record
    // nothing and the recording would be missing its most important click.
    assert.equal(events.some((e) => e.kind === "click" && e.selector === "#publish"), true);
    await page.close();
  });

  // --- masking -------------------------------------------------------------

  it("blurs a password field before any frame is encoded", async () => {
    const page = await openPage();
    const applied = await page.evaluate(() => {
      const api = (globalThis as unknown as { DemoRiffCapture: typeof import("./index") }).DemoRiffCapture;
      const mask = api.applyCaptureMasks(
        document,
        api.defaultMaskSelectors().map((selector) => ({ selector })),
      );
      const filter = getComputedStyle(document.querySelector("#pw")!).filter;
      const clean = getComputedStyle(document.querySelector("#email")!).filter;
      return { filter, clean, selectors: mask.selectors.length };
    });

    // The compositor never produces a clear frame of this field to capture.
    assert.match(applied.filter, /blur/);
    assert.equal(applied.clean, "none");
    assert.equal(applied.selectors > 0, true);
    await page.close();
  });

  it("drops one invalid selector without unapplying the other nine", async () => {
    const page = await openPage();
    const result = await page.evaluate(() => {
      const api = (globalThis as unknown as { DemoRiffCapture: typeof import("./index") }).DemoRiffCapture;
      const mask = api.applyCaptureMasks(document, [
        { selector: "#pw" },
        { selector: "((( not a selector" },
        { selector: "#email", style: "redact" as const },
      ]);
      return {
        selectors: mask.selectors,
        pw: getComputedStyle(document.querySelector("#pw")!).filter,
        email: getComputedStyle(document.querySelector("#email")!).backgroundColor,
      };
    });

    // A workspace policy is edited by humans; one typo must not leave the
    // rest of the rules unapplied.
    assert.deepEqual(result.selectors, ["#pw", "#email"]);
    assert.match(result.pw, /blur/);
    assert.equal(result.email, "rgb(0, 0, 0)");
    await page.close();
  });

  it("leaves no trace of itself once capture stops", async () => {
    const page = await openPage();
    const reverted = await page.evaluate(() => {
      const api = (globalThis as unknown as { DemoRiffCapture: typeof import("./index") }).DemoRiffCapture;
      const mask = api.applyCaptureMasks(document, [{ selector: "#pw" }]);
      const during = api.masksApplied(document);
      mask.revert();
      return { during, after: api.masksApplied(document) };
    });

    assert.deepEqual(reverted, { during: true, after: false });
    await page.close();
  });
});
