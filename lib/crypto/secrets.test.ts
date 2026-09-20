import assert from "node:assert/strict";
import test from "node:test";
import { SealedValueError, isSealed, open, seal } from "./secrets";

test("a sealed value comes back exactly as it went in", () => {
  for (const secret of ["hec-token-123", "", "🔑 unicode ✓", "a".repeat(4096)]) {
    assert.equal(open(seal(secret)), secret);
  }
});

test("the same plaintext seals differently every time", () => {
  // A fresh IV per message, always. Reusing one under GCM does not merely
  // leak equality — it exposes the authentication key.
  const a = seal("same");
  const b = seal("same");
  assert.notEqual(a, b);
  assert.equal(open(a), open(b));
});

test("an altered ciphertext is refused rather than decrypted to rubbish", () => {
  const sealed = seal("hec-token-123");
  const [version, iv, tag, body] = sealed.split(".");

  const flipped = Buffer.from(body, "base64url");
  flipped[0] ^= 0xff;

  // Without the authentication tag this would return a different plaintext,
  // and that plaintext would be sent to a customer's collector as their
  // token.
  assert.throws(
    () => open([version, iv, tag, flipped.toString("base64url")].join(".")),
    SealedValueError,
  );
  assert.throws(() => open([version, iv, tag, ""].join(".")), SealedValueError);
});

test("a value from an unknown format is refused, not guessed at", () => {
  for (const bad of ["", "plaintext", "v2.a.b.c", "v1.a.b"]) {
    assert.throws(() => open(bad), SealedValueError, bad);
    assert.equal(isSealed(bad), false, bad);
  }
  assert.equal(isSealed(seal("x")), true);
});
