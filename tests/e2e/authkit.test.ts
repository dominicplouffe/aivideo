import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BASE, api, count, signUp, sql } from "./harness";

/**
 * The sign-in routes, driven the way a browser drives them.
 *
 * `lib/auth/identity/identity.test.ts` asserts the pieces — the signed state,
 * provisioning, the role mapping. These assert the thing they add up to,
 * including the two checks that only exist at the route: that a code is
 * useless without the nonce cookie it was issued alongside, and that a
 * workspace appears only when it should.
 */

/** Starts a flow and returns where it points and the cookie it set. */
async function begin(method: string, email: string) {
  const response = await api(
    `/api/auth/authkit?method=${method}&email=${encodeURIComponent(email)}`,
  );
  const location = response.headers.get("location") ?? "";
  const nonce = (response.headers.get("set-cookie") ?? "").split(";")[0];
  return { status: response.status, location, nonce };
}

/** Follows a started flow back into the callback. */
function complete(location: string, cookie: string) {
  const url = new URL(location);
  return api(url.pathname + url.search, { cookie });
}

test("a first sign-in creates a workspace and makes the person its owner", async () => {
  const email = `first-${randomUUID().slice(0, 8)}@e2e.test`;

  const started = await begin("google", email);
  assert.equal(started.status, 302);
  // The nonce is scoped to the flow's own path, so it is not sent anywhere else.
  assert.ok(started.nonce.startsWith("demoriff_sso="), started.nonce);

  const back = await complete(started.location, started.nonce);
  assert.equal(back.status, 302);
  assert.equal(new URL(back.headers.get("location") ?? "").pathname, "/app");

  const cookies = back.headers.getSetCookie?.() ?? [];
  const session = cookies.find((c) => c.startsWith("demoriff_session="));
  assert.ok(session, "the callback should set a session cookie");
  assert.match(session, /HttpOnly/);

  assert.equal(count(`select count(*) from members where email = '${email}'`), 1);
  assert.equal(sql(`select role from members where email = '${email}'`), "owner");
  assert.equal(
    sql(
      `select a.action from audit_events a
        join members m on m.workspace_id = a.workspace_id
       where m.email = '${email}' order by a.seq limit 1`,
    ),
    "workspace.created",
  );
});

test("a code is worthless without the cookie it was issued with", async () => {
  // The login-CSRF case. Without this an attacker starts a flow, gets a
  // valid code, and walks a victim into redeeming it — after which the
  // victim is signed into the attacker's account and typing into it.
  const email = `csrf-${randomUUID().slice(0, 8)}@e2e.test`;
  const started = await begin("google", email);

  const noCookie = await complete(started.location, "");
  assert.match(noCookie.headers.get("location") ?? "", /error=state-nonce/);

  const other = await begin("google", `other-${randomUUID().slice(0, 8)}@e2e.test`);
  const wrongCookie = await complete(started.location, other.nonce);
  assert.match(wrongCookie.headers.get("location") ?? "", /error=state-nonce/);

  assert.equal(
    count(`select count(*) from members where email = '${email}'`),
    0,
    "A refused callback must not have created anybody.",
  );
});

test("an edited state is refused on its signature", async () => {
  const email = `tamper-${randomUUID().slice(0, 8)}@e2e.test`;
  const started = await begin("google", email);

  const edited = await complete(started.location + "TAMPER", started.nonce);
  assert.match(edited.headers.get("location") ?? "", /error=state-signature/);
  assert.equal(count(`select count(*) from members where email = '${email}'`), 0);
});

test("the enterprise door refuses an address it cannot route", async () => {
  // No workspace claims this domain, so there is no identity provider to
  // send them to. Saying so beats a redirect that comes straight back.
  const started = await begin("sso", `nobody-${randomUUID().slice(0, 8)}@unclaimed.test`);
  assert.equal(started.status, 302);
  assert.match(started.location, /error=sso-connection-none/);
});

test("the enterprise door asks for an address before it can route one", async () => {
  const response = await api("/api/auth/authkit?method=sso");
  assert.match(response.headers.get("location") ?? "", /error=sso-email-required/);
});

test("signing out clears the cookie and ends the session row", async () => {
  const session = await signUp("logout");
  const before = count(
    `select count(*) from sessions where member_id = '${session.memberId}' and revoked_at is null`,
  );
  assert.equal(before, 1);

  const out = await api("/api/auth", { method: "DELETE", cookie: session.cookie });
  assert.equal(out.status, 200);
  assert.match(out.headers.get("set-cookie") ?? "", /Max-Age=0|Expires=/);

  assert.equal(
    count(
      `select count(*) from sessions where member_id = '${session.memberId}' and revoked_at is null`,
    ),
    0,
    "Signing out should revoke the row, not only drop the cookie.",
  );

  // And the cookie no longer opens anything.
  const after = await api("/app", { cookie: session.cookie });
  assert.equal(after.status, 307, "A revoked session should be sent back to sign in.");
});

test("the three buttons are three different destinations", async () => {
  // They were one. All three called an endpoint that resolved a SAML
  // connection from the email domain, so "Continue with Google" involved
  // Google in no way at all.
  const html = await (await api("/signin")).text();
  for (const label of ["Continue with Google", "Continue with Microsoft", "Continue with SSO"]) {
    assert.ok(html.includes(label), `${label} is missing from the sign-in page`);
  }

  const email = `buttons-${randomUUID().slice(0, 8)}@e2e.test`;
  const google = await begin("google", email);
  const microsoft = await begin("microsoft", email);
  assert.notEqual(google.location, microsoft.location);
  assert.ok(google.location.startsWith(BASE), "the mock keeps the flow local");
});
