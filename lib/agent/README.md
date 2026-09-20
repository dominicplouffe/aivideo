# The Riff Agent

An agent that drives a browser through a customer's own product and records
what it does. It is the most dangerous feature in this repository, and every
decision below is a decision about that.

The whole security story is four sentences:

1. **Nothing records without a person's approval.**
2. **It cannot reach an origin nobody approved.**
3. **A password is only typed into the site it was stored for.**
4. **Everything it did — and everything it was refused — is in the log.**

Each one has a test that says it in about that many words.

## The approval gate is the state machine

The product promise is that nothing the agent produces reaches a
customer-facing surface without a person saying yes. A promise like that is
worth exactly as much as the place it is enforced. A check in a route handler
is one `fetch` away from being skipped. A disabled button is a CSS class.

So it is the transition table in `run.ts`. `recording` has exactly one legal
predecessor — `approved` — and there is no edge from `awaiting_approval` to
`recording` at all. A test asserts that in one line:

```ts
const into = Object.keys(TRANSITIONS).filter((from) => TRANSITIONS[from].includes("recording"));
assert.deepEqual(into, ["approved"]);
```

Three things follow from taking that seriously:

- **An approval needs a person.** `approve()` refuses without a member id.
  A service account approving its own runs is not an approval.
- **The approver is not the requester.** Not because one person cannot be
  trusted, but because the gate exists to put a second pair of eyes on a plan
  that will run unattended with real credentials. A gate you can open for
  yourself is a formality. `agent.run` and `agent.approve` are separate
  permissions and a creator holds only the first.
- **The outline is hashed at approval.** Otherwise "approved" means somebody
  approved *an* outline, and a plan edited afterwards still carries that
  approval. `beginRecording` re-checks the hash, so a rewritten plan fails
  closed.

The status is also part of the `UPDATE` predicate, so two callers racing to
start the same run cannot both win — the loser updates zero rows and is told
the transition is illegal, which by then it is.

## Outline first, and the outline is checked

Outline-first is not a UX preference. A person approving "record a demo of
our shipments flow" has approved a sentence; a person approving eight
numbered steps with the URLs they visit has approved a plan. Only the second
is reviewable.

The model's job ends at the outline — there is no loop that asks it what to
do next, because a plan a person approved and a plan a model is improvising
are different products and only one survives a security review.

And the plan is checked rather than trusted. A step naming a URL outside the
allowlist is **removed and reported**, never quietly trimmed: a plan that
reads as approvable while hiding a step nobody would approve is precisely
what the gate exists to prevent.

## The allowlist

Origins, not domains. `https://app.acme.com` does not admit
`http://app.acme.com` — a downgrade is how a credential ends up on the wire —
and it does not admit `acme.com`. A wildcard must be written as one, and
`*.acme.com` never matches `acme.com.evil.example` because the match is on
the parsed host's suffix *with a leading dot*, not on the string.

Two checks, at two levels, because each catches what the other cannot:

- **Every request, at `context.route("**")`.** Not just navigations: a page
  on an approved origin can `fetch` anywhere, and a page that can fetch
  anywhere can exfiltrate whatever it just saw. Requests are aborted rather
  than failed with a status, because a 403 would be rendered by the page and
  could be mistaken for the site's own answer.
- **Every navigation, against the resolved address.** An allowlist is a list
  of names, and a name resolves to whatever its owner says. `demo.acme.com`
  pointed at `127.0.0.1` is an approved entry that reaches our own network,
  so navigations go through the same private-address checks as an outbound
  webhook. Unlike the webhook worker, there is no development relaxation:
  the agent is the one place where "it also works against localhost" ends
  with a credential in someone else's hands.

Redirects are checked where they *land*, not where they were aimed.

This is verified in a real Chromium, not only reasoned about, because the
claim is about the browser's behaviour rather than ours: a page on an
approved origin tries to `fetch` an unapproved one that is up and answering,
and both the fetch and an `<img>` are blocked.

## Isolation

A fresh context per run, never a persistent profile. No cookie, no
`localStorage` entry and no service worker survives a run, so two runs for
two customers cannot see each other's session and a run cannot inherit one
from a run that ended badly. Downloads are refused and no permissions are
granted — a browser that volunteers a camera during a recording is doing
something nobody asked for.

## Credentials

Sealed with AES-256-GCM (`lib/crypto/secrets.ts`), because they are
presented rather than recognised. Two properties beyond that:

**Bound to one exact origin, checked at use.** The origin comes from
`page.url()` — where the browser actually is — not from the outline. Those
differ exactly when it matters: after a redirect to somewhere the agent did
not plan to go. This is the difference between "the agent has credentials"
and "the agent has credentials for this site". A wildcard is fine for
deciding where the agent may browse; it is not fine for deciding where a
password may be typed, so `storeCredential` refuses one.

**Rotatable in place.** One row, one label, a new secret — nothing that
references it changes, which is what makes rotation something a person will
actually do. Revoking clears the ciphertext rather than setting a flag: a
revoked credential whose ciphertext is still in the table comes back if
anybody ever un-sets the flag.

`lastUsedAt` is recorded because the most common way these leak is that the
demo account for a product nobody demos any more still works, and nobody can
see that it does.

The typed value never reaches the audit trail. "Signed in as sam@acme.com at
app.acme.com" is the useful record; the password is not part of it.

## The run audit

Every action, in order, with the step of the approved outline it belongs to
— **including the refusals**. A trail that holds only what happened cannot
answer the question a reviewer actually asks, which is what the agent *tried*
to do, and an agent that silently drops a refused navigation is
indistinguishable from one that never attempted it.

The brief, the outline, the approver, every action and the timestamps are one
`GET /api/agent/runs?id=…`, because that is the artefact a security review
asks for and reconstructing it from logs afterwards is how it turns out to be
incomplete.

## What is deliberately not here

- **No self-directed loop.** The agent walks the approved steps. It does not
  decide what to do next.
- **No destructive actions.** The planner is told not to plan them; more to
  the point, nothing in the driver deletes, cancels, or sends.
- **No publishing.** A recorded run produces a recording. Turning that into
  something a customer sees goes through the same `project.publish`
  permission as everything else.
