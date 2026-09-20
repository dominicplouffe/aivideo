import { build } from "esbuild";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Builds the embed runtime.
 *
 * Minified, because this is the one script that runs on a customer's landing
 * page and its size is their Core Web Vitals score, not ours. Built as an
 * IIFE with no exports: it must not depend on the host page having a module
 * loader, a bundler, or anything at all.
 *
 * **The budget is the number the marketing site prints.** A size on a
 * pricing page becomes a lie the first time somebody adds a dependency, so
 * the build fails instead of the claim quietly going stale. If the runtime
 * needs to grow, the copy changes in the same commit.
 */
export const EMBED_BUDGET_BYTES = 6 * 1024;

export async function buildEmbed(options = {}) {
  const outfile = options.outfile ?? path.join(root, "public/embed.js");
  const origin = options.origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://demoriff.com";

  await build({
    entryPoints: [path.join(root, "lib/embed/boot.ts")],
    outfile,
    bundle: true,
    format: "iife",
    // Browser targets only. Adding "es2020" alongside them makes esbuild try
    // to downlevel destructuring, which it cannot do for a for-of pattern.
    //
    // The Safari floor is 14.1, not 14.0: esbuild treats 14.0 as lacking
    // working destructuring because of a real Safari bug, and refuses to
    // build rather than emit something that would break there. Raising the
    // floor by one point release is the honest fix — the alternative is
    // writing index-juggling loops to satisfy a browser from 2020.
    target: ["chrome80", "firefox78", "safari14.1", "edge88"],
    platform: "browser",
    minify: true,
    sourcemap: false,
    legalComments: "none",
    define: { __DEMORIFF_ORIGIN__: JSON.stringify(origin) },
    alias: { "@": root },
  });

  const { size } = await stat(outfile);
  if (size > EMBED_BUDGET_BYTES) {
    throw new Error(
      `embed.js is ${size} bytes, over the ${EMBED_BUDGET_BYTES}-byte budget. ` +
        "This script runs on customers' landing pages; the budget is a promise, not a target.",
    );
  }

  const source = await readFile(outfile, "utf8");
  // A global would collide with the host page's code, and "our embed broke
  // their site" is not a support conversation worth having.
  if (/window\.[A-Za-z_$][\w$]*\s*=/.test(source)) {
    throw new Error("embed.js assigns to window; the runtime must leave no globals.");
  }

  return { outfile, size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { outfile, size } = await buildEmbed();
  console.log(`embed → ${path.relative(root, outfile)} (${size} bytes, budget ${EMBED_BUDGET_BYTES})`);
}
