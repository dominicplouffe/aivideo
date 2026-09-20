import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, getDb, isDatabaseConfigured } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { eraseWorkspace } from "@/lib/db/erase";
import { listForMember } from "../sessions";
import { MockSso, encode } from "./mock";
import { domainAllowed, provision, roleFor } from "./provisioning";
import {
  clearNonceCookie, issueState, readNonceCookie, safeNext, serializeNonceCookie, verifyState,
} from "./state";

/**
 * Single sign-on has two failure modes that matter, and they are different
 * shapes of the same question: *who decided this?*
 *
 * The callback must only accept a code this server sent this browser for —
 * otherwise a victim ends up signed into somebody else's account. And the
 * assertion must only be able to create a member in the workspace whose
 * administrator connected that identity provider — otherwise proving control
 * of an email domain is enough to join a stranger's tenant.
 */

const RUN = isDatabaseConfigured();
const WS = "77777777-7777-4777-8777-777777777777";
const OTHER_WS = "77777777-7777-4777-8777-777777777778";
const CONNECTION = "conn_meridian";
const OWNER = "77777777-7777-4777-8777-777777777001";

// --- state, nonce and the return path (no database needed) -----------------

describe("the state parameter", () => {
  it("round-trips when the nonce matches the browser's cookie", () => {
    const { state, nonce } = issueState({ next: "/app/projects", connectionId: CONNECTION });
    const verdict = verifyState(state, nonce);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.ok && verdict.payload.next, "/app/projects");
    assert.equal(verdict.ok && verdict.payload.connectionId, CONNECTION);
  });

  it("is refused when it is signed but presented by a different browser", () => {
    // This is the whole of login CSRF: the attacker starts a flow, holds the
    // code, and gets the victim's browser to load the callback. Their state
    // is perfectly well signed — it is simply not the victim's.
    const { state } = issueState({ next: "/app" });
    const somebodyElse = issueState({ next: "/app" }).nonce;
    assert.equal(verifyState(state, somebodyElse).ok, false);
    assert.equal(verifyState(state, null).ok, false);
  });

  it("is refused when the payload is edited", () => {
    const { state, nonce } = issueState({ next: "/app" });
    const [body, signature] = state.split(".");
    const edited = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), next: "/admin" }),
    ).toString("base64url");
    const verdict = verifyState(`${edited}.${signature}`, nonce);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok === false && verdict.reason, "signature");
  });

  it("expires, so one captured from a log is not useful later", () => {
    const { state, nonce } = issueState({ next: "/app" });
    const elevenMinutes = Date.now() + 11 * 60 * 1000;
    const verdict = verifyState(state, nonce, elevenMinutes);
    assert.equal(verdict.ok === false && verdict.reason, "expired");
  });

  it("refuses a malformed value rather than throwing", () => {
    for (const bad of [null, "", "nosignature", ".", "a.b.c"]) {
      assert.equal(verifyState(bad, "nonce").ok, false);
    }
  });
});

describe("the return path", () => {
  it("keeps a same-site path", () => {
    assert.equal(safeNext("/app/projects?tab=ready"), "/app/projects?tab=ready");
  });

  it("discards anything that could leave the site", () => {
    // A post-login redirect is exactly what phishing wants: the person has
    // just been told to trust what they are looking at.
    for (const hostile of [
      "https://evil.example/app",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "app/projects",
      "",
      null,
    ]) {
      assert.equal(safeNext(hostile), "/app", String(hostile));
    }
  });
});

describe("the nonce cookie", () => {
  it("is HttpOnly, Lax and scoped to the flow that uses it", () => {
    const cookie = serializeNonceCookie("abc");
    assert.match(cookie, /HttpOnly/);
    // Lax, not Strict: the callback is a top-level navigation from the
    // identity provider, and Strict would withhold the cookie from it —
    // the flow would fail for everybody, every time.
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\/api\/auth\/sso/);
  });

  it("is read back from a request, and cleared with a zero Max-Age", () => {
    const request = new Request("https://demoriff.com/api/auth/sso/callback", {
      headers: { cookie: `other=1; ${serializeNonceCookie("xyz").split(";")[0]}` },
    });
    assert.equal(readNonceCookie(request), "xyz");
    assert.match(clearNonceCookie(), /Max-Age=0/);
  });
});

