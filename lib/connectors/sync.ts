import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { open as unseal, seal } from "@/lib/crypto/secrets";
import { recordQuietly } from "@/lib/audit/log";
import { documentHash, textHash, type GuideDocument, type GuideStep } from "./document";
import { getConnector, type ConnectorVendor } from "./index";
import type { ConnectorContext, ConnectorCredentials } from "./types";

/**
 * Two-way sync with a help centre.
 *
 * The rule that governs everything here: **a human edit is never silently
 * overwritten.** A support lead who fixes a sentence in Zendesk has done
 * something more valuable than our re-render, and an integration that
 * clobbers it on the next sync is one they will disconnect that afternoon.
 *
 * Three hashes make that decidable, and all three are measured the same way
 * — the visible text of the article as the help centre would hold it:
 *
 *  - `pushedHash`  — what we last sent.
 *  - `remoteHash`  — what the help centre last told us it holds.
 *  - the live document's hash, computed fresh on every sync.
 *
 * From those, four states:
 *
 *  | local moved | remote moved | state         | what happens          |
 *  |-------------|--------------|---------------|-----------------------|
 *  | no          | no           | `in_sync`     | nothing               |
 *  | yes         | no           | `local_ahead` | push                  |
 *  | no          | yes          | `remote_ahead`| nothing, and say so   |
 *  | yes         | yes          | `diverged`    | nothing, and say so   |
 *
 * `remote_ahead` does **not** pull the edit back into the project. The
 * project is a recording with a transcript and camera direction; an edited
 * paragraph from Zendesk has nowhere honest to land in it. What the sync
 * does is stop pushing, and tell somebody. Pretending otherwise would be
 * the worse lie.
 */

export type LinkState = "in_sync" | "local_ahead" | "remote_ahead" | "diverged" | "unlinked";

export interface SyncOutcome {
  projectId: string;
  linkId: string | null;
  state: LinkState;
  action: "created" | "updated" | "skipped" | "held";
  externalId?: string | null;
  externalUrl?: string | null;
  reason?: string;
}

type Installation = typeof s.connectorInstallations.$inferSelect;
type Link = typeof s.connectorLinks.$inferSelect;

export interface SyncOptions {
  fetchImpl?: typeof fetch;
  /** Injectable so the destination check is testable without DNS. */
  resolve?: (hostname: string) => Promise<string[]>;
  /**
   * Pushes even when the help centre has been edited, discarding that edit.
   *
   * Exists because somebody will occasionally need it, and is never the
   * default. It takes an explicit choice, per project, and the audit log
   * records who made it.
   */
  force?: boolean;
  actor?: { memberId: string | null; email: string | null };
}

/* ------------------------------------------------------------ the decision */

export function decide(input: {
  pushedHash: string | null;
  remoteHash: string | null;
  liveHash: string;
}): LinkState {
  if (!input.pushedHash) return "unlinked";

  const localMoved = input.liveHash !== input.pushedHash;
  // A remote hash we have never recorded is not evidence of an edit.
  const remoteMoved = input.remoteHash !== null && input.remoteHash !== input.pushedHash;

  if (localMoved && remoteMoved) return "diverged";
  if (localMoved) return "local_ahead";
  if (remoteMoved) return "remote_ahead";
  return "in_sync";
}

/* -------------------------------------------------------------- the sync */

export function contextFor(
  installation: Installation,
  fetchImpl?: typeof fetch,
  resolve?: (hostname: string) => Promise<string[]>,
): ConnectorContext {
  const credentials: ConnectorCredentials = installation.credentialsSealed
    ? (JSON.parse(unseal(installation.credentialsSealed)) as ConnectorCredentials)
    : {};

  return {
    baseUrl: installation.baseUrl,
    credentials,
    containerId: installation.containerId,
    fetchImpl,
    resolve,
  };
}

/** Seals credentials for storage. Callers never write the column directly. */
export function sealCredentials(credentials: ConnectorCredentials): string {
  return seal(JSON.stringify(credentials));
}

/**
 * Syncs one project to one installation.
 *
 * Returns rather than throws for a held or skipped sync, because those are
 * outcomes rather than failures. A vendor error still throws: the caller
 * records it against the installation.
 */
