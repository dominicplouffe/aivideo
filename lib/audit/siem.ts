import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { open as unseal, seal, SealedValueError } from "@/lib/crypto/secrets";
import { checkDestination, describeRefusal } from "@/lib/webhooks/destinations";
import { dial, type Wire } from "@/lib/webhooks/transport";
import { canonicalJson } from "./chain";

/**
 * Streaming the audit log to a customer's SIEM.
 *
 * An enterprise buyer does not want a second place to look. They want these
 * events in Splunk, or Sentinel, or whatever their security team already has
 * open, correlated with everything else that happened that afternoon. That
 * is the whole feature.
 *
 * Two decisions shape it.
 *
 * **The cursor is a sequence number, not a timestamp.** The audit chain
 * already numbers entries densely within a workspace, so "everything after
 * 412" has exactly one meaning. A timestamp cursor has to choose between
 * re-sending the entries that share the boundary second and skipping them,
 * and under clock adjustment it can do both.
 *
 * **The cursor advances only after the collector has accepted the batch.**
 * That makes delivery at-least-once, which is the honest guarantee: a
 * collector that accepts a batch and then loses it is beyond our reach, but
 * one that times out after accepting will see those entries twice. Every
 * event carries its workspace and sequence number, so deduplicating is a
 * one-line search on the receiving side. The alternative — advancing first —
 * loses events, and an audit stream with holes is worse than none, because
 * it looks complete.
 */

export type SiemFormat = "json" | "cef" | "ecs";

type Destination = typeof s.siemDestinations.$inferSelect;
type AuditRow = typeof s.auditEvents.$inferSelect;

/* ------------------------------------------------------------- formatting */

/**
 * ArcSight CEF.
 *
 * The escaping rules are the whole of it, and they are asymmetric in a way
 * that is easy to get wrong: in the header, a backslash and a pipe are
 * escaped; in the extension, a backslash and an equals sign are, and a
 * newline must become a literal `\n` or it ends the record early. An
 * unescaped newline in an audit field is a way to inject a second,
 * fabricated event into somebody's SIEM.
 */
function cefHeaderEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

function cefExtensionEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/=/g, "\\=")
    .replace(/\r?\n/g, "\\n");
}

/** Severity on CEF's 0–10 scale. Refusals and deletions rank above reads. */
export function severityOf(action: string): number {
  if (/(deleted|erased|revoked|deactivated|refused|failed)/.test(action)) return 7;
  if (/(provisioned|created|published|changed|started)/.test(action)) return 4;
  return 3;
}

export function formatEntry(entry: AuditRow, format: SiemFormat): string {
  switch (format) {
    case "cef":
      return toCef(entry);
    case "ecs":
      return canonicalJson(toEcs(entry));
    default:
      return canonicalJson(toJson(entry));
  }
}

function toJson(entry: AuditRow): Record<string, unknown> {
  return {
    id: entry.id,
    seq: entry.seq,
    workspace_id: entry.workspaceId,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId,
    actor_id: entry.actorId,
    actor_email: entry.actorEmail,
    ip: entry.ip,
    metadata: entry.metadata,
    created_at: entry.createdAt.toISOString(),
    // Shipped with every event so a reader can verify the chain from what
    // their own collector holds, without asking us for it.
    hash: entry.hash,
    prev_hash: entry.prevHash,
  };
}

/** Elastic Common Schema, which is what most modern collectors normalise to. */
function toEcs(entry: AuditRow): Record<string, unknown> {
  return {
    "@timestamp": entry.createdAt.toISOString(),
    event: {
      kind: "event",
      category: ["configuration"],
      action: entry.action,
      id: entry.id,
      sequence: entry.seq,
      severity: severityOf(entry.action),
      provider: "demoriff",
    },
    user: { id: entry.actorId ?? undefined, email: entry.actorEmail ?? undefined },
    source: { ip: entry.ip ?? undefined },
    organization: { id: entry.workspaceId },
    demoriff: {
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      metadata: entry.metadata,
      hash: entry.hash,
      prev_hash: entry.prevHash,
    },
  };
}

