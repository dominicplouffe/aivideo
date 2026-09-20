import { applyCaptureMasks, captureSnapshot, createObserver, defaultMaskSelectors } from "@/lib/capture";
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

/**
 * Snapshot budget.
 *
 * An interactive demo is a handful of steps, not a frame-by-frame archive.
 * These numbers are what keeps a forty-minute recording from producing four
 * hundred snapshots of the same screen and a payload nobody can upload.
 */
const SNAPSHOT_MIN_GAP_MS = 750;
const SNAPSHOT_MAX_COUNT = 60;
const SNAPSHOT_MAX_BYTES = 24 * 1024 * 1024;

let lastSnapshotAt = 0;
let snapshotCount = 0;
let snapshotBytes = 0;

/**
 * Snapshots the page for a step of the interactive demo.
 *
 * Taken synchronously, on the click itself. A snapshot a moment later is a
 * snapshot of a different page: the menu has closed, the toast has faded,
 * the row the person clicked is no longer highlighted.
 */
function maybeSnapshot(selector: string | undefined) {
  const at = Date.now();
  if (at - lastSnapshotAt < SNAPSHOT_MIN_GAP_MS) return;
  if (snapshotCount >= SNAPSHOT_MAX_COUNT || snapshotBytes >= SNAPSHOT_MAX_BYTES) return;
  lastSnapshotAt = at;

  let snapshot;
  try {
    snapshot = captureSnapshot(document, { targetSelector: selector });
  } catch {
    // A page that breaks serialisation must not break the recording. The
    // video and the interaction log are still worth having.
    return;
  }

  snapshotCount += 1;
  snapshotBytes += snapshot.bytes;
  chrome.runtime
    .sendMessage({ type: "content/snapshot", snapshot } satisfies ExtensionMessage)
    .catch(() => {
      // Unlike events, a dropped snapshot is not re-queued: it is tens of
      // kilobytes of a screen we can reconstruct from the video, and
      // retrying would hold the whole page's markup in memory for a worker
      // that may never wake.
    });
}

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
  lastSnapshotAt = 0;
  snapshotCount = 0;
  snapshotBytes = 0;

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
      if (event.kind === "click" || event.kind === "route") {
        flush();
        maybeSnapshot(event.selector);
      }
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
