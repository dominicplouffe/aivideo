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
