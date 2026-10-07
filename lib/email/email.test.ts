import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { sendEmail } from "./index";
import { invitationEmail } from "./invitation";

const saved = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
afterEach(() => {
  for (const [name, value] of [["RESEND_API_KEY", saved.key], ["EMAIL_FROM", saved.from]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const email = { to: "a@example.com", subject: "Hi", text: "Hello", html: "<p>Hello</p>" };

describe("sending email", () => {
  it("sends nothing, and says so, without a key", async () => {
    delete process.env.RESEND_API_KEY;
    let called = false;
    const outcome = await sendEmail(email, (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch);
    assert.deepEqual(outcome, { sent: false, reason: "not-configured" });
    assert.equal(called, false);
  });

  it("posts to Resend with the key and the configured sender", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "DemoRiff <team@demoriff.com>";
    let seen: { url: string; init: RequestInit } | null = null;
    const outcome = await sendEmail(email, (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }) as unknown as typeof fetch);

    assert.deepEqual(outcome, { sent: true, id: "email_1" });
    assert.equal(seen!.url, "https://api.resend.com/emails");
    assert.equal((seen!.init.headers as Record<string, string>).Authorization, "Bearer re_test");
    const body = JSON.parse(String(seen!.init.body));
    assert.equal(body.from, "DemoRiff <team@demoriff.com>");
    assert.deepEqual(body.to, ["a@example.com"]);
  });

  it("reports a refusal with Resend's own message", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const outcome = await sendEmail(email, (async () =>
      new Response(JSON.stringify({ message: "The demoriff.com domain is not verified." }), { status: 403 })) as unknown as typeof fetch);
    assert.deepEqual(outcome, { sent: false, reason: "refused", detail: "The demoriff.com domain is not verified." });
  });
});

describe("the invitation email", () => {
  it("names who, where and as what, and escapes them in the HTML", () => {
    const message = invitationEmail({
      to: "nia@example.com",
      workspaceName: "Acme <Labs>",
      inviterName: "Olive",
      role: "admin",
      link: "https://demoriff.com/invite/abc",
      expiresAt: new Date("2026-10-14T12:00:00Z"),
    });
    assert.equal(message.subject, "Olive invited you to Acme <Labs> on DemoRiff");
    assert.match(message.text, /join Acme <Labs> on DemoRiff as an admin/);
    assert.match(message.text, /https:\/\/demoriff\.com\/invite\/abc/);
    assert.match(message.html, /Acme &lt;Labs&gt;/);
    assert.doesNotMatch(message.html, /Acme <Labs>/);
  });
});
