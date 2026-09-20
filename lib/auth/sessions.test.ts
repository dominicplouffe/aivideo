import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { changeRole, deactivate, MemberChangeError } from "@/lib/db/repositories/members";
import type { Actor } from "./authorize";
import { clearSessionCookie, originAllowed, readSessionCookie, serializeSessionCookie } from "./cookies";
import {
  ABSOLUTE_TIMEOUT_MS, IDLE_TIMEOUT_MS, hashToken, issue, listForMember,
  revoke, revokeAllForMember, rotate, sweep, verify,
} from "./sessions";

/**
 * Sessions exist as database rows for exactly one reason: revocation has to
 * be immediate. Most of these tests are that claim, from a different angle
 * each time.
 */

const RUN = isDatabaseConfigured();
const WS = "99999999-9999-4999-8999-999999999999";
const OWNER = "99999999-9999-4999-8999-999999999001";
const ADMIN = "99999999-9999-4999-8999-999999999002";
const CREATOR = "99999999-9999-4999-8999-999999999003";

const ownerActor: Actor = {
  memberId: OWNER, workspaceId: WS, email: "owner@example.com", role: "owner",
};

before(async () => {
  if (!RUN) return;
  await eraseWorkspace(WS, "test setup");
});

after(async () => {
  if (!RUN) return;
  await eraseWorkspace(WS, "test teardown");
  await closeDb();
});

beforeEach(async () => {
  if (!RUN) return;
  await eraseWorkspace(WS, "test reset");
  const db = getDb();
  await db.insert(s.workspaces).values({ id: WS, slug: "session-test", name: "Session Test" });
  await db.insert(s.members).values([
    { id: OWNER, workspaceId: WS, name: "Owner", email: "owner@example.com", role: "owner" },
    { id: ADMIN, workspaceId: WS, name: "Admin", email: "admin@example.com", role: "admin" },
    { id: CREATOR, workspaceId: WS, name: "Creator", email: "creator@example.com", role: "creator" },
  ]);
});

// --- the cookie (no database needed) ---------------------------------------

describe("the session cookie", () => {
  it("is HttpOnly, SameSite=Lax and scoped to the whole site", () => {
    const cookie = serializeSessionCookie("abc");
    // HttpOnly turns an XSS from an account takeover into a very bad day.
    assert.match(cookie, /HttpOnly/);
    // Lax, not Strict: a link from email should arrive signed in, and Lax
    // still withholds the cookie from cross-site writes.
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    // No Domain, ever — that is what lets a subdomain set the parent's
    // session cookie.
    assert.equal(/Domain=/.test(cookie), false);
  });

  it("carries no Max-Age, so the database owns the lifetime", () => {
    // A cookie that outlives its row merely fails. A cookie that outlives a
    // revocation would be a security bug.
    assert.equal(/Max-Age/.test(serializeSessionCookie("abc")), false);
    assert.match(clearSessionCookie(), /Max-Age=0/);
  });

  it("reads its own value back out of a crowded cookie header", () => {
    const request = new Request("https://app.test/", {
      headers: { cookie: `ph_id=x; demoriff_session=tok.en=; other=1` },
    });
    assert.equal(readSessionCookie(request), "tok.en=");
  });

  it("refuses a cross-site write and allows a same-site one", () => {
    const from = (origin: string | null) =>
      new Request("https://app.test/api/x", {
        method: "POST",
        headers: origin ? { origin } : {},
      });

    assert.equal(originAllowed(from("https://evil.test"), ["https://app.test"]), false);
    assert.equal(originAllowed(from("https://app.test"), ["https://app.test"]), true);
    // No Origin at all is a server-to-server call, which authenticates with
    // a key rather than a cookie and is not what CSRF is about.
    assert.equal(originAllowed(from(null), ["https://app.test"]), true);
  });
});

// --- against a real database -----------------------------------------------

