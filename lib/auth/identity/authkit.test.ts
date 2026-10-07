import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProviderError } from "@/lib/providers/errors";
import { WorkOsAuthKit, logoutUrl, sessionIdFrom } from "./authkit";

/**
 * The vendor adapter, against a stubbed transport.
 *
 * `api.workos.com` is not reachable from this repository's test environment,
 * so these assert the request we build and the response we map — the same
 * bargain every other vendor adapter here makes. They cannot tell you the
 * live call works; they can tell you that if the contract is what WorkOS
 * documents, this speaks it, and that a change to any field is caught.
 */

const KEY = "sk_test_key";
const CLIENT = "client_01ABC";

/** A transport that records what it was asked and answers with `body`. */
function stub(body: unknown, init: { status?: number } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, requestInit?: RequestInit) => {
    calls.push({ url: String(url), init: requestInit ?? {} });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const OK = {
  user: {
    id: "user_01XYZ",
    email: "Sam@Meridian.com",
    email_verified: true,
    first_name: "Sam",
    last_name: "Okonkwo",
  },
  organization_id: "org_01MER",
  authentication_method: "GoogleOAuth",
  access_token: "header." + Buffer.from(JSON.stringify({ sid: "session_01ABC" })).toString("base64url") + ".sig",
};

describe("the authorization url", () => {
  const kit = new WorkOsAuthKit(KEY, CLIENT);
  const base = { state: "state-value", redirectUri: "https://demoriff.com/cb" } as const;

  it("sends the browser to user management, not the old sso endpoint", () => {
    const url = new URL(kit.authorizationUrl({ ...base, method: "authkit" }));
    assert.equal(url.origin + url.pathname, "https://api.workos.com/user_management/authorize");
    assert.equal(url.searchParams.get("client_id"), CLIENT);
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("state"), "state-value");
    assert.equal(url.searchParams.get("redirect_uri"), "https://demoriff.com/cb");
  });

  it("names a different provider for each of the three buttons", () => {
    const provider = (method: "authkit" | "google" | "microsoft") =>
      new URL(kit.authorizationUrl({ ...base, method })).searchParams.get("provider");

    // The whole point. All three buttons used to produce the same URL.
    assert.equal(provider("google"), "GoogleOAuth");
    assert.equal(provider("microsoft"), "MicrosoftOAuth");
    assert.equal(provider("authkit"), "authkit");
  });

  it("pins the login to an organization instead of a provider when given one", () => {
    const url = new URL(
      kit.authorizationUrl({ ...base, method: "google", organizationId: "org_01MER" }),
    );
    assert.equal(url.searchParams.get("organization_id"), "org_01MER");
    // Sending both would mean the restriction we think we set is being
    // ignored in favour of the hosted pane.
    assert.equal(url.searchParams.get("provider"), null);
  });

  it("only asks for the sign-up pane where that pane exists", () => {
    const hosted = new URL(kit.authorizationUrl({ ...base, method: "authkit", intent: "sign-up" }));
    assert.equal(hosted.searchParams.get("screen_hint"), "sign-up");

    // Google has no such concept, and an organization login lands wherever
    // that organization says it does.
    const google = new URL(kit.authorizationUrl({ ...base, method: "google", intent: "sign-up" }));
    assert.equal(google.searchParams.get("screen_hint"), null);
  });
});

