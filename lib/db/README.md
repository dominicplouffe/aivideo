# Database

Postgres + Drizzle. The application runs **with or without** it: when
`DATABASE_URL` is unset, `lib/data.ts` serves the seeded fixtures from
`lib/app-data.ts` instead, so the project stays explorable with no
infrastructure.

## Local setup

```bash
# any Postgres 14+ will do
createdb demoriff
echo 'DATABASE_URL=postgres://localhost:5432/demoriff' > .env.local

npm run db:migrate   # apply migrations
npm run db:seed      # load the fixture workspace as real rows
npm run db:studio    # browse it
```

## Scripts

| Command | Does |
| --- | --- |
| `npm run db:generate` | Diff the schema and write a migration |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load the fixture workspace (idempotent) |
| `npm run db:studio` | Drizzle Studio |

## Design notes

**No import-time connection.** `client.ts` has no module-scope side effects.
A page that only asks `isDatabaseConfigured()` must not open a pool, or the
build breaks on any deployment without a database. Handles come from
`getDb()`, created on first use and cached on `globalThis` so dev reloads
don't exhaust connections.

**Duration is derived, never stored.** A project's finished duration comes
from its surviving segment words at read time. Storing it as a column is how
a duration drifts away from the cut it describes — and that number is what
gets billed.

**Usage is metered in seconds.** `video_seconds_used` rather than minutes, so
partial minutes never round in our favour.

**Consent is enforced by the database.** `voices_clone_requires_consent` makes
a clone without a consent subject and timestamp unrepresentable. This is a
constraint rather than a convention because the cost of getting it wrong is
someone's voice being used without permission.

**Studio voices are global.** They carry `workspace_id IS NULL`, so they
survive a workspace cascade — which is why the seed upserts voices rather
than inserting them.

## Seeding is idempotent

Identifiers are derived from fixture ids via `stableUuid()`, so re-running
converges on the same rows rather than accumulating duplicates. Verified by
running the seed three times and comparing the project id set.