// --- role mapping (no database needed) -------------------------------------

describe("the role an assertion earns", () => {
  const connection = {
    defaultRole: "viewer" as const,
    roleMappings: { "demo-admins": "admin", engineering: "creator", everyone: "viewer" },
  };

  it("falls back to the connection's default when the directory says nothing", () => {
    assert.equal(roleFor(connection, []), "viewer");
    assert.equal(roleFor(connection, ["sales"]), "viewer");
  });

  it("takes the most privileged mapping, not the first listed", () => {
    // Somebody in both groups should get the admin role regardless of the
    // order the directory happened to send them in.
    assert.equal(roleFor(connection, ["engineering", "demo-admins"]), "admin");
    assert.equal(roleFor(connection, ["demo-admins", "engineering"]), "admin");
  });

  it("never grants ownership from a group name", () => {
    // Ownership is a billing and deletion relationship. A directory
    // administrator must not be able to take a workspace from the person
    // paying for it by renaming a group.
    const owning = { defaultRole: "viewer" as const, roleMappings: { anything: "owner" } };
    assert.equal(roleFor(owning, ["anything"]), "viewer");
  });

  it("ignores a mapping to a role this product does not have", () => {
    const nonsense = { defaultRole: "viewer" as const, roleMappings: { g: "superuser" } };
    assert.equal(roleFor(nonsense, ["g"]), "viewer");
  });
});

describe("the claimed-domain check", () => {
  it("treats an empty list as no domains, not every domain", () => {
    // An allowlist that fails open is not an allowlist.
    assert.equal(domainAllowed({ domains: [] }, "anyone@anywhere.com"), false);
  });

  it("matches the domain exactly, case-insensitively", () => {
    const connection = { domains: ["meridian.com"] };
    assert.equal(domainAllowed(connection, "sam@Meridian.com"), true);
    assert.equal(domainAllowed(connection, "sam@notmeridian.com"), false);
    assert.equal(domainAllowed(connection, "sam@meridian.com.evil.example"), false);
    // The domain is what follows the *last* `@`, which is how an address is
    // actually split. Reading up to the first one instead would let a
    // quoted local part carry a domain of its own past the check.
    assert.equal(domainAllowed(connection, '"sam@evil.example"@meridian.com'), true);
    assert.equal(domainAllowed(connection, '"sam@meridian.com"@evil.example'), false);
  });
});

// --- the mock provider (no database needed) --------------------------------

describe("the development identity provider", () => {
  it("returns an id that is stable for an address", async () => {
    const provider = new MockSso(CONNECTION);
    const first = await provider.exchange(encode({ email: "a@b.com", connectionId: CONNECTION, groups: [] }));
    const second = await provider.exchange(encode({ email: "a@b.com", connectionId: CONNECTION, groups: [] }));
    assert.equal(first.externalId, second.externalId);
    assert.notEqual(first.externalId, "");
  });

  it("refuses a code it did not issue", async () => {
    await assert.rejects(() => new MockSso(CONNECTION).exchange("not-a-code"));
  });
});

// --- provisioning (database) -----------------------------------------------

