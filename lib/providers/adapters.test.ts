import assert from "node:assert/strict";
import test from "node:test";
import { AnthropicTranslation } from "./anthropic";
import { DeepgramTranscription } from "./deepgram";
import { ElevenLabsSynthesis } from "./elevenlabs";
import { ProviderError } from "./errors";
import { ruleMasking } from "./masking";
import { setStorage } from "@/lib/storage";
import type { StorageAdapter, StorageKey, StoredObject } from "@/lib/storage";

/**
 * These tests exercise the adapters against stubbed transports. They do not
 * prove the vendors behave as documented — nothing short of a live key does —
 * but they do prove the things that are ours to get wrong: the request we
 * build, the fields we map, what we do with a failure, and the rules we
 * refuse to break.
 */

// --- helpers ---------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const WORKSPACE = "11111111-1111-4111-8111-111111111111";

/** Records what was written without touching the filesystem. */
function recordingStorage() {
  const writes: { key: string; bytes: number; contentType: string }[] = [];
  const adapter: StorageAdapter = {
    name: "recording",
    async createUpload() { throw new Error("not used"); },
    async completeUpload() { throw new Error("not used"); },
    async abortUpload() {},
    async put(key: StorageKey, body: Uint8Array, contentType: string): Promise<StoredObject> {
      writes.push({ key: `${key.workspaceId}/${key.path}`, bytes: body.byteLength, contentType });
      return { key: key.path, bytes: body.byteLength, contentType, createdAt: new Date() };
    },
    async get() { return new Uint8Array(); },
    async signedReadUrl(key: StorageKey) {
      return { url: `signed://${key.path}`, expiresAt: new Date(Date.now() + 3600_000) };
    },
    async head() { return null; },
    async remove() {},
    async removeWorkspace() { return 0; },
  };
  return { adapter, writes };
}

// --- Deepgram --------------------------------------------------------------

const DEEPGRAM_BODY = {
  metadata: { duration: 12.5 },
  results: {
    channels: [
      {
        detected_language: "en",
        alternatives: [
          {
            words: [
              { word: "um", start: 0.1, end: 0.34, confidence: 0.91, punctuated_word: "Um,", speaker: 0 },
              { word: "click", start: 0.4, end: 0.8, confidence: 0.98, punctuated_word: "click", speaker: 0 },
              { word: "here", start: 0.85, end: 1.2, confidence: 0.99, punctuated_word: "here.", speaker: 1 },
            ],
          },
        ],
      },
    ],
  },
};

test("deepgram asks for filler words and diarization — the editor depends on both", async () => {
  let requested: URL | null = null;
  const provider = new DeepgramTranscription({
    apiKey: "k",
    fetchImpl: async (url) => {
      requested = new URL(String(url));
      return jsonResponse(DEEPGRAM_BODY);
    },
  });

  await provider.transcribe({ media: { url: "https://media.example/a.webm" } });

  const params = requested!.searchParams;
  assert.equal(params.get("filler_words"), "true");
  assert.equal(params.get("diarize"), "true");
  assert.equal(params.get("punctuate"), "true");
});

test("deepgram keeps punctuation and per-word timings", async () => {
  const provider = new DeepgramTranscription({
    apiKey: "k",
    fetchImpl: async () => jsonResponse(DEEPGRAM_BODY),
  });

  const result = await provider.transcribe({ media: { url: "https://media.example/a.webm" } });

  assert.equal(result.language, "en");
  assert.equal(result.durationSec, 12.5);
  assert.equal(result.words.length, 3);
  // Punctuated form wins: the direction engine finds sentence ends with it.
  assert.equal(result.words[2].word, "here.");
  assert.equal(result.words[0].speaker, "speaker-0");
  assert.equal(result.words[2].speaker, "speaker-1");
  // The filler survives transcription so the editor can offer to cut it.
  assert.equal(result.words[0].word, "Um,");
});

