import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

/**
 * The wire for outbound deliveries.
 *
 * This exists instead of `fetch` for one reason: it can pin the connection to
 * an address that has already been checked.
 *
 * `fetch` resolves the hostname itself, inside undici, after our check has
 * finished. That gap is the whole of DNS rebinding — an attacker serves a
 * public address with a one-second TTL, our check passes, and the connection
 * a moment later goes to `169.254.169.254`. Checking the name and then
 * handing the name to a different resolver verifies nothing about the socket
 * that actually opens.
 *
 * `node:https` takes a `lookup`, so the address our check approved is the
 * address the socket connects to. Overriding the lookup rather than putting
 * the literal in the URL matters: the hostname stays intact, so SNI is sent
 * and the certificate is validated against the name the customer gave us.
 */

export interface WireResponse {
  status: number;
  text(): Promise<string>;
}

export interface WireRequest {
  method: string;
  headers: Record<string, string>;
  body: string;
  /** The verified address to connect to. */
  address: string;
  signal?: AbortSignal;
}

export type Wire = (url: URL, req: WireRequest) => Promise<WireResponse>;

export const dial: Wire = (url, req) =>
  new Promise<WireResponse>((resolve, reject) => {
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const body = Buffer.from(req.body, "utf8");

    const request = send(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: req.method,
        headers: { ...req.headers, "Content-Length": String(body.byteLength) },
        signal: req.signal,
        // The pin. Every connection attempt for this request resolves to the
        // address the destination check approved, and to nothing else.
        lookup: (_hostname, options, callback) => {
          const family = req.address.includes(":") ? 6 : 4;
          if (typeof options === "object" && options?.all) {
            (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(
              null,
              [{ address: req.address, family }],
            );
            return;
          }
          (callback as (e: null, a: string, f: number) => void)(null, req.address, family);
        },
      },
      (response) => {
        // Redirects are not followed, here or anywhere: a 3xx from a webhook
        // receiver is a misconfiguration, and chasing it would re-open every
        // door the destination check just closed — with our signature header
        // along for the ride.
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          // The body is only ever used for an error message, so there is no
          // reason to hold a receiver's entire response in memory.
          if (bytes < 4096) chunks.push(chunk);
          bytes += chunk.byteLength;
        });
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8").slice(0, 4096);
          resolve({ status: response.statusCode ?? 0, text: async () => text });
        });
        response.on("error", reject);
      },
    );

    request.on("error", reject);
    request.end(body);
  });
