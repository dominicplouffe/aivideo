import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database handle — created on first use, never at module evaluation.
 *
 * This module must stay free of import-time side effects. A page that only
 * wants to ask "is a database configured?" imports this file, and if opening
 * a connection happened at module scope, that question would throw during the
 * build on any deployment without a database.
 *
 * Next dev reloads modules on every edit, so the pool is cached on globalThis
 * to avoid exhausting Postgres connections after a handful of saves.
 */
const globalForDb = globalThis as unknown as {
  __demoriffSql?: ReturnType<typeof postgres>;
  __demoriffDb?: ReturnType<typeof drizzle<typeof schema>>;
};

/** Pure env check. Safe to call anywhere, including at module scope. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres instance.",
    );
  }
  return url;
}

function createSql() {
  return postgres(getConnectionString(), {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    transform: { undefined: null },
  });
}

/** The raw driver. Throws if no database is configured — call only behind a check. */
export function getSql() {
  if (!globalForDb.__demoriffSql) globalForDb.__demoriffSql = createSql();
  return globalForDb.__demoriffSql;
}

/** The Drizzle handle. Throws if no database is configured. */
export function getDb() {
  if (!globalForDb.__demoriffDb) {
    globalForDb.__demoriffDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__demoriffDb;
}

/** Closes the pool. For scripts and tests; the server keeps its pool open. */
export async function closeDb() {
  if (globalForDb.__demoriffSql) {
    await globalForDb.__demoriffSql.end();
    globalForDb.__demoriffSql = undefined;
    globalForDb.__demoriffDb = undefined;
  }
}

export type Database = ReturnType<typeof getDb>;
export { schema };
