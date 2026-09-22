import { createHash } from "node:crypto";
import { getStorage } from "@/lib/storage";
import { ProviderError, isRetryableStatus } from "./errors";
import type { SynthesisProvider, SynthesisRequest, SynthesisResult } from "./types";

/** The vendor's timing report: one entry per character of the text it read. */
interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/**
 * Word timings from character timings.
 *
 * The vendor times characters; the editor thinks in words. A word is a run
 * of non-space characters, spoken from its first character's start to its
 * last character's end. Whitespace-only runs are skipped, so the result
 * lines up one to one with `text.split(/\s+/)`.
 */
export function wordsFromAlignment(alignment: Alignment): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  let current: { text: string; start: number; end: number } | null = null;
  alignment.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (current) out.push(current);
      current = null;
      return;
    }
    const start = alignment.character_start_times_seconds[i];
    const end = alignment.character_end_times_seconds[i];
    if (!current) current = { text: ch, start, end };
    else {
      current.text += ch;
      current.end = end;
    }
  });
  if (current) out.push(current);
  return out;
}

/**
 * ElevenLabs-backed speech synthesis and voice cloning.
 *
 * Two decisions here are deliberate and worth keeping.
 *
 * **Raw PCM, not MP3.** The editor needs the exact duration of every
 * synthesized span to place it on the timeline, and duration is the one thing
 * a compressed stream will not tell you without decoding it. PCM is a
 * division: bytes / (rate x 2). Shipping a decoder to recover a number the
 * format could have given us for free is not a trade worth making. The bytes
 * are stored inside a WAV header, though: raw PCM has no way to say what it
 * is, and ffmpeg handed a headerless file guesses a container and fails.
 * Forty-four bytes of header cost nothing and make the clip self-describing.
 *
 * **Cloning refuses without consent.** The database already enforces this —
 * `voices_clone_requires_consent` rejects a clone row with no consent record —
 * and this adapter enforces the same rule one layer out, before a person's
 * voice ever reaches a vendor. A voice clone made without the speaker's
 * recorded permission is the single worst thing this product could do.
 */

export interface ElevenLabsConfig {
  apiKey: string;
  model?: string;
  /**
   * PCM only — see the note above. 24 kHz by default: the vendor offers it
   * on every plan, where 44.1 kHz needs a Pro subscription, and speech at
   * 24 kHz is indistinguishable from 44.1 in a video mix. A higher format
   * the plan refuses falls back to 24 kHz rather than failing the render.
   */
  outputFormat?: "pcm_16000" | "pcm_22050" | "pcm_24000" | "pcm_44100";
  baseUrl?: string;
  timeoutMs?: number;
  /** How long a synthesized clip's read URL stays valid. */
  signedUrlTtlSec?: number;
  /** Pause before the one retry of a momentary refusal. */
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  fine_tuning?: { language?: string };
  preview_url?: string;
}

/** PCM from ElevenLabs is 16-bit mono, so two bytes carry one sample. */
const BYTES_PER_SAMPLE = 2;
/** The canonical header `wrapPcmInWav` writes. */
const WAV_HEADER_BYTES = 44;
/** Offered on every ElevenLabs plan. See `ElevenLabsConfig.outputFormat`. */
const DEFAULT_FORMAT = "pcm_24000" as const;

/** The vendor's "that output format is not on your plan" answer. */
function isFormatRefusal(error: unknown): boolean {
  return error instanceof ProviderError && error.detail.code === "output_format_not_allowed";
}

/**
 * Turns the vendor's refusal into one of ours, with its code kept.
 *
 * ElevenLabs puts the useful part in `detail.status`, and the HTTP status
 * is a poor guide to what to do: a 401 can mean a bad key (permanent) or
 * a burst its abuse detector disliked (try again in a moment); a 429 is
 * always momentary; a quota that has run out is permanent until next
 * month and worth saying in words the person can act on.
 */
const MOMENTARY = new Set(["too_many_concurrent_requests", "system_busy", "detected_unusual_activity", "rate_limit_exceeded"]);