test("deepgram treats silent footage as a valid empty transcript", async () => {
  const provider = new DeepgramTranscription({
    apiKey: "k",
    fetchImpl: async () =>
      jsonResponse({ metadata: { duration: 9 }, results: { channels: [{ alternatives: [{ words: [] }] }] } }),
  });

  const result = await provider.transcribe({ media: { url: "https://media.example/silent.webm" } });
  assert.deepEqual(result.words, []);
  assert.equal(result.durationSec, 9);
});

test("deepgram separates retryable failures from permanent ones", async () => {
  const rateLimited = new DeepgramTranscription({
    apiKey: "k",
    fetchImpl: async () => new Response("slow down", { status: 429 }),
  });
  await assert.rejects(
    () => rateLimited.transcribe({ media: { url: "https://media.example/a.webm" } }),
    (error: unknown) => error instanceof ProviderError && error.retryable,
  );

  const badKey = new DeepgramTranscription({
    apiKey: "k",
    fetchImpl: async () => new Response("nope", { status: 401 }),
  });
  await assert.rejects(
    () => badKey.transcribe({ media: { url: "https://media.example/a.webm" } }),
    (error: unknown) => error instanceof ProviderError && !error.retryable,
  );
});

// --- ElevenLabs ------------------------------------------------------------

test("elevenlabs derives exact duration from the PCM byte count", async () => {
  const { adapter, writes } = recordingStorage();
  setStorage(adapter);

  // One second of 16-bit mono at 44.1 kHz.
  const oneSecond = new Uint8Array(44100 * 2);
  const provider = new ElevenLabsSynthesis({
    apiKey: "k",
    workspaceId: WORKSPACE,
    fetchImpl: async () => new Response(oneSecond, { status: 200 }),
  });

  const result = await provider.synthesize({ text: "Click here.", voiceId: "v1", locale: "en-US" });

  assert.equal(result.durationSec, 1);
  assert.equal(result.sampleRate, 44100);
  assert.equal(result.audioUrl.startsWith("signed://synthesis/v1/"), true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].contentType, "audio/L16;rate=44100");
  setStorage(null);
});

test("elevenlabs applies the direction the vendor can honour", async () => {
  const { adapter } = recordingStorage();
  setStorage(adapter);

  let sent: Record<string, unknown> = {};
  const provider = new ElevenLabsSynthesis({
    apiKey: "k",
    workspaceId: WORKSPACE,
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(new Uint8Array(1024), { status: 200 });
    },
  });

  await provider.synthesize({
    text: "Open the Brand Kit and press save.",
    voiceId: "v1",
    locale: "pt-BR",
    direction: { pace: 4, pauseAfterMs: 900 },
    pronunciations: { save: "sayve" },
  });

  assert.equal(sent.text, 'Open the Brand Kit and press sayve. <break time="0.90s" />');
  // Out-of-range pace is clamped rather than allowed to fail the render.
  assert.deepEqual((sent.voice_settings as Record<string, unknown>).speed, 1.2);
  assert.equal(sent.language_code, "pt");
  setStorage(null);
});

test("elevenlabs refuses to clone a voice without a consent recording", async () => {
  let vendorCalled = false;
  const provider = new ElevenLabsSynthesis({
    apiKey: "k",
    workspaceId: WORKSPACE,
    fetchImpl: async () => {
      vendorCalled = true;
      return jsonResponse({ voice_id: "should-never-happen" });
    },
  });

  await assert.rejects(
    () => provider.cloneVoice({ sampleUrl: "https://s/sample.wav", consentPhraseUrl: "", ownerId: "u1" }),
    (error: unknown) => error instanceof ProviderError && !error.retryable,
  );
  // The point is not just the error — nothing left the building.
  assert.equal(vendorCalled, false);
});

