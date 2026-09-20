import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright";
import type { Snapshot } from "./snapshot";

/**
 * A snapshot has to do three things that pull against each other: look
 * exactly like what the person saw, render with no access to the original
 * server, and contain nothing the customer would not publish. So every test
 * here takes a snapshot in a real browser and then *renders it in a second
 * page* — because "the HTML looks right" and "the demo looks right" are
 * different claims, and only one of them is the product.
 */

const CHROMIUM = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  process.env.CHROMIUM_PATH ?? "",
].find((candidate) => candidate && existsSync(candidate));

const RUN = Boolean(CHROMIUM);
let browser: Browser | null = null;
let bundle = "";

const ORIGIN = "https://app.meridian.test";

const PAGE = `<!doctype html>
<html><head>
  <title>Meridian — Projects</title>
  <link rel="stylesheet" href="/assets/app.css" />
  <style>.local { color: rgb(0, 128, 0); }</style>
</head>
<body>
  <h1 class="brand">Meridian</h1>
  <img id="logo" src="/assets/logo.png" alt="Meridian" />
  <img id="hero" srcset="/assets/hero.png 1x, /assets/hero@2x.png 2x" src="/assets/hero.png" alt="" />
  <a id="docs" href="/docs">Docs</a>
  <a id="danger" href="javascript:alert(1)">Click</a>
  <button id="boom" onclick="window.__pwned = true">Boom</button>
  <img id="evil" src="/assets/missing.png" onerror="window.__pwned = true" />
  <form>
    <input id="email" name="email" type="email" placeholder="Work email" />
    <input id="pw" name="password" type="password" placeholder="Password" />
  </form>
  <iframe id="frame" src="https://third-party.test/widget"></iframe>
  <my-table id="shadow"></my-table>
  <p class="local">Local style</p>
  <script>
    window.__ran = true;
    const host = document.getElementById("shadow");
    host.attachShadow({ mode: "open" }).innerHTML =
      '<style>b { color: rgb(255, 0, 0); }</style><b id="inside">Shadow content</b>';
  </script>
</body></html>`;

const APP_CSS = `.brand { color: rgb(110, 86, 248); }
.hero { background-image: url("../img/bg.png"); }
.absolute { background-image: url("https://cdn.test/x.png"); }`;

before(async () => {
  if (!RUN) return;
  const { buildCaptureBundle } = (await import("../../scripts/build-capture.mjs" as string)) as typeof import("../../scripts/build-capture");
  const outfile = path.join(process.cwd(), "extension/dist/capture.js");
  await buildCaptureBundle(outfile);
  bundle = readFileSync(outfile, "utf8");

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ executablePath: CHROMIUM });
});

after(async () => {
  await browser?.close();
});

async function openPage(): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = route.request().url();
    if (url.endsWith("/assets/app.css")) {
      return route.fulfill({ status: 200, contentType: "text/css", body: APP_CSS });
    }
    if (url.endsWith("/assets/logo.png")) {
      // A one-pixel PNG, small enough to inline.
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        ),
      });
    }
    if (url.endsWith("/assets/missing.png")) return route.fulfill({ status: 404, body: "" });
    // Charset in the header only, exactly like plenty of real sites. The
    // fixture has no <meta charset>, which is the case the snapshot has to
    // survive.
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: PAGE });
  });
  await page.goto(`${ORIGIN}/projects`);
  await page.addScriptTag({ content: bundle });
  return page;
}

async function take(page: Page, targetSelector?: string): Promise<Snapshot> {
  return page.evaluate((selector) => {
    const api = (globalThis as unknown as { DemoRiffCapture: typeof import("./index") }).DemoRiffCapture;
    return api.captureSnapshot(document, { targetSelector: selector });
  }, targetSelector) as Promise<Snapshot>;
}

/** Renders a snapshot the way the demo viewer would: no network, no origin. */
async function render(snapshot: Snapshot): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
  // Every request is refused. If the snapshot needs the customer's server to
  // look right, it is not a snapshot.
  await page.route("**/*", (route) => route.abort());
  await page.setContent(snapshot.html, { waitUntil: "domcontentloaded" });
  return page;
}