export function describeRefusal(provider: string, path: string, status: number, body: string): ProviderError {
  let code: string | undefined;
  let vendorMessage = "";
  try {
    const parsed = JSON.parse(body) as { detail?: { status?: string; message?: string } | string };
    if (typeof parsed.detail === "object" && parsed.detail) {
      code = parsed.detail.status;
      vendorMessage = parsed.detail.message ?? "";
    } else if (typeof parsed.detail === "string") {
      vendorMessage = parsed.detail;
    }
  } catch {
    vendorMessage = body.slice(0, 200);
  }
  const momentary = (code !== undefined && MOMENTARY.has(code)) || isRetryableStatus(status);
  const said =
    code === "quota_exceeded"
      ? "ElevenLabs has no characters left on this plan for the month. Add credits or wait for the reset, then try again."
      : code === "detected_unusual_activity"
        ? "ElevenLabs paused this key for a moment (its abuse detector fired on a burst of requests). Try again shortly."
        : code === "too_many_concurrent_requests" || code === "system_busy"
          ? "ElevenLabs is busy; the request will be retried."
          : `ElevenLabs ${path.split("?")[0]} returned ${status}${code ? ` (${code})` : ""}: ${vendorMessage.slice(0, 300)}`;
  return new ProviderError(said, { provider, retryable: momentary, status, ...(code ? { code } : {}) });
}

