import type { CaptureState, ExtensionMessage } from "./protocol";

/**
 * The popup.
 *
 * It owns no state. A popup is destroyed the moment it loses focus, so
 * anything it remembered would be gone by the time the user looked again —
 * it asks the service worker on open and on a timer, and renders the answer.
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const toggle = $<HTMLButtonElement>("toggle");
const elapsed = $<HTMLElement>("elapsed");
const events = $<HTMLElement>("events");
const mic = $<HTMLInputElement>("mic");
const error = $<HTMLElement>("error");

function formatElapsed(startedAt: number | null): string {
  if (!startedAt) return "0:00";
  const total = Math.floor((Date.now() - startedAt) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function render(state: CaptureState) {
  document.body.classList.toggle("recording", state.recording);
  toggle.textContent = state.recording ? "Stop recording" : "Start recording";
  toggle.classList.toggle("stop", state.recording);
  elapsed.textContent = formatElapsed(state.recording ? state.startedAt : null);
  events.textContent = String(state.eventCount);
  mic.disabled = state.recording;

  error.hidden = !state.lastError;
  error.textContent = state.lastError ?? "";
}

async function ask(message: ExtensionMessage): Promise<CaptureState> {
  return (await chrome.runtime.sendMessage(message)) as CaptureState;
}

toggle.addEventListener("click", async () => {
  toggle.disabled = true;
  try {
    const current = await ask({ type: "capture/state" });
    const next = current.recording
      ? await ask({ type: "capture/stop" })
      : await ask({ type: "capture/start", masks: [], withMicrophone: mic.checked });
    render(next);
  } finally {
    toggle.disabled = false;
  }
});

async function refresh() {
  render(await ask({ type: "capture/state" }));
}

refresh();
// A second is plenty: the only thing that moves between polls is a clock.
setInterval(refresh, 1000);
