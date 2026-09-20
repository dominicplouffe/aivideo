import { defaultMaskSelectors } from "@/lib/capture/sensitive";
import type { CaptureEvent, CaptureManifest, MaskRule } from "@/lib/capture/types";
import { RECORDER, type CaptureState, type ExtensionMessage } from "./protocol";

/**
 * The service worker.
 *
 * It coordinates and it remembers, and in MV3 it is allowed to do neither
 * for long: Chrome terminates a service worker after about thirty seconds of
 * idleness, including in the middle of a recording. So no state lives in a
 * module variable that matters — everything that must survive is written to
 * `chrome.storage.session` on every change, and read back on every message.
 *
 * That is not defensive programming. It is the documented lifecycle, and a
 * recorder that keeps its event log in a closure will lose a customer's
 * session the first time they spend a minute reading before they click.
 */

const STATE_KEY = "capture-state";
const EVENTS_KEY = "capture-events";
const OFFSCREEN_PATH = "offscreen.html";

const EMPTY: CaptureState = {
  recording: false,
  tabId: null,
  startedAt: null,
  eventCount: 0,
  snapshotCount: 0,
  bytes: 0,
  lastError: null,
  manifest: null,
};

async function readState(): Promise<CaptureState> {
  const stored = await chrome.storage.session.get(STATE_KEY);
  return (stored[STATE_KEY] as CaptureState | undefined) ?? EMPTY;
}

async function writeState(patch: Partial<CaptureState>): Promise<CaptureState> {
  const next = { ...(await readState()), ...patch };
  await chrome.storage.session.set({ [STATE_KEY]: next });
  return next;
}

async function readEvents(): Promise<CaptureEvent[]> {
  const stored = await chrome.storage.session.get(EVENTS_KEY);
  return (stored[EVENTS_KEY] as CaptureEvent[] | undefined) ?? [];
}

async function appendEvents(events: CaptureEvent[]): Promise<number> {
  const all = (await readEvents()).concat(events);
  await chrome.storage.session.set({ [EVENTS_KEY]: all });
  return all.length;
}

/** Chrome allows exactly one offscreen document; creating a second throws. */
async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Holds the tab's media stream while a demo is being recorded.",
  });
}

/**
 * Prepares a page for recording.
 *
 * Both halves belong together and neither works alone, which is why this is
 * one function rather than two steps a caller has to remember to pair. The
 * route hook has to run in the page's own JavaScript world — a content
 * script's isolated world shares the DOM but not `history`, so a patch there
 * would never see the application's own navigation — while everything else
 * stays isolated, where it cannot collide with the customer's code.
 */
async function armTab(tabId: number, masks: MaskRule[]) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    files: ["dist/main-world.js"],
  });

  await chrome.tabs.sendMessage(tabId, {
    type: "content/arm",
    masks: masks.length > 0 ? masks : defaultMaskSelectors().map((selector) => ({ selector })),
  } satisfies ExtensionMessage);
}

async function disarmTab(tabId: number) {
  await chrome.tabs
    .sendMessage(tabId, { type: "content/disarm" } satisfies ExtensionMessage)
    .catch(() => {
      // The tab was closed mid-recording. The video and the events already
      // collected are still worth keeping.
    });
}

async function startCapture(tabId: number, masks: MaskRule[], withMicrophone: boolean) {
  await chrome.storage.session.set({ [EVENTS_KEY]: [] });

  // Masks and the observer go on before the recorder is handed the stream:
  // a frame or two of a password field is one frame too many.
  await armTab(tabId, masks);

  // The stream id is minted for one tab and expires quickly, so it is
  // requested immediately before the recorder is told to use it.
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

  await ensureOffscreen();
  await chrome.runtime.sendMessage({
    type: "offscreen/record",
    streamId,
    withMicrophone,
  } satisfies ExtensionMessage);

  await writeState({
    recording: true,
    tabId,
    startedAt: Date.now(),
    eventCount: 0,
    snapshotCount: 0,
    bytes: 0,
    lastError: null,
    manifest: null,
  });

  await chrome.action.setBadgeText({ text: "REC" });
  await chrome.action.setBadgeBackgroundColor({ color: "#E5484D" });
}

