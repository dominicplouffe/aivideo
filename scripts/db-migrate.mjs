#!/usr/bin/env node
/**
 * `npm run db:migrate`, with the connection checked first.
 *
 * drizzle-kit prints "applying migrations…" and then, if it cannot reach the
 * database, nothing at all — no error, no cause, just a spinner and a
 * non-zero exit some seconds later. Both of this project's first-run traps
 * have looked exactly like that from the outside, while being entirely
 * different underneath: once a default port nothing listened on, and once a
 * connection string with no password against a Postgres that wants one.
 *
 * So connect first and say what happened. The migration itself is still
 * drizzle-kit's job.
 */
import { spawnSync } from "node:child_process";
import postgres from "postgres";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent is fine — the variable may come from the real environment.
  }
}

const url = process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/demoriff";

/** The same string, with any password replaced — this gets printed. */
function redact(value) {
  try {
    const u = new URL(value);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return value;
  }
}

function die(problem, ...remedies) {
  console.error(`\nCannot reach the database at ${redact(url)}\n`);
  console.error(`  ${problem}\n`);
  for (const line of remedies) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

const sql = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
try {
  await sql`select 1`;
} catch (error) {
  const code = error?.code ?? error?.errno ?? "";
  const missingPassword = /no password supplied/i.test(error?.message ?? "");

  if (missingPassword || code === "28P01" || code === "28000") {
    die(
      missingPassword
        ? "The connection string carries no password, and this server wants one."
        : "The server rejected those credentials.",
      "DATABASE_URL in .env.local needs the password for that role, as in",
      "  postgres://postgres:YOUR_PASSWORD@localhost:5432/demoriff",
      "",
      "`.env.example` ships without one because a local Postgres set up for",
      "trust authentication does not need it. Many do.",
    );
  }
  if (code === "ECONNREFUSED") {
    die(
      "Nothing is listening there.",
      "Start Postgres, or correct the host and port in DATABASE_URL.",
    );
  }
  if (code === "3D000") {
    die("That database does not exist.", "Create it with `createdb demoriff`.");
  }
  die(`${code ? code + ": " : ""}${error?.message ?? error}`);
}

// Enum values first, outside any transaction. drizzle-kit applies pending
// migrations in one transaction, and Postgres refuses to *use* an enum value
// in the transaction that added it — so a migration that adds a plan and a
// later one that assigns it fail together, silently, with the spinner
// stopping and no message. Every `ADD VALUE IF NOT EXISTS` in the migration
// files is run here on its own, idempotently, before drizzle-kit starts.
try {
  const { readdirSync, readFileSync } = await import("node:fs");
  const dir = new URL("../lib/db/migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const text = readFileSync(new URL(file, dir), "utf8");
    for (const match of text.matchAll(/ALTER TYPE\s+[^;]*?ADD VALUE IF NOT EXISTS\s+'[^']+'/g)) {
      await sql.unsafe(match[0]);
    }
  }
} catch (error) {
  die(`Could not add enum values ahead of the migration: ${error?.message ?? error}`);
} finally {
  await sql.end({ timeout: 5 });
}

const { status } = spawnSync("npx", ["drizzle-kit", "migrate"], { stdio: "inherit" });
process.exit(status ?? 1);
