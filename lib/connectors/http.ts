import { ProviderError, isRetryableStatus } from "@/lib/providers/errors";
import { checkDestination, describeRefusal } from "@/lib/webhooks/destinations";

/**
 * The one HTTP helper every connector uses.
 *
 * The base URL is a customer's own instance — a Zendesk subdomain, a
 * self-hosted Confluence — so it is a destination somebody else chose,
 * dialled from our network. Same problem as an outbound webhook, same check.
 *
 * Errors carry the vendor and a retry decision but never the response body
 * verbatim beyond a short excerpt: a help-centre error page can echo the
 * Authorization header a customer configured, and that ends up in our logs.
 */

export interface VendorRequest {
  vendor: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  fetchImpl?: typeof fetch;
  /** Injectable so the destination check is testable without DNS. */
  resolve?: (hostname: string) => Promise<string[]>;
}

export async function callVendor<T>(request: VendorRequest): Promise<T> {
  const verdict = await checkDestination(request.url, { resolve: request.resolve });
  if (!verdict.ok) {
    throw new ProviderError(
      `${request.vendor}: ${describeRefusal(verdict.reason)}`,
      { provider: request.vendor, retryable: false },
    );
  }

  const fetchImpl = request.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "DemoRiff-Connectors/1",
    ...request.headers,
  };
  if (request.body !== undefined) headers["Content-Type"] ??= "application/json";

  let response: Response;
  try {
    response = await fetchImpl(request.url, {
      method: request.method ?? "GET",
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      // A help centre answering with a redirect to somewhere else would
      // carry the customer's token with it.
      redirect: "manual",
    });
  } catch (error) {
    throw new ProviderError(`${request.vendor} was unreachable: ${String(error)}`, {
      provider: request.vendor,
      retryable: true,
      cause: error,
    });
  }

  if (response.status === 404) return null as T;

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ProviderError(
      `${request.vendor} refused the request: ${response.status} ${detail.slice(0, 200)}`,
      { provider: request.vendor, retryable: isRetryableStatus(response.status), status: response.status },
    );
  }

  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

/** Joins a customer's base URL with a path, without doubling the slash. */
export function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function basicAuth(user: string, secret: string): string {
  return `Basic ${Buffer.from(`${user}:${secret}`, "utf8").toString("base64")}`;
}

export function requireCredential(vendor: string, value: string | undefined, name: string): string {
  if (!value) {
    throw new ProviderError(`${vendor} needs ${name}, and the stored credentials have none.`, {
      provider: vendor,
      retryable: false,
    });
  }
  return value;
}
