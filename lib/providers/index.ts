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

/**
 * Which vendor stands behind each capability.
 *
 * Selection is **per capability**, not all-or-nothing. The previous version
 * demanded every credential before it would use any of them, which meant a
 * person who had signed up for one vendor got the mock for all of them and no
 * explanation — their key was set, the transcript was still invented, and
 * nothing anywhere said why. Each capability now decides for itself, and the
 * report below says what it decided so the answer is never a mystery.
 */
export type Capability = "transcription" | "synthesis" | "translation" | "masking" | "render";

export interface CapabilityStatus {
  capability: Capability;
  /** The adapter actually in use. */
  provider: string;
  live: boolean;
  /** Empty when live. What to set, otherwise. */
  missing: string[];
}

export type ProviderReport = CapabilityStatus[];

/** Modes: `auto` picks per capability, `live` demands all, `mock` refuses all. */
function mode(): "auto" | "live" | "mock" {
  const raw = (process.env.DEMORIFF_PROVIDERS ?? "auto").trim().toLowerCase();
  return raw === "live" || raw === "mock" ? raw : "auto";
}

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** The credentials each capability needs before it can be anything but a mock. */
const CREDENTIALS: Record<Capability, string[]> = {
  transcription: ["DEEPGRAM_API_KEY"],
  synthesis: ["ELEVENLABS_API_KEY", "DEMORIFF_WORKSPACE_ID"],
  translation: ["ANTHROPIC_API_KEY"],
  masking: ["ANTHROPIC_API_KEY"],
  // Not a vendor: the durable queue, which needs somewhere to keep the jobs.
  // No workspace id: each request carries its own, so one deployment can
  // serve more than one tenant.
  render: ["DATABASE_URL"],
};

function missingFor(capability: Capability): string[] {
  return CREDENTIALS[capability].filter((name) => !env(name));
}

interface Resolved {
  providers: ProviderSet;
  report: ProviderReport;
}

function resolve(): Resolved {
  const selected = mode();
  const report: ProviderReport = [];

  // `live` is the production setting, and its job is to fail loudly rather
  // than degrade quietly. A deployment that silently transcribes with a mock
  // ships invented words to a customer, which is worse than not starting.
  if (selected === "live") {
    const absent = [...new Set((Object.keys(CREDENTIALS) as Capability[]).flatMap(missingFor))];
    if (absent.length > 0) {
      throw new Error(
        `DEMORIFF_PROVIDERS=live is missing ${absent.join(", ")}. Set them, or use ` +
          `DEMORIFF_PROVIDERS=auto, which uses each vendor you have a key for and ` +
          `mocks the rest.`,
      );
    }
  }

  const wants = (capability: Capability): boolean =>
    selected !== "mock" && missingFor(capability).length === 0;

  const note = (capability: Capability, provider: string, live: boolean) => {
    report.push({
      capability,
      provider,
      live,
      missing: live ? [] : selected === "mock" ? ["DEMORIFF_PROVIDERS=auto"] : missingFor(capability),
    });
  };

  const providers: ProviderSet = { ...mockProviders };

  if (wants("transcription")) {
    providers.transcription = createDeepgramTranscription({ apiKey: env("DEEPGRAM_API_KEY") });
  }
  note("transcription", providers.transcription.name, providers.transcription !== mockProviders.transcription);

  if (wants("synthesis")) {
    providers.synthesis = createElevenLabsSynthesis({
      apiKey: env("ELEVENLABS_API_KEY"),
      workspaceId: env("DEMORIFF_WORKSPACE_ID"),
    });
  }
  note("synthesis", providers.synthesis.name, providers.synthesis !== mockProviders.synthesis);

  if (wants("translation")) {
    providers.translation = createAnthropicTranslation({ apiKey: env("ANTHROPIC_API_KEY") });
  }
  note("translation", providers.translation.name, providers.translation !== mockProviders.translation);

  if (wants("masking")) {
    // With a text locator available, masking can honour rules over frame
    // contents. Without one it stays `ruleMasking`, which refuses those rules
    // out loud rather than returning an empty region list — an empty list
    // reads as "nothing sensitive here", which is the wrong thing to say.
    providers.masking = frameMasking({
      locator: new VisionLocator({ apiKey: env("ANTHROPIC_API_KEY") }),
      // Two a second catches a page a viewer could read. Faster costs a model
      // call per frame of every recording, for text that would have to appear
      // and vanish inside 250ms to be missed.
      fps: 2,
    });
  } else {
    providers.masking = ruleMasking;
  }
  note("masking", providers.masking.name, providers.masking !== ruleMasking);

  // The queue is preferred even in mock mode: losing a render on restart is
  // the one mock behaviour that is not a fair stand-in for the real thing.
  if (missingFor("render").length === 0) {
    providers.render = new QueuedRenderProvider(env("DEMORIFF_WORKSPACE_ID"));
  }
  note("render", providers.render.name, providers.render !== mockProviders.render);

  // Direction is ours. There is no vendor to swap in, which is why it does
  // not appear in the report at all.
  providers.direction = heuristicDirection;

  return { providers, report };
}

let cached: Resolved | null = null;
let overridden: ProviderSet | null = null;

/**
 * Resolves the provider set for the current environment.
 *
 * Mocks are the fallback rather than the default, so the application runs
 * with no credentials at all — that is what makes the product explorable
 * from a fresh clone — while any key that *is* set gets used.
 */
export function getProviders(): ProviderSet {
  if (overridden) return overridden;
  cached ??= resolve();
  return cached.providers;
}

/** What each capability resolved to, and what is missing where it did not. */
export function providerReport(): ProviderReport {
  if (overridden) {
    return [];
  }
  cached ??= resolve();
  return cached.report;
}

/** Test seam, and the way a worker process swaps in a partial set. */
export function setProviders(providers: ProviderSet | null) {
  overridden = providers;
  if (providers === null) cached = null;
}
