import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Bundles the capture library for the browser.
 *
 * The same bundle is what the extension injects and what the browser tests
 * exercise, which is the point: a test that runs against a re-implementation
 * of the thing being shipped proves nothing about the thing being shipped.
 */
export async function buildCaptureBundle(outfile = path.join(root, "extension/dist/capture.js")) {
  await build({
    entryPoints: [path.join(root, "lib/capture/index.ts")],
    outfile,
    bundle: true,
    format: "iife",
    globalName: "DemoRiffCapture",
    target: "chrome114",
    platform: "browser",
    // Readable in devtools when someone is debugging a customer's recording.
    minify: false,
    sourcemap: false,
    legalComments: "none",
  });
  return outfile;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await buildCaptureBundle();
  console.log(`capture bundle → ${path.relative(root, out)}`);
}
