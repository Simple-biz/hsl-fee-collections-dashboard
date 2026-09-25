/**
 * Shared fetch wrapper for external integrations (Chronicle, MyCase, n8n webhooks).
 *
 * Callers can distinguish timeout / upstream failure / invalid payload from a
 * valid empty-array result by catching IntegrationError and checking `.outcome`.
 */

export type IntegrationOutcome =
  | "success"
  | "timeout"
  | "upstream_4xx"
  | "upstream_5xx"
  | "invalid_payload"
  | "config_missing";

export class IntegrationError extends Error {
  readonly outcome: Exclude<IntegrationOutcome, "success">;
  readonly status?: number;

  constructor(
    outcome: Exclude<IntegrationOutcome, "success">,
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "IntegrationError";
    this.outcome = outcome;
    this.status = status;
  }
}

/**
 * Fetch `url` with a mandatory timeout. Throws `IntegrationError` on:
 *  - timeout (AbortSignal fires before the server responds)
 *  - non-2xx HTTP status
 *  - non-JSON or structurally invalid response body
 *
 * `validate` receives the parsed JSON body and must return `T` or throw.
 * Any thrown error from `validate` is wrapped as `invalid_payload`.
 */
export async function integrationFetch<T>(
  url: string,
  init: Omit<RequestInit, "signal"> & { timeoutMs: number },
  validate: (body: unknown) => T,
): Promise<T> {
  const { timeoutMs, ...fetchInit } = init;

  let res: Response;
  try {
    res = await fetch(url, {
      ...fetchInit,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      throw new IntegrationError(
        "timeout",
        `Request timed out after ${timeoutMs}ms`,
      );
    }
    throw new IntegrationError("upstream_5xx", `Network error: ${String(e)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const outcome: Exclude<IntegrationOutcome, "success"> =
      res.status >= 500 ? "upstream_5xx" : "upstream_4xx";
    throw new IntegrationError(
      outcome,
      `HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      res.status,
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new IntegrationError(
      "invalid_payload",
      "Response body is not valid JSON",
    );
  }

  try {
    return validate(body);
  } catch (e) {
    throw new IntegrationError(
      "invalid_payload",
      `Response payload failed validation: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
