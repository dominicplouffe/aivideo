# Audit


## Streaming to a SIEM

`lib/audit/siem.ts`. An enterprise buyer does not want a second place to
look; they want these events in Splunk, Sentinel, or whatever their security
team already has open, correlated with everything else that happened that
afternoon. That is the whole feature.

**The cursor is a sequence number, not a timestamp.** The chain already
numbers entries densely within a workspace, so "everything after 412" has
exactly one meaning. A timestamp cursor has to choose between re-sending the
entries that share the boundary second and skipping them, and under a clock
adjustment it manages both.

**The cursor advances only after the collector has accepted the batch.** That
makes delivery at-least-once, which is the honest guarantee. Every event
carries its workspace and sequence number, so deduplicating is one search on
the receiving side. Advancing first would lose events, and an audit stream
with holes is worse than no stream at all — it looks complete.

Three formats: newline-delimited JSON, Elastic Common Schema, and ArcSight
CEF. Each event ships with its own chain hash and its predecessor's, so a
reader can verify the chain from what their collector holds without asking
us for anything.

CEF's escaping rules are asymmetric and worth stating, because getting them
wrong is a vulnerability rather than a formatting bug: the header escapes a
backslash and a pipe; the extension escapes a backslash and an equals sign,
and must turn a newline into a literal `\n`. An unescaped newline in an
audit field ends the record early, and everything after it reads to the
collector as a second, fabricated event — which is a way to write whatever
you like into somebody's security log.

The destination is a customer-supplied URL dialled by a worker on our
private network, so it goes through exactly the same checks as an outbound
webhook (`lib/webhooks/destinations.ts`), at registration *and* at every
delivery.

The collector credential is the one secret in this codebase that is
encrypted rather than hashed, because it has to be presented to somebody
else's collector on every delivery. `lib/crypto/secrets.ts` seals it with
AES-256-GCM — authenticated, because a ciphertext that can be bit-flipped
into a different plaintext would be sent to a customer's collector as their
token. It is never readable back through the API.

A collector that has failed fifty times in a row stops being tried. One that
has been gone for two days is not coming back on its own, and retrying
forever hides the fact that nobody is receiving this workspace's audit
trail. Nothing is lost: the cursor never moved, so re-enabling it catches up.
