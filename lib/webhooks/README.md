# Webhooks

One signing scheme, used in both directions, and delivery that rides the same
durable queue as rendering.

## Why the signature covers a timestamp

    DemoRiff-Signature: t=1758394800,v1=9f86d081...

The HMAC is over `${timestamp}.${body}`, not the body alone. That is the
difference between a signature and a replay-proof signature: a bare body HMAC
stays valid forever, so anyone who captures one delivery can replay it —
`render.completed` for a render later revoked, `usage.warning` every minute —
and every replay verifies perfectly. Verification is timing-safe and bounded
by a five-minute tolerance in both directions, because a sender's clock can
run ahead of ours.

The inbound route at `app/api/webhooks/route.ts` verifies with the same
function that signs the outbound deliveries. One implementation to get right
rather than two that drift.

## Why delivery is a queue job

A webhook is work that must survive a restart, retry with backoff, and
eventually give up. That is the queue's entire job description. Writing a
second, subtly different implementation of it would mean two places to get
exponential backoff wrong.

Deliveries are queued at a lower priority than renders: a customer waiting on
a video cares more about it than the receiver of its announcement does. They
also carry an idempotency key of `<type>:<jobId>`, so a worker that is
reclaimed mid-announcement does not produce two.

## The contract with receivers

**At least once, with an id to deduplicate on.** Deliveries are retried, so a
receiver will sometimes see the same event twice. Promising exactly-once over
an unreliable network is a promise nobody can keep, so we do not make it —
every event carries `id`, also sent as `DemoRiff-Event-Id`.

The retry decision follows what each failure means rather than a blanket
rule. A `410` means the endpoint is gone and will stay gone. A `400` or `404`
is a receiver bug that repeating ourselves will not fix. `408`, `429` and
`5xx` are conditions that pass, as is a refused connection or a timeout.

Redirects are never followed. A receiver that answers a webhook with a `302`
is misconfigured, and following it would hand the signature and the payload
to another origin.

## Failure does not cascade

A render that succeeded is never marked failed because its announcement could
not be queued. The video exists and is stored; a missing notification is the
smaller problem. And a failure is announced only once the queue has stopped
retrying — a customer does not want three "render failed" alerts for one
render that succeeded on the third attempt.
