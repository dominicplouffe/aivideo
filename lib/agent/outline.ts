import { ProviderError } from "@/lib/providers/errors";
import { normaliseList, withinAllowlist } from "./allowlist";
import type { OutlineStep } from "./run";

/**
 * Turning a brief into a plan.
 *
 * Outline-first is not a UX preference. It is what makes the approval gate
 * mean something: a person approving "record a demo of our shipments flow"
 * has approved a sentence, and a person approving eight numbered steps with
 * the URLs they visit has approved a plan. The second is reviewable; the
 * first is a wish.
 *
 * So the model's job here ends at the outline. It does not decide where the
 * agent may go — every URL it proposes is checked against the allowlist
 * before a human ever sees it, and one outside the list is removed from the
 * plan with a note rather than quietly trimmed. A plan that reads as
 * approvable while containing a step nobody would approve is the failure
 * mode worth engineering against.
 */

export interface PlanRequest {
  brief: string;
  allowedOrigins: string[];
  /** Where the agent starts. Must itself be on the list. */
  entryUrl?: string;
  maxSteps?: number;
}

export interface PlanResult {
  outline: OutlineStep[];
  /** Steps the model proposed that were dropped, and why. Shown to the approver. */
  removed: { intent: string; url?: string; reason: string }[];
}

export interface OutlinePlanner {
  readonly name: string;
  plan(request: PlanRequest): Promise<PlanResult>;
}

const SYSTEM = [
  "You plan screen recordings of software products.",
  "",
  "Given a brief, produce the sequence of steps a person would take on screen",
  "to demonstrate it. Each step is one visible action with a purpose a viewer",
  "could follow — 'open the shipments list', 'create a shipment for the Berlin",
  "warehouse' — not an implementation detail like 'wait for the table to load'.",
  "",
  "Rules:",
  "- Stay inside the origins you are given. Do not invent a URL on any other host.",
  "- Do not plan destructive actions: no deleting, no cancelling, no sending",
  "  messages to real people, no changing billing or team membership.",
  "- Do not plan to enter real customer data. Use obviously fictional values.",
  "- Prefer eight to twelve steps. A demo nobody watches to the end is a demo",
  "  that did not work.",
].join("\n");

const OUTLINE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          intent: { type: "string", description: "One visible action, in plain words." },
          url: { type: "string", description: "The page this step happens on, if it navigates." },
        },
        required: ["intent"],
        additionalProperties: false,
      },
    },
  },
  required: ["steps"],
  additionalProperties: false,
};

/* --------------------------------------------------------------- shaping */

/**
 * Applies the rules the model was asked to follow, rather than trusting it to.
 *
 * Everything here is checked again after generation for the same reason the
 * translation adapter enforces its glossary after the call: a constraint that
 * lives only in a prompt is a constraint that holds most of the time, and
 * "most of the time" is not a property you can put in front of an approver.
 */
export function shapePlan(
  steps: { intent?: unknown; url?: unknown }[],
  allowedOrigins: string[],
  maxSteps = 14,
): PlanResult {
  const outline: OutlineStep[] = [];
  const removed: PlanResult["removed"] = [];

  for (const step of steps) {
    const intent = typeof step.intent === "string" ? step.intent.trim() : "";
    if (!intent) continue;

    const url = typeof step.url === "string" && step.url.trim() ? step.url.trim() : undefined;

    if (url) {
      const verdict = withinAllowlist(url, allowedOrigins);
      if (!verdict.ok) {
        // Removed and reported, never silently trimmed. A plan that reads as
        // approvable while hiding a step nobody would approve is the exact
        // failure this gate exists to prevent.
        removed.push({ intent, url, reason: "outside the run's allowlist" });
        continue;
      }
    }

    if (outline.length >= maxSteps) {
      removed.push({ intent, url, reason: "beyond the step limit for one run" });
      continue;
    }

    outline.push({ ordinal: outline.length, intent, url });
  }

  return { outline, removed };
}

/* -------------------------------------------------------------- planners */

type AnthropicModule = typeof import("@anthropic-ai/sdk");
type MessageParams = import("@anthropic-ai/sdk/resources/messages").MessageCreateParamsNonStreaming;
type MessageResult = import("@anthropic-ai/sdk/resources/messages").Message;

export interface AnthropicPlannerConfig {
  apiKey: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /** Test seam, as in the translation adapter. */
  messagesCreate?: (params: MessageParams) => Promise<MessageResult>;
}

export class AnthropicPlanner implements OutlinePlanner {
  readonly name = "anthropic";

  constructor(private readonly config: AnthropicPlannerConfig) {}

  async plan(request: PlanRequest): Promise<PlanResult> {
    const allowed = normaliseList(request.allowedOrigins);
    if (allowed.length === 0) {
      throw new ProviderError("A run needs at least one allowed origin before it can be planned.", {
        provider: this.name,
        retryable: false,
      });
    }

    const create = this.config.messagesCreate ?? (await this.client());

    const prompt = [
      `Allowed origins: ${allowed.join(", ")}`,
      request.entryUrl ? `Start at: ${request.entryUrl}` : "",
      "",
      "Brief:",
      request.brief,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await create({
      model: this.config.model ?? "claude-opus-5",
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      thinking: { type: "adaptive" },
      output_config: {
        // Planning a run somebody will approve and then execute unattended
        // is worth more thought than a caption span.
        effort: this.config.effort ?? "medium",
        format: { type: "json_schema", schema: OUTLINE_SCHEMA },
      },
    });

    if (response.stop_reason === "refusal") {
      throw new ProviderError("The planner refused that brief.", {
        provider: this.name,
        retryable: false,
      });
    }

    const text = response.content
      .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("");

    let parsed: { steps?: { intent?: unknown; url?: unknown }[] };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw new ProviderError("The planner did not return a plan.", {
        provider: this.name,
        retryable: true,
      });
    }

    return shapePlan(parsed.steps ?? [], allowed, request.maxSteps);
  }

  private async client(): Promise<(params: MessageParams) => Promise<MessageResult>> {
    const sdk = (await import("@anthropic-ai/sdk")) as AnthropicModule;
    const client = new sdk.default({ apiKey: this.config.apiKey });
    return (params: MessageParams) => client.messages.create(params);
  }
}

/**
 * A deterministic planner, for development and tests.
 *
 * Produces a plausible outline from the brief's own sentences so the whole
 * flow — plan, approve, record, audit — can be exercised without a vendor
 * account. It is a planner, not a demo of one: the same shaping rules apply
 * to its output as to the model's.
 */
export class MockPlanner implements OutlinePlanner {
  readonly name = "mock";

  async plan(request: PlanRequest): Promise<PlanResult> {
    const allowed = normaliseList(request.allowedOrigins);
    const entry = request.entryUrl ?? allowed[0];

    const sentences = request.brief
      .split(/[.;\n]+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 3);

    const steps = sentences.map((sentence, index) => ({
      intent: sentence,
      url: index === 0 ? entry : undefined,
    }));

    return shapePlan(steps, allowed, request.maxSteps);
  }
}

export function getPlanner(apiKey: string | null = process.env.ANTHROPIC_API_KEY ?? null): OutlinePlanner {
  if (apiKey && process.env.DEMORIFF_PROVIDERS === "live") {
    return new AnthropicPlanner({ apiKey });
  }
  return new MockPlanner();
}
