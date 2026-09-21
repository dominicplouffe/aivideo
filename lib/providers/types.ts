/**
 * Provider abstraction for the production pipeline.
 *
 * Every external capability the platform needs is expressed as a narrow
 * interface here, so the app never talks to a vendor SDK directly. The
 * repository ships a deterministic mock implementation; swapping in a real
 * vendor is a matter of writing one adapter and changing the factory in
 * `lib/providers/index.ts`. Nothing above this layer changes.
 */

export interface TranscriptWordResult {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
}

export interface TranscriptionResult {
  language: string;
  durationSec: number;
  words: TranscriptWordResult[];
}

/**
 * Where the audio comes from.
 *
 * A URL only works when the vendor can reach it, and ours usually cannot be:
 * a recording lives in workspace-scoped storage behind a session cookie, or
 * on a laptop running `next dev`. Posting the bytes is the path that works
 * everywhere, so it is the one the pipeline uses; the URL form stays for the
 * vendors that prefer to fetch, and for media that is genuinely public.
 */
export type TranscriptionSource =
  | { url: string }
  | { bytes: Uint8Array; contentType: string };

export interface TranscriptionProvider {
  readonly name: string;
  /** Word-level alignment is required — segment-level is not sufficient. */
  transcribe(input: {
    media: TranscriptionSource;
    languageHint?: string;
    /** Spellings to favour — product names, brand terms — when the vendor supports priming. */
    keyterms?: string[];
  }): Promise<TranscriptionResult>;
}

export interface SynthesisRequest {
  text: string;
  voiceId: string;
  locale: string;
  /** Whose audio this is. Synthesized clips are stored under this tenant. */
  workspaceId: string;
  /** Per-span direction: pace, emphasis and pauses. */
  direction?: { pace?: number; emphasis?: string[]; pauseAfterMs?: number };
  pronunciations?: Record<string, string>;
}

export interface SynthesisResult {
  /** A signed read URL, for playing the clip back in a browser. It expires. */
  audioUrl: string;
  /**
   * `storage://<workspaceId>/<path>`, for the render worker. It does not
   * expire, which matters: a render queued behind a backlog must not fetch
   * a link that died while it waited.
   */
  storageUrl?: string;
  durationSec: number;
  sampleRate: number;
}

/** A voice as the vendor describes it. */
export interface CatalogueVoice {
  id: string;
  name: string;
  locale: string;
  kind: "studio" | "clone";
  /** The vendor's one-line character note, e.g. "calm, narration". */
  descriptor?: string;
  accent?: string;
  /** A short sample hosted by the vendor. */
  previewUrl?: string;
}

export interface SynthesisProvider {
  readonly name: string;
  synthesize(req: SynthesisRequest): Promise<SynthesisResult>;
  listVoices(): Promise<CatalogueVoice[]>;
  cloneVoice(input: { sampleUrl: string; consentPhraseUrl: string; ownerId: string }): Promise<{ voiceId: string }>;
}

export interface TranslationProvider {
  readonly name: string;
  translate(input: {
    text: string;
    from: string;
    to: string;
    /** Product names and UI labels that must survive untranslated. */
    glossary?: string[];
  }): Promise<{ text: string }>;
}

export interface InteractionEvent {
  at: number;
  kind: "click" | "key" | "scroll" | "route" | "mutation";
  selector?: string;
  role?: string;
  accessibleName?: string;
  bounds?: { x: number; y: number; w: number; h: number };
}

export interface ZoomKeyframe {
  at: number;
  holdSec: number;
  scale: number;
  anchor: { x: number; y: number };
  easing: "push" | "cut" | "hold";
  inferred: boolean;
}

export interface DirectionProvider {
  readonly name: string;
  /** Turns interaction data plus an aligned transcript into camera direction. */
  direct(input: {
    events: InteractionEvent[];
    transcript: TranscriptionResult;
    maxScale?: number;
  }): Promise<{ keyframes: ZoomKeyframe[]; cuts: { start: number; end: number; reason: string }[] }>;
}

export interface MaskingRule {
  type: "detector" | "selector" | "region" | "pattern";
  detectors?: string[];
  selector?: string;
  rect?: [number, number, number, number];
  regex?: string;
  style?: MaskStyle;
}

/** How a region is obscured. The same three everywhere: CSS, ffmpeg, here. */
export type MaskStyle = "blur" | "pixelate" | "redact";

export interface MaskedRegion {
  at: number;
  until: number;
  rect: [number, number, number, number];
  style: MaskStyle;
  /** Which rule matched, for the recording's manifest. */
  reason: string;
  /** What kind of thing was found. Never the value itself. */
  category?: string;
}

export interface MaskingProvider {
  readonly name: string;
  /** Returns regions to obscure, per frame range. Applied before encoding. */
  detect(input: { mediaUrl: string; rules: MaskingRule[] }): Promise<{ regions: MaskedRegion[] }>;
}

export type RenderOutput = "video" | "guide" | "interactive" | "clips";

export interface RenderRequest {
  projectId: string;
  outputs: RenderOutput[];
  locales: string[];
  brandKitId: string;
  video?: { resolution: "720p" | "1080p" | "1440p" | "2160p"; fps: 30 | 60; aspects: string[] };
  webhookUrl?: string;
  idempotencyKey?: string;
  /** The project's title, which the written guide is headed with. */
  title?: string;
  /**
   * Which workspace this render belongs to.
   *
   * Carried on the request rather than fixed when the provider is built.
   * A provider configured with one workspace id from the environment is a
   * provider that bills the wrong tenant the first time anybody runs two.
   */
  workspaceId?: string;
  /**
   * A fully resolved edit decision list.
   *
   * When the caller has one — and the Studio always does — it travels with
   * the job. The alternative is for the worker to rebuild it from the
   * project hours later, by which time somebody has edited the project and
   * the render no longer matches what they pressed the button on.
   */
  edl?: unknown;
}

export interface RenderJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  minutesBilled: number;
  outputs: Partial<Record<RenderOutput, { status: string; url?: string }>>;
  /** Present when the render was narrated in a chosen voice. Shape: lib/render/narration.ts. */
  narration?: unknown;
  error?: string;
}

export interface RenderProvider {
  readonly name: string;
  submit(req: RenderRequest): Promise<RenderJob>;
  get(jobId: string): Promise<RenderJob>;
  cancel(jobId: string): Promise<void>;
}

export interface ProviderSet {
  transcription: TranscriptionProvider;
  synthesis: SynthesisProvider;
  translation: TranslationProvider;
  direction: DirectionProvider;
  masking: MaskingProvider;
  render: RenderProvider;
}
