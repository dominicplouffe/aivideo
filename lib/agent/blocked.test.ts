import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockedHosts, isTracker } from "./blocked";

describe("blockedHosts", () => {
  const trail = [
    { kind: "refused", url: "https://o944803.ingest.us.sentry.io/api/1/envelope/", refusedReason: "fetch: not-allowed" },
    { kind: "refused", url: "https://o944803.ingest.us.sentry.io/api/1/envelope/", refusedReason: "fetch: not-allowed" },
    { kind: "refused", url: "https://clio.growthvectors.io/api/auth/login", refusedReason: "xhr: not-allowed" },
    { kind: "refused", url: "https://js.stripe.com/v3", refusedReason: "script: not-allowed" },
    { kind: "refused", url: "https://www.googletagmanager.com/gtm.js", refusedReason: "script: not-allowed" },
    { kind: "navigate", url: "https://qore.gotrellis.com/login" },
  ];

  it("puts the app's own services first and marks analytics as such", () => {
    const hosts = blockedHosts(trail, []);
    assert.deepEqual(hosts.map((h) => h.origin), [
      "https://clio.growthvectors.io",
      "https://js.stripe.com",
      "https://o944803.ingest.us.sentry.io",
      "https://www.googletagmanager.com",
    ]);
    assert.equal(hosts[0].tracker, false);
    assert.deepEqual(hosts[0].kinds, ["xhr"]);
    assert.equal(hosts.find((h) => h.origin.includes("sentry"))?.count, 2);
    assert.equal(hosts.find((h) => h.origin.includes("sentry"))?.tracker, true);
  });

  it("leaves out what the run already allows", () => {
    assert.equal(blockedHosts(trail, ["https://clio.growthvectors.io"]).some((h) => h.origin.includes("growthvectors")), false);
  });

  it("does not take an app's API for a tracker", () => {
    assert.equal(isTracker("https://api.acme.com"), false);
    assert.equal(isTracker("https://api-js.mixpanel.com"), true);
  });
});
