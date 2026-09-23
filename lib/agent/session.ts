import type { Browser, BrowserContext, Page, Route } from "playwright";
import {
  describeAllowRefusal, resolvesPublicly, withinAllowlist, type AllowRefusal,
} from "./allowlist";

/**
 * The agent's browser session.
 *
 * Isolated means three specific things, and each one is a decision somebody
 * would otherwise make the other way for convenience:
 *
 *  1. **A fresh context per run, never a persistent profile.** No cookie,
 *     no `localStorage` entry and no service worker survives a run. Two runs
 *     for two customers cannot see each other's session, and a run cannot
 *     inherit one from a previous run that ended badly.
 *  2. **The tab stays on the listed sites.** A link, a redirect or a script
 *     that sends the page elsewhere is refused and reported. What a page
 *     loads or calls — scripts, fonts, its API — is left alone: it is the
 *     customer's own app making the requests it makes for every visitor.
 *  3. **Downloads are refused and storage is not persisted.** The agent is
 *     here to record a screen, not to collect files.
 *
 * Refusals are aborted *and* reported. The caller writes them to the run's
 * trail, because "what did it try to do" is the question a reviewer asks and
 * a silently aborted request cannot answer it.
 */

export interface SessionOptions {
  allowedOrigins: string[];
  viewport?: { width: number; height: number };
  /** Record the session to a video file in this directory. Absent in a dry run. */
  recordVideo?: { dir: string };
  /**
   * Cookies and local storage from a sign-in made just before, in a session
   * of its own, so the login screen is not in the recording. Held in memory
   * for this run only; nothing is written to disk or kept afterwards.
   */
  storageState?: Awaited<ReturnType<BrowserContext["storageState"]>>;
  /** Called for every refused request, so the run audit can hold it. */
  onRefusal?: (event: { url: string; reason: AllowRefusal; resourceType: string }) => void;
  /** Injectable so allowlist tests need no DNS. */
  resolve?: (hostname: string) => Promise<string[]>;
}

export interface AgentSession {
  context: BrowserContext;
  page: Page;
  /** Navigates, with the address check that a string match cannot do. */
  goto(url: string): Promise<{ ok: true } | { ok: false; reason: AllowRefusal; message: string }>;
  /** Closes the session and returns the video's path, once it is fully written. */
  close(): Promise<{ videoPath: string | null }>;
}

/** Schemes the browser serves itself. Nothing leaves the machine for these. */
const INTERNAL = /^(about|data|blob|chrome-extension):/;

export async function openSession(browser: Browser, options: SessionOptions): Promise<AgentSession> {
  const viewport = options.viewport ?? { width: 1440, height: 900 };
  const context = await browser.newContext({
    viewport,
    // The recording itself, at the viewport's size, so the footage is the
    // page and nothing else. Playwright writes it as the session runs and
    // finishes the file when the context closes.
    ...(options.recordVideo ? { recordVideo: { dir: options.recordVideo.dir, size: viewport } } : {}),
    // Nothing is loaded but the sign-in this run just made, and nothing is
    // saved. A run leaves nothing behind.
    storageState: options.storageState,
    acceptDownloads: false,
    // A recording of a customer's product is a recording of their
    // customers; a browser that volunteers a location or a camera during one
    // is a browser doing something nobody asked for.
    permissions: [],
    serviceWorkers: "block",
  });

  // Only where the tab itself goes is checked. What a page loads or calls
  // — its scripts, fonts, API, analytics — is the page's business: it is
  // the customer's own app running the same requests it runs for every real
  // visitor, and blocking them broke logins, fonts and data for no gain.
  // The limits that matter are that the agent stays on the listed sites
  // and types a password only into the site it belongs to.
  await context.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = request.url();
    const topLevel = request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame();
    if (!topLevel || INTERNAL.test(url)) {
      await route.continue();
      return;
    }
    const verdict = withinAllowlist(url, options.allowedOrigins);
    if (verdict.ok) {
      await route.continue();
      return;
    }
    // A link, a redirect or a script sending the tab to another site.
    options.onRefusal?.({ url, reason: verdict.reason, resourceType: "document" });
    // Aborted rather than failed with a status: a 403 would be rendered by
    // the page and could be mistaken for the site's own answer.
    await route.abort("blockedbyclient");
  });

  const page = await context.newPage();

  return {
    context,
    page,

    async goto(url: string) {
      const shape = withinAllowlist(url, options.allowedOrigins);
      if (!shape.ok) {
        options.onRefusal?.({ url, reason: shape.reason, resourceType: "document" });
        return { ok: false, reason: shape.reason, message: describeAllowRefusal(shape.reason) };
      }

      // The second check, and the one a string match cannot make: an
      // approved name that resolves to 127.0.0.1 is an approved entry
      // pointing at our own network.
      const address = await resolvesPublicly(url, { resolve: options.resolve });
      if (!address.ok) {
        options.onRefusal?.({ url, reason: address.reason, resourceType: "document" });
        return { ok: false, reason: address.reason, message: describeAllowRefusal(address.reason) };
      }

      await page.goto(url, { waitUntil: "domcontentloaded" });

      // Where it *ended up*. A redirect chain can leave the allowlist, and
      // the interceptor blocks the subresources but the document itself
      // arrives before anything can be asked about it.
      const landed = withinAllowlist(page.url(), options.allowedOrigins);
      if (!landed.ok) {
        options.onRefusal?.({ url: page.url(), reason: landed.reason, resourceType: "redirect" });
        await page.goto("about:blank");
        return {
          ok: false,
          reason: landed.reason,
          message: `That address redirected to ${new URL(page.url()).origin}, which is not on this run's allowlist.`,
        };
      }

      return { ok: true };
    },

    async close() {
      // The video object has to be taken before the page is gone.
      const video = page.video();
      await context.close().catch(() => {});
      const videoPath = video ? await video.path().catch(() => null) : null;
      return { videoPath };
    },
  };
}
