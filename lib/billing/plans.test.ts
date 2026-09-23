import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLAN_CATALOGUE, formatPrice, includedSeconds, normalizePlan, priceCents, projectLimit } from "./plans";

describe("the plan catalogue", () => {
  it("reads a plan that no longer exists as Studio, and nonsense as Free", () => {
    assert.equal(normalizePlan("team"), "studio");
    assert.equal(normalizePlan("starter"), "studio");
    assert.equal(normalizePlan("byok"), "byok");
    assert.equal(normalizePlan("gold"), "free");
  });

  it("grows Studio's projects and minutes by the pack", () => {
    assert.equal(projectLimit("studio", 0), 10);
    assert.equal(projectLimit("studio", 2), 30);
    assert.equal(includedSeconds("studio", 2), (150 + 2 * 75) * 60);
    assert.equal(priceCents("studio", 2), 9_900 + 2 * 4_900);
    assert.equal(projectLimit("byok", 5), null, "packs mean nothing on an unlimited plan");
    assert.equal(includedSeconds("byok", 5), 1_000 * 60);
  });

  it("prints prices the way the page says them", () => {
    assert.equal(formatPrice("free"), "Free");
    assert.equal(formatPrice("byok"), "$240/yr");
    assert.equal(formatPrice("studio"), "$99/mo");
    assert.equal(formatPrice("studio", 1), "$148/mo");
    assert.equal(formatPrice("enterprise"), "Quoted");
  });

  it("stops Free at its allowance and lets paid plans run into overage", () => {
    assert.equal(PLAN_CATALOGUE.free.overageCentsPerSecond, null);
    assert.ok(PLAN_CATALOGUE.studio.overageCentsPerSecond! > 0);
    assert.ok(PLAN_CATALOGUE.byok.overageCentsPerSecond! > 0);
  });

  it("keeps the own-keys plan free of AI caps, and Free capped", () => {
    assert.equal(PLAN_CATALOGUE.byok.ai.suggestionsPerPeriod, null);
    assert.equal(PLAN_CATALOGUE.byok.ai.ownKeys, true);
    assert.ok(PLAN_CATALOGUE.free.ai.suggestionsPerPeriod! > 0);
    assert.equal(PLAN_CATALOGUE.free.features.agent, false);
  });
});
