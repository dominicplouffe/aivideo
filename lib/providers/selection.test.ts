import assert from "node:assert/strict";
import test from "node:test";

/**
 * Provider selection reads `process.env` once and caches the answer, so each
 * case here sets the environment, clears the cache through `setProviders`,
 * and puts the environment back afterwards.
 */
const KEYS = [
  "DEMORIFF_PROVIDERS",
  "DEEPGRAM_API_KEY",
  "ELEVENLABS_API_KEY",
  "ANTHROPIC_API_KEY",
  "DEMORIFF_WORKSPACE_ID",
  "DATABASE_URL",
] as const;

async function withEnv<T>(
  env: Partial<Record<(typeof KEYS)[number], string>>,
  body: (mod: typeof import("./index")) => Promise<T> | T,
): Promise<T> {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, env);

  const mod = await import("./index");
  mod.setProviders(null);
  try {
    return await body(mod);
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key]!;
    }
    mod.setProviders(null);
  }
}

test("one vendor key lights up that capability and only that one", async () => {
  await withEnv({ DEEPGRAM_API_KEY: "dg-key" }, (mod) => {
    const providers = mod.getProviders();
    assert.equal(providers.transcription.name, "deepgram-transcription");
    // This is the whole point of the change: the old all-or-nothing gate
    // meant a Deepgram key alone bought you nothing at all.
    assert.equal(providers.synthesis.name, "mock-synthesis");
    assert.equal(providers.translation.name, "mock-translation");
  });
});

test("the report names what is missing, per capability", async () => {
  await withEnv({ DEEPGRAM_API_KEY: "dg-key" }, (mod) => {
    const report = mod.providerReport();
    const transcription = report.find((r) => r.capability === "transcription");
    const synthesis = report.find((r) => r.capability === "synthesis");

    assert.equal(transcription?.live, true);
    assert.deepEqual(transcription?.missing, []);
    assert.equal(synthesis?.live, false);
    assert.deepEqual(synthesis?.missing, ["ELEVENLABS_API_KEY", "DEMORIFF_WORKSPACE_ID"]);
  });
});

test("no credentials at all still yields a working app", async () => {
  await withEnv({}, (mod) => {
    const report = mod.providerReport();
    assert.ok(report.length > 0);
    assert.ok(report.every((entry) => !entry.live));
    // Every slot is filled. A missing key degrades a capability; it never
    // leaves an undefined where a provider should be.
    const providers = mod.getProviders();
    for (const name of ["transcription", "synthesis", "translation", "masking", "render"] as const) {
      assert.ok(providers[name], `${name} has a provider`);
    }
  });
});

test("mock mode refuses a vendor even when its key is present", async () => {
  await withEnv({ DEMORIFF_PROVIDERS: "mock", DEEPGRAM_API_KEY: "dg-key" }, (mod) => {
    assert.equal(mod.getProviders().transcription.name, "mock-transcription");
  });
});

test("live mode refuses to start rather than mocking quietly", async () => {
  await withEnv({ DEMORIFF_PROVIDERS: "live", DEEPGRAM_API_KEY: "dg-key" }, (mod) => {
    assert.throws(
      () => mod.getProviders(),
      /ELEVENLABS_API_KEY/,
      "the error names every credential that is missing, not the first",
    );
  });
});

test("live mode with everything set uses every vendor", async () => {
  await withEnv(
    {
      DEMORIFF_PROVIDERS: "live",
      DEEPGRAM_API_KEY: "dg",
      ELEVENLABS_API_KEY: "el",
      ANTHROPIC_API_KEY: "an",
      DEMORIFF_WORKSPACE_ID: "11111111-1111-4111-8111-111111111111",
      DATABASE_URL: "postgres://nowhere/db",
    },
    (mod) => {
      const report = mod.providerReport();
      assert.ok(report.every((entry) => entry.live), JSON.stringify(report));
    },
  );
});

test("a blank key is a missing key", async () => {
  // `DEEPGRAM_API_KEY=` in a .env file is the most common way to have a
  // variable set to nothing, and constructing an adapter with it fails at
  // the first request rather than here.
  await withEnv({ DEEPGRAM_API_KEY: "   " }, (mod) => {
    assert.equal(mod.getProviders().transcription.name, "mock-transcription");
  });
});
