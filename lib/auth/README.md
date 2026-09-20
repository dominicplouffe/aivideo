# Roles, permissions and the audit trail

## The matrix is data

`lib/auth/roles.ts` holds every permission and who has it, written out in
full. Not "admin inherits creator plus…", because inheritance reads well and
hides exactly the thing a reviewer needs to see: that a role gained a
permission because of a tier it was never meant to have.

Two rules shape it:

- **Publishing is not editing.** A reviewer approves and cannot edit; a
  creator makes and cannot publish. The approval means something precisely
  because the approver did not also write the thing, and a draft holding
  production data must not reach a public link on one person's say-so.
- **Consent and money are owner-level.** An admin runs the workspace; they do
  not change the contract, and they do not withdraw a person's voice consent,
  which is irreversible for every future render.

Role changes have three rules of their own, each from a specific failure:
nobody may grant a role above their own (or an admin reaches owner in two
steps via a colleague), nobody may change their own role, and only an owner
may appoint or demote an owner.

## One authorisation seam

`authorize(actor, permission, { workspaceId })` throws `ForbiddenError`. The
workspace check lives inside it, not in the route handlers, because "a member
of workspace A acting on workspace B's project by passing its id" is a
mistake made by omission — so it belongs where omitting it is impossible.

`resolveActor` tries the session cookie first and falls back to a development
header that is refused in production **loudly** rather than ignored — a
convenience that survives into production is how an impersonation header
becomes an authentication bypass, and one that fails noisily is one somebody
notices. Single sign-on is the piece still missing: WorkOS issues the
identity and `POST /api/auth` is where it lands. Everything downstream of
that already works.

## Sessions are rows

Database-backed, not a stateless signed token, for one reason that outweighs
every argument the other way: **revocation has to be immediate**. When
somebody is offboarded, or their role is cut, or a laptop is lost, "their
token expires within the hour" is not an answer. A stateless token cannot be
taken back; a row can.

The token is returned once and never stored — only its SHA-256 is kept,
exactly as with a password, so a leaked backup gives the reader a list of
hashes rather than a live session for every customer.

Two clocks, because they answer different questions: idle expiry ends an
abandoned session on a shared machine, and an absolute ceiling means no
session lives forever however often it is used. `lastSeenAt` is only written
when it is stale, so an active tab polling every few seconds is not a
database write per request.

Rotation on sign-in closes session fixation — a token planted in a victim's
browser is dead the moment they authenticate — and rotation on privilege
change stops a token captured before a promotion from being useful after it.

### What offboarding actually does

`lib/db/repositories/members.ts` exists so three things cannot be done apart:
check the actor may do it, make the change, and **end the affected person's
live sessions**. The last is the one that gets forgotten and the one that
matters. Removing somebody while their browser keeps a valid session for
twelve hours is not removing them; demoting an admin who still holds an admin
session is not demoting them.

Members are deactivated, never deleted: the audit trail references the row,
and a departed colleague's name vanishing from every entry they ever wrote is
not a feature. And a workspace can never be left without an active owner —
that state has nobody who can change billing, revoke a voice or delete it, so
it must not be reachable by a button.

## The cookie, and the guard around it