test("elevenlabs submits both recordings when consent exists", async () => {
  const seen: string[] = [];
  let form: FormData | null = null;
  const provider = new ElevenLabsSynthesis({
    apiKey: "k",
    workspaceId: WORKSPACE,
    fetchImpl: async (url, init) => {
      const href = String(url);
      seen.push(href);
      if (href.includes("/v1/voices/add")) {
        form = init?.body as FormData;
        return jsonResponse({ voice_id: "voice_123" });
      }
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    },
  });

  const result = await provider.cloneVoice({
    sampleUrl: "https://s/sample.wav",
    consentPhraseUrl: "https://s/consent.wav",
    ownerId: "u1",
  });

  assert.equal(result.voiceId, "voice_123");
  assert.equal(seen.filter((u) => u.startsWith("https://s/")).length, 2);
  assert.equal((form as unknown as FormData).getAll("files").length, 2);
});

test("elevenlabs maps vendor categories onto studio and clone voices", async () => {
  const provider = new ElevenLabsSynthesis({
    apiKey: "k",
    workspaceId: WORKSPACE,
    fetchImpl: async () =>
      jsonResponse({
        voices: [
          { voice_id: "a", name: "Avery", category: "premade", labels: { language: "en" } },
          { voice_id: "b", name: "Renata", category: "cloned", fine_tuning: { language: "pt" } },
        ],
      }),
  });

  const voices = await provider.listVoices();
  assert.deepEqual(voices, [
    { id: "a", name: "Avery", locale: "en", kind: "studio" },
    { id: "b", name: "Renata", locale: "pt", kind: "clone" },
  ]);
});

// --- Anthropic -------------------------------------------------------------

