import type { Config } from "drizzle-kit";

/**
 * Next.js loads `.env.local` for us; drizzle-kit is a separate process and
 * does not, so `npm run db:migrate` saw none of it. With no `DATABASE_URL`
 * it fell through to a default pointing at port 5433 — a port nothing in
 * this project ever listens on — and the migration hung on a connection
 * that was never going to be answered, printing "applying migrations…" and
 * nothing else. Following the README exactly produced that hang.
 */
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent, which is fine: the variable may come from the real
    // environment instead. A missing optional file is not a failure.
  }
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Matches `.env.example` and the README. The old default disagreed with
    // both on the port.
    url: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/demoriff",
  },
  strict: true,
  verbose: true,
} satisfies Config;