`__Host-` prefix (a subdomain cannot then set the parent's session cookie),
HttpOnly (an XSS becomes a bad day rather than an account takeover),
`SameSite=Lax` (Strict would mean a link from email arrives signed out, and
Lax still withholds the cookie from cross-site writes), and **no Max-Age** —
the lifetime lives in the database where it can be shortened. A cookie that
outlives its row merely fails; one that outlives a revocation would be a
security bug.

`proxy.ts` refuses cross-origin writes for every API route. The first version
of that check lived inside the sign-in route, and a cross-origin `PATCH` to
the billing route went straight through, because that route had not been told
to call it. A guard each handler must remember is a guard that will be
forgotten — the same lesson the workspace check in `authorize` already
learned. It is the second line: `SameSite=Lax` is the first, and it depends
entirely on the browser getting it right.

## The audit log

Three properties, in the order they matter.

**Append-only in the database.** A trigger refuses `UPDATE` and `DELETE` for
everyone. Application discipline is not a control; every codebase eventually
grows a path that "just fixes up" a row, and an audit log with such a path is
a log of what someone wanted you to believe.

**Chained.** Each entry is numbered within its workspace and hashed over its
contents plus the previous entry's hash, so an alteration made with enough
privilege to drop the trigger still leaves evidence. A test does exactly
that — disables the trigger, edits a row, re-enables it — and asserts the
chain catches it and names the first entry that no longer fits.

Three details in the hash are load-bearing:

- Fields are joined with a null byte, not a pipe. Otherwise an action named
  `a|b` with resource type `c` hashes identically to `a` with `b|c`, and the
  chain can be forged by choosing names.
- Metadata is canonicalised with sorted keys. `JSON.stringify` preserves
  insertion order, so two identical payloads would otherwise hash differently
  and the chain would fail for a reason that has nothing to do with tampering
   — which trains people to ignore the alarm.
- The version is inside the payload, so when the format changes, entries
  written under the old rule can still be checked with it.

**Writing it never fails the thing it records.** `recordQuietly` is for paths
where the action has already happened and cannot be undone. Losing an entry
is bad; reporting a completed render as failed because the log was
unavailable is worse, and leaves the two records disagreeing forever.

### Entries that predate the chain

`seq`, `prev_hash` and `hash` are nullable, deliberately. You cannot
retroactively prove the integrity of entries written before hashing existed,
and inventing a hash for them at migration time would be a claim of integrity
nobody can stand behind. Null means "predates the chain", and `verifyChain`
starts at the first entry that has one.

### Erasure

The trigger made a hidden decision visible: deleting a workspace cascades
into its audit log, and "deleting the workspace erased the record of who
deleted it" is not a property to ship by accident. But erasure is also a
legal obligation, so the rule is not "never".

An entry may never be **edited**, under any circumstances — there is no
lawful reason to change what happened. Entries may be **deleted** only inside
a transaction that has explicitly declared itself an erasure. A routine
cascade has declared nothing and still fails loudly.

`eraseWorkspace(id, reason)` in `lib/db/erase.ts` is the one supported way to
delete a workspace and its trail. It requires a stated reason and reports
what it destroyed to the operator's log — the one record the deletion cannot
reach. Test teardown uses the same function on purpose: a test that reaches
for a private escape hatch stops exercising the rule everyone else follows.

## Where the checks actually live

The framework's guidance is blunt about this: a check in a route handler
protects that route, and the majority of security checks belong as close as
possible to the data source. So `lib/data.ts` is a **Data Access Layer** —
every read authorizes before it returns, which protects every caller that
will ever exist, including the page somebody adds in six months without
reading the comment above it.

Three rules hold there:

- **Nothing is passed in.** The actor is read back from `getCurrentActor()`,
  a `cache()`-wrapped helper, so a page, its layout and every read inside one
  render share a single session lookup. A value threaded through props is a
  value that eventually reaches a client component by accident.
- **Refusal returns nothing, never someone else's data.** A caller who may
  not see a project gets `null` — the same answer as for a project that does
  not exist, because a different answer for one that exists in a workspace
  you cannot see is an oracle for what that workspace contains.
- **No database means no authorization to do.** The app runs on seeded
  fixtures with nobody signed in, which is what keeps it explorable from a
  fresh clone.

`getCurrentActor()` returns null rather than throwing when called outside a
request — from a script, a worker, a test. Every check downstream then
denies, instead of an exception about a React cache that says nothing about
what went wrong.

The app layout redirects a signed-out visitor to sign-in. That is not the
authorization; it is the courtesy. Without it somebody sees a workspace full
of empty states and has to work out why.

### Tenant isolation is in the query

`getProjectById` takes a workspace and filters on it, rather than looking up
an id across every tenant and leaving the caller to check afterwards. That
kind of check is one somebody eventually forgets, and it fails silently — by
returning the wrong customer's data rather than an error anybody notices.

### A guard that an environment variable could switch off

The first version of the production sign-in guard read "refuse unless
`WORKOS_API_KEY` is set". Setting that variable — exactly what somebody
deploying would do while wiring up SSO — would have enabled the
development-only email sign-in, where anybody becomes anybody by typing an
address. It now refuses in production unconditionally; when the real
exchange exists it gets its own branch, and this one stays as it is.


## Single sign-on

`lib/auth/sso/`, and the whole of it comes down to one question: **who
decides which workspace this person joins?**

The tempting answer is the email domain — `@meridian.com` joins Meridian. It
is also wrong. It means anybody who can get *any* identity provider to
assert an address at a customer's domain becomes a member of that customer's
workspace, and the customer never agreed to trust that identity provider.
Domain ownership and "this directory speaks for us" are different claims.

So the **connection** decides. A workspace admin registers one, and every
assertion that arrives through it lands in that workspace and nowhere else
(`sso_connections.connection_id` is unique across the whole table, so a
second workspace cannot claim a connection and start receiving its logins).
The email domain then only *narrows* what that connection may create: a
connection provisions addresses at domains the workspace has claimed, and an
empty claim list means none rather than all, because an allowlist that fails
open is not an allowlist.

Typing a work address still works, because being handed a connection id is
not a sign-in experience. The domain routes the request and nothing more —
the connection re-checks its own claimed domains before a row is written, so
a wrong guess can only lead to a login that then refuses. Two workspaces
claiming the same domain is refused rather than resolved; guessing would
send somebody into the wrong company's identity provider.

### The state parameter

`state` is the only thing standing between the callback and login CSRF, and
that attack is worth stating plainly: the attacker completes an
authorization flow as themselves, stops before the redirect, and gets a
victim's browser to load the callback carrying *their* code. The victim is
now signed into the attacker's account, and every recording, script and
brand kit they make next lands somewhere the attacker can read.

Three properties, each load-bearing:

1. **Signed**, so it cannot be minted by whoever is driving the browser.
2. **Expiring** (ten minutes), so one captured from a proxy log is not useful.
3. **Bound to a nonce that is also a cookie**, so a state issued to one
   browser cannot be replayed in another. A signature alone proves only that
   *we* issued it — not that we issued it to the browser presenting it.

The return path rides inside the signed blob rather than as its own query
parameter, and is rejected unless it is a same-site path. A post-login
redirect is exactly what phishing wants, because the person has just been
told to trust what they are looking at.

### Roles from a directory

Group mappings are data on the connection. The highest privilege wins rather
than the first listed, so somebody in both `engineering` and `demo-admins`
gets the admin role regardless of the order the directory sent them in.

**Ownership is never assigned from a group.** It is a billing and deletion
relationship, and letting a group name confer it would mean a directory
administrator could take a workspace from the person paying for it. A role
*change* ends every session that predates it, because a demotion that takes
effect at the next sign-in takes effect exactly when it matters least.

A new account defaults to `viewer` — the least privilege the product has. An
account arriving from a directory nobody has reviewed should be able to
watch demos, not publish them.

## Directory sync (SCIM 2.0)

`lib/auth/scim/`, served at `/api/scim/v2`. Creating accounts is the
convenient half; **removing them on the day somebody leaves is the half
worth having**, and it is the half that goes wrong when it is a person's job
to remember.

So deactivation does two things, not one: it marks the member row *and* ends
every live session behind it. A deactivated member whose browser tab still
works has been marked, not offboarded. A `DELETE` deactivates too — audit
entries, recordings and render approvals all point at a member row, and
removing it would either cascade away evidence or leave the trail pointing
at nothing.

Nothing in a SCIM request names a workspace. The bearer token names a
connection, the connection names the workspace, and every query is scoped to
it before a filter is even parsed. A directory asking about a member in
another workspace gets the same answer as for an id that does not exist,
because any other answer is an enumeration oracle.

Only the token's hash is stored, for the same reason as the session table.
`active: false` is read in all three shapes vendors send it — including
Entra's string `"False"`, which read as truthy would make an offboarding
silently do nothing.

The filter grammar is parsed, not interpreted: `userName eq` and
`externalId eq` are handled and everything else is refused with
`invalidFilter`. A half-implemented expression evaluator over a provisioning
endpoint returns the wrong set quietly, which means acting on the wrong
person. `ServiceProviderConfig` declares the gaps honestly — no bulk, no
sort, no password change — because a directory told that bulk exists will
use it, and then every offboarding fails.

### Groups

Served at `/api/scim/v2/Groups`, and worth syncing for exactly one reason:
they decide roles. A directory that moves somebody from `demo-viewers` to
`demo-admins` is deciding what that person may do, and the point is that the
decision takes effect here without anybody re-typing it.

**Every membership change recomputes the member's role from all of their
groups, never from the delta.** Applying the delta is the bug everybody
writes: removing somebody from `demo-admins` would drop them to the
connection default even though they are still in `support-leads`, which maps
to admin too.

The mapping itself lives on the connection, shared with the SSO assertion
path, so one place answers "what does this group grant". Two copies of that
answer drift.

Three consequences that are easy to get wrong, each with a test:

- **A group deletion recomputes before it removes the rows.** Afterwards
  there is nothing left to recompute from, and a deletion that leaves ten
  people holding an admin role it granted is the worst possible outcome of
  tidying up a directory.
- **A replace recomputes the people who left as well as the people who
  joined.** A replace both grants and removes.
- **A removal encoded in the path is handled.** Entra sends
  `path: 'members[value eq "..."]'` with no value at all, and a handler that
  only reads `value` silently ignores every offboarding that vendor sends.

A role change ends every session that predates it, as everywhere else here.
An owner's role is never changed by a directory.