describe("the code exchange", () => {
  it("posts the code and the secret to the authenticate endpoint", async () => {
    const { impl, calls } = stub(OK);
    await new WorkOsAuthKit(KEY, CLIENT, impl).exchange("code_123");

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.workos.com/user_management/authenticate");
    assert.equal(calls[0].init.method, "POST");
    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(body, {
      client_id: CLIENT,
      client_secret: KEY,
      grant_type: "authorization_code",
      code: "code_123",
    });
  });

  it("maps the response onto a profile", async () => {
    const { impl } = stub(OK);
    const profile = await new WorkOsAuthKit(KEY, CLIENT, impl).exchange("code_123");

    assert.equal(profile.externalId, "user_01XYZ");
    // Normalised, because every lookup downstream compares it to a stored
    // address and a stored address is lower case.
    assert.equal(profile.email, "sam@meridian.com");
    assert.equal(profile.name, "Sam Okonkwo");
    assert.equal(profile.emailVerified, true);
    assert.equal(profile.authenticationMethod, "GoogleOAuth");
    assert.equal(profile.organizationId, "org_01MER");
    assert.equal(profile.sessionId, "session_01ABC");
  });

  it("falls back to the address when the provider sends no name", async () => {
    const { impl } = stub({ ...OK, user: { ...OK.user, first_name: null, last_name: null } });
    const profile = await new WorkOsAuthKit(KEY, CLIENT, impl).exchange("c");
    // Derived from the address as the provider wrote it, not the lower-cased
    // form. This is the name on a page header; "Sam" is what somebody wants
    // to be greeted by and "sam" is not.
    assert.equal(profile.name, "Sam");
  });

  it("treats a missing email_verified as unverified", async () => {
    // A missing field is not a reason to assume somebody owns an address,
    // and this value is the only thing standing in front of creating a
    // workspace for them.
    const { impl } = stub({ ...OK, user: { ...OK.user, email_verified: undefined } });
    const profile = await new WorkOsAuthKit(KEY, CLIENT, impl).exchange("c");
    assert.equal(profile.emailVerified, false);
  });

  it("has no organization for a self-serve login", async () => {
    const { impl } = stub({ ...OK, organization_id: null });
    const profile = await new WorkOsAuthKit(KEY, CLIENT, impl).exchange("c");
    // Absence is what routes this to signup rather than to a workspace.
    assert.equal(profile.organizationId, undefined);
  });

  it("carries the vendor's code through so the page can say what to do", async () => {
    for (const code of [
      "email_verification_required",
      "organization_selection_required",
      "mfa_enrollment",
      "sso_required",
    ]) {
      const { impl } = stub({ code, message: "..." }, { status: 403 });
      await assert.rejects(
        () => new WorkOsAuthKit(KEY, CLIENT, impl).exchange("c"),
        (error: unknown) => {
          assert.ok(error instanceof ProviderError);
          assert.equal(error.detail.code, code);
          // Not worth retrying: the person has to go and do something.
          assert.equal(error.retryable, false);
          return true;
        },
      );
    }
  });

  it("retries a 503 and does not retry a 400", async () => {
    const transient = stub("upstream is down", { status: 503 });
    await assert.rejects(
      () => new WorkOsAuthKit(KEY, CLIENT, transient.impl).exchange("c"),
      (error: unknown) => (error as ProviderError).retryable === true,
    );

    const permanent = stub("bad request", { status: 400 });
    await assert.rejects(
      () => new WorkOsAuthKit(KEY, CLIENT, permanent.impl).exchange("c"),
      (error: unknown) => (error as ProviderError).retryable === false,
    );
  });

  it("refuses a 200 with no usable user rather than inventing one", async () => {
    const { impl } = stub({ user: { id: "u" } });
    await assert.rejects(() => new WorkOsAuthKit(KEY, CLIENT, impl).exchange("c"));
  });

  it("needs both credentials before it will start", () => {
    const key = process.env.WORKOS_API_KEY;
    const client = process.env.WORKOS_CLIENT_ID;
    delete process.env.WORKOS_API_KEY;
    delete process.env.WORKOS_CLIENT_ID;
    try {
      assert.throws(() => WorkOsAuthKit.fromEnv(), /WORKOS_API_KEY/);
    } finally {
      if (key) process.env.WORKOS_API_KEY = key;
      if (client) process.env.WORKOS_CLIENT_ID = client;
    }
  });

  it("refuses a client id that is really the secret key", () => {
    const key = process.env.WORKOS_API_KEY;
    const client = process.env.WORKOS_CLIENT_ID;
    process.env.WORKOS_API_KEY = CLIENT;
    process.env.WORKOS_CLIENT_ID = KEY;
    try {
      assert.throws(() => WorkOsAuthKit.fromEnv(), /must start with client_/);
    } finally {
      if (key) process.env.WORKOS_API_KEY = key;
      else delete process.env.WORKOS_API_KEY;
      if (client) process.env.WORKOS_CLIENT_ID = client;
      else delete process.env.WORKOS_CLIENT_ID;
    }
  });
});

describe("the session id inside an access token", () => {
  it("reads the sid claim", () => {
    const token =
      "h." + Buffer.from(JSON.stringify({ sid: "session_9" })).toString("base64url") + ".s";
    assert.equal(sessionIdFrom(token), "session_9");
  });

  it("returns null rather than throwing on anything malformed", () => {
    for (const bad of [undefined, null, "", "not-a-jwt", "a.b", "a.!!!.c"]) {
      assert.equal(sessionIdFrom(bad), null);
    }
  });

  it("returns null when there is no sid to read", () => {
    const token = "h." + Buffer.from(JSON.stringify({ sub: "u" })).toString("base64url") + ".s";
    assert.equal(sessionIdFrom(token), null);
  });
});

describe("the logout url", () => {
  it("names the session to end and where to come back to", () => {
    const url = new URL(logoutUrl("session_9", "https://demoriff.com/signin"));
    assert.equal(url.origin + url.pathname, "https://api.workos.com/user_management/sessions/logout");
    assert.equal(url.searchParams.get("session_id"), "session_9");
    assert.equal(url.searchParams.get("return_to"), "https://demoriff.com/signin");
  });
});
