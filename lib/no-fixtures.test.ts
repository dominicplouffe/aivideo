import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Nothing that renders may import the seeded workspace.
 *
 * This is the assertion that keeps the bug fixed. The application used to
 * fall back to `lib/app-data.ts` whenever a read found nothing — not only
 * when there was no database — so an account created a minute earlier was
 * shown Meridian's projects, Renata's name, a 7.7k-view sparkline generated
 * by a PRNG, and a retention curve with an annotated cliff, all sitting
 * beside its own genuine zeros with nothing on screen to tell them apart.
 *
 * Every one of those was a single `import` away from returning. A reviewer
 * cannot be relied on to catch the sixteenth one, so the rule is enforced
 * here instead: the fixtures live in `lib/db/scripts/fixtures.ts`, and the
 * seed script and tests are the only things allowed to reach them.
 */

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/** Directories whose contents reach a browser or a signed-in request. */
const RENDERING = ["app", "components", "lib"];

/** The only files permitted to import the seeded workspace. */
const ALLOWED = new Set([
  "lib/db/scripts/seed.ts",
  "lib/no-fixtures.test.ts",
]);

const SKIP_DIRS = new Set(["node_modules", ".next", "dist", ".git"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const sourceFiles = RENDERING.flatMap((dir) => walk(join(ROOT, dir))).map((f) =>
  f.slice(ROOT.length + 1),
);

test("no rendering code imports the seeded fixtures", () => {
  const offenders: string[] = [];

  for (const file of sourceFiles) {
    if (ALLOWED.has(file)) continue;
    const source = readFileSync(join(ROOT, file), "utf8");
    // Any import of the fixtures module, however it is spelled.
    if (/from\s+["'][^"']*db\/scripts\/fixtures["']/.test(source)) offenders.push(file);
  }

  assert.deepEqual(
    offenders,
    [],
    `These files import the seeded workspace and must not:\n  ${offenders.join("\n  ")}\n\n` +
      "The seeded data exists to populate a database, not to stand in for one. " +
      "Read through lib/data.ts instead, and render an empty state when it " +
      "returns nothing — an empty workspace is a real answer.",
  );
});

test("lib/app-data.ts exports types only", () => {
  const source = readFileSync(join(ROOT, "lib/app-data.ts"), "utf8");

  // `export const`, `export function` and `export let` are values. Types and
  // interfaces are fine: they never carried any data.
  const values = [...source.matchAll(/^export\s+(const|function|let|var|class)\s+(\w+)/gm)].map(
    (m) => m[2],
  );

  assert.deepEqual(
    values,
    [],
    `lib/app-data.ts must export types only, but exports: ${values.join(", ")}. ` +
      "Seeded values belong in lib/db/scripts/fixtures.ts, which nothing that " +
      "renders is allowed to import.",
  );
});

test("no invented numbers in the app's rendering paths", () => {
  const offenders: string[] = [];

  for (const file of sourceFiles) {
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
    // The mock provider set is deterministic on purpose and says so; the
    // seed and its fixtures exist to write a database.
    if (file.startsWith("lib/providers/mock") || file.startsWith("lib/db/scripts/")) continue;
    if (file.startsWith("lib/agent/fixtures")) continue;

    const source = readFileSync(join(ROOT, file), "utf8");
    // Metrics must be counted, never rolled. A chart drawn from Math.random
    // is the exact failure this whole change was about.
    if (/Math\.random\(/.test(source)) offenders.push(file);
  }

  assert.deepEqual(
    offenders,
    [],
    `Math.random() in rendering code: ${offenders.join(", ")}. ` +
      "A number shown to somebody as a measurement has to be measured.",
  );
});