describe("sessions", { skip: RUN ? false : "DATABASE_URL not set" }, () => {
  it("never stores the token it hands out", async () => {
    const { token, session } = await issue({ memberId: OWNER, workspaceId: WS });

    const [row] = await getDb().select().from(s.sessions).where(eq(s.sessions.id, session.id));
    // A leaked backup gives the reader hashes, not live sessions for every
    // customer in the system.
    assert.equal(row.tokenHash, hashToken(token));
    assert.equal(row.tokenHash.includes(token), false);
    assert.equal(JSON.stringify(session).includes(token), false);
  });

  it("resolves a valid token to the member holding it", async () => {
    const { token } = await issue({ memberId: ADMIN, workspaceId: WS });
    const verdict = await verify(token);

    assert.equal(verdict.ok, true);
    if (!verdict.ok) return;
    assert.equal(verdict.actor.memberId, ADMIN);
    assert.equal(verdict.actor.role, "admin");
  });

  it("refuses an unknown, empty or tampered token", async () => {
    const { token } = await issue({ memberId: OWNER, workspaceId: WS });
    assert.deepEqual(await verify(null), { ok: false, reason: "unknown" });
    assert.deepEqual(await verify(""), { ok: false, reason: "unknown" });
    assert.deepEqual(await verify(`${token}x`), { ok: false, reason: "unknown" });
  });

  it("ends a revoked session at once, not at its expiry", async () => {
    const { token, session } = await issue({ memberId: ADMIN, workspaceId: WS });
    assert.equal((await verify(token)).ok, true);

    await revoke(session.id, "signed out");

    // The entire reason sessions are rows.
    assert.deepEqual(await verify(token), { ok: false, reason: "revoked" });
  });

  it("expires on idle and on an absolute ceiling", async () => {
    const { token } = await issue({ memberId: OWNER, workspaceId: WS });
    const later = new Date(Date.now() + IDLE_TIMEOUT_MS + 1000);
    assert.deepEqual(await verify(token, { now: later }), { ok: false, reason: "idle" });

    const { token: fresh, session } = await issue({ memberId: OWNER, workspaceId: WS });
    // Used constantly, but still not forever.
    await getDb()
      .update(s.sessions)
      .set({ absoluteExpiresAt: new Date(Date.now() - 1000), lastSeenAt: new Date() })
      .where(eq(s.sessions.id, session.id));
    assert.deepEqual(await verify(fresh), { ok: false, reason: "expired" });
  });

  it("keeps an active session alive by touching it", async () => {
    const { token, session } = await issue({ memberId: OWNER, workspaceId: WS });
    const before = new Date(Date.now() - 10 * 60 * 1000);
    await getDb().update(s.sessions).set({ lastSeenAt: before }).where(eq(s.sessions.id, session.id));

    await verify(token);
    const [row] = await getDb().select().from(s.sessions).where(eq(s.sessions.id, session.id));
    assert.equal(row.lastSeenAt.getTime() > before.getTime(), true);
  });

  it("does not write to the database on every request", async () => {
    const { token, session } = await issue({ memberId: OWNER, workspaceId: WS });
    const [before] = await getDb().select().from(s.sessions).where(eq(s.sessions.id, session.id));

    // An active tab polling every few seconds must not become a write per
    // request on the hot path.
    await verify(token, { touchAfterMs: 60_000 });
    const [after] = await getDb().select().from(s.sessions).where(eq(s.sessions.id, session.id));
    assert.equal(after.lastSeenAt.getTime(), before.lastSeenAt.getTime());
  });

  it("rotation kills the old token and issues a working one", async () => {
    const { token: original, session } = await issue({ memberId: OWNER, workspaceId: WS });
    const rotated = await rotate(session.id, "privilege change");

    assert.notEqual(rotated, null);
    // Session fixation: a token planted before authentication is dead after.
    assert.deepEqual(await verify(original), { ok: false, reason: "unknown" });
    assert.equal((await verify(rotated!.token)).ok, true);
    assert.equal(rotated!.session.id, session.id);
  });

  it("signs out everywhere, optionally keeping the session doing the asking", async () => {
    const keep = await issue({ memberId: ADMIN, workspaceId: WS });
    const others = await Promise.all([
      issue({ memberId: ADMIN, workspaceId: WS }),
      issue({ memberId: ADMIN, workspaceId: WS }),
    ]);

    const ended = await revokeAllForMember(ADMIN, "lost laptop", { except: keep.session.id });
    assert.equal(ended, 2);
    assert.equal((await verify(keep.token)).ok, true);
    for (const other of others) assert.equal((await verify(other.token)).ok, false);
  });

  it("lists live sessions and leaves dead ones out", async () => {
    const live = await issue({ memberId: ADMIN, workspaceId: WS });
    const dead = await issue({ memberId: ADMIN, workspaceId: WS });
    await revoke(dead.session.id, "signed out");

    const listed = await listForMember(ADMIN);
    assert.deepEqual(listed.map((session) => session.id), [live.session.id]);
  });

  it("sweeps only sessions that can no longer authenticate anyone", async () => {
    const live = await issue({ memberId: OWNER, workspaceId: WS });
    const ancient = await issue({ memberId: OWNER, workspaceId: WS });
    await getDb()
      .update(s.sessions)
      .set({ absoluteExpiresAt: new Date(Date.now() - ABSOLUTE_TIMEOUT_MS) })
      .where(eq(s.sessions.id, ancient.session.id));

    const swept = await sweep();
    assert.equal(swept >= 1, true);
    assert.equal((await verify(live.token)).ok, true);
  });

  // --- the governance payoff -----------------------------------------------

  it("deactivating a member ends their live sessions immediately", async () => {
    const theirs = await Promise.all([
      issue({ memberId: CREATOR, workspaceId: WS }),
      issue({ memberId: CREATOR, workspaceId: WS }),
    ]);
    assert.equal((await verify(theirs[0].token)).ok, true);

    const result = await deactivate({ actor: ownerActor, memberId: CREATOR });

    assert.equal(result.sessionsEnded, 2);
    // Offboarding that leaves somebody signed in for twelve hours is not
    // offboarding.
    for (const session of theirs) {
      assert.deepEqual(await verify(session.token), { ok: false, reason: "revoked" });
    }
  });

  it("a deactivated account cannot use a session that somehow survived", async () => {
    const { token } = await issue({ memberId: CREATOR, workspaceId: WS });
    // Deactivate the row directly, bypassing the revocation path, to prove
    // verification checks the account and not only the session.
    await getDb().update(s.members).set({ deactivatedAt: new Date() }).where(eq(s.members.id, CREATOR));

    assert.deepEqual(await verify(token), { ok: false, reason: "deactivated" });
  });

  it("changing a role ends the sessions carrying the old one", async () => {
    const { token } = await issue({ memberId: ADMIN, workspaceId: WS });

    await changeRole({ actor: ownerActor, memberId: ADMIN, nextRole: "viewer" });

    // A demotion that leaves the person holding admin for hours is a
    // demotion in name only.
    assert.deepEqual(await verify(token), { ok: false, reason: "revoked" });
  });

  it("refuses to leave a workspace without an owner", async () => {
    // A workspace with no owner has nobody who can change billing, revoke a
    // voice, or delete it — a state only support can fix, so a button must
    // not reach it.
    await assert.rejects(
      () => changeRole({ actor: ownerActor, memberId: OWNER, nextRole: "admin" }),
      (error: unknown) => error instanceof MemberChangeError && error.reason === "cannot-change-own-role",
    );

    const second: Actor = { ...ownerActor, memberId: ADMIN, email: "admin@example.com" };
    await getDb().update(s.members).set({ role: "owner" }).where(eq(s.members.id, ADMIN));
    await assert.rejects(
      () => changeRole({ actor: second, memberId: OWNER, nextRole: "viewer" }).then(() =>
        changeRole({ actor: { ...second, role: "owner" }, memberId: ADMIN, nextRole: "viewer" }),
      ),
      (error: unknown) => error instanceof MemberChangeError,
    );
  });

  it("will not let anyone deactivate themselves", async () => {
    await assert.rejects(
      () => deactivate({ actor: ownerActor, memberId: OWNER }),
      (error: unknown) => error instanceof MemberChangeError && error.reason === "cannot-deactivate-self",
    );
  });

  it("records the change and how many sessions it ended", async () => {
    await issue({ memberId: CREATOR, workspaceId: WS });
    await deactivate({ actor: ownerActor, memberId: CREATOR });

    const { list } = await import("@/lib/audit/log");
    const entries = await list(WS, { limit: 5 });
    const entry = entries.find((e) => e.action === "member.deactivated");
    assert.notEqual(entry, undefined);
    assert.equal((entry!.metadata as { sessionsEnded: number }).sessionsEnded, 1);
  });
});