/** Wraps 16-bit mono PCM in a canonical 44-byte WAV header. */
export function wrapPcmInWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const channels = 1;
  const blockAlign = channels * BYTES_PER_SAMPLE;
  const out = new Uint8Array(WAV_HEADER_BYTES + pcm.byteLength);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM format chunk size
  view.setUint16(20, 1, true); // linear PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
  ascii(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  out.set(pcm, WAV_HEADER_BYTES);
  return out;
}

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
        throw describeRefusal(this.name, path, response.status, body);
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
    if (!req.workspaceId) {
      // Refused rather than defaulted: a clip stored under no tenant is a
      // clip nobody can be billed for and nobody can be sure to delete.
      throw new ProviderError("Synthesis needs the workspace the audio belongs to.", {
        provider: this.name,
        retryable: false,
      });
    }
    const format = this.config.outputFormat ?? DEFAULT_FORMAT;
    try {
      return await this.synthesizeAs(req, format);
    } catch (error) {
      // The plan does not include the configured format. The clip is worth
      // more than the sample rate, so take the one every plan has.
      if (format !== DEFAULT_FORMAT && isFormatRefusal(error)) {
        return this.synthesizeAs(req, DEFAULT_FORMAT);
      }
      // A momentary refusal — a burst the vendor disliked, a busy signal —
      // is retried once after a pause. A chapter is a small request and the
      // person is waiting on a plan of forty of them; failing the whole
      // plan for one hiccup is the wrong trade.
      if (error instanceof ProviderError && error.retryable) {
        await new Promise((resolve) => setTimeout(resolve, this.config.retryDelayMs ?? 1500));
        return this.synthesizeAs(req, format);
      }
      throw error;
    }
  }

  private async synthesizeAs(
    req: SynthesisRequest,
    format: NonNullable<ElevenLabsConfig["outputFormat"]>,
  ): Promise<SynthesisResult> {
    const sampleRate = sampleRateOf(format);
    const text = applyDirection(req);
    const pace = req.direction?.pace ? Math.min(1.2, Math.max(0.7, req.direction.pace)) : 1;

    // Content-addressed: the same words in the same voice at the same pace
    // are the same clip. Re-rendering an unchanged chapter, or previewing a
    // voice twice, reads the clip already stored instead of buying it again.
    const digest = createHash("sha256")
      .update(`${req.voiceId}\u0000${req.locale}\u0000${format}\u0000${pace}\u0000${text}`)
      .digest("hex")
      .slice(0, 32);
    const key = {
      workspaceId: req.workspaceId,
      path: `synthesis/${req.voiceId}/${digest}.wav`,
    };
    const storage = getStorage();

    // The word timings live beside the audio, so a cache hit returns them too.
    const timingKey = { workspaceId: key.workspaceId, path: key.path.replace(/\.wav$/, ".words.json") };

    const cached = await storage.head(key).catch(() => null);
    if (cached && cached.bytes > WAV_HEADER_BYTES) {
      const signed = await storage.signedReadUrl(key, this.config.signedUrlTtlSec ?? 3600);
      let words: SynthesisResult["words"];
      try {
        const raw = await storage.get(timingKey);
        words = JSON.parse(new TextDecoder().decode(raw)) as SynthesisResult["words"];
      } catch {
        // A clip stored before timings were kept. Still a clip.
      }
      return {
        audioUrl: signed.url,
        storageUrl: `storage://${key.workspaceId}/${key.path}`,
        durationSec: (cached.bytes - WAV_HEADER_BYTES) / (sampleRate * BYTES_PER_SAMPLE),
        sampleRate,
        ...(words ? { words } : {}),
      };
    }

    const voiceSettings: Record<string, unknown> = {
      stability: 0.45,
      similarity_boost: 0.8,
      use_speaker_boost: true,
    };
    if (req.direction?.pace) {
      // The vendor accepts 0.7 to 1.2; anything outside that is refused, so
      // clamp rather than let a slider in the UI fail the render.
      voiceSettings.speed = pace;
    }

    const body = {
      text,
      model_id: this.config.model ?? "eleven_multilingual_v2",
      language_code: req.locale.split("-")[0],
      voice_settings: voiceSettings,
    };

    // The variant that reports when each character was spoken. Same audio,
    // same price; the timing is what lets the footage be fitted to the
    // reading word by word instead of chapter by chapter.
    const response = await this.send(
      `/v1/text-to-speech/${encodeURIComponent(req.voiceId)}/with-timestamps?output_format=${format}`,
      {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify(body),
      },
    );

    const payload = (await response.json()) as { audio_base64?: string; alignment?: Alignment | null };
    const audio = payload.audio_base64 ? new Uint8Array(Buffer.from(payload.audio_base64, "base64")) : new Uint8Array();
    if (audio.byteLength === 0) {
      throw new ProviderError("ElevenLabs returned an empty audio stream.", {
        provider: this.name,
        retryable: true,
      });
    }
    const words = payload.alignment ? wordsFromAlignment(payload.alignment) : undefined;

    await storage.put(key, wrapPcmInWav(audio, sampleRate), "audio/wav");
    if (words) {
      await storage.put(timingKey, new TextEncoder().encode(JSON.stringify(words)), "application/json");
    }
    const signed = await storage.signedReadUrl(key, this.config.signedUrlTtlSec ?? 3600);

    return {
      audioUrl: signed.url,
      storageUrl: `storage://${key.workspaceId}/${key.path}`,
      durationSec: audio.byteLength / (sampleRate * BYTES_PER_SAMPLE),
      sampleRate,
      ...(words ? { words } : {}),
    };
  }

  async listVoices() {
    const response = await this.send("/v1/voices", {
      method: "GET",
      headers: this.headers(),
    });
    const payload = (await response.json()) as { voices?: ElevenLabsVoice[] };

    return (payload.voices ?? []).map((voice) => {
      const labels = voice.labels ?? {};
      // The vendor tags a voice with a few words each for description and
      // use case; together they read as the one-line note a picker wants.
      const descriptor = [labels.description, labels.use_case]
        .filter((part): part is string => Boolean(part))
        .join(", ");
      return {
        id: voice.voice_id,
        name: voice.name,
        locale: voice.fine_tuning?.language ?? labels.language ?? "en",
        // "premade" voices are licensed by the vendor; everything else was made
        // from somebody's recording and carries a consent obligation.
        kind: (voice.category === "premade" || voice.category === undefined
          ? "studio"
          : "clone") as "studio" | "clone",
        ...(descriptor ? { descriptor } : {}),
        ...(labels.accent ? { accent: labels.accent } : {}),
        ...(voice.preview_url ? { previewUrl: voice.preview_url } : {}),
      };
    });
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
