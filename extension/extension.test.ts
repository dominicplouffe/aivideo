import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import type { BrowserContext, Worker } from "playwright";

/**
 * Does the extension actually load?
 *
 * A manifest is a configuration file, which means it is wrong in ways that
 * typecheck perfectly: a permission Chrome no longer recognises, a script
 * path that does not exist, a service worker declared as a module that is
 * bundled as an IIFE. None of that shows up until a browser refuses it, so
 * these tests load the built extension into a real Chromium and ask.
 *
 * `tabCapture` itself is not exercised — there is no tab to capture and no
 * display to capture it on. What is exercised is everything that has to be
 * right before that call can be reached.
 */

const CHROMIUM = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
  process.env.CHROMIUM_PATH ?? "",
].find((candidate) => candidate && existsSync(candidate));

const RUN = Boolean(CHROMIUM);
const EXTENSION = path.resolve("extension");

let context: BrowserContext | null = null;
let worker: Worker | null = null;
let extensionId = "";
let profileDir = "";

before(async () => {
  if (!RUN) return;

  const { buildExtension } = (await import("../scripts/build-extension.mjs" as string)) as typeof import("../scripts/build-extension");
  await buildExtension();

  const { chromium } = await import("playwright");
  profileDir = await mkdtemp(path.join(tmpdir(), "demoriff-profile-"));
  context = await chromium.launchPersistentContext(profileDir, {
    executablePath: CHROMIUM,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      "--headless=new",
    ],
  });

  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }));
  extensionId = worker.url().split("/")[2];
});

after(async () => {
  await context?.close();
  if (profileDir) await rm(profileDir, { recursive: true, force: true });
});

