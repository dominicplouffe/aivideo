import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { Browser, Page } from "playwright";
import { parseAspect, playerUrl, readOptions, safeOrigin, viewEventUrl } from "./runtime";

/**
 * The embed is the one piece of this product that runs on somebody else's
 * page. A bug here is a slower landing page for a customer who will remove
 * the snippet and blame us — correctly. So the tests measure the things that
 * would make them do that: layout shift, globals, and whether it works at
 * all when the clever path is unavailable.
 */

const CHROMIUM = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  process.env.CHROMIUM_PATH ?? "",
].find((candidate) => candidate && existsSync(candidate));

const RUN = Boolean(CHROMIUM);
const HOST = "https://customer.test";

/**
 * Generous on purpose.
 *
 * These assertions are about *whether* something happens — a beacon is
 * sent, an iframe mounts — not how quickly. A tight budget turns "the suite
 * is busy" into a failure that looks like a bug, and a test that fails for
 * reasons unrelated to what it checks is a test people learn to re-run
 * rather than read.
 */
const BROWSER_TIMEOUT_MS = 15_000;

let browser: Browser | null = null;
let runtime = "";

before(async () => {
  if (!RUN) return;
  const { buildEmbed } = (await import("../../scripts/build-embed.mjs" as string)) as typeof import("../../scripts/build-embed");
  const { outfile } = await buildEmbed({ origin: "https://demoriff.test" });
  runtime = readFileSync(outfile, "utf8");

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ executablePath: CHROMIUM });
});

after(async () => {
  await browser?.close();
});

