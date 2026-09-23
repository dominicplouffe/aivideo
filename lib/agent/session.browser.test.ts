import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import type { Browser } from "playwright";
import { openSession } from "./session";

/**
 * The allowlist, enforced by a real browser.
 *
 * Everything else about the agent can be reasoned about from the code. This
 * cannot: the claim is that a page on an approved origin cannot reach an
 * unapproved one, and that claim is about Chromium's behaviour, not ours. A
 * page that can `fetch` anywhere is a page that can exfiltrate whatever it
 * just saw on the customer's product.
 */

const CHROMIUM = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  process.env.CHROMIUM_PATH ?? "",
].find((candidate) => candidate && existsSync(candidate));

const RUN = Boolean(CHROMIUM);
const TIMEOUT_MS = 20_000;

let browser: Browser | null = null;
let approved: Server | null = null;
let elsewhere: Server | null = null;
let approvedOrigin = "";
let elsewhereOrigin = "";

before(async () => {
  if (!RUN) return;

  // "Elsewhere" is a site nobody listed. It answers, so a page's call to it
  // succeeds, and the tab going there is what must be refused.
  elsewhere = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("the-secret");
  });
  await new Promise<void>((done) => elsewhere!.listen(0, "127.0.0.1", done));
  elsewhereOrigin = `http://127.0.0.1:${(elsewhere.address() as AddressInfo).port}`;

  approved = createServer((req, res) => {
    if (req.url === "/leak.png") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html><body><h1>Approved</h1><script>
      window.__result = "pending";
      fetch(${JSON.stringify(`${elsewhereOrigin}/secret`)})
        .then((r) => r.text())
        .then((t) => { window.__result = "reached:" + t; })
        .catch((e) => { window.__result = "blocked:" + e.name; });
      const img = document.createElement("img");
      img.src = ${JSON.stringify(`${elsewhereOrigin}/leak.png`)};
      document.body.appendChild(img);
    </script></body></html>`);
  });
  await new Promise<void>((done) => approved!.listen(0, "127.0.0.1", done));
  approvedOrigin = `http://127.0.0.1:${(approved.address() as AddressInfo).port}`;

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ executablePath: CHROMIUM!, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  approved?.close();
  elsewhere?.close();
});

describe("the agent's browser session", { skip: !RUN, timeout: TIMEOUT_MS }, () => {
  it("lets a page load and call what it needs, and keeps the tab on the listed site", async () => {
    const refusals: { url: string; resourceType: string }[] = [];
    const session = await openSession(browser!, {
      allowedOrigins: [approvedOrigin],
      onRefusal: (event) => refusals.push({ url: event.url, resourceType: event.resourceType }),
    });

    try {
      // Straight to the page, bypassing `goto`'s public-address check —
      // loopback is refused there by design, and that refusal has its own
      // test below. What is under test here is the interceptor.
      await session.page.goto(approvedOrigin, { waitUntil: "load" });
      await session.page.waitForFunction("window.__result !== 'pending'", null, { timeout: 5000 });

      // The page's own calls go through: they are the app working, the
      // same requests it makes for every real visitor.
      assert.equal(await session.page.evaluate("window.__result"), "reached:the-secret");
      assert.equal(refusals.length, 0);

      // The tab itself going to another site is refused and reported.
      await session.page.evaluate(`location.href = ${JSON.stringify(`${elsewhereOrigin}/`)}`);
      await session.page.waitForTimeout(1000);
      assert.notEqual(new URL(session.page.url()).origin, elsewhereOrigin);
      assert.ok(refusals.some((refusal) => refusal.url.startsWith(elsewhereOrigin) && refusal.resourceType === "document"));
    } finally {
      await session.close();
    }
  });

  it("refuses a listed origin that resolves onto the private network", async () => {
    const port = (approved!.address() as AddressInfo).port;
    // On the list by name, https, and resolving to loopback. An allowlist is
    // a list of names, and a name resolves to whatever its owner says — so
    // an approved entry can still be a route into our own network.
    const session = await openSession(browser!, {
      allowedOrigins: [`https://localhost:${port}`],
    });

    try {
      const verdict = await session.goto(`https://localhost:${port}/`);
      assert.equal(verdict.ok, false);
      assert.equal(verdict.ok === false && verdict.reason, "private");
    } finally {
      await session.close();
    }
  });

  it("refuses a listed origin that is plain http, even in development", async () => {
    const session = await openSession(browser!, { allowedOrigins: [approvedOrigin] });
    try {
      // The agent is the one place where "it also works against http" is a
      // convenience that ends with a credential on the wire, so the relaxed
      // mode the webhook worker has in development is not offered here.
      const verdict = await session.goto(approvedOrigin);
      assert.equal(verdict.ok, false);
      assert.equal(verdict.ok === false && verdict.reason, "scheme");
    } finally {
      await session.close();
    }
  });

  it("starts every run with nothing from the last one", async () => {
    const first = await openSession(browser!, { allowedOrigins: [approvedOrigin] });
    await first.page.goto(approvedOrigin, { waitUntil: "domcontentloaded" });
    await first.page.evaluate("localStorage.setItem('run', 'first'); document.cookie = 'run=first'");
    await first.close();

    const second = await openSession(browser!, { allowedOrigins: [approvedOrigin] });
    try {
      await second.page.goto(approvedOrigin, { waitUntil: "domcontentloaded" });
      // No cookie, no localStorage, no service worker survives a run. Two
      // runs for two customers cannot see each other's session.
      assert.equal(await second.page.evaluate("localStorage.getItem('run')"), null);
      assert.equal(await second.page.evaluate("document.cookie"), "");
      assert.equal((await second.context.cookies()).length, 0);
    } finally {
      await second.close();
    }
  });
});
