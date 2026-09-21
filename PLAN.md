# DemoRiff — build plan

This document is the running plan. Phases 1–10 are complete and in this
repository. What is *not* built is named at the bottom, under "What is real,
and what is not" — that section is the one to read first, and it is kept
current deliberately, because a plan that only records wins stops being
useful the week somebody relies on it.

---

## Where the product sits

The category has three clusters of tools, and every one of them is a partial
answer:

| Cluster | Examples | What they do | What they leave out |
| --- | --- | --- | --- |
| Recording → video + docs | Trupeer, Clueso, Guidde | Screen capture, AI voiceover, auto-zoom, written guides | No interactive demos, shallow editing surface, thin governance |
| General AI editors | Descript | Excellent transcript-based editing across any content | No interaction awareness, no documentation, no redaction |
| Interactive demo tools | Arcade, Storylane, Navattic, Supademo | Strong click-through tours | Video is a secondary feature; no documentation output |
| Avatar ad generators | Creatify, HeyGen, Synthesia | High-volume avatar ad creative | Not built around a software interface at all |
| Process documentation | Scribe, Tango | Good written SOPs | No video, no interactive, weak branding |

**DemoRiff's position:** one capture, four outputs, one source of truth. The
recorder captures the DOM and the interaction log alongside the pixels, so the
video, the interactive tour and the written guide are all *derived* from the
same take and cannot drift apart. That is the structural advantage; everything
else follows from it.

The three commercial decisions that fall out of that:

1. **Documentation is unmetered.** Metering it makes teams write fewer guides,
   which makes their product harder to use.
2. **Translations are never re-billed.** Charging per language per video is why
   teams localize two markets instead of eleven.
3. **Comparison pages open by naming where the competitor wins.** Cheaper than
   churn.

---

## Phase 1 — Foundation ✅

- Next.js 16, React 19, TypeScript strict, Tailwind CSS v4
- Token-only design system (eleven-step ink ramp, one brand gradient)
- 80-glyph icon set, logo, motion primitives, shared reveal observer
- Production dependencies: `next`, `react`, `react-dom`

## Phase 2 — Marketing core ✅

- Home with a six-stage animated pipeline canvas
- Pricing: five plans, billing commitments, minute explainer, comparison matrix
- Marketing shell: mega-menu header, multi-column footer

## Phase 3 — Marketing depth ✅

- 11 product pages, 6 solution pages, 6 comparison pages, 6 case studies
- Trust centre, integrations directory, ROI calculator, company pages

## Phase 4 — Resources ✅

- Typed block content format with a Prose renderer
- 8 blog posts, 4 academy courses (12 lessons), 8 docs pages, API reference,
  changelog, 5 legal documents

## Phase 5 — Application ✅

- App shell, ⌘K command palette, dashboard, project library
- Recorder with real `getDisplayMedia` capture and a staged pipeline
- **The Studio**: edited-timeline model, transcript editing, canvas with zoom
  keyframes, timeline strip, five-tab inspector, export dialog
- Guide editor, interactive demo builder, brand kits, voices, presenters,
  localization matrix
- Analytics, team, billing, settings, public share pages, auth
- Provider abstraction with deterministic mocks; four API route handlers
- SEO: sitemap, robots, OG image, metadata on every route

---

## Phase 6 — Make it real (backend)

The largest remaining block. Nothing above the provider boundary changes.

1. ~~**Persistence.** Postgres with Drizzle.~~ **Done.** Twelve tables, with
   the constraints that matter enforced in the schema rather than in code —
   `voices_clone_requires_consent` is the one to read first. Usage is metered
   in seconds so partial minutes never round in our favour. See
   `lib/db/README.md`.
2. ~~**Media storage.**~~ **Done.** One contract, two adapters (local and S3),
   workspace-scoped keys, signed time-limited reads, resumable multipart
   upload. See `lib/storage/`.
3. ~~**Transcription adapter.**~~ **Done.** Deepgram, with word-level
   alignment, diarization and filler words explicitly requested — the last of
   those is discarded by default and the editor cannot cut what the transcript
   never admitted was there.
