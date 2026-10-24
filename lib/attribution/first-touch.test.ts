import { test } from "node:test";
import assert from "node:assert/strict";
import {
  currentFirstTouch,
  firstTouchMetadata,
  firstTouchParams,
  parseFirstTouch,
  sanitizeFirstTouch,
  withFirstTouch,
} from "./first-touch";
import { issueState, verifyState } from "@/lib/auth/identity/state";

test("parseFirstTouch reads UTM, dr_* and referrer tags and drops the rest", () => {
  const touch = parseFirstTouch(
    new URLSearchParams("utm_source=getdemoriff-co&utm_medium=outbound-email&utm_campaign=2611-pmm&dr_seq=s01&dr_step=2&plan=studio&email=a@b.com"),
  );
  assert.deepEqual(touch, {
    utm_source: "getdemoriff-co",
    utm_medium: "outbound-email",
    utm_campaign: "2611-pmm",
    dr_seq: "s01",
    dr_step: "2",
  });
  assert.equal(parseFirstTouch(new URLSearchParams("plan=studio")), undefined);
});

test("parseFirstTouch refuses unsafe values: personal data, paths in referrers, foreign landing paths", () => {
  const touch = parseFirstTouch(
    new URLSearchParams({ utm_source: "jane@acme.com", utm_term: "demo video tool", ft_ref: "https://www.google.com/search?q=x", ft_lp: "//evil.example" }),
  );
  assert.deepEqual(touch, { utm_term: "demo+video+tool", referrer_origin: "https://www.google.com" });
  assert.equal(parseFirstTouch(new URLSearchParams({ ft_ref: "javascript:alert(1)" })), undefined);
  assert.equal(parseFirstTouch(new URLSearchParams({ utm_source: "x".repeat(300) }))?.utm_source?.length, 100);
});

test("currentFirstTouch adds an external referrer origin and the landing path, ignores our own referrer", () => {
  assert.deepEqual(currentFirstTouch("https://demoriff.com/compare/loom?utm_source=test", "https://news.ycombinator.com/item?id=1"), {
    utm_source: "test",
    referrer_origin: "https://news.ycombinator.com",
    landing_path: "/compare/loom",
  });
  assert.equal(currentFirstTouch("https://demoriff.com/pricing", "https://demoriff.com/"), undefined);
  // Arrived on /pricing by a carried link: keeps the first landing path, not /pricing.
  assert.deepEqual(currentFirstTouch("https://demoriff.com/pricing?utm_source=test&ft_lp=%2F", "https://demoriff.com/"), {
    utm_source: "test",
    landing_path: "/",
  });
});

test("withFirstTouch carries the tags on a link without overwriting what it has", () => {
  const href = withFirstTouch("/signup?plan=studio", { utm_source: "test", landing_path: "/" });
  assert.equal(href, "/signup?plan=studio&utm_source=test&ft_lp=%2F");
  assert.equal(withFirstTouch("/signup?utm_source=keep", { utm_source: "test" }), "/signup?utm_source=keep");
  assert.equal(withFirstTouch("/pricing", undefined), "/pricing");
  assert.equal(firstTouchParams({ utm_source: "test" }).toString(), "utm_source=test");
});

test("first touch survives the signed sign-in state and junk in it is dropped", () => {
  const { state, nonce } = issueState({ next: "/app", firstTouch: { utm_source: "test", utm_medium: "<script>" } as never });
  const verdict = verifyState(state, nonce);
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.ok && verdict.payload.firstTouch, { utm_source: "test" });
  const none = verifyState(issueState({ next: "/app" }).state, undefined);
  assert.equal(none.ok, false);
  assert.equal(sanitizeFirstTouch("utm_source=test"), undefined);
});

test("firstTouchMetadata prefixes keys for Stripe", () => {
  assert.deepEqual(firstTouchMetadata({ utm_source: "test", referrer_origin: "https://g.co" }), {
    ft_utm_source: "test",
    ft_referrer_origin: "https://g.co",
  });
  assert.deepEqual(firstTouchMetadata(null), {});
});