describe("provisioning through a connection", { skip: !RUN }, () => {
  before(async () => {
    await eraseWorkspace(WS, "test setup");
    await eraseWorkspace(OTHER_WS, "test setup");
  });

  after(async () => {
    await eraseWorkspace(WS, "test teardown");
    await eraseWorkspace(OTHER_WS, "test teardown");
    await closeDb();
  });

  beforeEach(async () => {
    await eraseWorkspace(WS, "test reset");
    await eraseWorkspace(OTHER_WS, "test reset");
    const db = getDb();
    await db.insert(s.workspaces).values([
      { id: WS, slug: "sso-test", name: "SSO Test" },
      { id: OTHER_WS, slug: "sso-test-other", name: "Someone Else" },
    ]);
    await db.insert(s.members).values({
      id: OWNER, workspaceId: WS, name: "Owner", email: "owner@meridian.com", role: "owner",
    });
    await db.insert(s.ssoConnections).values({
      workspaceId: WS,
      connectionId: CONNECTION,
      domains: ["meridian.com"],
      defaultRole: "viewer",
      roleMappings: { "demo-admins": "admin" },
    });
  });

  const profile = (over: Partial<Parameters<typeof provision>[0]> = {}) => ({
    externalId: "idp_1",
    email: "sam@meridian.com",
    name: "Sam",
    connectionId: CONNECTION,
    groups: [] as string[],
    provider: "mock",
    ...over,
  });

  it("creates a member in the workspace that owns the connection", async () => {
    const result = await provision(profile());
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.created, true);
    assert.equal(result.ok && result.member.workspaceId, WS);
    // Least privilege by default: an account arriving from a directory
    // nobody has reviewed can watch demos, not publish them.
    assert.equal(result.ok && result.member.role, "viewer");
  });

  it("refuses a connection nobody has registered", async () => {
    const result = await provision(profile({ connectionId: "conn_attacker" }));
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "unknown-connection");
  });

  it("refuses an address at a domain the connection has not claimed", async () => {
    // Proving control of an identity provider is not the same claim as
    // owning this domain, so both are required before a row is written.
    const result = await provision(profile({ email: "mallory@gmail.com" }));
    assert.equal(result.ok === false && result.reason, "domain-not-claimed");
  });

  it("matches an existing member by directory id when their email changed", async () => {
    const first = await provision(profile());
    assert.equal(first.ok, true);

    const renamed = await provision(profile({ email: "sam.taylor@meridian.com" }));
    assert.equal(renamed.ok, true);
    assert.equal(renamed.ok && renamed.created, false);
    // One person, one member row. Matching on email alone would strand
    // everything the first account owned.
    assert.equal(renamed.ok && renamed.member.id, first.ok && first.member.id);
    assert.equal(renamed.ok && renamed.member.email, "sam.taylor@meridian.com");
  });

  it("applies a group mapping, and ends existing sessions when the role changes", async () => {
    const created = await provision(profile());
    assert.equal(created.ok, true);
    const memberId = created.ok ? created.member.id : "";

    const { issue } = await import("../sessions");
    await issue({ memberId, workspaceId: WS, ip: null, userAgent: null });
    assert.equal((await listForMember(memberId)).length, 1);

    const promoted = await provision(profile({ groups: ["demo-admins"] }));
    assert.equal(promoted.ok && promoted.member.role, "admin");
    assert.equal(promoted.ok && promoted.roleChanged, true);
    // A privilege change that only takes effect at the next sign-in takes
    // effect exactly when it matters least.
    assert.equal((await listForMember(memberId)).length, 0);
  });

  it("does not let a directory take a workspace from its owner", async () => {
    const result = await provision(
      profile({ email: "owner@meridian.com", externalId: "idp_owner", groups: ["demo-admins"] }),
    );
    assert.equal(result.ok && result.member.role, "owner");
  });

  it("does not reactivate somebody who was offboarded", async () => {
    const created = await provision(profile());
    assert.equal(created.ok, true);
    await getDb()
      .update(s.members)
      .set({ deactivatedAt: new Date() })
      .where(eq(s.members.id, created.ok ? created.member.id : ""));

    const result = await provision(profile());
    // An assertion from a directory that has not caught up is not consent
    // to undo an offboarding. SCIM reactivates; a login does not.
    assert.equal(result.ok === false && result.reason, "deactivated");
  });

  it("refuses an unknown person when the directory is the source of truth", async () => {
    await getDb()
      .update(s.ssoConnections)
      .set({ justInTime: false })
      .where(eq(s.ssoConnections.connectionId, CONNECTION));

    const result = await provision(profile({ email: "new@meridian.com", externalId: "idp_new" }));
    assert.equal(result.ok === false && result.reason, "no-just-in-time");
  });

  it("refuses every assertion once the connection is switched off", async () => {
    await getDb()
      .update(s.ssoConnections)
      .set({ disabledAt: new Date() })
      .where(eq(s.ssoConnections.connectionId, CONNECTION));

    const result = await provision(profile());
    assert.equal(result.ok === false && result.reason, "connection-disabled");
  });
});
