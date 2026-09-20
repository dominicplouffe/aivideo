# DemoRiff Capture

The MV3 extension that records a tab and, more importantly, records what the
person did inside it.

    npm run build:extension      # → extension/dist
    # chrome://extensions → Developer mode → Load unpacked → this folder

## Why the interaction log is the product

A screen recorder captures pixels. Pixels cannot tell you that the thing
clicked at 00:42 was a button named "Save changes" with the selector
`[data-testid="save"]`, and that is exactly what lets the editor zoom to it,
hold the frame until the sentence describing it ends, and title that step
"Save changes" in the generated guide. None of it is recoverable from the
video afterwards at any price, so it has to be recorded at the same moment.

## The four worlds, and why

MV3 splits a recorder across contexts that cannot see each other. Each piece
is here because something is impossible without it.

| Piece | Context | Why it exists |
|---|---|---|
| `background.ts` | Service worker | Coordinates. Chrome terminates it after ~30s idle, including mid-recording, so it keeps **no** state in memory |
| `offscreen.ts` | Offscreen document | A service worker has no DOM, so no `MediaRecorder`. This is Chrome's sanctioned workaround, and the only place raw media lives |
| `content.ts` | Isolated world | Applies masks, runs the observer, buffers events. Isolated so it cannot collide with the customer's own code |
| `main-world.ts` | Page world | Patches `history.pushState`. See below — this is the one thing an isolated world cannot do |

### The isolated-world trap

A content script shares the DOM with the page but not its JavaScript objects.
Patching `history.pushState` there produces a patched copy that the
application never calls, so every single-page route change goes unrecorded —
the recording shows a click and then, with no explanation, a different
screen, and the generated guide loses its chapter boundaries. It looks like
it works, because the mask applies and clicks are captured; only routing is
silently missing.

So the route hook runs in the page's own world, injected on demand, and
announces route changes as a DOM event — which *does* cross the boundary.
`extension/extension.test.ts` covers this end to end, because the unit tests
could not: they inject the bundle into the main world, where the bug does not
exist.

## What it refuses to record

- **Content, ever.** A printable keystroke produces `{kind: "input",
  redacted: true}` — the action, never the letters. The recorder has no way
  to know which document on screen was confidential, so it treats them all as
  confidential.
- **Sensitive fields' names.** A step titled "type your password" in a
  published guide is a step pointing at the credential prompt.
- **Command keys are kept**, because `Cmd-S` is "they saved", not "they typed
  s".

Masking happens **in the page, before any frame is encoded**. Blurring in
post means there is a moment — on disk, in a bucket, in a render worker's
scratch directory — when the customer's production data sits there at full
resolution. A CSS filter is applied during paint, so the compositor never
produces a clear frame to capture.

Detection is deliberately over-broad. A field wrongly treated as sensitive
costs a blurred rectangle in one demo; a field wrongly treated as safe costs
a customer their credentials, in a video they published themselves.

## Other decisions worth keeping

- **Nothing runs until armed.** An extension that attaches a
  `MutationObserver` to every open tab is a battery complaint and a support
  ticket.
- **Listeners are capture-phase and passive.** Capture phase so an
  application calling `stopPropagation` cannot blind the recorder; passive so
  the recorder is never the reason a scroll stutters.
- **Events are buffered and flushed on a timer**, and a failed send keeps the
  batch. The service worker being asleep must not silently cost the
  interaction log.
- **Microphone audio is a separate track**, not mixed into tab audio. The
  editor needs them independently, and a mix cannot be undone.
- **The upload is not started by the service worker.** It can be killed
  mid-transfer; the blob URL is handed to a page that owns its own lifetime.
