import { execFileSync } from "node:child_process";

/**
 * Which code this process is running.
 *
 * The render worker is a separate process that loads its code once. After a
 * change to how narration or edits are read, a worker started before the
 * change keeps producing renders the old way, and nothing says so — the
 * job completes, the dialog says done, and the voice reads words the person
 * has since corrected. Stamping each render with the worker's version lets
 * the app compare it with its own and say, out loud, that the worker is
 * stale.
 *
 * The commit in a checkout; `DEMORIFF_BUILD` where there is no git (a
 * container image sets it at build time); "unknown" otherwise, which
 * compares equal to itself and warns about nothing.
 */
let cached: string | null = null;

export function codeVersion(): string {
  if (cached) return cached;
  const fromEnv = process.env.DEMORIFF_BUILD?.trim();
  if (fromEnv) return (cached = fromEnv);
  try {
    cached = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    })
      .toString()
      .trim();
    // Uncommitted edits still count as a different version from a committed
    // worker, so a dirty tree gets a marker.
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    })
      .toString()
      .trim();
    if (dirty) cached += "+";
  } catch {
    cached = "unknown";
  }
  return cached!;
}
