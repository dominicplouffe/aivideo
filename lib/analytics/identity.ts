import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { recordQuietly } from "@/lib/audit/log";

/**
 * Knowing who watched.
 *
 * The rest of `lib/analytics` is built so that nobody can be identified: a
 * salt that rotates daily and is never written down, a key that is
 * meaningless tomorrow, an asset in the hash so one viewer cannot be
 * followed across demos. This module is the opposite trade, and it is
 * deliberately the *only* place that makes it.
 *
 * Three rules hold it in place.
 *
 * **Identity is given, never inferred.** A contact exists because somebody
 * typed an address into a gate, or followed a link a salesperson sent them
 * that says who it was for. There is no fingerprinting, no IP lookup, no
 * "probably the same person as".
 *
 * **It attaches forwards only.** The session in which somebody identified
 * themselves carries the contact. Earlier sessions do not, and cannot: the
 * daily key is irreversible, so there is no way to find them. That is the
 * design, not a limitation — an address given for one demo is not consent to
 * be matched against every anonymous view in the table.
 *
 * **Erasure keeps the count and drops the name.** A person asking to be
 * forgotten should not silently restate last quarter's numbers, so the
 * contact row survives with its address cleared and the sessions keep
 * counting towards totals while no longer naming anybody.
 */

export type IdentitySource = "email_gate" | "crm_link" | "personalized_link" | "manual";

export interface IdentifyInput {
  workspaceId: string;
  email: string;
  name?: string | null;
  company?: string | null;
  source: IdentitySource;
}

export type Contact = typeof s.contacts.$inferSelect;

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Looks like an address. Deliberately permissive; the gate is not a validator. */
export function plausibleEmail(email: string): boolean {
  const value = normaliseEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

/**
 * Records that somebody identified themselves.
 *
 * Upserts on the address, because the same person filling in a second gate
 * is the same person — and creating a second row would split their history
 * without hiding anything.
 */
export async function identify(input: IdentifyInput): Promise<Contact> {
  const email = normaliseEmail(input.email);
  if (!plausibleEmail(email)) {
    throw new Error("That does not look like an email address.");
  }

  const db = getDb();
  const [contact] = await db
    .insert(s.contacts)
    .values({
      workspaceId: input.workspaceId,
      email,
      name: input.name ?? null,
      company: input.company ?? null,
      source: input.source,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [s.contacts.workspaceId, s.contacts.email],
      set: {
        lastSeenAt: new Date(),
        // Filled in if we did not have them, never overwritten with null:
        // a later gate that asks for less must not erase what an earlier
        // one collected.
        name: sql`coalesce(${s.contacts.name}, excluded.name)`,
        company: sql`coalesce(${s.contacts.company}, excluded.company)`,
        // An erased contact that identifies itself again is a new consent.
        erasedAt: null,
      },
    })
    .returning();

  await recordQuietly({
    workspaceId: input.workspaceId,
    actor: { memberId: null, email },
    action: "contact.identified",
    resourceType: "contact",
    resourceId: contact.id,
    // The source is the answer to "why do you have my email", so it is the
    // part worth keeping.
    metadata: { source: input.source },
  });

  return contact;
}

/**
 * Attaches a contact to the session it was given in.
 *
 * Scoped to the workspace *and* to a session that has no contact yet. The
 * second condition matters: without it, a second gate submission on somebody
 * else's machine could overwrite whose session this was.
 */
export async function attachToSession(
  workspaceId: string,
  sessionId: string,
  contactId: string,
): Promise<boolean> {
  const [updated] = await getDb()
    .update(s.analyticsSessions)
    .set({ contactId })
    .where(
      and(
        eq(s.analyticsSessions.id, sessionId),
        eq(s.analyticsSessions.workspaceId, workspaceId),
        isNull(s.analyticsSessions.contactId),
      ),
    )
    .returning({ id: s.analyticsSessions.id });

  return Boolean(updated);
}

/* -------------------------------------------------- personalised links */

/**
 * A link that says who it was sent to.
 *
 * A sales team sends `?ri=<token>`, and the token carries a contact id
 * signed by us. Signed, because an unsigned id in a URL is an invitation to
 * iterate — and a viewer who could edit it would attach their watching to
 * somebody else's record.
 *
 * It expires, because a link forwarded six months later is being opened by
 * whoever it was forwarded to, and recording that as the original recipient
 * is worse than recording nobody.
 */
const LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function linkSecret(): string {
  const value = process.env.DEMORIFF_LINK_SECRET ?? process.env.DEMORIFF_SECRET_KEY;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DEMORIFF_LINK_SECRET must be set in production.");
  }
  return "development-link-secret";
}