function translationResponse(text: string) {
  return {
    id: "msg_1",
    type: "message" as const,
    role: "assistant" as const,
    model: "claude-opus-5",
    stop_reason: "end_turn" as const,
    stop_sequence: null,
    content: [{ type: "text" as const, text: JSON.stringify({ text }), citations: null }],
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

test("anthropic retries once when a protected term is dropped, then succeeds", async () => {
  const prompts: string[] = [];
  let call = 0;
  const provider = new AnthropicTranslation({
    apiKey: "k",
    messagesCreate: async (params) => {
      prompts.push(String((params.messages[0] as { content: string }).content));
      call += 1;
      return (call === 1
        ? translationResponse("Abra o Kit de Marca.")
        : translationResponse("Abra o Brand Kit.")) as never;
    },
  });

  const result = await provider.translate({
    text: "Open the Brand Kit.",
    from: "en-US",
    to: "pt-BR",
    glossary: ["Brand Kit"],
  });

  assert.equal(result.text, "Abra o Brand Kit.");
  assert.equal(call, 2);
  assert.match(prompts[1], /Brand Kit/);
  assert.match(prompts[1], /previous attempt was rejected/);
});

test("anthropic fails the job rather than shipping a renamed product", async () => {
  const provider = new AnthropicTranslation({
    apiKey: "k",
    messagesCreate: async () => translationResponse("Abra o Kit de Marca.") as never,
  });

  await assert.rejects(
    () =>
      provider.translate({
        text: "Open the Brand Kit.",
        from: "en-US",
        to: "pt-BR",
        glossary: ["Brand Kit"],
      }),
    (error: unknown) => error instanceof ProviderError && !error.retryable,
  );
});

test("anthropic asks again when the line will not fit the shot", async () => {
  const corrections: string[] = [];
  let call = 0;
  const long =
    "Haga clic en el botón principal, que se encuentra en la parte superior derecha de la pantalla, " +
    "para continuar con el proceso completo.";
  const provider = new AnthropicTranslation({
    apiKey: "k",
    messagesCreate: async (params) => {
      const prompt = String((params.messages[0] as { content: string }).content);
      if (prompt.includes("previous attempt")) corrections.push(prompt);
      call += 1;
      return (call === 1 ? translationResponse(long) : translationResponse("Haga clic aquí.")) as never;
    },
  });

  const result = await provider.translate({ text: "Click here.", from: "en-US", to: "es-ES" });

  assert.equal(result.text, "Haga clic aquí.");
  assert.equal(corrections.length, 1);
  assert.match(corrections[0], /longer than the source/);
});

test("anthropic does not compare character counts across scripts", async () => {
  let calls = 0;
  const provider = new AnthropicTranslation({
    apiKey: "k",
    messagesCreate: async () => {
      calls += 1;
      // Japanese renders this in far fewer characters; a naive ratio check
      // in the other direction would fire on every Latin-to-CJK pair.
      return translationResponse("ここをクリックします。") as never;
    },
  });

  await provider.translate({ text: "Click here to continue.", from: "en-US", to: "ja-JP" });
  assert.equal(calls, 1);
});

test("anthropic sends the model, effort and schema the product expects", async () => {
  let params: Record<string, unknown> = {};
  const provider = new AnthropicTranslation({
    apiKey: "k",
    messagesCreate: async (p) => {
      params = p as unknown as Record<string, unknown>;
      return translationResponse("Hola.") as never;
    },
  });

  await provider.translate({ text: "Hello.", from: "en-US", to: "es-ES" });

  assert.equal(params.model, "claude-opus-5");
  assert.deepEqual(params.thinking, { type: "adaptive" });
  const output = params.output_config as { effort: string; format: { type: string } };
  assert.equal(output.effort, "low");
  assert.equal(output.format.type, "json_schema");
});

test("anthropic short-circuits empty narration without a request", async () => {
  let calls = 0;
  const provider = new AnthropicTranslation({
    apiKey: "k",
    messagesCreate: async () => {
      calls += 1;
      return translationResponse("") as never;
    },
  });

  assert.deepEqual(await provider.translate({ text: "   ", from: "en", to: "fr" }), { text: "" });
  assert.equal(calls, 0);
});

// --- Masking ---------------------------------------------------------------

test("masking refuses rules it cannot actually evaluate", async () => {
  await assert.rejects(
    () =>
      ruleMasking.detect({
        mediaUrl: "https://media.example/a.webm",
        rules: [{ type: "detector", detectors: ["email", "credit-card"], style: "blur" }],
      }),
    (error: unknown) => error instanceof ProviderError && /not available/.test(error.message),
  );
});

test("masking applies region rules for the whole clip", async () => {
  const { regions } = await ruleMasking.detect({
    mediaUrl: "https://media.example/a.webm",
    rules: [{ type: "region", rect: [0.1, 0.2, 0.3, 0.05], style: "pixelate" }],
  });

  assert.equal(regions.length, 1);
  assert.equal(regions[0].at, 0);
  assert.equal(regions[0].until, Number.POSITIVE_INFINITY);
  assert.equal(regions[0].style, "pixelate");
});

test("masking rejects a selector rule that never got resolved bounds", async () => {
  await assert.rejects(
    () =>
      ruleMasking.detect({
        mediaUrl: "https://media.example/a.webm",
        rules: [{ type: "selector", selector: "[data-pii]" }],
      }),
    (error: unknown) => error instanceof ProviderError && /resolved bounds/.test(error.message),
  );
});

test("Deepgram is handed the bytes, not a URL it cannot reach", async () => {
  // The recording sits behind a session cookie on someone's laptop. A URL
  // would mean publishing it; this is the request that does not.
  let seen: { contentType?: string; body?: unknown } = {};
  const provider = new DeepgramTranscription({
    apiKey: "k",
    fetchImpl: (async (_url: string, init: RequestInit) => {
      seen = {
        contentType: new Headers(init.headers).get("content-type") ?? undefined,
        body: init.body,
      };
      return new Response(JSON.stringify({ metadata: { duration: 1 }, results: {} }), {
        status: 200,
      });
    }) as unknown as typeof fetch,
  });

  const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]); // an EBML header
  await provider.transcribe({ media: { bytes, contentType: "video/webm" } });

  assert.equal(seen.contentType, "video/webm");
  assert.ok(seen.body instanceof ArrayBuffer, "the media is sent as the request body");
  assert.deepEqual([...new Uint8Array(seen.body as ArrayBuffer)], [...bytes]);
});
