import { spawn } from "node:child_process";
import type { Edl } from "./edl";

/**
 * The step-by-step guide output.
 *
 * Every one of these tools ships a written walkthrough alongside the video,
 * because the video is what you watch once and the guide is what you search
 * three weeks later. It is built from the same EDL, so the two never
 * disagree: the steps are the chapters that survived the edit, the prose is
 * what was actually said in them, and each screenshot is a frame from the
 * recording rather than a drawing of one.
 *
 * Screenshots are taken one `ffmpeg` invocation per step, seeking rather
 * than decoding forward. A single pass emitting every frame and keeping six
 * of them decodes the whole file to throw almost all of it away; with
 * `-ss` before `-i`, FFmpeg seeks to the keyframe and decodes a fraction of
 * a second.
 */

export interface GuideStep {
  ordinal: number;
  title: string;
  /** What was said during this step, fillers already removed. */
  body: string;
  /** Where in the source this frame was taken from. */
  atSec: number;
  screenshot: Uint8Array | null;
  screenshotName: string;
}

export interface GuideResult {
  steps: GuideStep[];
  markdown: string;
}

/** Grabs one frame, as PNG. Returns null rather than failing the render. */
export async function grabFrame(
  sourcePath: string,
  atSec: number,
  options: { binary?: string; maxEdge?: number } = {},
): Promise<Uint8Array | null> {
  const maxEdge = options.maxEdge ?? 1280;
  const args = [
    "-hide_banner",
    "-loglevel", "error",
    // Before `-i`: this is the input seek, and it is the difference between
    // decoding a fraction of a second and decoding the entire file.
    "-ss", Math.max(0, atSec).toFixed(3),
    "-i", sourcePath,
    "-frames:v", "1",
    "-vf", `scale='min(${maxEdge},iw)':-2`,
    "-f", "image2",
    "-vcodec", "png",
    "-",
  ];

  const chunks: Buffer[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(options.binary ?? "ffmpeg", args);
      child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      // Swallowed deliberately: a missing screenshot is a guide with one
      // fewer picture, not a failed render.
      child.stderr.resume();
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    });
  } catch {
    return null;
  }

  const png = Buffer.concat(chunks);
  return png.byteLength > 0 ? new Uint8Array(png) : null;
}

function slugForStep(ordinal: number): string {
  return `step-${String(ordinal + 1).padStart(2, "0")}.png`;
}

/** Escapes the characters that would otherwise be Markdown syntax. */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]#])/g, "\\$1");
}

/**
 * Writes each step's title from what the step does ("Open the pricing
 * page"), given each step's spoken text. Null, an error or a wrong-length
 * answer keeps the first-sentence titles; a guide never fails over headings.
 */
export type StepTitler = (bodies: string[]) => Promise<string[] | null>;

export function anthropicStepTitler(apiKey: string, model = "claude-opus-5"): StepTitler {
  return async (bodies) => {
    const sdk = await import("@anthropic-ai/sdk");
    const client = new sdk.default({ apiKey, maxRetries: 2, timeout: 60_000 });
    const response = await client.messages.create({
      model,
      max_tokens: 1000,
      system:
        "You title the steps of a written product walkthrough. For each step you get what the presenter said. " +
        "Answer with one title per step, in order: an imperative phrase of two to six words naming the action the reader takes " +
        "(Open the pricing page / Pick a plan / Enter your email). Plain words, no trailing punctuation, nothing the presenter did not say.",
      messages: [{ role: "user", content: bodies.map((b, i) => `Step ${i + 1}: ${b || "(no speech)"}`).join("\n") }],
      output_config: {
        format: {
          type: "json_schema",
          schema: { type: "object", properties: { titles: { type: "array", items: { type: "string" } } }, required: ["titles"], additionalProperties: false },
        },
      },
    } as never);
    const text = (response as unknown as { content: { type: string; text?: string }[] }).content
      .filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
    const titles = (JSON.parse(text) as { titles?: unknown }).titles;
    return Array.isArray(titles) ? titles.map((t) => String(t).trim()) : null;
  };
}

export interface BuildGuideOptions {
  /** Titles steps by their action; without it a step is titled by its first sentence. */
  titleSteps?: StepTitler;
  title: string;
  sourcePath: string;
  ffmpegBinary?: string;
  /** Where the images will be served from, for the Markdown links. */
  imageBase?: string;
}

export async function buildGuide(edl: Edl, options: BuildGuideOptions): Promise<GuideResult> {
  const steps: GuideStep[] = [];

  const groups = groupCaptions(edl);
  let titles: string[] | null = null;
  if (options.titleSteps && groups.length > 0) {
    titles = await options.titleSteps(groups.map((g) => g.text)).catch(() => null);
    if (!titles || titles.length !== groups.length || titles.some((t) => !t)) titles = null;
  }
  for (const [index, caption] of groups.entries()) {
    // A second in, not at the boundary: the first frame of a cut is
    // mid-transition often enough that it makes a poor illustration.
    const atSec = caption.sourceAt + Math.min(1, Math.max(0, caption.length / 2));
    steps.push({
      ordinal: index,
      title: titles?.[index] ?? caption.title,
      body: caption.text,
      atSec,
      screenshot: await grabFrame(options.sourcePath, atSec, { binary: options.ffmpegBinary }),
      screenshotName: slugForStep(index),
    });
  }

  const base = options.imageBase ?? ".";
  const lines: string[] = [`# ${options.title}`, ""];

  for (const step of steps) {
    lines.push(`## ${step.ordinal + 1}. ${escapeMarkdown(step.title)}`, "");
    if (step.screenshot) {
      lines.push(`![${escapeMarkdown(step.title)}](${base}/${step.screenshotName})`, "");
    }
    if (step.body) lines.push(escapeMarkdown(step.body), "");
  }

  return { steps, markdown: lines.join("\n").trimEnd() + "\n" };
}

/**
 * One entry per step, built from the EDL's clips.
 *
 * Clips carry a label — the segment they came from — so consecutive clips
 * from one chapter become one step rather than one step per surviving run
 * of words. Captions supply the prose, since they are already the edited
 * text in output order.
 */
function groupCaptions(edl: Edl): { title: string; text: string; sourceAt: number; length: number }[] {
  const byLabel = new Map<string, { sourceAt: number; outputStart: number; outputEnd: number }>();

  for (const clip of edl.clips) {
    const label = clip.label ?? "step";
    const length = clip.sourceEnd - clip.sourceStart;
    const existing = byLabel.get(label);
    if (existing) {
      existing.outputEnd = clip.outputStart + length;
    } else {
      byLabel.set(label, {
        sourceAt: clip.sourceStart,
        outputStart: clip.outputStart,
        outputEnd: clip.outputStart + length,
      });
    }
  }

  return [...byLabel.values()].map((span, index) => {
    const text = edl.captions
      .filter((caption) => caption.from >= span.outputStart - 1e-6 && caption.from < span.outputEnd - 1e-6)
      .map((caption) => caption.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      // The EDL carries segment ids, not titles — a label is the best name
      // available here, and the editor renames steps anyway.
      title: text ? firstSentence(text) : `Step ${index + 1}`,
      text,
      sourceAt: span.sourceAt,
      length: span.outputEnd - span.outputStart,
    };
  });
}

function firstSentence(text: string): string {
  const match = /^(.{0,70}?[.!?])(\s|$)/.exec(text);
  const head = (match?.[1] ?? text.split(/\s+/).slice(0, 8).join(" ")).trim();
  return head.replace(/[,.;:]+$/, "");
}