describe("capture extension", { skip: RUN ? false : "Chromium is not available" }, () => {
  it("is accepted by Chrome and registers its service worker", () => {
    // If the manifest were invalid — a bad permission, a missing file, the
    // wrong module type — there would be no worker here at all.
    assert.equal(worker?.url().endsWith("/dist/background.js"), true);
    assert.match(extensionId, /^[a-p]{32}$/);
  });

  it("asks for no permission it does not use", () => {
    const manifest = JSON.parse(readFileSync(path.join(EXTENSION, "manifest.json"), "utf8")) as {
      permissions: string[];
      host_permissions: string[];
    };
    const sources = ["background.ts", "content.ts", "offscreen.ts", "popup.ts"]
      .map((file) => readFileSync(path.join(EXTENSION, "src", file), "utf8"))
      .join("\n");

    // Every permission on this list is something a user is asked to grant.
    // One that nothing uses is a promise we took and did not need.
    for (const permission of manifest.permissions) {
      const api = permission === "activeTab" ? "tabs" : permission;
      assert.equal(
        sources.includes(`chrome.${api}`),
        true,
        `manifest requests "${permission}" but no source calls chrome.${api}`,
      );
    }
  });

  it("serves a popup that renders before the worker answers", async () => {
    const page = await context!.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    // The popup owns no state and is destroyed on blur, so it must be
    // readable the instant it opens rather than after a round trip.
    assert.equal(await page.title(), "DemoRiff Capture");
    assert.equal(await page.textContent("#toggle"), "Start recording");
    assert.equal(await page.textContent("#elapsed"), "0:00");
    await page.close();
  });

  it("answers the popup's state request from the service worker", async () => {
    const page = await context!.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    const state = await page.evaluate(() => chrome.runtime.sendMessage({ type: "capture/state" }));

    // Not recording, no error: the worker is alive and its handler replies
    // on an open channel rather than closing it under the caller.
    assert.deepEqual(state, {
      recording: false,
      tabId: null,
      startedAt: null,
      eventCount: 0,
      snapshotCount: 0,
      bytes: 0,
      lastError: null,
      manifest: null,
    });
    await page.close();
  });

  it("keeps its state where a terminated service worker cannot lose it", async () => {
    const page = await context!.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await page.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "content/events",
        events: [{ at: 1.5, kind: "click", selector: "#save" }],
      }),
    );

    // Chrome kills a service worker after about thirty seconds of idleness,
    // routinely in the middle of a recording. State in a module variable
    // would be gone; state in session storage is still here.
    const stored = await worker!.evaluate(() => chrome.storage.session.get("capture-events"));
    assert.equal((stored as { "capture-events": unknown[] })["capture-events"].length, 1);

    const state = (await page.evaluate(() =>
      chrome.runtime.sendMessage({ type: "capture/state" }),
    )) as { eventCount: number };
    assert.equal(state.eventCount, 1);

    await worker!.evaluate(() => chrome.storage.session.clear());
    await page.close();
  });

  it("injects the content script into an ordinary page without disturbing it", async () => {
    const page = await context!.newPage();
    await page.route("https://demo.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><html><body><button id="go">Go</button></body></html>',
      }),
    );
    await page.goto("https://demo.test/");

    // Until it is armed the content script does nothing at all: no
    // observer, no mask, no listeners. An extension that instruments every
    // open tab is a battery complaint waiting to be filed.
    const disturbed = await page.evaluate(() => ({
      style: document.getElementById("demoriff-capture-mask") !== null,
      historyPatched: !history.pushState.toString().includes("native code"),
    }));

    assert.deepEqual(disturbed, { style: false, historyPatched: false });
    await page.close();
  });

  it("records a single-page route change across the isolated-world boundary", async () => {
    const page = await context!.newPage();
    await page.route("https://demo.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><html><body><button id="go">Go</button></body></html>',
      }),
    );
    await page.goto("https://demo.test/");

    const tabId = (await worker!.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: "https://demo.test/*" });
      return tab?.id ?? null;
    })) as number;

    const driver = await context!.newPage();
    await driver.goto(`chrome-extension://${extensionId}/popup.html`);
    await driver.evaluate(() => chrome.runtime.sendMessage({ type: "capture/state" }));
    await worker!.evaluate(() => chrome.storage.session.clear());
    await driver.evaluate(
      (id) => chrome.runtime.sendMessage({ type: "capture/arm-tab", tabId: id, masks: [] }),
      tabId,
    );
    await page.waitForFunction(() => document.getElementById("demoriff-capture-mask") !== null);

    await page.evaluate(() => history.pushState({}, "", "/projects/onboarding"));
    await page.waitForTimeout(300);

    const events = (await worker!.evaluate(async () => {
      const stored = await chrome.storage.session.get("capture-events");
      return stored["capture-events"] ?? [];
    })) as { kind: string; value?: string }[];

    // This is the one thing an isolated world cannot do by itself. Patching
    // `history` in the content script patches a copy nothing calls, and the
    // recording would show a click followed, unexplained, by a different
    // screen.
    assert.equal(
      events.some((e) => e.kind === "route" && e.value?.endsWith("/projects/onboarding")),
      true,
      `no route event in ${JSON.stringify(events)}`,
    );

    await driver.evaluate(
      (id) => chrome.runtime.sendMessage({ type: "capture/disarm-tab", tabId: id }),
      tabId,
    );
    await worker!.evaluate(() => chrome.storage.session.clear());
    await driver.close();
    await page.close();
  });

  it("snapshots a step when the person clicks, through the whole extension", async () => {
    const page = await context!.newPage();
    await page.route("https://demo.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body:
          '<!doctype html><html><body><style>#go{color:rgb(1,2,3)}</style>' +
          '<button id="go" data-testid="go">Go</button></body></html>',
      }),
    );
    await page.goto("https://demo.test/");

    const tabId = (await worker!.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: "https://demo.test/*" });
      return tab?.id ?? null;
    })) as number;

    const driver = await context!.newPage();
    await driver.goto(`chrome-extension://${extensionId}/popup.html`);
    await worker!.evaluate(() => chrome.storage.session.clear());
    await driver.evaluate(
      (id) => chrome.runtime.sendMessage({ type: "capture/arm-tab", tabId: id, masks: [] }),
      tabId,
    );
    await page.waitForFunction(() => document.getElementById("demoriff-capture-mask") !== null);

    await page.click("#go");
    await page.waitForTimeout(400);

    const state = (await driver.evaluate(() =>
      chrome.runtime.sendMessage({ type: "capture/state" }),
    )) as { snapshotCount: number };

    // The snapshot is taken on the click itself and forwarded to the
    // offscreen document, which is where large media already lives —
    // chrome.storage.session's ten-megabyte quota would not survive sixty
    // steps, and it would take the interaction log down with it.
    assert.equal(state.snapshotCount >= 1, true, "a click should produce a step snapshot");

    await driver.evaluate(
      (id) => chrome.runtime.sendMessage({ type: "capture/disarm-tab", tabId: id }),
      tabId,
    );
    await worker!.evaluate(() => chrome.storage.session.clear());
    await driver.close();
    await page.close();
  });

  it("arms the page only when told to, and leaves no trace when disarmed", async () => {
    const page = await context!.newPage();
    await page.route("https://demo.test/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><html><body><input id="pw" type="password" /><button id="go">Go</button></body></html>',
      }),
    );
    await page.goto("https://demo.test/");

    const tabId = await worker!.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: "https://demo.test/*" });
      return tab?.id ?? null;
    });
    assert.notEqual(tabId, null);

    // Driven from an extension page rather than from the worker, because
    // Chrome does not deliver a service worker's own sendMessage back to
    // its listener — the popup is the real caller, so it is the caller here
    // too. And through the background's arming path, not around it: the
    // route hook and the mask are one operation, and testing half of it
    // proves nothing about the half that ships.
    const driver = await context!.newPage();
    await driver.goto(`chrome-extension://${extensionId}/popup.html`);
    await driver.evaluate(
      (id) => chrome.runtime.sendMessage({ type: "capture/arm-tab", tabId: id, masks: [] }),
      tabId as number,
    );
    await page.waitForFunction(() => document.getElementById("demoriff-capture-mask") !== null);

    // The password field is blurred in the page itself, before any frame
    // could be encoded from it.
    const armed = await page.evaluate(() => ({
      masked: getComputedStyle(document.querySelector("#pw")!).filter,
      historyPatched: !history.pushState.toString().includes("native code"),
    }));
    assert.match(armed.masked, /blur/);
    assert.equal(armed.historyPatched, true);

    await driver.evaluate(
      (id) => chrome.runtime.sendMessage({ type: "capture/disarm-tab", tabId: id }),
      tabId as number,
    );
    await page.waitForFunction(() => document.getElementById("demoriff-capture-mask") === null);

    const disarmed = await page.evaluate(() =>
      history.pushState.toString().includes("native code"),
    );
    assert.equal(disarmed, true, "history must be handed back untouched");
    await driver.close();
    await page.close();
  });
});
