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

Identity itself is the next piece of work and belongs behind WorkOS.
`lib/auth/session.ts` is the seam it will slot into. Until then it resolves a
member from a header, and refuses that header in production *loudly* rather
than ignoring it: a development convenience that survives into production is
how an impersonation header becomes an authentication bypass.

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
