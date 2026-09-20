# Interactive demos

A tour is the recording read a second way. The click that told the renderer
to zoom tells the tour where to put a hotspot; the accessible name that
titled a step in the guide titles it here. Nothing is authored twice, which
is the whole argument for capturing interactions rather than just pixels.

## The snapshot

`lib/capture/snapshot.ts` serialises the page at the moment of each click.
Four rules, each of them a refusal:

- **No scripts survive.** A replay executing the customer's application code
  would be non-deterministic at best — fetching, redirecting, eventually
  erroring against an API that is not there — and at worst it is arbitrary
  JavaScript running on our origin next to a viewer's session. Tags,
  `on*` attributes and `javascript:` URLs are all stripped, and a test
  asserts nothing executes when the snapshot is parsed.
- **No field values.** Not the password, and not the rest either: the
  recorder cannot know which document on screen was confidential, so it
  treats every one of them as confidential.
- **Assets are absolutised at capture and inlined afterwards.** Relative
  URLs break the moment the snapshot is served from anywhere else, and a
  snapshot still pointing at the customer's CDN works until they redeploy.
- **There is a size budget.** A page with twenty 4K hero images inlines to
  ninety megabytes. What was skipped is recorded, never silently dropped.

Two details that are easy to miss and expensive to discover:

**Shadow DOM.** A component library built on custom elements renders nothing
at all without declarative shadow DOM — the outer HTML of `<my-table>` is
`<my-table></my-table>`, and the whole table lives in a shadow root that
`outerHTML` does not see.

**Charset.** Plenty of sites declare UTF-8 only in the HTTP `Content-Type`
header. A snapshot is served from somewhere else, where that header is gone,
so the snapshot states its own charset — otherwise every em dash renders as
`â€”` and every non-English demo as gibberish.

## The tour

`buildTour` pairs each snapshot with the interaction that caused it, using
the target selector first and time as the tiebreaker — the same button
clicked twice is the common case, and its selector is identical both times.

Three rules came out of building the sample tour and looking at it:

- **A snapshot is the screen *before* the action**, so the control the viewer
  is asked to press is still on it.
- **The last screen has no hotspot and is kept anyway.** Without it the
  viewer clicks the final hotspot and the demo ends before showing the
  outcome — the created project, the sent invoice, the point of the whole
  thing. Only a trailing snapshot qualifies, and only once there is a step
  for it to be the outcome of.
- **A duplicate is the same screen *and* the same target.** The same screen
  with a different target is "fill in the name, now press Create", which is
  how most forms are demonstrated.

## The player

`components/app/SnapshotPlayer.tsx` renders the snapshot in a sandboxed
iframe. Two things carry the weight:

**The sandbox.** `allow-scripts` together with `allow-same-origin` is not a
sandbox at all — the framed document can reach out and remove its own
sandbox attribute. Snapshots contain no scripts by construction, so neither
token is needed, and a test asserts they never appear together.

**The frame is scaled, not resized.** A responsive application reflows:
shrink the frame to 960px and the sidebar collapses, the form moves, and
every hotspot — whose coordinates are fractions of the *captured* viewport —
points at the wrong control. The frame renders at the viewport it was
captured in and is transform-scaled to fit.

The hotspot overlay is drawn *outside* the frame rather than injected into
the snapshot. Injecting would mean editing the customer's markup at display
time, which is how a "safe" snapshot quietly becomes executable again.
