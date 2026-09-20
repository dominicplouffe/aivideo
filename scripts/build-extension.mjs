import { build } from "esbuild";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCaptureBundle } from "./build-capture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "extension/src");
const dist = path.join(root, "extension/dist");

/**
 * Builds the MV3 extension.
 *
 * Each entry point is bundled separately because Chrome loads them into
 * three different worlds — a service worker, a page context, and an isolated
 * content-script world — and a shared chunk would need a module loader that
 * content scripts do not have. The duplication costs a few kilobytes and
 * buys a build with no runtime.
 */
const ENTRIES = [
  { file: "background.ts", format: "esm" },
  { file: "offscreen.ts", format: "esm" },
  { file: "popup.ts", format: "esm" },
  // Content scripts have no module loader: these must be plain scripts.
  { file: "content.ts", format: "iife" },
  { file: "main-world.ts", format: "iife" },
];

export async function buildExtension() {
  await mkdir(dist, { recursive: true });

  for (const entry of ENTRIES) {
    await build({
      entryPoints: [path.join(src, entry.file)],
      outfile: path.join(dist, entry.file.replace(/\.ts$/, ".js")),
      bundle: true,
      format: entry.format,
      target: "chrome116",
      platform: "browser",
      minify: false,
      sourcemap: false,
      legalComments: "none",
      alias: { "@": root },
    });
  }

  // Also emitted standalone so the browser tests exercise the same code the
  // extension ships, rather than a parallel build of it.
  await buildCaptureBundle(path.join(dist, "capture.js"));

  // The manifest's version is the recorder version reported in every
  // capture manifest; keeping them in step is not something to remember.
  const manifestPath = path.join(root, "extension/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const protocol = await readFile(path.join(src, "protocol.ts"), "utf8");
  const declared = /version:\s*"([^"]+)"/.exec(protocol)?.[1];
  if (declared && declared !== manifest.version) {
    throw new Error(
      `manifest.json says ${manifest.version} but protocol.ts says ${declared}. ` +
        "A capture manifest that names the wrong recorder version is a bug report nobody can read.",
    );
  }

  return dist;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildExtension();
  console.log(`extension → ${path.relative(root, dist)}`);
}