4. ~~**Render cluster.**~~ **Done, as a worker.** An EDL format, an FFmpeg
   compiler, and a queue worker that renders, stores and meters. Proven by
   rendering synthetic footage end to end and probing the result. What remains
   is horizontal: GPU encoding, autoscaling and a cluster to run the worker
   on — deployment, not design. See `lib/render/README.md`.
5. ~~**Synthesis and cloning adapters.**~~ **Done.** ElevenLabs, requesting raw
   PCM so span durations are exact rather than decoded, refusing to clone a
   voice without a recorded consent phrase, and refusing to render with one
   whose consent was later withdrawn.
6. ~~**Job queue.**~~ **Done.** `FOR UPDATE SKIP LOCKED` claiming, lease-based
   crash recovery, exponential backoff, dead-lettering, idempotency keys, and
   outbound webhook delivery on the same machinery.

6.5 and 6.6, closing the phase: **outbound webhooks** ride the same durable
queue as renders, signed with a timestamped HMAC so a captured delivery
cannot be replayed; and **withdrawing consent for a cloned voice** now stops
renders that were queued while consent still stood, checked at the last
moment before bytes exist.

Also done in this phase, beyond the original list: an Anthropic translation
adapter that enforces the glossary and the shot's length budget rather than
merely asking for them, and a masking engine that throws on rules it cannot
actually evaluate instead of returning an empty region list that reads like
"nothing to hide". See `lib/providers/README.md`.

## Phase 7 — Real capture

1. ~~**Browser extension** (MV3)~~ **Done.** Tab video plus the interaction
   log — selector, role, accessible name, bounds, route changes, mutations —
   with sensitive fields masked in the page before any frame is encoded. The
   route hook runs in the page's own JavaScript world because a content
   script's isolated world shares the DOM but not `history`; see
   `extension/README.md`. Tested by loading the built extension into a real
   Chromium. Firefox and Safari ports are still open.
2. **Desktop apps** (macOS, Windows) for full-desktop capture, system audio and
   hardware encoding.
3. ~~**Masking at capture time**~~ **Done, both lines.** Selectors are
   enforced in the extension before the compositor paints, so unmasked
   pixels never exist in a file. Detectors, regions and patterns now have
   the frame-level service `lib/providers/masking.ts` used to refuse to
   fake: frames sampled through a pipe (never to disk), text located by a
   vision model, sensitivity decided separately so it is testable without an
   OCR engine, and per-frame hits expanded into timeline regions that bridge
   the frames nobody inspected. Everything errs towards masking — Luhn
   raises confidence and never vetoes. A frame that cannot be read fails the
   render rather than passing as clean. Verified in the pixels: 95% of the
   detail inside the box is gone while the mask is on, and unchanged after
   it ends. See `lib/masking/README.md`.
4. ~~**DOM snapshotting** per step, with assets inlined~~ **Done.** Scripts
   stripped, field values withheld, shadow DOM preserved, assets absolutised
   at capture and inlined offline against a budget. The tour model pairs
   snapshots with interactions, and the player renders them in a sandbox that
   never grants scripts. See `lib/demo/README.md`.

## Phase 8 — Auth, billing, governance

1. ~~**WorkOS for SAML SSO and SCIM.**~~ **Done.** The connection decides
   which workspace an assertion lands in — never the email domain, which
   would mean anybody who can get an identity provider to assert an address
   at a customer's domain joins that customer's workspace. `state` is
   signed, expiring and bound to a nonce cookie, so a code obtained by one
   browser cannot be redeemed in another; the return path travels inside the
   signed blob and is rejected unless it is a same-site path. Group mappings
   assign roles, most privileged wins, and never ownership. SCIM 2.0 Users
   is served at `/api/scim/v2` with a per-connection bearer token stored
   only as a hash, and deactivation ends every live session rather than only
   marking the row. Verified end to end against a live server: the flow,
   login CSRF from a second browser, three open-redirect attempts, and an
   offboarding that killed a live session mid-request. **SCIM Groups is now
   done too**: group membership decides roles, recomputed from every group a
   member is in rather than from the delta, because removing somebody from
   one admin group while they remain in another must not demote them. A
   group deletion recomputes before it removes the rows, and Entra's
   removal-in-the-path shape is handled — a handler that only reads `value`
   silently ignores every offboarding that vendor sends. See
   `lib/auth/README.md`.
