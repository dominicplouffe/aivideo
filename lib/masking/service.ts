import { ProviderError } from "@/lib/providers/errors";
import type { MaskingProvider, MaskingRule } from "@/lib/providers/types";
import { detectorsIn, narrow, type DetectorName } from "./detectors";
import { sampleFrames, type SampleOptions } from "./frames";
import { toRegions, type Hit } from "./regions";
import type { Frame, TextLocator } from "./types";

/**
 * Frame-level masking, assembled.
 *
 * Sample frames, find the text, decide what is sensitive, turn per-frame
 * hits into regions on a timeline. Each of those is its own module and each
 * is testable alone; this file is the wiring and the failure policy.
 *
 * The failure policy is the part worth reading. When a frame cannot be
 * inspected — the locator errored, the vendor was down, the image was
 * rejected — this does **not** carry on. A render that skipped three frames
 * produces a video that is unmasked for a second and a half, and nothing
 * about it looks wrong. The default is to fail the render and say which
 * frames, because a render that failed is a problem somebody fixes and a
 * render that silently leaked is a problem somebody finds out about later.
 */

export type FrameFailurePolicy = "fail" | "extend";

export interface FrameMaskingOptions extends SampleOptions {
  locator: TextLocator;
  /**
   * What to do when a frame cannot be read.
   *
   * `extend` carries the previous frame's regions forward instead of
   * failing. It is the right choice for a long recording where one vendor
   * hiccup should not discard an hour of encoding, and it is still a guess
   * about what was on screen — so it is never the default.
   */
  onFrameFailure?: FrameFailurePolicy;
  /** Below this, a detector hit is still masked but noted as uncertain. */
  minConfidence?: number;
  bridgeSec?: number;
  padding?: number;
  /** Frames are read one at a time by default; raise for a faster vendor. */
  concurrency?: number;
}

const DEFAULT_DETECTORS: DetectorName[] = ["email", "card", "iban", "ssn", "secret"];

function detectorsFor(rule: MaskingRule): DetectorName[] {
  const named = (rule.detectors ?? []).filter((name): name is DetectorName =>
    ["email", "phone", "card", "iban", "ssn", "ip", "postal", "name", "secret"].includes(name),
  );
  return named.length > 0 ? named : DEFAULT_DETECTORS;
}

/**
 * Builds a masking provider that can honour `detector` and `pattern` rules.
 *
 * `region` and `selector` rules pass straight through to the same geometry
 * the rule-based provider applies, so a policy mixing all four is handled by
 * one call rather than by the caller merging two providers' output.
 */
export function frameMasking(options: FrameMaskingOptions): MaskingProvider {
  return {
    name: `frame-masking/${options.locator.name}`,

    async detect({ mediaUrl, rules }) {
      const frameRules = rules.filter((rule) => rule.type === "detector" || rule.type === "pattern");
      const geometryRules = rules.filter((rule) => rule.type === "region" || rule.type === "selector");

      const regions = geometryRules.flatMap((rule) => {
        if (!rule.rect) {
          if (rule.type === "selector") {
            throw new ProviderError(
              `Selector rule "${rule.selector ?? "(unnamed)"}" reached masking without ` +
                `resolved bounds. Selector rules are converted to regions from recorder ` +
                `events before this runs.`,
              { provider: "frame-masking", retryable: false },
            );
          }
          return [];
        }
        return [
          {
            at: 0,
            until: Number.POSITIVE_INFINITY,
            rect: rule.rect,
            style: rule.style ?? "blur",
            reason: rule.type === "selector" ? (rule.selector ?? "selector") : "region",
          },
        ];
      });

      if (frameRules.length === 0) return { regions };

      const frames = await sampleFrames(mediaUrl, options);
      if (frames.length === 0) {
        throw new ProviderError(
          `No frames could be read from ${mediaUrl}, so no rule over frame contents ` +
            `can be honoured. This render will not proceed with these rules unapplied.`,
          { provider: "frame-masking", retryable: false },
        );
      }

      const fps = options.fps ?? 2;
      const samplePeriodSec = 1 / fps;
      const durationSec = frames.length * samplePeriodSec;

      const hits: Hit[] = [];
      const failed: number[] = [];
      let previous: Hit[] = [];

      for (const frame of frames) {
        let boxes;
        try {
          boxes = await options.locator.locate(frame);
        } catch (error) {
          failed.push(frame.atSec);
          if ((options.onFrameFailure ?? "fail") === "fail") {
            throw new ProviderError(
              `A frame at ${frame.atSec.toFixed(2)}s could not be inspected, so what it ` +
                `showed is unknown: ${String(error)}. Masking rules over frame contents ` +
                `cannot be honoured for this render.`,
              { provider: "frame-masking", retryable: true, cause: error },
            );
          }
          // Carried forward, and recorded as a guess. The previous frame's
          // regions are the best available answer, and 1/fps of stale mask
          // is safer than 1/fps of none.
          for (const hit of previous) hits.push({ ...hit, atSec: frame.atSec });
          continue;
        }

        const frameHits = hitsFor(frame, boxes, frameRules, options.minConfidence ?? 0);
        hits.push(...frameHits);
        previous = frameHits;
      }

      const detected = toRegions(hits, {
        samplePeriodSec,
        bridgeSec: options.bridgeSec,
        padding: options.padding,
        durationSec,
      });

      if (failed.length > 0) {
        // Not thrown, because the caller chose `extend` — but said out loud,
        // so a manifest can record which seconds are covered by a guess.
        console.warn(
          `[masking] ${failed.length} frame(s) could not be inspected and were covered ` +
            `by the previous frame's regions: ${failed.map((s) => s.toFixed(2)).join(", ")}`,
        );
      }

      return { regions: [...regions, ...detected] };
    },
  };
}

function hitsFor(
  frame: Frame,
  boxes: Awaited<ReturnType<TextLocator["locate"]>>,
  rules: MaskingRule[],
  minConfidence: number,
): Hit[] {
  const hits: Hit[] = [];

  for (const box of boxes) {
    for (const rule of rules) {
      const style = rule.style ?? "blur";

      if (rule.type === "pattern") {
        if (!rule.regex) continue;
        let regex: RegExp;
        try {
          regex = new RegExp(rule.regex, "g");
        } catch {
          throw new ProviderError(
            `Masking pattern "${rule.regex}" is not a valid expression, so it cannot be ` +
              `applied. A rule that does not compile is not a rule that matched nothing.`,
            { provider: "frame-masking", retryable: false },
          );
        }

        for (const match of box.text.matchAll(regex)) {
          if (match.index === undefined) continue;
          hits.push({
            atSec: frame.atSec,
            rect: narrow(box, match.index, match.index + match[0].length).rect,
            style,
            reason: `pattern:${rule.regex}`,
            category: "pattern",
          });
        }
        continue;
      }

      for (const hit of detectorsIn(box.text, detectorsFor(rule))) {
        // The locator's own confidence is *not* a filter. Text it was unsure
        // about is text a viewer might still read, and a mask skipped
        // because the machine hesitated is the worst possible reason to
        // leave a card number on screen.
        if (hit.confidence < minConfidence) continue;

        hits.push({
          atSec: frame.atSec,
          rect: narrow(box, hit.start, hit.end).rect,
          style,
          reason: `detector:${hit.detector}`,
          category: hit.detector,
        });
      }
    }
  }

  return hits;
}
