import assert from "node:assert/strict";
import test from "node:test";
import { checkDestination } from "./destinations";

/**
 * The destination check is the only thing standing between a customer-typed
 * URL and a worker that sits on the private network next to the database and
 * the storage credentials. These tests are the list of ways people get past
 * checks like it.
 */

const NEVER = async () => {
  throw new Error("DNS must not be consulted for a literal address");
};

test("only https gets through, unless insecure delivery is opted into", async () => {
  for (const url of [
    "file:///etc/passwd",
    "gopher://internal:70/x",
    "ftp://internal/x",
    "http://hooks.example/x",
    // Not a URL at all.
    "hooks.example/x",
    "",
  ]) {
    const verdict = await checkDestination(url, { resolve: NEVER });
    assert.equal(verdict.ok, false, url);
  }

  const relaxed = await checkDestination("http://hooks.example/x", {
    allowInsecure: true,
    resolve: async () => ["93.184.216.34"],
  });
  assert.equal(relaxed.ok, true);
});

test("a literal private address is refused without asking DNS", async () => {
  const cases = [
    "https://127.0.0.1/x",
    "https://127.1.2.3/x",
    "https://0.0.0.0/x",
    "https://10.1.2.3/x",
    "https://172.16.0.1/x",
    "https://172.31.255.255/x",
    "https://192.168.1.1/x",
    // The one that matters most: cloud instance metadata.
    "https://169.254.169.254/latest/meta-data/iam/security-credentials/",
    // Carrier-grade NAT, which is a private range people forget.
    "https://100.64.0.1/x",
    "https://239.0.0.1/x",
    "https://[::1]/x",
    "https://[::]/x",
    "https://[fe80::1]/x",
    "https://[fd00::1]/x",
    "https://[fc00::1]/x",
    // An IPv4 address wearing a hat.
    "https://[::ffff:169.254.169.254]/x",
    "https://[::ffff:127.0.0.1]/x",
  ];

  for (const url of cases) {
    const verdict = await checkDestination(url, { resolve: NEVER });
    assert.equal(verdict.ok, false, url);
    assert.equal(verdict.ok === false && verdict.reason, "private", url);
  }
});

test("a public literal address is allowed, and comes back to be pinned", async () => {
  const verdict = await checkDestination("https://93.184.216.34/x", { resolve: NEVER });
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.ok && verdict.addresses, ["93.184.216.34"]);
});

test("every resolved address is checked, not just the first", async () => {
  // A hostname with one public and one private record is the oldest way past
  // a filter that stops reading at the first answer.
  const split = await checkDestination("https://hooks.example/x", {
    resolve: async () => ["93.184.216.34", "127.0.0.1"],
  });
  assert.equal(split.ok, false);
  assert.equal(split.ok === false && split.reason, "private");

  const reversed = await checkDestination("https://hooks.example/x", {
    resolve: async () => ["127.0.0.1", "93.184.216.34"],
  });
  assert.equal(reversed.ok, false);
});

test("a hostname that does not resolve is refused rather than dialled", async () => {
  const empty = await checkDestination("https://hooks.example/x", { resolve: async () => [] });
  assert.equal(empty.ok === false && empty.reason, "unresolvable");

  const broken = await checkDestination("https://hooks.example/x", {
    resolve: async () => {
      throw new Error("NXDOMAIN");
    },
  });
  assert.equal(broken.ok === false && broken.reason, "unresolvable");
});

test("a public hostname passes, and hands back the addresses it verified", async () => {
  const verdict = await checkDestination("https://hooks.example/path?q=1", {
    resolve: async () => ["93.184.216.34", "93.184.216.35"],
  });
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.ok && verdict.addresses, ["93.184.216.34", "93.184.216.35"]);
  // The parsed URL comes back too, so the caller never re-parses the string
  // and never gets a different answer the second time.
  assert.equal(verdict.ok && verdict.url.pathname, "/path");
});
