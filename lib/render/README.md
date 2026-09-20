# Rendering

Two modules and a worker. `edl.ts` decides what the video is; `ffmpeg.ts`
turns that decision into an encoder invocation; `worker.ts` runs it against
the durable queue.

## The one idea that matters

**The cut is expressed in source time. Everything else is expressed in output
time.**

`clips` says which ranges of the recording survive. Zooms, masks and captions
are positioned on the finished timeline, *after* those ranges are gone. The
alternative — carrying source timestamps all the way to the renderer — is the
classic way this goes wrong: delete one "um" near the start and every zoom for
the rest of the video drifts by 340 milliseconds. The mapping happens once, in
`mapSourceToOutput`, in code that can be tested without an encoder.

A join is ambiguous in the other direction: the instant one clip ends is also
where the next begins, and the two have different source times.
`mapOutputToSource` gives the boundary to the clip about to play, which is
what a viewer sees and what makes the two functions exact inverses.

## Why the EDL is data

It is serialisable, diffable and reproducible. The same EDL renders to the
same bytes, which is what makes a re-render after a copy change cheap and a
render cache worth having. It is also the artefact you attach to a bug report:
"the zoom is wrong" becomes a document you can read.

`validateEdl` runs before a worker spends GPU minutes. Each check has a
matching way to waste an hour — overlapping clips double-count billed
duration, a zoom past the end never appears, a mask outside the frame hides
nothing.

## Why the filter graph is built by pure functions

A filter graph is a program, and a program you cannot test without a GPU and a
coffee break is a program nobody will dare to change. `buildCutFilters`,
`zoomExpression`, `anchorExpression`, `buildMaskFilters` and
`buildAudioFilters` are all data in, strings out. The end-to-end test renders
a synthetic recording through the real FFmpeg and probes the result, which is
the only way to know the graph is valid rather than merely plausible.

Four details in there are not style preferences:

- `setpts=PTS-STARTPTS` on every trim. Without it the concat produces a video
  that freezes for the length of everything removed.
- `zoompan` with `d=1`. The default of 25 turns each frame into a one-second
  still.
- A box blur's radius is bounded by the smallest plane it touches. On 4:2:0
  the chroma planes are half size, so a radius above `min(w, h) / 4` is
  rejected — and a narrow mask over a single form field is exactly that shape.
- `apad=whole_dur=<duration>` before `-shortest`. A bare `apad` emits silence
  forever and leaves `-shortest` to stop it, which it does not reliably do for
  a filter-generated stream: the encoder writes until the disk gives out.
  Without any pad at all, `-shortest` truncates the *video* to the end of the
  last narration clip.

## What the worker guarantees

- **The heartbeat runs while FFmpeg does.** A four-minute render outlives the
  queue's 60-second lease; without it the job is reclaimed mid-encode and the
  customer is billed twice for one video.
- **The scratch directory is always removed**, on success and on failure. A 4K
  intermediate is gigabytes, and one leaked per job fills a worker's disk in an
  afternoon — after which every job fails for a reason that looks unrelated.
- **Billing is recorded at completion, from the probed output, in seconds.**
  Not from the request, which is a prediction; not from the EDL, which is an
  intention; not in minutes, because metering in minutes means rounding, and
  rounding in our favour on every render is a choice rather than an accident.
- **A permanent failure dead-letters immediately.** An EDL that does not
  validate will not validate on the third attempt either.
