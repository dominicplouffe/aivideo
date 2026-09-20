import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Where a webhook may be sent.
 *
 * A customer supplies this URL, and a worker inside our network dials it.
 * That makes every delivery a request an outsider chose the destination of,
 * which is the definition of server-side request forgery — and the worker is
 * exactly the process worth aiming at, since it sits next to the database,
 * the storage credentials and whatever else is on the private network.
 *
 * The check is in `deliver()` rather than only at the API boundary, because
 * a URL can reach the queue by more than one path and a check at one door is
 * a check the other door does not have.
 */

/** RFC1918, loopback, link-local, and the rest of what must never be dialled. */
function isPrivateAddress(address: string): boolean {
  const family = isIP(address);

  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, and cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  if (family === 6) {
    const normalised = address.toLowerCase();
    if (normalised === "::" || normalised === "::1") return true;
    if (normalised.startsWith("fe80")) return true; // link-local
    if (/^f[cd]/.test(normalised)) return true; // unique local
    // An IPv4-mapped address is an IPv4 address wearing a hat. Both spellings
    // have to be handled: `URL` normalises `::ffff:169.254.169.254` to
    // `::ffff:a9fe:a9fe`, so a check written only against the dotted form
    // waves the hex one straight through to the metadata service.
    const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalised);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalised);
    if (hex) {
      const high = parseInt(hex[1], 16);
      const low = parseInt(hex[2], 16);
      return isPrivateAddress(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
    }
    return false;
  }

  return false;
}

export type DestinationVerdict =
  | { ok: true; url: URL; addresses: string[] }
  | { ok: false; reason: "malformed" | "scheme" | "private" | "unresolvable" };

export interface DestinationOptions {
  /** Allows plain http and private addresses. Development only. */
  allowInsecure?: boolean;
  /** Injectable so the check is testable without touching DNS. */
  resolve?: (hostname: string) => Promise<string[]>;
}

async function resolveAll(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

/**
 * Decides whether a destination may be dialled, and returns the addresses it
 * resolved to.
 *
 * **Every** address is checked, not the first. A hostname with one public and
 * one private A record is the oldest way past a filter that stops at the
 * first answer.
 *
 * The addresses come back so the caller can pin the connection to one of
 * them. Without that pinning the check is decorative: DNS is free to return
 * a different answer a millisecond later, and rebinding between the check
 * and the connection is the whole technique.
 */
export async function checkDestination(
  raw: string,
  options: DestinationOptions = {},
): Promise<DestinationVerdict> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const insecure =
    options.allowInsecure ?? process.env.DEMORIFF_ALLOW_INSECURE_WEBHOOKS === "yes";

  // https only. `file:`, `gopher:` and friends are not transports a customer
  // needs, and each one is a different library's parser to be surprised by.
  if (url.protocol !== "https:" && !(insecure && url.protocol === "http:")) {
    return { ok: false, reason: "scheme" };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  // A literal address skips DNS, and skipping DNS is how a filter that only
  // inspects resolved names gets walked past.
  if (isIP(hostname)) {
    if (isPrivateAddress(hostname) && !insecure) return { ok: false, reason: "private" };
    return { ok: true, url, addresses: [hostname] };
  }

  let addresses: string[];
  try {
    addresses = await (options.resolve ?? resolveAll)(hostname);
  } catch {
    return { ok: false, reason: "unresolvable" };
  }

  if (addresses.length === 0) return { ok: false, reason: "unresolvable" };
  if (!insecure && addresses.some(isPrivateAddress)) return { ok: false, reason: "private" };

  return { ok: true, url, addresses };
}

export function describeRefusal(reason: Exclude<DestinationVerdict, { ok: true }>["reason"]): string {
  switch (reason) {
    case "malformed":
      return "The webhook URL could not be parsed.";
    case "scheme":
      return "Webhook URLs must be https.";
    case "private":
      return "That webhook URL resolves to a private or loopback address.";
    case "unresolvable":
      return "That webhook URL's hostname does not resolve.";
  }
}
