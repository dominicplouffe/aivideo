import { applyCaptureMasks, createObserver, defaultMaskSelectors } from "@/lib/capture";
import type { AppliedMask } from "@/lib/capture/masking";
import type { CaptureObserver } from "@/lib/capture/observer";
import type { CaptureEvent, MaskRule } from "@/lib/capture/types";
import type { ExtensionMessage } from "./protocol";

/**
 * The content script.
 *
 * Runs inside the page being recorded, which is someone's production
 * application. Two consequences shape everything below.
 *
 * First, it does as little as possible until asked. An extension that
 * attaches a MutationObserver to every tab a user has open is a battery
 * complaint and a support ticket. Nothing starts until `content/arm`.
 *
 * Second, it never trusts that the service worker is alive. MV3 kills
 * service workers aggressively, so events are buffered locally and flushed
 * on a timer; a failed send keeps the buffer rather than dropping it.
 */

let observer: CaptureObserver | null = null;
let mask: AppliedMask | null = null;
let buffer: CaptureEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

const FLUSH_MS = 1000;

function flush() {
  if (buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  chrome.runtime
    .sendMessage({ type: "content/events", events: batch } satisfies ExtensionMessage)
    .catch(() => {
      // The worker was asleep or the port closed. Put the batch back at the
      // front — losing the interaction log silently would produce a video
      // with no zooms and no explanation.
      buffer = batch.concat(buffer);
    });
}

function arm(rules: MaskRule[]) {
  if (observer) return;

  // Masks go on before the observer, and well before the first frame: the
  // point of masking at capture time is that the clear pixels never exist.
  const selectors = rules.length > 0 ? rules : defaultMaskSelectors().map((selector) => ({ selector }));
  mask = applyCaptureMasks(document, selectors);

  observer = createObserver({
    // The page-world helper owns the history patch; patching it here would
    // patch a copy of `history` that the application never calls.
    patchHistory: false,
    onEvent: (event) => {
      buffer.push(event);
      // A click is worth sending promptly so the recorder UI can show it;
      // a mutation burst is not worth waking the worker for.
      if (event.kind === "click" || event.kind === "route") flush();
    },
  });
  observer.start();
  flushTimer = setInterval(flush, FLUSH_MS);

  chrome.runtime
    .sendMessage({
      type: "content/ready",
      url: location.href,
      title: document.title,
    } satisfies ExtensionMessage)
    .catch(() => {});
}

function disarm() {
  // Tell the page-world helper to put `history` back before we stop
  // listening, so the last route change of a session is still recorded.
  document.dispatchEvent(new CustomEvent("demoriff:disarm"));
  observer?.stop();
  observer = null;
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  flush();
  // The mask comes off last. Reverting it while frames are still being
  // encoded would put one clear frame of a password field into the video.
  mask?.revert();
  mask = null;
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === "content/arm") arm(message.masks);
  if (message.type === "content/disarm") disarm();
  return undefined;
});

// A single-page application can survive a recording; a full navigation
// cannot. Flush what we have before the page goes away.
window.addEventListener("pagehide", () => {
  flush();
});
