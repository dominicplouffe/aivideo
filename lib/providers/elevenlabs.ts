import { createHash } from "node:crypto";
import { getStorage } from "@/lib/storage";
import { ProviderError, isRetryableStatus } from "./errors";
import type { SynthesisProvider, SynthesisRequest, SynthesisResult } from "./types";

/**
 * ElevenLabs-backed speech synthesis and voice cloning.
 *
 * Two decisions here are deliberate and worth keeping.
 *
 * **Raw PCM, not MP3.** The editor needs the exact duration of every
 * synthesized span to place it on the timeline, and duration is the one thing
 * a compressed stream will not tell you without decoding it. PCM is a
 * division: bytes / (rate x 2). Shipping a decoder to recover a number the
 * format could have given us for free is not a trade worth making.
 *
 * **Cloning refuses without consent.** The database already enforces this —
 * `voices_clone_requires_consent` rejects a clone row with no consent record —
 * and this adapter enforces the same rule one layer out, before a person's
 * voice ever reaches a vendor. A voice clone made without the speaker's
 * recorded permission is the single worst thing this product could do.
 */

export interface ElevenLabsConfig {
  apiKey: string;
  /** Storage tenant for synthesized audio. */
  workspaceId: string;
  model?: string;
  /** PCM only — see the note above. */
  outputFormat?: "pcm_16000" | "pcm_22050" | "pcm_24000" | "pcm_44100";
  baseUrl?: string;
  timeoutMs?: number;
  /** How long a synthesized clip's read URL stays valid. */
  signedUrlTtlSec?: number;
  fetchImpl?: typeof fetch;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  fine_tuning?: { language?: string };
}

/** PCM from ElevenLabs is 16-bit mono, so two bytes carry one sample. */
const BYTES_PER_SAMPLE = 2;