describe("dom snapshots", { skip: RUN ? false : "Chromium is not available" }, () => {
  it("strips every way a snapshot could execute code", async () => {
    const page = await openPage();
    const snapshot = await take(page);
    await page.close();

    assert.equal(snapshot.html.includes("<script"), false);
    assert.equal(snapshot.html.includes("onclick"), false);
    assert.equal(snapshot.html.includes("onerror"), false);
    assert.equal(/javascript:/i.test(snapshot.html), false);

    // Not just absent from the markup — inert when the markup is parsed.
    const replay = await render(snapshot);
    await replay.waitForTimeout(150);
    const executed = await replay.evaluate(() => ({
      ran: (window as unknown as { __ran?: boolean }).__ran ?? false,
      pwned: (window as unknown as { __pwned?: boolean }).__pwned ?? false,
    }));
    assert.deepEqual(executed, { ran: false, pwned: false });
    await replay.close();
  });

  it("holds no field values, typed or shipped", async () => {
    const page = await openPage();
    await page.fill("#email", "renata@example.com");
    await page.fill("#pw", "hunter2");
    const snapshot = await take(page);
    await page.close();

    // The recorder cannot know which document on screen was confidential,
    // so it treats all of them as confidential.
    assert.equal(snapshot.html.includes("renata"), false);
    assert.equal(snapshot.html.includes("hunter2"), false);

    const replay = await render(snapshot);
    const values = await replay.evaluate(() => ({
      email: (document.querySelector("#email") as HTMLInputElement).value,
      pw: (document.querySelector("#pw") as HTMLInputElement).value,
      pwPlaceholder: document.querySelector("#pw")!.getAttribute("placeholder"),
      masked: document.querySelector("#pw")!.getAttribute("data-demoriff-masked"),
    }));
    assert.deepEqual(values, { email: "", pw: "", pwPlaceholder: "", masked: "true" });
    await replay.close();
  });

  it("renders with the customer's styling and no network at all", async () => {
    const page = await openPage();
    const snapshot = await take(page);
    await page.close();

    const replay = await render(snapshot);
    const colours = await replay.evaluate(() => ({
      // From the cross-origin-readable stylesheet, inlined.
      brand: getComputedStyle(document.querySelector(".brand")!).color,
      // From the inline <style>, preserved.
      local: getComputedStyle(document.querySelector(".local")!).color,
    }));

    assert.deepEqual(colours, { brand: "rgb(110, 86, 248)", local: "rgb(0, 128, 0)" });
    await replay.close();
  });

  it("resolves a stylesheet's relative urls against the stylesheet", async () => {
    const page = await openPage();
    const snapshot = await take(page);
    await page.close();

    // `url("../img/bg.png")` in /assets/app.css means /img/bg.png, not
    // /projects/../img/bg.png. Resolving against the document would point
    // at the wrong file, and only for pages at some depths.
    assert.equal(snapshot.html.includes(`${ORIGIN}/img/bg.png`), true);
    // An already-absolute url is left exactly as it was.
    assert.equal(snapshot.html.includes("https://cdn.test/x.png"), true);
  });

  it("absolutises src, href and every candidate in a srcset", async () => {
    const page = await openPage();
    const snapshot = await take(page);
    await page.close();

    assert.equal(snapshot.html.includes(`src="${ORIGIN}/assets/logo.png"`), true);
    assert.equal(snapshot.html.includes(`href="${ORIGIN}/docs"`), true);
    // A srcset is a comma-separated list with descriptors, not a URL.
    assert.match(snapshot.html, /srcset="[^"]*hero\.png 1x[^"]*hero@2x\.png 2x"/);
    assert.equal(snapshot.html.includes(`${ORIGIN}/assets/hero@2x.png 2x`), true);
  });

  it("keeps a custom element's shadow DOM, which outerHTML cannot see", async () => {
    const page = await openPage();
    const snapshot = await take(page);
    await page.close();

    // Without declarative shadow DOM a component library renders as a row
    // of empty custom elements: `<my-table></my-table>` and nothing else.
    assert.match(snapshot.html, /<template shadowrootmode="open">/);

    const replay = await render(snapshot);
    const inside = await replay.evaluate(() => {
      const host = document.querySelector("#shadow")!;
      const node = host.shadowRoot?.querySelector("#inside");
      return { text: node?.textContent ?? null, colour: node ? getComputedStyle(node).color : null };
    });
    assert.deepEqual(inside, { text: "Shadow content", colour: "rgb(255, 0, 0)" });
    await replay.close();
  });

  it("defuses an iframe rather than loading the live application inside the demo", async () => {
    const page = await openPage();
    const snapshot = await take(page);
    await page.close();

    assert.equal(snapshot.html.includes("third-party.test/widget"), false);
    assert.match(snapshot.html, /data-demoriff-frame="removed"/);
    assert.equal(
      snapshot.skipped.some((s) => s.url.includes("third-party.test") && s.reason === "cross-origin"),
      true,
    );
  });

  it("states its charset even when the original page only sent a header", async () => {
    const page = await openPage();
    const snapshot = await take(page);
    await page.close();

    // The fixture declares UTF-8 in Content-Type and nowhere in its markup.
    // Served from an iframe or a blob, that header is gone.
    assert.equal(PAGE.includes("charset"), false);
    assert.match(snapshot.html, /<meta charset="utf-8">/);

    const replay = await render(snapshot);
    assert.equal(await replay.title(), "Meridian — Projects");
    await replay.close();
  });

  it("records the step's target and the viewport it was seen in", async () => {
    const page = await openPage();
    const snapshot = await take(page, "#docs");
    await page.close();

    assert.equal(snapshot.targetSelector, "#docs");
    assert.equal(snapshot.viewport.width, 1000);
    assert.equal(snapshot.viewport.height, 700);
    assert.equal(snapshot.title, "Meridian — Projects");
    assert.equal(snapshot.url, `${ORIGIN}/projects`);
  });

  // --- inlining --------------------------------------------------------------

  it("inlines assets so the demo still works after the customer redeploys", async () => {
    const page = await openPage();
    const snapshot = await take(page);
    const inlined = await page.evaluate(async (snap) => {
      const api = (globalThis as unknown as { DemoRiffCapture: typeof import("./index") }).DemoRiffCapture;
      return api.inlineAssets(snap as never);
    }, snapshot as never) as Snapshot;
    await page.close();

    assert.match(inlined.html, /src="data:image\/png;base64,/);
    assert.equal(inlined.html.includes(`${ORIGIN}/assets/logo.png`), false);
  });

  it("says what it could not inline instead of dropping it silently", async () => {
    const page = await openPage();
    const snapshot = await take(page);
    const inlined = await page.evaluate(async (snap) => {
      const api = (globalThis as unknown as { DemoRiffCapture: typeof import("./index") }).DemoRiffCapture;
      return api.inlineAssets(snap as never, { maxAssetBytes: 10 });
    }, snapshot as never) as Snapshot;
    await page.close();

    // Under a 10-byte ceiling nothing fits. The snapshot keeps the URL and
    // records why, because a demo missing its logo should be diagnosable.
    assert.equal(inlined.skipped.some((s) => s.reason === "too-large"), true);
    assert.equal(inlined.html.includes(`${ORIGIN}/assets/logo.png`), true);
  });

  it("stops inlining at the total budget rather than building a 90MB demo", async () => {
    const page = await openPage();
    const snapshot = await take(page);
    const inlined = await page.evaluate(async (snap) => {
      const api = (globalThis as unknown as { DemoRiffCapture: typeof import("./index") }).DemoRiffCapture;
      return api.inlineAssets(snap as never, { maxTotalBytes: (snap as { html: string }).html.length });
    }, snapshot as never) as Snapshot;
    await page.close();

    // The budget was already spent by the markup itself, so no asset may be
    // added. A demo nobody waits for is a demo nobody sees.
    assert.equal(inlined.html.includes("data:image/png;base64,"), false);
    assert.equal(inlined.skipped.some((s) => s.reason === "too-large"), true);
  });
});
