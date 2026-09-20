import { ProviderError } from "./errors";
import type { MaskingProvider } from "./types";

/**
 * Rule-based masking.
 *
 * This is the piece of the pipeline where a convincing stub would be
 * dangerous. If masking quietly returns nothing for a rule it cannot
 * evaluate, the render succeeds, the customer ships the video, and their
 * users' email addresses are on screen. So this engine does exactly what it
 * can prove and refuses the rest out loud.
 *
 *  - `region` rules are geometry. A fixed rectangle over the whole clip needs
 *    no inference and is applied here.
 *  - `selector` rules need the DOM bounds captured by the recorder, which
 *    arrive as interaction events, not as pixels. They are resolved upstream
 *    and reach the renderer already converted to regions.
 *  - `detector` and `pattern` rules need OCR and a PII classifier running
 *    over frames. That service is not built. Asking for one throws rather
 *    than returning an empty region list that reads like "nothing to hide".
 */

export const ruleMasking: MaskingProvider = {
  name: "rule-masking",
  async detect({ rules }) {
    const unsupported = rules
      .filter((rule) => rule.type === "detector" || rule.type === "pattern")
      .map((rule) => (rule.type === "detector" ? (rule.detectors ?? ["pii"]).join("/") : (rule.regex ?? "pattern")));

    if (unsupported.length > 0) {
      throw new ProviderError(
        `Frame-level masking is not available in this deployment, so these rules ` +
          `cannot be honoured: ${unsupported.join(", ")}. Convert them to region ` +
          `rules or disable them — this render will not silently leave them unmasked.`,
        { provider: "rule-masking", retryable: false },
      );
    }

    const regions = rules
      .filter((rule) => rule.type === "region" || rule.type === "selector")
      .flatMap((rule) => {
        if (!rule.rect) {
          if (rule.type === "selector") {
            throw new ProviderError(
              `Selector rule "${rule.selector ?? "(unnamed)"}" reached the renderer ` +
                `without resolved bounds. Selector rules must be converted to ` +
                `regions from recorder events before masking runs.`,
              { provider: "rule-masking", retryable: false },
            );
          }
          return [];
        }
        return [
          {
            // Region rules are static: they hold for the whole clip. The
            // renderer clamps `until` to the actual duration.
            at: 0,
            until: Number.POSITIVE_INFINITY,
            rect: rule.rect,
            style: rule.style ?? "blur",
            reason: rule.type === "selector" ? (rule.selector ?? "selector") : "region",
          },
        ];
      });

    return { regions };
  },
};