function toCef(entry: AuditRow): string {
  const header = [
    "CEF:0",
    "DemoRiff",
    "DemoRiff",
    "1.0",
    entry.action,
    entry.action.replace(/[._]/g, " "),
    String(severityOf(entry.action)),
  ]
    .map(cefHeaderEscape)
    .join("|");

  const extension: [string, string | null][] = [
    ["rt", String(entry.createdAt.getTime())],
    ["externalId", entry.id],
    ["cn1", String(entry.seq ?? 0)],
    ["cn1Label", "sequence"],
    ["suser", entry.actorEmail],
    ["suid", entry.actorId],
    ["src", entry.ip],
    ["cs1", entry.workspaceId],
    ["cs1Label", "workspaceId"],
    ["cs2", entry.resourceType],
    ["cs2Label", "resourceType"],
    ["cs3", entry.resourceId],
    ["cs3Label", "resourceId"],
    ["cs4", entry.hash],
    ["cs4Label", "chainHash"],
    ["msg", entry.metadata ? canonicalJson(entry.metadata) : null],
  ];

  const pairs = extension
    .filter((pair): pair is [string, string] => pair[1] !== null && pair[1] !== "")
    .map(([k, v]) => `${k}=${cefExtensionEscape(v)}`);

  return `${header}|${pairs.join(" ")}`;
}

/* --------------------------------------------------------------- delivery */

export interface StreamOptions {
  /** Most collectors accept far more; this keeps one failure cheap to retry. */
  batchSize?: number;
  wire?: Wire;
  resolve?: (hostname: string) => Promise<string[]>;
  allowInsecure?: boolean;
}

export interface StreamOutcome {
  destinationId: string;
  delivered: number;
  fromSeq: number;
  toSeq: number;
  status: number | null;
  ok: boolean;
  error?: string;
}

/**
 * Ships one batch to one destination.
 *
 * Returns rather than throws, because the caller runs this across every
 * destination a workspace has and one broken collector must not stop the
 * others.
 */
export async function streamBatch(
  destination: Destination,
  options: StreamOptions = {},
): Promise<StreamOutcome> {
  const db = getDb();
  const batchSize = Math.min(500, Math.max(1, options.batchSize ?? 200));

  const rows = await db
    .select()
    .from(s.auditEvents)
    .where(
      and(
        eq(s.auditEvents.workspaceId, destination.workspaceId),
        gt(s.auditEvents.seq, destination.lastSeq),
      ),
    )
    .orderBy(asc(s.auditEvents.seq))
    .limit(batchSize);

  const base = {
    destinationId: destination.id,
    fromSeq: destination.lastSeq,
    toSeq: destination.lastSeq,
  };

  if (rows.length === 0) {
    return { ...base, delivered: 0, status: null, ok: true };
  }

  // The same check the webhook worker uses, for the same reason: this is a
  // customer-supplied URL dialled from our private network.
  const verdict = await checkDestination(destination.url, {
    resolve: options.resolve,
    allowInsecure: options.allowInsecure,
  });
  if (!verdict.ok) {
    await noteFailure(destination, describeRefusal(verdict.reason));
    return { ...base, delivered: 0, status: null, ok: false, error: describeRefusal(verdict.reason) };
  }

  const body = rows.map((row) => formatEntry(row, destination.format as SiemFormat)).join("\n");

  const headers: Record<string, string> = {
    // Newline-delimited, because that is what every collector on this list
    // ingests without configuration. A JSON array would need a parser
    // setting on their side for no benefit on ours.
    "Content-Type": destination.format === "cef" ? "text/plain; charset=utf-8" : "application/x-ndjson",
    "User-Agent": "DemoRiff-Audit/1",
    "DemoRiff-Workspace": destination.workspaceId,
    "DemoRiff-Sequence-Range": `${rows[0].seq}-${rows[rows.length - 1].seq}`,
  };

  if (destination.authValueSealed) {
    try {
      headers[destination.authHeaderName || "Authorization"] = unseal(destination.authValueSealed);
    } catch (error) {
      // A credential that will not decrypt is not a transient failure, and
      // sending the batch without it would authenticate as nobody.
      const message =
        error instanceof SealedValueError
          ? "The stored collector credential could not be decrypted."
          : String(error);
      await noteFailure(destination, message);
      return { ...base, delivered: 0, status: null, ok: false, error: message };
    }
  }

  const wire = options.wire ?? dial;
  let status: number | null = null;
  try {
    const response = await wire(verdict.url, {
      method: "POST",
      headers,
      body,
      addresses: verdict.addresses,
    });
    status = response.status;
    if (status < 200 || status >= 300) {
      const text = await response.text().catch(() => "");
      const message = `Collector answered ${status} ${text.slice(0, 200)}`.trim();
      await noteFailure(destination, message);
      return { ...base, delivered: 0, status, ok: false, error: message };
    }
  } catch (error) {
    await noteFailure(destination, String(error));
    return { ...base, delivered: 0, status: null, ok: false, error: String(error) };
  }

  const toSeq = rows[rows.length - 1].seq ?? destination.lastSeq;

  // Advanced only now. Advancing before the collector accepted would lose
  // events on any failure, and an audit stream with holes is worse than no
  // stream at all, because it looks complete.
  await db
    .update(s.siemDestinations)
    .set({ lastSeq: toSeq, lastDeliveredAt: new Date(), lastError: null, consecutiveFailures: 0 })
    .where(eq(s.siemDestinations.id, destination.id));

  return { destinationId: destination.id, delivered: rows.length, fromSeq: destination.lastSeq, toSeq, status, ok: true };
}

