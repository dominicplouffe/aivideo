# DemoRiff

**Studio-grade product demos from a rough screen recording.**

DemoRiff turns one raw screen recording into a directed demo video, a clickable
interactive tour, a step-by-step written guide with annotated screenshots, and a
set of vertical social cuts — on brand, in 34 languages.

This repository contains the complete public marketing site and the full
application, built as a single Next.js project.

---

## Running it

```bash
npm install
npm run dev     # http://localhost:3000
```

No environment variables and no credentials are required. The production
pipeline is expressed behind provider interfaces (`lib/providers/types.ts`) and
resolves to a deterministic mock implementation by default, so every screen is
explorable immediately.

```bash
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
```

---

## What is here

### Public site

| Route | What it is |
| --- | --- |
| `/` | Home — animated pipeline hero, cost comparison, capability bento, proof |
| `/product`, `/product/[slug]` | Eleven deep product pages (studio, recorder, voice, avatars, brand, interactive, docs, localization, analytics, agent, import) |
| `/solutions`, `/solutions/[slug]` | Six persona pages with pains, plays, workflow and outcomes |
| `/pricing` | Five plans, billing commitments, minute-usage explainer, full comparison matrix |
| `/compare`, `/compare/[slug]` | Six competitor comparisons, each opening by naming where the competitor wins |
| `/customers`, `/customers/[slug]` | Six long-form case studies |
| `/blog`, `/blog/[slug]` | Eight long-form articles including a retention-data research piece |
| `/academy`, `/academy/[course]/[lesson]` | Four courses, twelve lessons |
| `/docs`, `/docs/[slug]`, `/docs/api` | Help centre and a full REST API reference |
| `/security` | Trust centre — certifications, commitments, operations |
| `/integrations`, `/changelog`, `/roi-calculator` | Directory, release history, interactive ROI model |
| `/about`, `/careers`, `/partners`, `/press`, `/contact` | Company |
| `/legal/[slug]` | Terms, Privacy, DPA, Subprocessors, Acceptable Use |

### Application

| Route | What it is |
| --- | --- |
| `/app` | Dashboard — usage, stale-asset alerts, recent projects, activity |
| `/app/projects` | Library with transcript search, filters, grid and list views |
| `/app/new` | Recorder (real `getDisplayMedia` capture), import, and agent briefing |
| `/app/studio/[id]` | **The Studio** — transcript editing, canvas, timeline, inspector, export |
| `/app/guides`, `/app/guides/[id]` | Guide list and article editor |
| `/app/demos`, `/app/demos/[id]` | Interactive tour list and builder |
| `/app/brand`, `/app/voices`, `/app/avatars`, `/app/localization` | Production assets |
| `/app/analytics` | Per-second retention, sources, account identification |
| `/app/team`, `/app/billing`, `/app/settings` | Workspace administration |
| `/d/[slug]` | Public, branded share page |
| `/signin`, `/signup` | Authentication |

### API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/contact` | Validated contact submission with topic routing |
| `GET /api/projects` | List projects, mirrors the public `GET /v1/projects` |
| `POST /api/renders` | Submit a render job through the provider layer |
| `GET /api/renders?id=` | Poll job status |
| `POST /api/webhooks` | Inbound receiver with HMAC-SHA256 verification |

---

## Architecture

```
app/
  (marketing)/    Public site — shares one header/footer shell
  (app)/app/      Authenticated workspace — sidebar shell + ⌘K palette
  (auth)/         Sign-in and sign-up
  (public)/d/     Public share pages (no app chrome)
  api/            Route handlers
components/
  ui/             Primitives: Button, Icon (80 glyphs), Card, Reveal…
  brand/          Logo and wordmark
  marketing/      Site header/footer, hero canvas, previews, prose renderer
  app/            App shell, recorder, studio, editors, analytics
  app/studio/     Timeline model, canvas, transcript, inspector, export
lib/
  providers/      Provider interfaces + deterministic mock implementations
  *-content.ts    Typed content models (product, solutions, compare, blog,
                  academy, docs, legal, changelog, customers)
  app-data.ts     Seeded workspace: projects with word-aligned transcripts
```

### Two decisions worth knowing about

**The edited-timeline model.** `components/app/studio/types.ts` flattens a
project into a single list of words, each carrying a frame range. Removing
fillers or deleting a scene genuinely shortens the finished duration, which is
what the header, the timeline, the export dialog and the billing figure all
read from. Nothing is faked with a separate "duration" field.

**The provider boundary.** No component or route handler talks to a vendor SDK.
Transcription, synthesis, translation, camera direction, masking and rendering
are six interfaces in `lib/providers/types.ts`. Wiring a real vendor means
writing one adapter and returning it from `getProviders()`; everything above
that line is untouched.

---

## Design system

Dark-first, defined entirely as tokens in `app/globals.css` under Tailwind v4's
`@theme`. Components never hardcode a hex value.

- **Surfaces** — an eleven-step ink ramp from `ink-1000` to `ink-500`
- **Brand** — one signature gradient: iris → violet → cyan
- **Type** — Inter for UI, JetBrains Mono for labels and code
- **Motion** — a shared `IntersectionObserver` drives every scroll reveal, and
  all animation is disabled under `prefers-reduced-motion`
- **Icons** — 80 hand-drawn glyphs in one component, no icon dependency

Production dependencies: `next`, `react`, `react-dom`. That is the whole list.

---

## Status and next steps

See [`PLAN.md`](./PLAN.md) for what is built, what is deliberately mocked, and
the sequenced work to take this to production.