export function signPersonalLink(contactId: string, issuedAt = Date.now()): string {
  const body = `${contactId}.${issuedAt}`;
  const signature = createHmac("sha256", linkSecret()).update(body).digest("base64url");
  return `${Buffer.from(body, "utf8").toString("base64url")}.${signature}`;
}

export type LinkVerdict =
  | { ok: true; contactId: string }
  | { ok: false; reason: "malformed" | "signature" | "expired" };

export function verifyPersonalLink(token: string, now = Date.now()): LinkVerdict {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };

  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));

  let decoded: string;
  try {
    decoded = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expected = Buffer.from(
    createHmac("sha256", linkSecret()).update(decoded).digest("base64url"),
  );
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "signature" };
  }

  const separator = decoded.lastIndexOf(".");
  const contactId = decoded.slice(0, separator);
  const issuedAt = Number(decoded.slice(separator + 1));
  if (!contactId || !Number.isFinite(issuedAt)) return { ok: false, reason: "malformed" };
  if (now - issuedAt > LINK_TTL_MS) return { ok: false, reason: "expired" };

  return { ok: true, contactId };
}

/* ----------------------------------------------------------- reading it */

export interface ContactActivity {
  contact: Contact;
  sessions: {
    projectId: string;
    startedAt: Date;
    watchedSeconds: number;
    assetSeconds: number;
    reachedEnd: boolean;
    ctaClicked: boolean;
  }[];
}

/** What one known viewer watched. The whole point of the opt-in. */
export async function activityFor(
  workspaceId: string,
  contactId: string,
): Promise<ContactActivity | null> {
  const db = getDb();
  const [contact] = await db
    .select()
    .from(s.contacts)
    .where(and(eq(s.contacts.id, contactId), eq(s.contacts.workspaceId, workspaceId)))
    .limit(1);

  if (!contact) return null;

  const sessions = await db
    .select({
      projectId: s.analyticsSessions.projectId,
      startedAt: s.analyticsSessions.startedAt,
      watchedSeconds: s.analyticsSessions.watchedSeconds,
      assetSeconds: s.analyticsSessions.assetSeconds,
      reachedEnd: s.analyticsSessions.reachedEnd,
      ctaClicked: s.analyticsSessions.ctaClicked,
    })
    .from(s.analyticsSessions)
    .where(
      and(
        eq(s.analyticsSessions.contactId, contactId),
        eq(s.analyticsSessions.workspaceId, workspaceId),
      ),
    )
    .orderBy(desc(s.analyticsSessions.startedAt));

  return { contact, sessions };
}

/**
 * Forgets somebody.
 *
 * The address goes; the row and the sessions stay. Deleting the contact
 * outright would unlink its sessions and quietly restate every report that
 * counted them — a deletion request is about a person's name, not about
 * rewriting last quarter.
 */
export async function erase(
  workspaceId: string,
  contactId: string,
  actor: { memberId: string | null; email: string | null },
): Promise<boolean> {
  const db = getDb();

  const [erased] = await db
    .update(s.contacts)
    .set({
      // Replaced rather than nulled: the unique index is on the address, and
      // two erased contacts must not collide with each other.
      email: `erased:${contactId}`,
      name: null,
      company: null,
      crmId: null,
      erasedAt: new Date(),
    })
    .where(
      and(
        eq(s.contacts.id, contactId),
        eq(s.contacts.workspaceId, workspaceId),
        isNull(s.contacts.erasedAt),
      ),
    )
    .returning();

  if (!erased) return false;

  await recordQuietly({
    workspaceId,
    actor,
    action: "contact.erased",
    resourceType: "contact",
    resourceId: contactId,
    metadata: { sessionsKept: true },
  });

  return true;
}
