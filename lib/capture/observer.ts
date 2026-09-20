import { accessibleName, cssPath, normalizeBounds, roleOf } from "./describe";
import { isRecordableKey, isSensitiveField } from "./sensitive";
import type { CaptureEvent, CaptureEventKind } from "./types";

/**
 * The interaction observer.
 *
 * Attaches to a document and writes down what the person did, in a form the
 * editor and the direction engine can use. Three things shape every decision
 * here:
 *
 *  1. **It must not be noticeable.** This runs inside someone's application
 *     while they are recording a demo of it. A handler that reflows the page
 *     on every scroll event turns a smooth product into a janky one on
 *     camera, which is precisely the opposite of the point.
 *  2. **It records actions, never content.** "They typed here for four
 *     seconds" is the step; the letters are not. See `sensitive.ts`.
 *  3. **Listeners are passive and in the capture phase.** Capture phase so an
 *     application that calls `stopPropagation` does not blind the recorder;
 *     passive so scroll handling is never blocked on our work.
 */

export interface ObserverOptions {
  /** Ignored when absent: the observer reads the document it is given. */
  doc?: Document;
  /** Injected so tests do not depend on wall-clock timing. */
  now?: () => number;
  /** Fires as events are recorded, for a live indicator in the recorder UI. */
  onEvent?: (event: CaptureEvent) => void;
  /** Suppression window for repeated clicks on one target, in ms. */
  clickDedupeMs?: number;
  /** How often a scroll may produce an event, in ms. */
  scrollThrottleMs?: number;
  /** How often a burst of DOM changes may produce an event, in ms. */
  mutationThrottleMs?: number;
  /** Cap on retained events, so a four-hour session cannot exhaust memory. */
  maxEvents?: number;
  /**
   * Whether to patch `history.pushState` here.
   *
   * A browser extension's content script runs in an isolated world: it
   * shares the DOM with the page but not its JavaScript objects. Patching
   * `history` there produces a patched copy nobody calls, and every
   * single-page route change goes unrecorded. So the extension runs a small
   * script in the page's own world instead and sets this to false — see
   * `extension/src/main-world.ts`.
   */
  patchHistory?: boolean;
}

export interface CaptureObserver {
  start(): void;
  stop(): void;
  readonly events: CaptureEvent[];
  /** Seconds since `start()`, or 0 before it. */
  elapsed(): number;
}

/** How a main-world helper reports a route change across the world boundary. */
export const ROUTE_EVENT = "demoriff:route";

const DEFAULTS = {
  patchHistory: true,
  clickDedupeMs: 120,
  scrollThrottleMs: 150,
  mutationThrottleMs: 400,
  maxEvents: 20_000,
};

