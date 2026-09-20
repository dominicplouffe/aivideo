# Frame-level masking

The second line of defence. The first is `lib/capture/masking.ts`, which
alters the page before the compositor paints so unmasked pixels never exist
in a file — and that is always better, because nothing here can undo the fact
that the clear frames were, briefly, on disk.

Capture-time masking can only reach what a CSS selector can name. It cannot
reach an email address drawn inside a `<canvas>`, a customer's name baked
into a chart image, a card number in a PDF preview, or anything on a page the
recorder did not instrument. This finds the text *in the frames* instead.

Both are offered, and the recording's manifest says which one each rule used.

## The shape

Four modules, because four different things can be wrong:

| module | job |
|---|---|
| `frames.ts` | sample PNGs out of the recording |
| `locator.ts` | find text and where it is |
| `detectors.ts` | decide what is sensitive |
| `regions.ts` | turn per-frame hits into spans on a timeline |

Locating text and deciding sensitivity are kept apart deliberately. It means
the sensitivity rules are testable exhaustively without an OCR engine, and
the engine is swappable without reopening them.

## Everything errs towards masking

An over-masked frame is a blurred order number somebody complains about. An
under-masked frame is a customer's card number in a video on a marketing
site. Those are not comparable mistakes, so nothing in `detectors.ts` is
allowed to *exclude* a match:

- **Luhn raises confidence and never vetoes.** A card number typed into a
  demo is usually fake and usually fails Luhn, and a rule that only masked
  valid cards would leave a real one through the moment OCR misread a digit
  — which is exactly when it matters.
- **Patterns are looser than a validator's.** OCR reads `O` for `0` and `l`
  for `1` and loses spaces. A pattern tuned to well-formed input misses
  precisely the frames where the text was hard to read, and hard to read is
  not the same as unreadable to somebody with a scrubber.
- **Low locator confidence is not a filter.** Text the model hesitated over
  is text a viewer might still read. A mask skipped because the machine was
  unsure is the worst possible reason to leave an address on screen.
- **An IBAN also matches the card pattern.** That is the right way round to
  be wrong: the rectangle lands on the IBAN either way.

The one thing that *is* narrowed is the rectangle. OCR returns a box per
line, and blurring a whole line to hide six digits destroys the demo for no
security gain — so a hit is narrowed to its share of the line, generously
padded at both ends, because a proportional estimate over a proportional font
that stops one character short is not a mask.

## Sampling is where this gets subtle

Text is located on frames taken a few times a second, not on every frame. A
naive implementation produces a mask that exists only at the sampled
instants, and the frames in between show the data. Three rules:

1. **A hit covers the whole sample interval**, half a period either side. The
   text was on screen between the frame that saw it and the frames nobody
   inspected.
2. **Short gaps are bridged.** OCR misses a frame when a cursor crosses the
   text or an animation blurs it. A mask that drops out for 400ms is a mask
   that can be paused on.
3. **Boxes that are the same thing seen twice merge and grow.** A table
   reflowing or a tooltip nudging a row must stay covered across the whole
   span, not only where it started — and a mosaic of adjacent blurs leaks at
   the seams. A redaction never merges into a blur, which would silently
   downgrade it.

## When a frame cannot be read

**It fails the render.** A render that skipped three frames is unmasked for a
second and a half, and nothing about it looks wrong. A render that failed is
a problem somebody fixes; a render that silently leaked is a problem somebody
finds out about later.

`onFrameFailure: "extend"` carries the previous frame's regions forward
instead — the right choice for a long recording where one vendor hiccup
should not discard an hour of encoding. It is still a guess about what was on
screen, so it is never the default, and the seconds it covers are logged.

The same applies upstream: a pattern that does not compile is an error, not a
rule that matched nothing, and a selector rule arriving without resolved
bounds is refused rather than skipped.

## Frames never touch the disk

One ffmpeg process writes PNGs to a pipe and they are split in memory. Using
a scratch directory would mean unmasked frames of a customer's product
sitting on disk — which is the exact thing this subsystem exists to prevent.

## It is checked in the pixels

Every other test here is about the decision. One is about whether the
decision survives the trip through the EDL and ffmpeg's filter graph and
lands on the frame, which is the only claim a customer cares about and the
one that a bug in the geometry, the normalisation or the `enable=between(…)`
expression would break without failing anything above.

It encodes a clip with a noisy block standing in for a line of text, runs the
whole pipeline, and measures the mean absolute difference between
neighbouring pixels inside the box. A blur collapses it — about 95% of the
detail goes — while the same measurement after the region ends is unchanged.
A mask that ran the whole clip would be safe and useless; nobody ships a demo
that is blurred throughout.
