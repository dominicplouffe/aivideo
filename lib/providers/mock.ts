import { seeded } from "@/lib/utils";
import { heuristicDirection } from "./direction";
import type {
  DirectionProvider, MaskingProvider, ProviderSet, RenderJob, RenderProvider,
  SynthesisProvider, TranscriptionProvider, TranscriptionSource, TranslationProvider,
} from "./types";

/**
 * Deterministic in-memory providers. They implement the same contracts as a
 * real vendor adapter, return plausibly shaped data, and never call out to the
 * network — which is what makes the app runnable with no credentials.
 */

/** A stable seed for either shape of source, so a take always mocks the same. */
function seedFor(media: TranscriptionSource): string {
  if ("url" in media) return media.url;
  // Length plus a sample of the head: enough that two different takes get
  // two different transcripts, cheap enough that a 500MB blob is not hashed.
  const head = Array.from(media.bytes.slice(0, 64)).join(",");
  return `${media.bytes.byteLength}:${head}`;
}

export const mockTranscription: TranscriptionProvider = {
  name: "mock-transcription",
  async transcribe({ media, languageHint = "en-US" }) {
    const rand = seeded(seedFor(media));
    const source =
      "So um let me show you how this works. You click the primary action here and the result " +
      "appears immediately, which is basically the whole feature.";
    let t = 0;
    const words = source.split(/\s+/).map((w) => {
      const d = 0.16 + w.length * 0.045 + rand() * 0.06;
      const entry = { word: w, start: t, end: t + d, confidence: 0.87 + rand() * 0.12 };
      t += d;
      return entry;
    });
    return { language: languageHint, durationSec: t, words };
  },
};

export const mockSynthesis: SynthesisProvider = {
  name: "mock-synthesis",
  async synthesize({ text, voiceId }) {
    const wordCount = text.trim().split(/\s+/).length;
    return {
      audioUrl: `mock://audio/${voiceId}/${wordCount}`,
      durationSec: wordCount * 0.38,
      sampleRate: 48000,
    };
  },
  async listVoices() {
    return [
      { id: "avery-warm-us", name: "Avery", locale: "en-US", kind: "studio" },
      { id: "rhys-crisp-uk", name: "Rhys", locale: "en-GB", kind: "studio" },
      { id: "clone-renata", name: "Renata", locale: "pt-BR", kind: "clone" },
    ];
  },
  async cloneVoice({ ownerId }) {
    return { voiceId: `clone-${ownerId}` };
  },
};

export const mockTranslation: TranslationProvider = {
  name: "mock-translation",
  async translate({ text, to, glossary = [] }) {
    // Protected terms survive verbatim — the behaviour that matters here.
    const protectedTerms = new Set(glossary.map((g) => g.toLowerCase()));
    const translated = text
      .split(/\s+/)
      .map((w) => (protectedTerms.has(w.toLowerCase().replace(/\W/g, "")) ? w : w))
      .join(" ");
    return { text: `[${to}] ${translated}` };
  },
};

/**
 * Direction is first-party logic, not a vendor stand-in, so the mock set
 * uses the real engine. Re-exported here so the two sets stay symmetrical.
 */
export const mockDirection: DirectionProvider = heuristicDirection;

export const mockMasking: MaskingProvider = {
  name: "mock-masking",
  async detect({ mediaUrl, rules }) {
    const rand = seeded(`${mediaUrl}:mask`);
    return {
      regions: rules.slice(0, 3).map((r, i) => ({
        at: i * 4 + rand() * 2,
        until: i * 4 + 3 + rand() * 2,
        rect: (r.rect ?? [0.1 + i * 0.2, 0.3, 0.18, 0.05]) as [number, number, number, number],
        style: r.style ?? "blur",
        reason: r.type === "detector" ? (r.detectors?.[0] ?? "pii") : r.type,
      })),
    };
  },
};

const jobs = new Map<string, RenderJob>();

export const mockRender: RenderProvider = {
  name: "mock-render",
  async submit(req) {
    const id = `ren_${Math.random().toString(36).slice(2, 10)}`;
    // Only finished video minutes are billed; derived assets are free.
    const minutesBilled = req.outputs.includes("video") ? 1.8 : 0;
    const job: RenderJob = {
      id,
      status: "queued",
      progress: 0,
      minutesBilled,
      outputs: Object.fromEntries(req.outputs.map((o) => [o, { status: "pending" }])) as RenderJob["outputs"],
    };
    jobs.set(id, job);
    return job;
  },
  async get(jobId) {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`Unknown render job: ${jobId}`);
    // Advance deterministically so polling clients see progress.
    if (job.status !== "completed") {
      job.progress = Math.min(1, job.progress + 0.25);
      job.status = job.progress >= 1 ? "completed" : "running";
      if (job.status === "completed") {
        for (const key of Object.keys(job.outputs)) {
          job.outputs[key as keyof typeof job.outputs] = {
            status: "ready",
            url: `mock://output/${jobId}/${key}`,
          };
        }
      }
    }
    return job;
  },
  async cancel(jobId) {
    jobs.delete(jobId);
  },
};

export const mockProviders: ProviderSet = {
  transcription: mockTranscription,
  synthesis: mockSynthesis,
  translation: mockTranslation,
  direction: mockDirection,
  masking: mockMasking,
  render: mockRender,
};