export function createObserver(options: ObserverOptions = {}): CaptureObserver {
  const doc = options.doc ?? document;
  const win = doc.defaultView ?? window;
  const now = options.now ?? (() => Date.now());
  const config = { ...DEFAULTS, ...options };

  const events: CaptureEvent[] = [];
  let startedAt: number | null = null;
  let running = false;

  let lastClick: { selector: string; at: number } | null = null;
  let scrollTimer: ReturnType<typeof setTimeout> | null = null;
  let mutationTimer: ReturnType<typeof setTimeout> | null = null;
  let mutationCount = 0;
  let observer: MutationObserver | null = null;
  const teardown: (() => void)[] = [];

  function elapsed(): number {
    if (startedAt === null) return 0;
    // Seconds, to match the provider layer's InteractionEvent.
    return (now() - startedAt) / 1000;
  }

  function record(kind: CaptureEventKind, detail: Partial<CaptureEvent> = {}) {
    if (!running) return;
    // Dropping the newest event is wrong — the tail of a session is where the
    // conclusion is. Drop from the front, which is the part already edited.
    if (events.length >= config.maxEvents) events.shift();

    const event: CaptureEvent = { at: elapsed(), kind, ...detail };
    events.push(event);
    options.onEvent?.(event);
  }

  function describe(target: EventTarget | null): Partial<CaptureEvent> {
    if (!(target instanceof Element)) return {};
    const rect = target.getBoundingClientRect();
    return {
      selector: cssPath(target),
      role: roleOf(target),
      accessibleName: isSensitiveField(target) ? undefined : accessibleName(target),
      bounds: normalizeBounds(rect, {
        width: win.innerWidth,
        height: win.innerHeight,
      }),
    };
  }

  function onClick(event: Event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const described = describe(target);
    const selector = described.selector ?? "";
    const at = now();

    // A double click, or a click that bubbles into a handler that re-fires,
    // is one intention. Two zooms 80ms apart is a twitch.
    if (lastClick && lastClick.selector === selector && at - lastClick.at < config.clickDedupeMs) {
      return;
    }
    lastClick = { selector, at };

    record("click", {
      ...described,
      redacted: isSensitiveField(target) || undefined,
    });
  }

  function onKeyDown(event: Event) {
    const keyboard = event as KeyboardEvent;
    const hasModifier = keyboard.metaKey || keyboard.ctrlKey || keyboard.altKey;
    const target = keyboard.target;
    const sensitive = target instanceof Element && isSensitiveField(target);

    if (!isRecordableKey(keyboard.key, hasModifier)) {
      // Typing happened. That is the whole event: no key, no content, and
      // no way to reconstruct either from the log.
      record("input", { ...describe(target), redacted: true });
      return;
    }

    const modifiers = [
      keyboard.metaKey && "Meta",
      keyboard.ctrlKey && "Ctrl",
      keyboard.altKey && "Alt",
      keyboard.shiftKey && "Shift",
    ].filter(Boolean) as string[];

    record("key", {
      ...describe(target),
      value: [...modifiers, keyboard.key].join("+"),
      redacted: sensitive || undefined,
    });
  }

  function onScroll() {
    if (scrollTimer) return;
    scrollTimer = setTimeout(() => {
      scrollTimer = null;
      record("scroll", {
        value: `${Math.round(win.scrollX)},${Math.round(win.scrollY)}`,
      });
    }, config.scrollThrottleMs);
  }

  function onMutation(records: MutationRecord[]) {
    mutationCount += records.length;
    if (mutationTimer) return;
    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      // The count is the useful part: "the page changed a lot here" is how
      // the direction engine knows a result appeared and the camera should
      // hold rather than move on.
      record("mutation", { value: String(mutationCount) });
      mutationCount = 0;
    }, config.mutationThrottleMs);
  }

  function onRoute(url: string) {
    record("route", { value: url });
  }

  function patchHistory(): () => void {
    const history = win.history;
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;

    // A single-page application changes route without a navigation event.
    // Without this the log shows a click and then, inexplicably, a different
    // screen — and the generated guide loses its chapter boundaries.
    history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = originalPush.apply(this, args);
      onRoute(win.location.href);
      return result;
    };
    history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
      const result = originalReplace.apply(this, args);
      onRoute(win.location.href);
      return result;
    };

    return () => {
      history.pushState = originalPush;
      history.replaceState = originalReplace;
    };
  }

  function start() {
    if (running) return;
    running = true;
    startedAt = now();

    // Capture phase: an application that calls stopPropagation in its own
    // handler must not be able to blind the recorder. Passive: our work is
    // never a reason for a scroll to stutter.
    const listen = (
      target: EventTarget,
      type: string,
      handler: EventListener,
      opts: AddEventListenerOptions = { capture: true, passive: true },
    ) => {
      target.addEventListener(type, handler, opts);
      teardown.push(() => target.removeEventListener(type, handler, opts));
    };

    listen(doc, "click", onClick);
    listen(doc, "keydown", onKeyDown);
    listen(doc, "focusin", (event) => record("focus", describe(event.target)));
    listen(win, "scroll", onScroll);
    listen(win, "popstate", () => onRoute(win.location.href));
    listen(win, "hashchange", () => onRoute(win.location.href));

    if (config.patchHistory) teardown.push(patchHistory());
    // Always listened for: a DOM event crosses the isolated-world boundary
    // even though a patched function object does not.
    listen(doc, ROUTE_EVENT, (event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;
      onRoute(detail?.url ?? win.location.href);
    });

    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(onMutation);
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        // Character data would fire on every animated counter on the page,
        // and tells us nothing the childList count does not.
        characterData: false,
      });
    }

    record("route", { value: win.location.href });
  }

  function stop() {
    if (!running) return;
    running = false;

    for (const undo of teardown.splice(0)) undo();
    observer?.disconnect();
    observer = null;
    if (scrollTimer) clearTimeout(scrollTimer);
    if (mutationTimer) clearTimeout(mutationTimer);
    scrollTimer = null;
    mutationTimer = null;
  }

  return { start, stop, events, elapsed };
}