async function stopCapture() {
  const state = await readState();
  if (state.tabId !== null) await disarmTab(state.tabId);
  await chrome.runtime.sendMessage({ type: "offscreen/stop" } satisfies ExtensionMessage);
  await chrome.action.setBadgeText({ text: "" });
}

async function buildManifest(durationSec: number): Promise<CaptureManifest> {
  const state = await readState();
  const events = await readEvents();
  const tab = state.tabId === null ? null : await chrome.tabs.get(state.tabId).catch(() => null);

  return {
    sessionId: crypto.randomUUID(),
    startedAt: new Date(state.startedAt ?? Date.now()).toISOString(),
    durationSec,
    url: tab?.url ?? "",
    title: tab?.title ?? "",
    viewport: { width: tab?.width ?? 0, height: tab?.height ?? 0, devicePixelRatio: 1 },
    events,
    maskedSelectors: defaultMaskSelectors(),
    recorder: { name: RECORDER.name, version: RECORDER.version },
  };
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, respond) => {
  // The listener returns true to keep the channel open for an async reply —
  // an `async` listener function would return a Promise, which Chrome reads
  // as "no reply coming" and closes the port under it.
  (async () => {
    switch (message.type) {
      case "capture/start": {
        const tabId =
          message.tabId ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
        if (tabId === undefined) throw new Error("No active tab to record.");
        await startCapture(tabId, message.masks, message.withMicrophone);
        respond(await readState());
        return;
      }
      case "capture/stop":
        await stopCapture();
        respond(await readState());
        return;
      case "capture/state":
        respond(await readState());
        return;
      // Arming without capturing: what the extension's own tests drive, and
      // what a future "preview your masks" button in the popup will use.
      case "capture/arm-tab":
        await armTab(message.tabId, message.masks);
        respond({ ok: true });
        return;
      case "capture/disarm-tab":
        await disarmTab(message.tabId);
        respond({ ok: true });
        return;
      case "content/events": {
        const count = await appendEvents(message.events);
        await writeState({ eventCount: count });
        respond({ ok: true });
        return;
      }
      case "content/snapshot": {
        // Snapshots go to the offscreen document, which is already where
        // large media lives. chrome.storage.session has a ten-megabyte
        // quota, and a sixty-step demo would blow through it and take the
        // interaction log down with it.
        await ensureOffscreen();
        await chrome.runtime.sendMessage({
          type: "offscreen/snapshot",
          snapshot: message.snapshot,
        } satisfies ExtensionMessage);
        const current = await readState();
        await writeState({ snapshotCount: current.snapshotCount + 1 });
        respond({ ok: true });
        return;
      }
      case "offscreen/chunk": {
        const state = await readState();
        await writeState({ bytes: state.bytes + message.bytes });
        respond({ ok: true });
        return;
      }
      case "offscreen/done": {
        const manifest = await buildManifest(message.durationSec);
        await writeState({ recording: false, manifest });
        // The upload is deliberately not started here. A service worker can
        // be killed mid-transfer; handing the blob url to a page that owns
        // its own lifetime is the only way a large upload survives.
        await chrome.tabs.create({
          url: `${await uploadOrigin()}/app/record/finish?session=${manifest.sessionId}`,
        });
        respond({ ok: true });
        return;
      }
      case "offscreen/error":
        await writeState({ recording: false, lastError: message.message });
        await chrome.action.setBadgeText({ text: "" });
        respond({ ok: true });
        return;
      default:
        respond({ ok: false });
    }
  })().catch(async (error) => {
    await writeState({ recording: false, lastError: String(error) });
    respond({ ok: false, error: String(error) });
  });

  return true;
});

async function uploadOrigin(): Promise<string> {
  const stored = await chrome.storage.local.get("origin");
  return (stored.origin as string | undefined) ?? "https://demoriff.com";
}

// A tab that closes mid-recording ends the recording rather than leaving a
// worker holding a stream to a page that no longer exists.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await readState();
  if (state.recording && state.tabId === tabId) await stopCapture();
});