2. **Stripe.** The metering engine is ~~done~~: a usage ledger in seconds,
   idempotent against queue retries, top-ups that carry across periods,
   proration by the day, the 80% notice fired once, and a hard stop that is
   off by default and enforced before a render starts. See
   `lib/billing/README.md`. **The Stripe side is now done too.** Webhook
   signatures are verified over the raw bytes against every `v1` value, with
   a tolerance window, because a captured delivery replayed forever is a
   free subscription. Every delivery is claimed by event id before it is
   acted on, since Stripe retries for three days including deliveries we
   handled but answered slowly. The webhook is the *only* path that writes a
   workspace's plan — "upgrade by POSTing your own subscription" is the
   oldest billing bug there is. Usage already incurred is never reset and
   top-up seconds are never taken back, because a plan change is not a
   reason to restate the ledger or to reclaim something bought outright.
3. ~~RBAC across owner / admin / creator / reviewer / viewer, scoped per
   workspace.~~ **Done.** The matrix is data, written out in full, with the
   workspace check inside the one authorisation seam rather than in each
   route. See `lib/auth/README.md`.
4. ~~Append-only audit log~~ **Done.** A database trigger refuses UPDATE and
   DELETE for everyone; entries are numbered per workspace and hash-chained,
   so an alteration made with enough privilege to drop the trigger still
   leaves evidence. Erasure is possible only inside a transaction that
   declares itself one. **SIEM streaming is now done too**: newline-delimited
   JSON, ECS or ArcSight CEF to a customer's collector, cursored on the
   chain's own sequence rather than a timestamp, advancing only after the
   collector accepts — so the stream is at-least-once and never has holes.
   Every event carries its chain hash, so a reader can verify from their own
   copy. The collector token is sealed with AES-256-GCM rather than hashed,
   because unlike every other credential here it has to be presented again.

## Phase 9 — Distribution

1. ~~Embed runtime~~ **Done.** A 3.2 KB async script against an enforced 6 KB
   budget, zero layout shift measured with a real `PerformanceObserver`, lazy
   below the fold, no globals, no cookies, and server-rendered step text that
   a search engine can read with JavaScript disabled. See
   `lib/embed/README.md`.
2. ~~Analytics ingestion: per-second retention at write scale, cookieless
   mode.~~ **Done.** One row per viewing session with a per-second watch
   bitmap, deduplicated by a daily-rotating key that cannot be reversed or
   linked across days, and retention curves computed in SQL. See
   `lib/analytics/README.md`. **CRM identity resolution is now done too**,
   and it is deliberately the opposite trade, confined to one module.
   Identity is given rather than inferred — an address typed into a gate, or
   a signed expiring link a salesperson sent — and it attaches forwards
   only, because the daily key is irreversible and earlier sessions cannot
   be found. That is a real cost: a competitor who fingerprints shows more
   history on day one. What they cannot show is a straight answer to "how do
   you know that was me". Erasure keeps the count and drops the name, so
   honouring a deletion request does not quietly restate last quarter. The
   CRM push is a contact and one note, never a sync.
3. ~~Help-centre connectors with two-way sync (Zendesk, Intercom, HelpScout,
   Notion, Confluence).~~ **Done.** All five, behind one interface. The sync
   is genuinely two-way in the only sense that matters: a human edit in the
   help centre is never silently overwritten. Three hashes over *visible
   text* — what we last sent, what they last held, and the guide as it
   stands — decide whether each side has moved, and a sync that would
   discard somebody's edit is held and reported rather than performed.
   Overriding takes an explicit choice and lands in the audit log with a
   name against it. Every adapter creates drafts; publishing stays a human
   decision on the vendor's side. See `lib/connectors/README.md` for what
   each vendor gets wrong, because each one is wrong in its own way.

## Phase 10 — Riff Agent ✅

