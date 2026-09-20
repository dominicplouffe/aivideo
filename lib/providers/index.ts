import { mockProviders } from "./mock";
import { QueuedRenderProvider } from "./queued-render";
import type { ProviderSet } from "./types";

export * from "./types";

/**
 * Resolves the provider set for the current environment.
 *
 * The mock set is the default so the application runs with no credentials.
 * To wire real vendors, write an adapter implementing the interfaces in
 * `types.ts` and return it here behind the matching env flag — nothing
 * upstream of this function needs to change.
 */
export function getProviders(): ProviderSet {
  const mode = process.env.DEMORIFF_PROVIDERS ?? "mock";

  switch (mode) {
    case "live":
      // Example wiring — each adapter lives in its own module and is
      // instantiated from environment credentials.
      //
      //   return {
      //     transcription: createDeepgram(process.env.DEEPGRAM_API_KEY!),
      //     synthesis:     createElevenLabs(process.env.ELEVENLABS_API_KEY!),
      //     translation:   createAnthropic(process.env.ANTHROPIC_API_KEY!),
      //     direction:     createDirectionEngine(),
      //     masking:       createMaskingEngine(),
      //     render:        createRenderCluster(process.env.RENDER_CLUSTER_URL!),
      //   };
      throw new Error(
        "DEMORIFF_PROVIDERS=live requires vendor adapters. See lib/providers/index.ts.",
      );
    case "mock":
    default: {
      // Even in mock mode, prefer the durable queue when a database exists.
      // Losing a render on restart is the one mock behaviour that is not a
      // fair stand-in for the real thing.
      if (process.env.DATABASE_URL && process.env.DEMORIFF_WORKSPACE_ID) {
        return {
          ...mockProviders,
          render: new QueuedRenderProvider(process.env.DEMORIFF_WORKSPACE_ID),
        };
      }
      return mockProviders;
    }
  }
}
