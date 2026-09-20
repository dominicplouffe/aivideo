# DemoRiff — build plan

This document is the running plan. Phases 1–5 are complete and in this
repository. Phases 6–10 are the sequenced work to take it to production.

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
   PCM so span durations are exact rather than decoded, and refusing to clone a
   voice without a recorded consent phrase. Revocation propagating to future
   renders is still open.
6. ~~**Job queue.**~~ **Done.** `FOR UPDATE SKIP LOCKED` claiming, lease-based
   crash recovery, exponential backoff, dead-lettering, idempotency keys.
   Webhook emission is still open.

Still open in this phase: webhook emission on job completion, and revoking a
cloned voice so future renders stop using it.

Also done in this phase, beyond the original list: an Anthropic translation
adapter that enforces the glossary and the shot's length budget rather than
merely asking for them, and a masking engine that throws on rules it cannot
actually evaluate instead of returning an empty region list that reads like
"nothing to hide". See `lib/providers/README.md`.

## Phase 7 — Real capture

1. **Browser extension** (MV3) capturing tab video plus the interaction log:
   element selector, role, accessible name, bounds, route changes, mutations.
2. **Desktop apps** (macOS, Windows) for full-desktop capture, system audio and
   hardware encoding.
3. **Masking at capture time** — detectors, selectors, regions, patterns —
   applied before frames are encoded, never after.
4. **DOM snapshotting** per step, with assets inlined, to drive interactive
   demos.

## Phase 8 — Auth, billing, governance

1. WorkOS for SAML SSO and SCIM; enforced domain capture.
2. Stripe: subscriptions, metered video minutes, proration, top-ups, the 80%
   notice and the customer-controlled hard stop.
3. RBAC across owner / admin / creator / reviewer / viewer, scoped per
   workspace.
4. Append-only audit log with SIEM streaming.

## Phase 9 — Distribution

1. Embed runtime — a 34 KB async script with no layout shift, an iframe
   fallback, and server-rendered text for indexing.
2. Analytics ingestion: per-second retention at write scale, cookieless mode,
   CRM identity resolution.
3. Help-centre connectors with two-way sync (Zendesk, Intercom, HelpScout,
   Notion, Confluence).

## Phase 10 — Riff Agent

1. Environment allowlist, scoped rotatable credentials, isolated browser
   sessions.
2. Outline-first flow — nothing records until a human approves the outline.
3. Full run audit: brief, every action, output, approver, timestamp.
4. **The approval gate stays non-optional.** Nothing the agent produces reaches
   a customer-facing surface without a person saying yes.

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

## What is deliberately not real

Stated plainly so nothing here is mistaken for working infrastructure:

- **Providers are mocked.** Transcription, synthesis, translation, direction,
  masking and rendering return deterministic shaped data. The interfaces are
  real; the implementations are not.
- **Workspace data is seeded.** Eight projects with word-aligned transcripts,
  members, analytics. No database.
- **Auth accepts anything.** Sign-in routes to the app without verification.
- **Customers and their numbers are fictional.** Northwind, Cardinal, Tessera,
  Foldr, Halcyon and Meridian do not exist, and neither do their results.
- **Recording is genuinely real.** `getDisplayMedia` and `MediaRecorder` do
  capture your screen; the take plays back and downloads. What happens after —
  transcription, editing, rendering — is simulated.