1. ~~Environment allowlist, scoped rotatable credentials, isolated browser
   sessions.~~ **Done.** Origins not domains, no http downgrade, no implied
   subdomains, and a wildcard that cannot be walked past with
   `acme.com.evil.example`. Enforced on *every* request rather than only on
   navigations — a page that can `fetch` anywhere can exfiltrate what it
   just saw — plus a resolved-address check per navigation, because a name
   resolves to whatever its owner says. Verified in a real Chromium against
   an unapproved origin that was up and answering. Credentials are sealed,
   bound to one exact origin, checked against where the browser actually is
   rather than where the plan said it would be, and rotate in place.
2. ~~Outline-first flow — nothing records until a human approves the
   outline.~~ **Done**, and the gate is the state machine rather than a
   check: `recording` has exactly one legal predecessor, and there is no
   edge from `awaiting_approval` to it. The approver cannot be the
   requester, an approval needs a person's member id, and the outline is
   hashed at approval so a plan edited afterwards fails closed.
3. ~~Full run audit: brief, every action, output, approver, timestamp.~~
   **Done**, refusals included — "what did it try to do" is the question a
   reviewer asks, and an agent that silently drops a refused navigation
   looks identical to one that never attempted it.
4. **The approval gate stays non-optional.** Nothing the agent produces
   reaches a customer-facing surface without a person saying yes. See
   `lib/agent/README.md`.

---

## Open questions for you

1. **Name and domain.** `demoriff.com` is the working assumption throughout. It
   is one constant in `lib/site.ts` plus the wordmark component — changing it is
   a small, contained edit.
2. **Which output leads.** The current positioning leads with video and treats
   the interactive tour and the guide as equally first-class. If the wedge
   should be interactive demos instead, the home page and the product ordering
   shift.
3. **Pricing shape.** Minutes-of-finished-video is the cleanest metric we found
   and the easiest to explain. A seats-only model is simpler still but caps
   revenue on high-volume accounts.
4. **Enterprise from day one, or later.** Private rendering and SCIM are real
   engineering investments. They also shortened Halcyon's security review from
   six weeks to seven days in the story this site tells.

---

## What is real, and what is not

Stated plainly, and kept current, so nothing here is mistaken for working
infrastructure — or dismissed as a mock when it is not.

**Real, and proven by tests that would fail if it broke:**

- **Persistence.** Postgres with twenty-seven tables, sixteen migrations, and
  the constraints that matter enforced in the schema. There is no fixture
  fallback: without `DATABASE_URL` the app renders empty states, and with one
  it shows what that workspace holds, empty included.
- **The job queue.** `FOR UPDATE SKIP LOCKED` claiming, lease recovery,
  backoff, dead-lettering, idempotency keys — exercised against a real
  database under concurrency.
- **Rendering.** An EDL, an FFmpeg compiler and a worker that produces a
  finished MP4. The end-to-end tests render synthetic footage and probe the
  result.
- **Capture.** An MV3 extension that records a tab and its interaction log,
  tested by loading the built extension into a real Chromium. Sensitive
  fields are masked in the page before any frame is encoded.
- **Masking, both lines.** Selectors are enforced before the compositor
  paints; detectors and patterns are found in the frames, expanded into
  timeline regions, and **verified in the pixels** — 95% of the detail
  inside the box is gone while the mask is on, and unchanged after it ends.
- **Interactive demos.** Real DOM snapshots, scripts stripped, replayed in a
  sandboxed frame with no network access.
- **Governance.** RBAC, an append-only hash-chained audit log, sessions that
  revoke immediately, metering in seconds with an idempotent ledger, and the
  audit log streamed to a SIEM without holes.
- **Identity.** Connection-scoped single sign-on with a signed, nonce-bound
  state, and SCIM 2.0 Users and Groups where a directory decides roles and
  an offboarding ends live sessions. Verified end to end against a running
  server: the full round trip, a login-CSRF replay from a second browser,
  three open-redirect attempts, and a SCIM deactivation that killed a
  session which had worked a second earlier.
