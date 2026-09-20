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

## The destination is a security boundary

A customer types this URL, and a worker on our private network dials it. That
is server-side request forgery by construction, and the worker is the process
worth aiming at: it sits next to the database, the storage credentials and
whatever else answers on the internal network. `169.254.169.254` is one hop
from a set of cloud credentials.

`destinations.ts` decides what may be dialled, and `deliver()` asks it on
every attempt rather than trusting a check made when the URL was first
accepted — a URL reaches the queue by more than one path, and a check at one
door is a check the other door does not have. Four rules:

1. **https only**, unless `DEMORIFF_ALLOW_INSECURE_WEBHOOKS=yes` for local
   development. `file:`, `gopher:` and friends are not transports a customer
   needs, and each one is a different library's parser to be surprised by.
2. **Every resolved address is checked, not the first.** A hostname with one
   public and one private `A` record is the oldest way past a filter that
   stops reading at the first answer.
3. **Literal addresses skip DNS, so they are checked directly** — including
   IPv4-mapped IPv6 in both spellings, because `URL` rewrites
   `::ffff:169.254.169.254` as `::ffff:a9fe:a9fe` and a check written only
   against the dotted form waves the hex one straight through.
4. **The connection is pinned to an address that was checked.** This is why
   delivery uses `node:https` rather than `fetch`: `fetch` resolves the
   hostname again, inside undici, after our check has finished, and that gap
   is the whole of DNS rebinding. Overriding the resolver rather than putting
   the address in the URL keeps the hostname intact, so SNI is sent and the
   certificate is still validated against the name the customer gave us.

A refused destination is never retried. It will be refused every time, and
retrying would turn one bad URL into a port scanner.

None of this replaces egress filtering at the network layer. It is the layer
that is ours to get right.

## Failure does not cascade

A render that succeeded is never marked failed because its announcement could
not be queued. The video exists and is stored; a missing notification is the
smaller problem. And a failure is announced only once the queue has stopped
retrying — a customer does not want three "render failed" alerts for one
render that succeeded on the third attempt.