/**
 * How many consecutive failures before a destination stops being tried.
 *
 * It does stop, eventually: a collector that has been gone for two days is
 * not coming back on its own, and retrying it forever hides the fact that
 * nobody is receiving this workspace's audit trail. The events are not lost
 * — the cursor has not moved, so re-enabling it catches up.
 */
export const FAILURE_LIMIT = 50;

async function noteFailure(destination: Destination, message: string): Promise<void> {
  const failures = destination.consecutiveFailures + 1;
  await getDb()
    .update(s.siemDestinations)
    .set({
      lastError: message.slice(0, 500),
      consecutiveFailures: failures,
      disabledAt: failures >= FAILURE_LIMIT ? new Date() : destination.disabledAt,
    })
    .where(eq(s.siemDestinations.id, destination.id));
}

/* ------------------------------------------------------------ the worker */

/** Every destination that is still being tried. */
export async function activeDestinations(workspaceId?: string): Promise<Destination[]> {
  const where = workspaceId
    ? and(isNull(s.siemDestinations.disabledAt), eq(s.siemDestinations.workspaceId, workspaceId))
    : isNull(s.siemDestinations.disabledAt);

  return getDb().select().from(s.siemDestinations).where(where);
}

/**
 * One pass over every destination.
 *
 * Sequential rather than parallel, and deliberately: a workspace with twenty
 * destinations should not open twenty sockets at once from a worker that is
 * also encoding video.
 */
export async function streamAll(options: StreamOptions = {}): Promise<StreamOutcome[]> {
  const outcomes: StreamOutcome[] = [];
  for (const destination of await activeDestinations()) {
    outcomes.push(await streamBatch(destination, options));
  }
  return outcomes;
}

/* ----------------------------------------------------------- registration */

export interface DestinationInput {
  workspaceId: string;
  name: string;
  url: string;
  format?: SiemFormat;
  authHeaderName?: string;
  /** Plaintext. Sealed here so no caller has to remember to. */
  authValue?: string;
  /** Stream from the beginning rather than from now. */
  fromStart?: boolean;
  /** Injectable so the destination check is testable without DNS. */
  resolve?: (hostname: string) => Promise<string[]>;
}

export async function registerDestination(input: DestinationInput): Promise<Destination> {
  const verdict = await checkDestination(input.url, { resolve: input.resolve });
  if (!verdict.ok) {
    // Refused at registration as well as at delivery, so a typo is an error
    // an admin sees now rather than a stream that silently never starts.
    throw new Error(describeRefusal(verdict.reason));
  }

  // Default to streaming from now. A new collector filling with two years of
  // history is a surprise, and the history is still there to backfill from.
  const lastSeq = input.fromStart ? 0 : await currentSeq(input.workspaceId);

  const [row] = await getDb()
    .insert(s.siemDestinations)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      url: input.url,
      format: input.format ?? "json",
      authHeaderName: input.authHeaderName ?? (input.authValue ? "Authorization" : null),
      authValueSealed: input.authValue ? seal(input.authValue) : null,
      lastSeq,
    })
    .returning();

  return row;
}

async function currentSeq(workspaceId: string): Promise<number> {
  const [tail] = await getDb()
    .select({ seq: s.auditEvents.seq })
    .from(s.auditEvents)
    .where(eq(s.auditEvents.workspaceId, workspaceId))
    .orderBy(desc(s.auditEvents.seq))
    .limit(1);
  return tail?.seq ?? 0;
}
