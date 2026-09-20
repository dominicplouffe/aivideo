import { randomUUID } from "node:crypto";
import { enqueue, type Job } from "@/lib/jobs/queue";
import { SIGNATURE_HEADER, signPayload } from "./signing";

/**
 * Outbound webhooks.
 *
 * Delivery rides the same durable queue as rendering rather than getting its
 * own machinery. A webhook is work that must survive a restart, retry with
 * backoff, and eventually give up — which is the queue's entire job
 * description. Writing a second, subtly different implementation of that
 * would mean two places to get exponential backoff wrong.
 *
 * Deliveries carry an event id and are retried, so a receiver will sometimes
 * see the same event twice. That is the honest contract: at least once, with
 * an id to deduplicate on. Promising exactly-once over an unreliable network
 * is a promise nobody can keep.
 */

export type WebhookEventType =
  | "recording.processed"
  | "project.ready"
  | "render.completed"
  | "render.failed"
  | "locale.stale"
  | "asset.threshold"
  | "usage.warning"
  | "voice.revoked";

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  createdAt: string;
  data: Record<string, unknown>;
}

export interface EmitOptions {
  workspaceId: string;
  type: WebhookEventType;
  url: string;
  data: Record<string, unknown>;
  /** Defaults to the event id, so a repeated emit does not double-deliver. */
  idempotencyKey?: string;
}

export function buildEvent(type: WebhookEventType, data: Record<string, unknown>): WebhookEvent {
  return { id: `evt_${randomUUID()}`, type, createdAt: new Date().toISOString(), data };
}

/** Queues one delivery. Returns the queued job. */
export async function emitEvent(options: EmitOptions): Promise<{ event: WebhookEvent; job: Job }> {
  const event = buildEvent(options.type, options.data);
  const { job } = await enqueue({
    workspaceId: options.workspaceId,
    kind: "webhook",
    payload: { url: options.url, event: event as unknown as Record<string, unknown> },
    idempotencyKey: options.idempotencyKey ?? event.id,
    // A receiver that is down for ten minutes should still get the event.
    maxAttempts: 8,
    // Notifications yield to renders: a customer waiting on a video cares
    // more about it than the receiver of its announcement does.
    priority: -1,
  });
  return { event, job };
}

export interface DeliveryOutcome {
  status: number | null;
  ok: boolean;
  retryable: boolean;
  body?: string;
}

/**
 * Performs one delivery.
 *
 * The retry decision is the whole point of this function. A 2xx is done. A
 * 410 means the endpoint is gone and will stay gone, so retrying it for the
 * next hour helps nobody. Everything else that is a client error is a
 * receiver bug we cannot fix by repeating ourselves; 408, 429 and 5xx are
 * conditions that pass.
 */
export async function deliver(
  url: string,
  event: WebhookEvent,
  options: { secret?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<DeliveryOutcome> {
  const body = JSON.stringify(event);
  const secret = options.secret ?? process.env.DEMORIFF_WEBHOOK_SECRET;
  const fetchImpl = options.fetchImpl ?? fetch;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "DemoRiff-Webhooks/1",
    "DemoRiff-Event-Id": event.id,
    "DemoRiff-Event-Type": event.type,
  };
  if (secret) headers[SIGNATURE_HEADER] = signPayload(secret, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      // A receiver that answers a webhook with a redirect is misconfigured,
      // and following one can leak the signature to another origin.
      redirect: "manual",
    });

    const status = response.status;
    if (status >= 200 && status < 300) return { status, ok: true, retryable: false };

    const text = await response.text().catch(() => "");
    const retryable = status === 408 || status === 429 || status >= 500;
    return { status, ok: false, retryable, body: text.slice(0, 500) };
  } catch (error) {
    // A refused connection or a timeout is exactly what retries are for.
    return { status: null, ok: false, retryable: true, body: String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

/** Runs a claimed `webhook` job. Throws to let the queue apply its backoff. */
export async function deliverWebhookJob(
  job: Job,
  options: { secret?: string; fetchImpl?: typeof fetch } = {},
): Promise<DeliveryOutcome> {
  const payload = job.payload as { url?: string; event?: WebhookEvent };
  if (!payload.url || !payload.event) {
    throw new Error("Webhook job is missing a url or an event.");
  }

  const outcome = await deliver(payload.url, payload.event, options);
  if (outcome.ok) return outcome;

  const detail = outcome.status === null ? outcome.body : `${outcome.status} ${outcome.body ?? ""}`;
  throw new Error(
    `${outcome.retryable ? "" : "permanent: "}webhook delivery to ${payload.url} failed — ${detail}`,
  );
}
