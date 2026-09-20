# Help-centre connectors

Zendesk Guide, Intercom Articles, Help Scout Docs, Notion and Confluence
Cloud. One narrow interface, one adapter each, and a sync layer that never
learns a vendor's name.

## The rule

**A human edit is never silently overwritten.**

A support lead who fixes a sentence in Zendesk has done something more
valuable than our re-render. An integration that clobbers that on the next
sync is one they disconnect the same afternoon — and the damage is invisible
until a customer reads the wrong instructions.

So every sync asks who has moved, and three hashes make it decidable. All
three are measured the same way: the *visible text* of the article as the
help centre would hold it.

| stored | what it is |
|---|---|
| `pushedHash` | what we last sent |
| `remoteHash` | what the help centre last told us it holds |
| — | the live guide, hashed fresh on every sync |

| local moved | remote moved | state | what happens |
|---|---|---|---|
| no | no | `in_sync` | nothing is sent |
| yes | no | `local_ahead` | push |
| no | yes | `remote_ahead` | held, and reported |
| yes | yes | `diverged` | held, and reported |

`force` overrides a hold. It is never the default, it takes an explicit
choice per project, and it writes `connector.edit_overwritten` to the audit
log with a name against it.

`remote_ahead` does **not** pull the edit back into the project. A project is
a recording with a transcript and camera direction; an edited paragraph from
Zendesk has nowhere honest to land in it. The sync stops pushing and says so.
Pretending to merge would be the worse lie.

## Why hashes and not timestamps

Every vendor exposes a "last updated" field and every one of them moves for
reasons that are not edits — a re-index, a template change, a bulk category
move. Hashing visible text asks the only question worth asking: does this
article still *read* the same?

That it is visible text rather than markup matters just as much. Help centres
reflow HTML, rewrite entities, and wrap articles in templates of their own.
A comparison over markup reports an edit the first time the vendor changes
its serialiser.

And nothing time-varying goes into the hash. Re-rendering a guide updates its
timestamp on every run; a hash that moved with it would report every project
as edited on every sync, which trains people to ignore the one time it is
true.

## Drafts, not publishes

Every adapter creates drafts. An automated publish straight to a live help
centre is a change nobody reviewed, on a page customers read. Somebody
presses publish on the vendor's side.

## What each vendor gets wrong

These are the things that cost an afternoon each, and every one has a test:

- **Zendesk** authenticates as `{email}/token:{api_token}`. Without the
  `/token` suffix it fails with the same 401 as a bad token. Locales must be
  lowercase — `en-US` is rejected with "locale is not valid". And an
  article's body lives on its *translation*; PUTting it on the article
  silently does nothing.
- **Intercom** is regional. `api.intercom.io` is the US, and an EU or AU
  workspace answers only on its own host — with a 401 that reads as a bad
  token. Timestamps are seconds; read as milliseconds they put every article
  in 1970. The API version is pinned, because an unversioned request follows
  whatever is current.
- **Help Scout** answers a create with an id and nothing else, so the article
  is read back. Without that there is no body to hash and the next sync
  reports an edit that never happened.
- **Notion** has no body field at all — a page is a tree of blocks, capped at
  100 children per call and 2000 characters per rich-text run. An update
  cannot replace content, so the blocks we wrote are deleted before fresh
  ones are appended; appending without that grows the page by a full copy of
  the guide on every sync.
- **Confluence** requires the version number of the revision being replaced,
  and it must be exactly one higher. That is optimistic locking, and it is
  the only reason two syncs racing cannot discard each other's write — so the
  current version is read immediately before every update, never cached.
  Storage format is XHTML: an unclosed `<img>` or an unescaped `&` rejects
  the whole page.

## Security

The base URL is a customer's own instance, dialled from our network — the
same problem as an outbound webhook, so it gets the same destination checks
(`lib/webhooks/destinations.ts`), at installation and on every call.

Vendor credentials are sealed with AES-256-GCM rather than hashed, because
they have to be presented on every call. They are never readable back
through the API.

Every piece of text in a guide is HTML-escaped before it is sent. Not because
a help centre would run our script, but because this content travels into
somebody else's site under their domain, and what we send them is our
responsibility.
