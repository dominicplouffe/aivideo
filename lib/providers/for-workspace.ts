import { getProviders } from "./index";
import { createDeepgramTranscription } from "./deepgram";
import { createElevenLabsSynthesis } from "./elevenlabs";
import { ProviderError } from "./errors";
import type { ProviderSet, SynthesisProvider, TranscriptionProvider } from "./types";
import { usage } from "@/lib/billing/metering";
import { planFor } from "@/lib/billing/plans";
import { VENDOR_LABELS, vendorKeys, type Vendor } from "@/lib/billing/vendor-keys";

/**
 * The providers a workspace's work runs on.
 *
 * On the Bring-your-own-keys plan the workspace's own keys stand behind
 * every vendor call; a vendor with no key saved refuses out loud, naming
 * the setting to fill in, rather than falling back to ours or to a mock. On
 * every other plan the deployment's providers are used unchanged.
 *
 * Cached per workspace and dropped when a key changes.
 */

export interface WorkspaceProviders {
  providers: ProviderSet;
  /** "workspace" when the workspace's own keys are in use. */
  source: "workspace" | "deployment";
  /** Vendors the workspace still has to add a key for, when on its own keys. */
  missing: Vendor[];
  /** The Anthropic key to call Claude with, or null with a reason. */
  anthropic: { key: string } | { key: null; reason: string };
}

const cache = new Map<string, WorkspaceProviders>();

export function forgetWorkspaceProviders(workspaceId: string): void {
  cache.delete(workspaceId);
}

function missingKeyMessage(vendor: Vendor): string {
  return `This workspace runs on its own keys and has none for ${VENDOR_LABELS[vendor].name}. Add it under Settings → Your keys.`;
}

function refusingTranscription(vendor: Vendor): TranscriptionProvider {
  return {
    name: "missing-key",
    async transcribe() {
      throw new ProviderError(missingKeyMessage(vendor), { provider: "missing-key", retryable: false });
    },
  } as TranscriptionProvider;
}

function refusingSynthesis(vendor: Vendor): SynthesisProvider {
  const refuse = async () => {
    throw new ProviderError(missingKeyMessage(vendor), { provider: "missing-key", retryable: false });
  };
  return { name: "missing-key", synthesize: refuse, listVoices: refuse } as unknown as SynthesisProvider;
}

export async function providersFor(workspaceId: string): Promise<WorkspaceProviders> {
  const cached = cache.get(workspaceId);
  if (cached) return cached;

  const snapshot = await usage(workspaceId);
  let result: WorkspaceProviders;
  if (!planFor(snapshot.plan).ai.ownKeys) {
    const deploymentKey = process.env.ANTHROPIC_API_KEY?.trim();
    result = {
      providers: getProviders(),
      source: "deployment",
      missing: [],
      anthropic: deploymentKey
        ? { key: deploymentKey }
        : { key: null, reason: "This deployment has no Anthropic key configured (ANTHROPIC_API_KEY)." },
    };
  } else {
    const keys = await vendorKeys(workspaceId);
    const missing = (["deepgram", "elevenlabs", "anthropic"] as Vendor[]).filter((v) => !keys[v]);
    result = {
      providers: {
        ...getProviders(),
        transcription: keys.deepgram ? createDeepgramTranscription({ apiKey: keys.deepgram }) : refusingTranscription("deepgram"),
        synthesis: keys.elevenlabs ? createElevenLabsSynthesis({ apiKey: keys.elevenlabs }) : refusingSynthesis("elevenlabs"),
      },
      source: "workspace",
      missing,
      anthropic: keys.anthropic ? { key: keys.anthropic } : { key: null, reason: missingKeyMessage("anthropic") },
    };
  }
  cache.set(workspaceId, result);
  return result;
}

/** Whether a capability will really run for this workspace, and what to set if not. */
export function capabilityLive(
  resolved: WorkspaceProviders,
  capability: "transcription" | "synthesis",
  deploymentReport: { capability: string; live: boolean; missing: string[] }[],
): { live: boolean; hint: string } {
  if (resolved.source === "workspace") {
    const vendor: Vendor = capability === "transcription" ? "deepgram" : "elevenlabs";
    return resolved.missing.includes(vendor)
      ? { live: false, hint: missingKeyMessage(vendor) }
      : { live: true, hint: "" };
  }
  const entry = deploymentReport.find((e) => e.capability === capability);
  return { live: entry?.live ?? false, hint: entry?.missing.join(" and ") ?? "" };
}
