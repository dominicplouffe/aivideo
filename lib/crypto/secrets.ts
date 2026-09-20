import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Encryption for secrets this product is given rather than issues.
 *
 * Most credentials here are never stored: a session token is kept as a hash,
 * a SCIM token likewise, because we only ever need to recognise them again.
 * A customer's SIEM token is different — it has to be *presented* to their
 * collector on every delivery, so it must come back out. Hashing is not an
 * option and plaintext is not an answer.
 *
 * So: AES-256-GCM, which authenticates as well as encrypts. Without the tag
 * a ciphertext can be truncated or bit-flipped into a different plaintext,
 * and a decryption that silently returns rubbish would be sent to a
 * customer's collector as their token.
 *
 * The output is versioned. Whatever replaces this scheme will have to read
 * what it wrote, and a format with no version is a migration nobody can
 * perform safely.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

/**
 * The key, derived once from the environment.
 *
 * Deriving with scrypt rather than trusting the variable to be 32 bytes of
 * entropy: people set these to a passphrase, and a passphrase used directly
 * as an AES key is a short key padded with nothing.
 */
let cached: Buffer | null = null;

function key(): Buffer {
  if (cached) return cached;

  const material = process.env.DEMORIFF_SECRET_KEY;
  if (!material) {
    if (process.env.NODE_ENV === "production") {
      // A shared development constant in production would mean every
      // deployment can read every other deployment's stored secrets.
      throw new Error("DEMORIFF_SECRET_KEY must be set in production.");
    }
    cached = scryptSync("development-secret-key", "demoriff/secrets/v1", 32);
    return cached;
  }

  cached = scryptSync(material, "demoriff/secrets/v1", 32);
  return cached;
}

/** For tests, which change the environment between cases. */
export function resetKeyCache(): void {
  cached = null;
}

export function seal(plaintext: string): string {
  // A fresh IV per message, always. Reusing one under GCM does not merely
  // leak equality — it exposes the authentication key, and every message
  // under that key becomes forgeable.
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}

export class SealedValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealedValueError";
  }
}

export function open(sealed: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SealedValueError("That value was not sealed by this version.");
  }

  const [, iv, tag, body] = parts;
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // `final()` is where the tag is checked. A failure here means the
    // ciphertext was altered or the key is wrong, and both are worth
    // refusing loudly rather than returning something plausible.
    throw new SealedValueError("That value failed its authentication check.");
  }
}

/** Whether a stored column holds something this module can open. */
export function isSealed(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${VERSION}.`) && value.split(".").length === 4;
}