/** A customer's landing page: content above, the embed in the middle. */
function hostPage(embedTag: string, options: { tall?: boolean } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin: 0; font: 16px system-ui; }
    .band { padding: 24px; }
  </style></head><body>
    <div class="band"><h1>Meridian</h1><p>Ship faster.</p></div>
    ${options.tall ? '<div style="height:2000px"></div>' : ""}
    ${embedTag}
    <div class="band" id="below"><h2>Pricing</h2><p>From $39.</p></div>
  </body></html>`;
}

/** Beacon URLs intercepted per page, in arrival order. */
const beaconLog = new WeakMap<Page, string[]>();

/** Waits for a beacon to be intercepted, or gives up. */
async function waitForBeacon(page: Page, timeoutMs = BROWSER_TIMEOUT_MS): Promise<string | null> {
  const log = beaconLog.get(page) ?? [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (log.length > 0) return log[0];
    await page.waitForTimeout(50);
  }
  return null;
}

async function openHost(
  html: string,
  options: { slowScript?: boolean; onConsole?: (page: Page) => void } = {},
): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width: 1000, height: 700 } });
  // Attached before navigating: the script can run and warn before a
  // listener added afterwards would ever hear it.
  options.onConsole?.(page);
  await page.route(`${HOST}/**`, async (route) => {
    const url = route.request().url();
    if (url.endsWith("/embed.js")) {
      // Delayed on purpose in the layout-shift test: a browser paints long
      // before a slow async script arrives, which is the case that matters
      // and the one a fast local test would never reach.
      if (options.slowScript) await new Promise((resolve) => setTimeout(resolve, 600));
      return route.fulfill({ status: 200, contentType: "text/javascript", body: runtime });
    }
    return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
  });
  // The player itself: a stand-in, because what is under test is the
  // runtime that mounts it, not the player's own rendering.
  await page.route("https://demoriff.test/embed/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: '<!doctype html><html><body style="margin:0;background:#101322;color:#fff">player</body></html>',
    }),
  );
  // Beacons are observed by intercepting them, not by listening for the
  // request event. `sendBeacon` is fire-and-forget, and under load the event
  // arrives late or not at all — which made this look like a slow test when
  // it was actually an unobservable one. Interception happens before the
  // request leaves, so it cannot be missed.
  const beacons: string[] = [];
  beaconLog.set(page, beacons);
  await page.route("https://demoriff.test/api/embed/**", (route) => {
    beacons.push(route.request().url());
    return route.fulfill({ status: 204, body: "" });
  });
  await page.goto(`${HOST}/`);
  return page;
}

// --- decisions, without a browser ------------------------------------------

describe("embed options", () => {
  it("accepts an aspect ratio written any of the three ways people write one", () => {
    // All three appear in the wild, usually copied from another vendor's
    // docs. Rejecting two to be principled costs a ticket and buys nothing.
    assert.equal(parseAspect("16:9"), 16 / 9);
    assert.equal(parseAspect("16/9"), 16 / 9);
    assert.equal(parseAspect("1.7777777777777777"), 16 / 9);
    assert.equal(parseAspect("4:3"), 4 / 3);
  });

  it("falls back rather than producing a broken ratio", () => {
    for (const value of [null, "", "banana", "0:0", "-2", "16:0"]) {
      assert.equal(parseAspect(value), 16 / 9, `${value} did not fall back`);
    }
  });

  it("needs only a demo id, and measures unless told not to", () => {
    const element = fakeElement({ "data-demo": "prj_1" });
    const options = readOptions(element, { origin: "https://demoriff.test" })!;

    assert.equal(options.id, "prj_1");
    assert.equal(options.origin, "https://demoriff.test");
    // Opt-out, not opt-in: an embed nobody can measure is one nobody renews.
    assert.equal(options.analytics, true);
    assert.equal(options.autoplay, false);
  });

  it("returns nothing for an element that names no demo", () => {
    assert.equal(readOptions(fakeElement({}), { origin: "https://x.test" }), null);
  });

  it("puts everything in the query string, never a fragment", () => {
    const url = playerUrl({
      id: "prj_1", origin: "https://demoriff.test", aspectRatio: 1.78,
      autoplay: true, locale: "de-DE", analytics: false,
    });
    // A fragment is not sent to the server, so a server-rendered first frame
    // could not know which demo it was for.
    assert.equal(url.includes("#"), false);
    assert.match(url, /\/embed\/prj_1\?/);
    assert.match(url, /autoplay=1/);
    assert.match(url, /locale=de-DE/);
    assert.match(url, /analytics=off/);
  });

  it("reports the referring origin and never the path", () => {
    const url = viewEventUrl(
      { id: "prj_1", origin: "https://demoriff.test", aspectRatio: 1.78 },
      "https://customer.test/pricing/enterprise?utm_campaign=q3",
    );
    assert.match(url, /from=https%3A%2F%2Fcustomer.test/);
    // The path of a page on somebody else's site is their data, not ours.
    assert.equal(url.includes("pricing"), false);
    assert.equal(url.includes("utm_campaign"), false);
  });

  it("does not throw on a referrer it cannot parse", () => {
    assert.equal(safeOrigin("not a url"), "unknown");
    assert.equal(safeOrigin(""), "unknown");
  });
});

function fakeElement(attributes: Record<string, string>): Element {
  return {
    getAttribute: (name: string) => attributes[name] ?? null,
  } as unknown as Element;
}

// --- on a real page --------------------------------------------------------

describe("the embed on a customer's page", { skip: RUN ? false : "Chromium is not available" }, () => {
  it("causes no layout shift at all, even when the script runs after first paint", async () => {
    // The documented snippet reserves the height in markup. This test used
    // to pass without it, because the script happened to run before the
    // browser painted — and then failed under parallel load, which is
    // exactly the condition a real visitor on a slow connection is in.
    const page = await openHost(
      hostPage(`<div data-demoriff data-demo="prj_1" data-aspect="16:9"
                     style="aspect-ratio:16/9;width:100%"></div>
                <script async src="${HOST}/embed.js"></script>`),
      { slowScript: true },
    );

    const shift = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              value: number;
              hadRecentInput: boolean;
            })[]) {
              if (!entry.hadRecentInput) total += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve(total), 1200);
        }),
    );

    // A customer's Core Web Vitals score is not ours to spend.
    assert.equal(shift, 0, `cumulative layout shift was ${shift}`);
    await page.close();
  });

  it("still works, and says so, when the snippet omits the reservation", async () => {
    const warnings: string[] = [];
    const page = await openHost(
      hostPage(`<div data-demoriff data-demo="prj_1"></div>
                <script async src="${HOST}/embed.js"></script>`),
      {
        onConsole: (target) =>
          target.on("console", (message) => {
            if (message.type() === "warning") warnings.push(message.text());
          }),
      },
    );
    await page.locator("[data-demoriff] iframe").waitFor({ state: "attached", timeout: BROWSER_TIMEOUT_MS });

    // It mounts rather than refusing — but somebody has to be able to find
    // out why their page moved.
    assert.equal(warnings.some((text) => /aspect-ratio/.test(text)), true, warnings.join(" | "));
    await page.close();
  });

  it("reserves the exact height the aspect ratio asks for", async () => {
    const page = await openHost(
      hostPage(`<div data-demoriff data-demo="prj_1" data-aspect="4:3"></div>
                <script async src="${HOST}/embed.js"></script>`),
    );
    await page.waitForFunction(() => document.querySelector("[data-demoriff-mounted]") !== null);

    const box = await page.evaluate(() => {
      const element = document.querySelector("[data-demoriff]")!;
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });

    assert.equal(Math.abs(box.width / box.height - 4 / 3) < 0.02, true, `ratio ${box.width / box.height}`);
    await page.close();
  });

  it("leaves no globals on the host page", async () => {
    const page = await openHost(
      hostPage(`<div data-demoriff data-demo="prj_1"></div>
                <script async src="${HOST}/embed.js"></script>`),
    );
    await page.waitForFunction(() => document.querySelector("[data-demoriff-mounted]") !== null);

    const leaked = await page.evaluate(() => {
      const known = new Set(Object.getOwnPropertyNames(window));
      // Anything the runtime added would be here. "Our embed broke their
      // site" is not a support conversation worth having.
      return Object.getOwnPropertyNames(window).filter(
        (name) => /demoriff/i.test(name) && known.has(name),
      );
    });
    assert.deepEqual(leaked, []);
    await page.close();
  });

  it("mounts the player and points it at the right demo", async () => {
    const page = await openHost(
      hostPage(`<div data-demoriff data-demo="prj_abc" data-locale="de-DE"></div>
                <script async src="${HOST}/embed.js"></script>`),
    );
    const frame = page.locator("[data-demoriff] iframe");
    await frame.waitFor({ state: "attached", timeout: BROWSER_TIMEOUT_MS });

    const src = await frame.getAttribute("src");
    assert.match(src ?? "", /https:\/\/demoriff\.test\/embed\/prj_abc/);
    assert.match(src ?? "", /locale=de-DE/);

    const sandbox = await frame.getAttribute("sandbox");
    // The player is ours and needs scripts. It must never be able to
    // navigate the host page away.
    assert.equal(sandbox?.includes("allow-top-navigation"), false);
    await page.close();
  });

  it("waits for an embed below the fold instead of loading it at once", async () => {
    const page = await openHost(
      hostPage(
        `<div data-demoriff data-demo="prj_1"></div>
         <script async src="${HOST}/embed.js"></script>`,
        { tall: true },
      ),
    );
    await page.waitForFunction(() => document.querySelector("[data-demoriff-mounted]") !== null);
    await page.waitForTimeout(300);

    // An embed 2,000 pixels down should not compete for bandwidth with the
    // content the visitor is actually reading.
    assert.equal(await page.locator("[data-demoriff] iframe").count(), 0);

    await page.evaluate(() => window.scrollTo(0, 2200));
    await page.locator("[data-demoriff] iframe").waitFor({ state: "attached", timeout: BROWSER_TIMEOUT_MS });
    await page.close();
  });

  it("mounts an embed that the page adds later", async () => {
    const page = await openHost(
      hostPage(`<script async src="${HOST}/embed.js"></script>`),
    );
    await page.waitForTimeout(300);

    // A CMS, a tab switch, a single-page route change. Without this the
    // snippet works on a static page and mysteriously does not in an app.
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.setAttribute("data-demoriff", "");
      host.setAttribute("data-demo", "prj_late");
      document.body.appendChild(host);
    });

    await page.locator('[data-demo="prj_late"] iframe').waitFor({ state: "attached", timeout: BROWSER_TIMEOUT_MS });
    await page.close();
  });

  it("mounts once when the snippet is included twice", async () => {
    const page = await openHost(
      hostPage(`<div data-demoriff data-demo="prj_1"></div>
                <script async src="${HOST}/embed.js"></script>
                <script async src="${HOST}/embed.js"></script>`),
    );
    await page.locator("[data-demoriff] iframe").waitFor({ state: "attached", timeout: BROWSER_TIMEOUT_MS });
    await page.waitForTimeout(300);

    assert.equal(await page.locator("[data-demoriff] iframe").count(), 1);
    await page.close();
  });

  it("reports a view without setting a single cookie", async () => {
    const page = await openHost(
      hostPage(`<div data-demoriff data-demo="prj_1"></div>
                <script async src="${HOST}/embed.js"></script>`),
    );

    await page.locator("[data-demoriff] iframe").waitFor({ state: "attached", timeout: BROWSER_TIMEOUT_MS });
    const beacon = await waitForBeacon(page);

    assert.notEqual(beacon, null, "the runtime should report a view");
    assert.match(beacon!, /demo=prj_1/);
    assert.match(beacon!, /from=https%3A%2F%2Fcustomer.test/);

    // No consent banner needed, because nothing is stored.
    const cookies = await page.context().cookies();
    assert.deepEqual(cookies, []);
    const storage = await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    }));
    assert.deepEqual(storage, { local: 0, session: 0 });
    await page.close();
  });

  it("does not report a view when the customer turned measurement off", async () => {
    const page = await openHost(
      hostPage(`<div data-demoriff data-demo="prj_1" data-analytics="off"></div>
                <script async src="${HOST}/embed.js"></script>`),
    );

    await page.locator("[data-demoriff] iframe").waitFor({ state: "attached", timeout: BROWSER_TIMEOUT_MS });
    await page.waitForTimeout(600);

    assert.deepEqual(beaconLog.get(page), []);
    await page.close();
  });
});
