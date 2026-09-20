# The provider boundary

Every external capability the platform needs is expressed as a narrow
interface in `types.ts`. Nothing above this directory imports a vendor SDK.
There are two complete sets behind the same contracts:

| Capability    | Mock set              | Live set                                   |
| ------------- | --------------------- | ------------------------------------------ |
| transcription | `mock.ts`             | `deepgram.ts` — Deepgram REST              |
| synthesis     | `mock.ts`             | `elevenlabs.ts` — ElevenLabs REST          |
| translation   | `mock.ts`             | `anthropic.ts` — `@anthropic-ai/sdk`       |
| direction     | `direction.ts`        | `direction.ts` — *same engine, it is ours* |
| masking       | `mock.ts`             | `masking.ts` — rule-based, see below       |
| render        | `mock.ts` / `queued-render.ts` | `queued-render.ts` — the durable queue |

`getProviders()` picks a set from `DEMORIFF_PROVIDERS`. The default is `mock`,
so a fresh clone runs the entire product with no credentials — that is a
design goal, not a convenience. `live` checks every credential up front and
fails with one message naming all of them, because a deployment missing two
keys should learn that at boot rather than forty minutes into a render.

## What each adapter is careful about

**Deepgram.** Two query parameters are load-bearing. `filler_words=true`
because the API discards "um" and "uh" unless asked, and removing filler words
is a headline feature — we cannot cut what the transcript never admitted was
there. `diarize=true` because two-person walkthroughs are common. Word-level
timings are the whole basis of the editor: deleting a word from the transcript
removes its milliseconds from the timeline, so segment-level alignment would
not be a degraded version of this feature, it would be no feature at all.

**ElevenLabs.** Requests raw PCM rather than MP3, because the timeline needs
the exact duration of every synthesized span and a compressed stream will not
give you one without decoding it. PCM duration is a division. Clips are
content-addressed, so re-synthesizing an unchanged line overwrites the same
object. Cloning refuses outright without a recorded consent phrase, and the
consent recording is submitted alongside the sample rather than checked and
discarded — the database enforces the same rule in
`voices_clone_requires_consent`, and both layers exist on purpose.

**Anthropic.** Narration is not prose. The translated line is spoken over
footage already cut to the original timing, and product nouns visible in the
UI must survive verbatim or the video becomes wrong rather than localised. So
the glossary is *enforced* after the call, not merely requested in the prompt,
and a gross length overrun earns one corrective pass. A line that is still
long ships — the renderer can tighten pacing. A renamed product does not.
Structured outputs remove the "respond with only JSON" failure mode, where an
apologetic preamble becomes part of the voiceover.

**Masking** is the one place a convincing stub would be dangerous. If masking
quietly returns nothing for a rule it cannot evaluate, the render succeeds and
the customer ships a video with their users' email addresses on screen. The
rule engine applies region rules, which are pure geometry, and throws on
detector and pattern rules, which need OCR and a classifier that this
deployment does not have. An error is the correct output; an empty region list
reads like "nothing to hide".

## What is and is not proven here

`adapters.test.ts` runs every adapter against a stubbed transport. It proves
the parts that are ours to get wrong — the request we build, the fields we
map, which failures retry, and the rules we refuse to break. It does not prove
the vendors behave as documented; only a live key does that. Treat the first
run against real credentials as the point where that half is established.

## Failure semantics

Adapters raise `ProviderError` with a `retryable` flag. The job queue reads
that flag and nothing else: a 429 or a 503 backs off and retries, a 401 or a
malformed request dead-letters immediately. Burning a retry budget on a bad
API key only delays the page.