function sampleRateOf(format: string): number {
  const rate = Number(format.split("_")[1]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Unsupported ElevenLabs output format: ${format}`);
  }
  return rate;
}

/**
 * Applies per-span direction the vendor can actually honour.
 *
 * `pauseAfterMs` becomes a break tag and `pronunciations` become respellings,
 * both of which work on every model. Phoneme tags would be more precise but
 * are model-gated, and a respelling that silently does nothing is better than
 * a tag that makes the request fail.
 *
 * `emphasis` has no vendor control to map onto. It is carried in the edit and
 * applied in the mix — ducking, a held frame — rather than faked here by
 * mangling the text.
 */
function applyDirection(req: SynthesisRequest): string {
  let text = req.text.trim();

  for (const [term, saidAs] of Object.entries(req.pronunciations ?? {})) {
    if (!term) continue;
    // Word-boundary, case-insensitive, escaped: a term like "C++" must not
    // become a regex.
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    text = text.replace(pattern, saidAs);
  }

  const pause = req.direction?.pauseAfterMs;
  if (pause && pause > 0) {
    // ElevenLabs caps a single break at three seconds.
    text += ` <break time="${Math.min(3, pause / 1000).toFixed(2)}s" />`;
  }

  return text;
}

export class ElevenLabsSynthesis implements SynthesisProvider {
  readonly name = "elevenlabs-synthesis";

  constructor(private readonly config: ElevenLabsConfig) {
    if (!config.apiKey) {
      throw new Error("ElevenLabsSynthesis requires an API key (ELEVENLABS_API_KEY).");
    }
    if (!config.workspaceId) {
      throw new Error("ElevenLabsSynthesis requires a workspace id to scope stored audio.");
    }
  }

  private get base() {
    return this.config.baseUrl ?? "https://api.elevenlabs.io";
  }

  private get fetchImpl() {
    return this.config.fetchImpl ?? fetch;
  }

  private headers(extra: Record<string, string> = {}) {
    return { "xi-api-key": this.config.apiKey, ...extra };
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 120_000);
    try {
      const response = await this.fetchImpl(`${this.base}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new ProviderError(
          `ElevenLabs ${path} returned ${response.status}: ${body.slice(0, 400)}`,
          {
            provider: this.name,
            retryable: isRetryableStatus(response.status),
            status: response.status,
          },
        );
      }
      return response;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(`ElevenLabs was unreachable: ${String(error)}`, {
        provider: this.name,
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    const format = this.config.outputFormat ?? "pcm_44100";
    const sampleRate = sampleRateOf(format);
    const text = applyDirection(req);

    const voiceSettings: Record<string, unknown> = {
      stability: 0.45,
      similarity_boost: 0.8,
      use_speaker_boost: true,
    };
    if (req.direction?.pace) {
      // The vendor accepts 0.7 to 1.2; anything outside that is refused, so
      // clamp rather than let a slider in the UI fail the render.
      voiceSettings.speed = Math.min(1.2, Math.max(0.7, req.direction.pace));
    }

    const body = {
      text,
      model_id: this.config.model ?? "eleven_multilingual_v2",
      language_code: req.locale.split("-")[0],
      voice_settings: voiceSettings,
    };

    const response = await this.send(
      `/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=${format}`,
      {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json", Accept: "audio/*" }),
        body: JSON.stringify(body),
      },
    );

    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.byteLength === 0) {
      throw new ProviderError("ElevenLabs returned an empty audio stream.", {
        provider: this.name,
        retryable: true,
      });
    }

    // Content-addressed: re-synthesizing an unchanged span overwrites the
    // same object instead of littering storage with identical clips.
    const digest = createHash("sha256")
      .update(`${req.voiceId}\u0000${req.locale}\u0000${format}\u0000${text}`)
      .digest("hex")
      .slice(0, 32);
    const key = {
      workspaceId: this.config.workspaceId,
      path: `synthesis/${req.voiceId}/${digest}.pcm`,
    };

    const storage = getStorage();
    await storage.put(key, audio, `audio/L16;rate=${sampleRate}`);
    const signed = await storage.signedReadUrl(key, this.config.signedUrlTtlSec ?? 3600);

    return {
      audioUrl: signed.url,
      durationSec: audio.byteLength / (sampleRate * BYTES_PER_SAMPLE),
      sampleRate,
    };
  }

  async listVoices() {
    const response = await this.send("/v1/voices", {
      method: "GET",
      headers: this.headers(),
    });
    const payload = (await response.json()) as { voices?: ElevenLabsVoice[] };

    return (payload.voices ?? []).map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      locale: voice.fine_tuning?.language ?? voice.labels?.language ?? "en",
      // "premade" voices are licensed by the vendor; everything else was made
      // from somebody's recording and carries a consent obligation.
      kind: (voice.category === "premade" || voice.category === undefined
        ? "studio"
        : "clone") as "studio" | "clone",
    }));
  }

  async cloneVoice(input: { sampleUrl: string; consentPhraseUrl: string; ownerId: string }) {
    if (!input.consentPhraseUrl) {
      throw new ProviderError(
        "Refusing to clone a voice without a recorded consent phrase. The speaker " +
          "must read the consent statement aloud before their voice is cloned.",
        { provider: this.name, retryable: false },
      );
    }

    const [sample, consent] = await Promise.all([
      this.download(input.sampleUrl, "sample"),
      this.download(input.consentPhraseUrl, "consent phrase"),
    ]);

    const form = new FormData();
    form.append("name", `demoriff-${input.ownerId}`);
    // Both recordings are submitted. The consent phrase is not merely a
    // gate we check and discard: it is part of the evidence attached to the
    // voice, in our database and at the vendor.
    form.append("files", new Blob([sample], { type: "audio/wav" }), "sample.wav");
    form.append("files", new Blob([consent], { type: "audio/wav" }), "consent.wav");
    form.append(
      "description",
      `Cloned for DemoRiff owner ${input.ownerId} with a recorded consent phrase.`,
    );

    const response = await this.send("/v1/voices/add", {
      method: "POST",
      headers: this.headers(),
      body: form,
    });
    const payload = (await response.json()) as { voice_id?: string };
    if (!payload.voice_id) {
      throw new ProviderError("ElevenLabs did not return a voice id for the clone.", {
        provider: this.name,
        retryable: false,
      });
    }
    return { voiceId: payload.voice_id };
  }

  private async download(url: string, label: string): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await this.fetchImpl(url);
    } catch (error) {
      throw new ProviderError(`Could not read the ${label} recording: ${String(error)}`, {
        provider: this.name,
        retryable: true,
        cause: error,
      });
    }
    if (!response.ok) {
      throw new ProviderError(
        `Could not read the ${label} recording: ${response.status}.`,
        {
          provider: this.name,
          retryable: isRetryableStatus(response.status),
          status: response.status,
        },
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new ProviderError(`The ${label} recording is empty.`, {
        provider: this.name,
        retryable: false,
      });
    }
    return bytes;
  }
}

export function createElevenLabsSynthesis(config: ElevenLabsConfig): SynthesisProvider {
  return new ElevenLabsSynthesis(config);
}
