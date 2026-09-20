# Analytics

Per-second retention, no cookies, and one row per viewing session.

## Why one row, not one per ping

The obvious design is an event per progress ping, and it is the one that
falls over. A demo watched for four minutes at a ping every two seconds is
120 rows; a customer with real traffic writes millions a day to produce a
chart with 240 points on it. That is how an analytics feature becomes an
infrastructure project.

So the player keeps the watch pattern in memory and sends it once, when the
tab goes away, as a run-length-encoded span list — `"0-12,30-44"`. The server
turns that into a Postgres `bit varying`: one bit per second, bit *n* set
means second *n* was watched.

A forty-minute demo is 2,400 bits, about 300 bytes. The retention curve is
then `get_bit(watched, n)` over a `generate_series`, which needs no pipeline,
no warehouse and no nightly job. The shape of the data is what makes the
query cheap, rather than a layer of machinery compensating for the shape
being wrong.

It also answers questions a duration counter cannot. "Watched 30 seconds of a
100-second demo" is a number; "watched the first five seconds and then the
pricing section twice" is an insight, and only a bitmap has it.

## Why it is genuinely cookieless

No cookie, no `localStorage`, no stored identifier. Two views from one person
on one day count once because of `visitorKey` — an HMAC of their address and
user agent under a salt that **rotates daily and is never written down**.

The day after, the key cannot be recomputed: there is no salt left. Somebody
holding the entire database and a specific person in mind cannot confirm that
person watched anything, because the input that would let them check is gone.
A process restart rotates the salt early, which over-counts a handful of
returning viewers — the right trade against persisting the one value that
makes the scheme reversible.

The asset id is inside the hash on purpose. Without it, one key would follow
a viewer across every demo they see that day, which is a cross-site
behavioural profile — the exact thing dropping cookies was supposed to avoid.

Only the **origin** of the referring page is stored, never its path. The URL
of a page on somebody else's site is their data.

## Decisions that look small and are not

- **Merge, never replace.** A viewer who watches the first minute, leaves,
  comes back and watches the last minute has seen both. A summary that
  overwrote the earlier bitmap would report that they skipped the middle
  *and* the beginning.
- **A call to action never un-clicks.** Clicked in the morning stays clicked
  when the afternoon's summary arrives without it.
- **"The end" is the last 5%, not the final second.** Players stop reporting
  a moment early and an outro runs past the last spoken word. A completion
  rate that reads 0% is a metric nobody trusts twice.
- **Malformed input is dropped, not coerced.** Splitting `"-5--1"` on `-` and
  running the pieces through `Number()` yields a perfectly plausible 0-to-5
  range out of input that means nothing. Garbage should produce nothing, not
  a believable answer.
- **The player reports the asset's length.** The finished duration is derived
  from surviving segments rather than stored, and computing it on a beacon
  would be a join on the hot path. It is kept per session, so a later re-edit
  does not rewrite what an earlier viewer actually saw.
- **A beacon always gets a 204.** An unknown demo id is a stale embed on a
  page somebody forgot about; a database outage is ours. Neither is something
  `sendBeacon` can act on, and measurement must never be why a customer's
  page misbehaves.

## Two things the driver taught me

`second` is a keyword in Postgres, so the `generate_series` column is aliased
— otherwise the parser reads it as an interval unit and the failure names
nothing resembling the problem.

And a raw `sql` template hands values straight to the driver, which takes
strings and buffers but not `Date`s. The query builder converts one; a raw
template does not, and the resulting error mentions neither dates nor the
query.