export async function syncProject(
  installation: Installation,
  project: { id: string; workspaceId: string },
  document: GuideDocument,
  options: SyncOptions = {},
): Promise<SyncOutcome> {
  const db = getDb();
  const connector = getConnector(installation.vendor as ConnectorVendor, options.fetchImpl);
  const context = contextFor(installation, options.fetchImpl, options.resolve);
  const liveHash = documentHash(document);

  const [existing] = await db
    .select()
    .from(s.connectorLinks)
    .where(
      and(
        eq(s.connectorLinks.installationId, installation.id),
        eq(s.connectorLinks.projectId, project.id),
        eq(s.connectorLinks.locale, document.locale),
      ),
    )
    .limit(1);

  if (!existing) {
    const article = await connector.createArticle(context, document);
    const [link] = await db
      .insert(s.connectorLinks)
      .values({
        installationId: installation.id,
        projectId: project.id,
        locale: document.locale,
        externalId: article.id,
        externalUrl: article.url ?? null,
        pushedHash: liveHash,
        // What the help centre echoed back, measured the same way. Vendors
        // reformat on ingest, and recording their version now is what stops
        // the very next sync reporting a human edit that never happened.
        remoteHash: article.html ? textHash(`${article.title} ${article.html}`) : liveHash,
        state: "in_sync",
        lastPushedAt: new Date(),
      })
      .returning();

    await note(project.workspaceId, options.actor, "connector.article_created", link, installation, {
      vendor: installation.vendor,
      externalId: article.id,
    });

    return {
      projectId: project.id,
      linkId: link.id,
      state: "in_sync",
      action: "created",
      externalId: article.id,
      externalUrl: article.url ?? null,
    };
  }

  // Read before deciding. The stored remote hash is from the last sync, and
  // the question is what the help centre holds *now*.
  const remote = await connector.fetchArticle(context, existing.externalId);
  const remoteNow = remote ? textHash(`${remote.title} ${remote.html}`) : null;

  const state = decide({
    pushedHash: existing.pushedHash,
    remoteHash: remoteNow,
    liveHash,
  });

  if (state === "in_sync") {
    await touch(existing.id, { remoteHash: remoteNow, state: "in_sync" });
    return { projectId: project.id, linkId: existing.id, state, action: "skipped", externalId: existing.externalId };
  }

  const wouldDiscardAnEdit = state === "remote_ahead" || state === "diverged";
  if (wouldDiscardAnEdit && !options.force) {
    await touch(existing.id, { remoteHash: remoteNow, state });
    await note(project.workspaceId, options.actor, "connector.sync_held", existing, installation, {
      vendor: installation.vendor,
      state,
      externalId: existing.externalId,
    });

    return {
      projectId: project.id,
      linkId: existing.id,
      state,
      action: "held",
      externalId: existing.externalId,
      externalUrl: existing.externalUrl,
      reason:
        state === "diverged"
          ? "Both this guide and the published article have changed since the last sync."
          : "The published article has been edited in the help centre since the last sync.",
    };
  }

  const article = await connector.updateArticle(context, existing.externalId, document);
  await touch(existing.id, {
    pushedHash: liveHash,
    remoteHash: article.html ? textHash(`${article.title} ${article.html}`) : liveHash,
    state: "in_sync",
    lastPushedAt: new Date(),
    externalUrl: article.url ?? existing.externalUrl,
  });

  await note(
    project.workspaceId,
    options.actor,
    options.force && wouldDiscardAnEdit ? "connector.edit_overwritten" : "connector.article_updated",
    existing,
    installation,
    { vendor: installation.vendor, externalId: existing.externalId, previousState: state },
  );

  return {
    projectId: project.id,
    linkId: existing.id,
    state: "in_sync",
    action: "updated",
    externalId: existing.externalId,
    externalUrl: article.url ?? existing.externalUrl,
  };
}

async function touch(linkId: string, changes: Partial<typeof s.connectorLinks.$inferInsert>): Promise<void> {
  await getDb()
    .update(s.connectorLinks)
    .set({ ...changes, lastPulledAt: new Date() })
    .where(eq(s.connectorLinks.id, linkId));
}

async function note(
  workspaceId: string,
  actor: SyncOptions["actor"],
  action: string,
  link: Pick<Link, "id"> | null,
  installation: Installation,
  metadata: Record<string, unknown>,
): Promise<void> {
  await recordQuietly({
    workspaceId,
    actor: actor ?? null,
    action,
    resourceType: "connector_link",
    resourceId: link?.id ?? installation.id,
    metadata: { ...metadata, installationId: installation.id },
  });
}

/* ------------------------------------------------------- reading the state */

export async function linksForProject(projectId: string): Promise<Link[]> {
  return getDb()
    .select()
    .from(s.connectorLinks)
    .where(eq(s.connectorLinks.projectId, projectId))
    .orderBy(asc(s.connectorLinks.createdAt));
}

export async function installationsFor(workspaceId: string): Promise<Installation[]> {
  return getDb()
    .select()
    .from(s.connectorInstallations)
    .where(eq(s.connectorInstallations.workspaceId, workspaceId))
    .orderBy(asc(s.connectorInstallations.createdAt));
}

/* ------------------------------------------- building a document to publish */

/** Turns a project and its segments into the document a connector publishes. */
export function documentFor(
  project: { title: string; description?: string | null; updatedAt?: Date },
  segments: { ordinal: number; title: string; action?: string | null; words: { w: string; cut?: boolean }[]; startSec?: number }[],
  options: { locale?: string; videoUrl?: string | null; tourUrl?: string | null; screenshots?: Record<number, string> } = {},
): GuideDocument {
  const steps: GuideStep[] = segments
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((segment) => ({
      ordinal: segment.ordinal + 1,
      title: segment.title,
      // The edited transcript, not the raw one: a cut word is cut from the
      // video, and a guide that still prints it describes a video nobody
      // will watch.
      body: segment.words
        .filter((word) => !word.cut)
        .map((word) => word.w)
        .join(" ")
        .replace(/\s+([,.!?])/g, "$1")
        .trim(),
      action: segment.action ?? null,
      screenshotUrl: options.screenshots?.[segment.ordinal] ?? null,
      startSec: segment.startSec,
    }));

  return {
    title: project.title,
    summary: project.description ?? null,
    locale: options.locale ?? "en-US",
    steps,
    videoUrl: options.videoUrl ?? null,
    tourUrl: options.tourUrl ?? null,
    updatedAt: project.updatedAt ?? new Date(),
  };
}
