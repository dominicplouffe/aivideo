/**
 * A vendor-neutral error for the provider layer.
 *
 * The job queue needs one thing from a failed provider call: whether trying
 * again could plausibly succeed. A 429 or a 503 should back off and retry; a
 * 401 or a malformed request should dead-letter immediately, because burning
 * the retry budget on a bad API key only delays the page. Each adapter maps
 * its vendor's failures onto this shape so `lib/jobs` never has to know which
 * vendor produced them.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly detail: {
      provider: string;
      retryable: boolean;
      status?: number;
      cause?: unknown;
    },
  ) {
    super(message, { cause: detail.cause });
    this.name = "ProviderError";
  }

  get retryable() {
    return this.detail.retryable;
  }
}

/**
 * HTTP status to retry decision, shared by the adapters that speak REST.
 *
 * 408, 409 and 429 are transient by definition. Everything at 500 and above
 * is the vendor's problem, not ours, so it is worth a second attempt. The 4xx
 * range otherwise means the request itself is wrong and will stay wrong.
 */
export function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 409 || status === 429) return true;
  return status >= 500;
}
