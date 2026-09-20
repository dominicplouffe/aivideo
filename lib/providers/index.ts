import { createAnthropicTranslation } from "./anthropic";
import { createDeepgramTranscription } from "./deepgram";
import { heuristicDirection } from "./direction";
import { createElevenLabsSynthesis } from "./elevenlabs";
import { ruleMasking } from "./masking";
import { frameMasking } from "@/lib/masking/service";
import { VisionLocator } from "@/lib/masking/locator";
import { mockProviders } from "./mock";
import { QueuedRenderProvider } from "./queued-render";
import type { ProviderSet } from "./types";

export * from "./types";
export { ProviderError, isRetryableStatus } from "./errors";
export { heuristicDirection } from "./direction";
export { ruleMasking } from "./masking";
export { createAnthropicTranslation } from "./anthropic";
export { createDeepgramTranscription } from "./deepgram";
export { createElevenLabsSynthesis } from "./elevenlabs";

let cached: ProviderSet | null = null;

/** Reads an environment variable, recording it if absent. */
function needEnv(name: string, missing: string[]): string {
  const value = process.env[name];
  if (!value) {
    missing.push(name);
    return "";
  }
  return value;
}

/**
 * Builds the live provider set.
 *
 * Every credential is checked before anything is constructed, and one error
 * names all of them. A deployment that is missing two keys should learn that
 * at boot, not discover the second one forty minutes into a render.
 */
function liveProviders(): ProviderSet {
  const missing: string[] = [];
  const deepgramKey = needEnv("DEEPGRAM_API_KEY", missing);
  const elevenLabsKey = needEnv("ELEVENLABS_API_KEY", missing);
  const anthropicKey = needEnv("ANTHROPIC_API_KEY", missing);
  const workspaceId = needEnv("DEMORIFF_WORKSPACE_ID", missing);
  needEnv("DATABASE_URL", missing);

  if (missing.length > 0) {
    throw new Error(
      `DEMORIFF_PROVIDERS=live is missing ${missing.join(", ")}. Set them or use ` +
        `DEMORIFF_PROVIDERS=mock, which runs the whole product with no credentials.`,
    );
  }

  return {
    transcription: createDeepgramTranscription({ apiKey: deepgramKey }),
    synthesis: createElevenLabsSynthesis({ apiKey: elevenLabsKey, workspaceId }),
    translation: createAnthropicTranslation({ apiKey: anthropicKey }),
    // Direction is ours; there is no vendor to swap in, which is why it
    // looks the same in both sets.
    direction: heuristicDirection,
    // Masking in live mode can honour rules over frame contents, because a
    // text locator is available. Mock mode keeps `ruleMasking`, which
    // refuses those rules out loud rather than returning an empty region
    // list that reads as "nothing to hide".
    masking: frameMasking({
      locator: new VisionLocator({ apiKey: anthropicKey }),
      // Two a second catches a page a viewer could read. Faster costs a
      // model call per frame of every recording, for text that would have
      // to appear and vanish inside 250ms to be missed.
      fps: 2,
    }),
    // Rendering goes through the durable queue in both modes; in live mode it
    // is the only option, because a lost render is a lost customer hour.
    render: new QueuedRenderProvider(workspaceId),
  };
}

/**
 * Resolves the provider set for the current environment.
 *
 * The mock set is the default so the application runs with no credentials —
 * that is what makes the whole product explorable from a fresh clone.
 */
export function getProviders(): ProviderSet {
  if (cached) return cached;

  const mode = process.env.DEMORIFF_PROVIDERS ?? "mock";

  if (mode === "live") {
    cached = liveProviders();
    return cached;
  }

  // Even in mock mode, prefer the durable queue when a database exists.
  // Losing a render on restart is the one mock behaviour that is not a fair
  // stand-in for the real thing.
  if (process.env.DATABASE_URL && process.env.DEMORIFF_WORKSPACE_ID) {
    cached = {
      ...mockProviders,
      render: new QueuedRenderProvider(process.env.DEMORIFF_WORKSPACE_ID),
    };
    return cached;
  }

  cached = mockProviders;
  return cached;
}

/** Test seam, and the way a worker process swaps in a partial set. */
export function setProviders(providers: ProviderSet | null) {
  cached = providers;
}
