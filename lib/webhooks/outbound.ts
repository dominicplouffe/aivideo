import { randomUUID } from "node:crypto";
import { enqueue, type Job } from "@/lib/jobs/queue";
import { checkDestination, describeRefusal } from "./destinations";
import { dial, type Wire } from "./transport";
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

export interface DeliveryOptions {
  secret?: string;
  timeoutMs?: number;
  /** Injectable transport. Defaults to the address-pinned dialler. */
  wire?: Wire;
  /** Injectable so destination checks are testable without DNS. */
  resolve?: (hostname: string) => Promise<string[]>;
  /** Permits plain http and private addresses. Development and tests only. */
  allowInsecure?: boolean;
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
  options: DeliveryOptions = {},
): Promise<DeliveryOutcome> {
  // Checked here, not only where the URL was accepted. A customer chooses
  // this destination and a worker on our private network dials it — that is
  // server-side request forgery by construction, and the worker sits next to
  // the database and the storage credentials. A URL can reach the queue by
  // more than one path, so the check belongs at the one place they all
  // converge.
  const destination = await checkDestination(url, {
    resolve: options.resolve,
    allowInsecure: options.allowInsecure,
  });
  if (!destination.ok) {
    return {
      status: null,
      ok: false,
      // Never retried: a destination that is refused now is refused every
      // time, and retrying would turn one bad URL into a scanner.
      retryable: false,
      body: describeRefusal(destination.reason),
    };
  }

  const body = JSON.stringify(event);
  const secret = options.secret ?? process.env.DEMORIFF_WEBHOOK_SECRET;
  const wire = options.wire ?? dial;

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
    // Pinned to an address the check approved, rather than resolved a second
    // time by whatever is underneath `fetch`. See `transport.ts`: a name that
    // was verified and then handed to a different resolver has not been
    // verified at all.
    const response = await wire(destination.url, {
      method: "POST",
      headers,
      body,
      addresses: destination.addresses,
      signal: controller.signal,
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
  options: DeliveryOptions = {},
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
