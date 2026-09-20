# Metering and billing

Billing is the part of a product where a bug is not a bug, it is a charge on
someone's card. Four decisions here, each of which a customer would notice if
it went the other way.

## Seconds, never minutes

A 71-second render is 71 seconds. Every limit in the catalogue, every column
in the schema, every field in the API is in seconds — including the ones the
pricing page renders as minutes. A plan stored as "40 minutes" and consumed
in seconds needs a conversion at every boundary, and every conversion is a
chance to round, always in practice the seller's way. Store the smaller unit
and divide once, at the edge, for display.

The one rounding that exists: a render shorter than a second costs a second,
because the ledger stores integers. Nothing longer is rounded at all.

## Every charge is idempotent

A render job whose lease expires is reclaimed and can complete twice. Without
a unique key on the ledger, the customer pays twice for one video — and finds
out from an invoice rather than from us. The key is the job id, not a
timestamp: the whole point is that the second attempt recognises the first.

The same applies to top-ups, keyed on the invoice.

## The counter is a cache; the ledger is the truth

`workspaces.video_seconds_used` is a counter, and a counter is a summary of
something it cannot explain. "Why does my invoice say that?" has to be
answerable with a list of renders and their durations.

`reconcile()` recomputes the counter from the ledger and **reports** the
difference rather than correcting it. Silently writing the counter to match
would hide the bug that caused the drift, and the invoice and its explanation
would go on disagreeing.

## Running out does not cut you off unless you asked it to

The default is to keep working and bill the overage. A workspace that stops
mid-launch because of a setting nobody chose is a worse outcome than a line on
an invoice — so the hard stop exists, and the customer turns it on. Free has
no overage rate at all, because a plan with no card on file cannot run up a
bill.

Two things follow from where the check sits:

- **The stop is enforced before a render starts**, which is the only moment
  refusing helps anyone, and it names itself in the error. "Your workspace has
  a hard stop enabled and is out of minutes" is a customer fixing it in a
  minute; a generic failure is a ticket.
- **Work that is already done is always metered**, even with the stop on. The
  file exists and the compute was spent; a ledger claiming otherwise is worse
  than an overage.

## Top-ups are bought, not rented

They are added to their own column rather than subtracted from usage, and
they carry across periods. Netting them off the counter would make "you have
used 9 of 10 hours" wrong the moment someone pays, and expiring them would
mean charging for time and then taking it back.

## The notice fires once

At 80% of the allowance, on the render that crosses the line — not on every
render after it. A warning that arrives every time is a warning nobody reads.
The flag clears when the period rolls, so next month's warning still arrives.

## Proration is by the day

Whole days remaining, counting the day of the change as still belonging to the
old plan. Proration by the second looks precise and produces an invoice line
nobody can check; by the day, a customer can do the arithmetic themselves,
which is the only version of "transparent billing" that means anything.

Rounding is toward zero, so a rounding error is never a charge the customer
did not incur. A downgrade returns a credit, applied to the next invoice
rather than refunded automatically — refunding to a card that has since been
replaced fails silently. Enterprise has no list price, so it prorates to
nothing and is handled on the contract.

## The Stripe webhook is the only path that writes a plan

`POST /api/billing/stripe`. Everything about it is arranged around two
properties.

**The body is read as text, once, before anything parses it.** The signature
is over the exact bytes Stripe sent; parsing and re-serialising changes
whitespace and key order, and it never matches again. That is why the route
does not call `request.json()` at all. Every `v1` value in the header is
checked rather than the first, because Stripe sends two during a secret
rotation and checking one breaks every delivery in the window where an
operator is least able to tell whether it is their fault. And there is a
tolerance window, because without one a captured delivery replays forever and
a replayed `invoice.paid` is a free subscription.

**Every delivery is claimed by its event id before it is acted on.** Stripe
retries for three days, including deliveries we handled perfectly well but
answered slowly. A retried `invoice.paid` granting a second period, or a
retried `subscription.deleted` cancelling a workspace that had already
resubscribed, is the kind of bug that arrives as an angry support ticket
rather than as an exception.

Nothing else writes `workspaces.plan`. "Upgrade by POSTing your own
subscription" is the oldest billing bug there is, and the only defence that
holds is that no other code path can do it.

### What a plan change does and does not touch

- **Plan, seats and included seconds follow the subscription.** That is what
  was bought.
- **Usage already recorded does not reset.** Someone upgrading mid-period has
  used what they used; zeroing it hands them the month back and makes the
  invoice disagree with the ledger.
- **Top-up seconds are never touched.** They were paid for outright and carry
  across periods. A plan change is not a reason to take them back.
- **Cancellation drops to free, not to nothing.** Somebody who stops paying
  keeps their recordings and their history; they lose the allowance, not the
  work.
- **`past_due` keeps access.** A failed renewal is usually an expired card,
  and locking somebody out of their own demos over it costs more goodwill
  than the invoice is worth. Dunning has days to fix it, so
  `invoice.payment_failed` deliberately does nothing.

The period rolls on `invoice.paid` rather than on a timer of ours. A timer
drifts out of step with Stripe's billing anchor and gives somebody either a
free week or a short month, every month, forever.

The subscription is read from the event payload, not re-fetched. The event
carries the object as it was at the moment of the change; a fetch returns
what it looks like *now*, so two events arriving out of order would both
apply the later state and a downgrade followed by an upgrade would lose the
upgrade.

A workspace learns its Stripe customer id exactly once, from
`checkout.session.completed`'s `client_reference_id`, and the link is only
written when it is unset — a customer id that changes is either a mistake or
somebody attaching their own Stripe account to a tenant they do not own.

`billing_events` is pruned rather than kept forever. Stripe gives up after
three days, so a row past a month is being kept for no reason — but the floor
is days rather than hours, because the one thing pruning must never do is
forget a delivery inside the window Stripe is still retrying it.