- **Distribution.** A 3.5 KB embed runtime with measured zero layout shift,
  cookieless per-second analytics, and two-way sync with five help centres
  that never silently overwrites a human's edit.
- **The Riff Agent.** An approval gate that is the state machine rather than
  a check, an allowlist enforced on every request and verified in a real
  Chromium against an unapproved origin that was up and answering, and
  credentials bound to one exact origin.
- **The surface.** 109 pages — 84 marketing, 25 in the app — audited in
  Chromium at 1440px and 390px for overflow, console errors, heading
  structure, titles and alt text. All clean.

**Written but not exercised against the vendor:**

- **Inference adapters.** Deepgram, ElevenLabs and Anthropic adapters exist
  and are tested against stubbed transports — the request we build, the
  fields we map, which failures retry. Nothing has run against a live key.
- **The vendor side of identity, billing and distribution.** WorkOS, Stripe,
  the five help centres, HubSpot and the vision locator are all built
  against their documented contracts and tested with stubbed transports.
  Every subtle part that can be checked without an account is — Stripe's
  webhook signature over raw bytes with rotation and a tolerance window,
  Confluence's version locking, Notion's block limits, Zendesk's
  translation-not-article body — but none has spoken to a live account.
- **S3 storage.** Same contract as the local adapter, unexercised without a
  bucket.

**Not built:**

- **Presenters / avatars.** The page was deleted rather than left as a shell.
  There was no table, no route and no provider behind it — only a fixture
  gallery and a "Train a presenter" button with no handler.
- **Brand kits and localization, end to end.** Both tables were dead: the
  pages rendered fixtures and nothing had ever written a row. Both now have a
  repository and read real data, and localization has
  `POST /api/projects/[id]/locales` to queue a language. What is still
  missing is the worker that drains a queued locale into a translated cut,
  and any way to create or edit a brand kit from the interface.
- **Self-serve signup in production.** `POST /api/auth/signup` refuses with
  501 unless `NODE_ENV` is not production, because nothing verifies that the
  person typing an address owns it. Single sign-on is the production path and
  needs `WORKOS_API_KEY` and `WORKOS_CLIENT_ID`. The three buttons on the
  sign-in form — Google, Microsoft, SSO — all call the same endpoint, which
  resolves a WorkOS connection from the email domain. There is no Google or
  Microsoft OAuth behind the first two, and their labels promise one.
- **Firefox and Safari extensions.** The Chromium extension is real. A
  Firefox port needs a different capture path — `chrome.offscreen` and
  `tabCapture` are Chromium-only — and Safari needs Xcode. Neither can be
  written honestly without the browser to test in.
- **Desktop apps** for macOS and Windows: full-desktop capture, system audio
  and hardware encoding.

**Fictional by design:**

- **Customers and their numbers, on the marketing site.** Northwind,
  Cardinal, Tessera, Foldr, Halcyon and Meridian do not exist, and neither do
  their results. Every figure under `/`, `/customers`, `/compare` and
  `/pricing` is illustrative.

  They are **not** in the application any more, and that distinction is the
  point. Until recently every read in `lib/data.ts` fell back to the seeded
  Meridian workspace — not only when `DATABASE_URL` was unset, but whenever a
  real query came back empty. A person who had just created an account was
  shown Meridian's projects, greeted as Renata, told 76 of their 240 video
  minutes remained, and given an analytics page reporting 8,400 views, a 71%
  completion rate, a retention curve with an annotated cliff and four named
  traffic sources. Two of those were PRNGs seeded with a project id; two were
  literal arrays. All of it sat beside genuine zeros with nothing on screen
  distinguishing the two.

  What holds now: the seeded data lives in `lib/db/scripts/fixtures.ts`,
  reachable from the seed script and the tests and from nothing that renders.
  `lib/no-fixtures.test.ts` fails the build if anything under `app/`,
  `components/` or `lib/` imports it, if `lib/app-data.ts` exports a value
  rather than a type, or if `Math.random()` appears in rendering code.
  `tests/e2e/` drives signup through publishing to analytics on a workspace
  it creates itself, and checks every figure on the page against a direct SQL
  count.
