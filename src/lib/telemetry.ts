import "server-only";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutcomeCategory =
  | "success"
  | "partial"
  | "timeout"
  | "upstream_4xx"
  | "upstream_5xx"
  | "invalid_payload"
  | "config_missing"
  | "auth_error"
  | "db_error"
  | "unexpected";

export interface ImportCounts {
  attempted: number;
  succeeded: number;
  failed: number;
}

export interface TelemetryEvent {
  correlationId: string;
  route: string;
  operation: string;
  integration?: string;
  durationMs?: number;
  outcome: OutcomeCategory;
  statusCode?: number;
  /** Server-side error detail — never forwarded to API callers. */
  serverError?: string;
  /** Stack trace for the server-side error — never forwarded to API callers. */
  serverStack?: string;
  counts?: ImportCounts;
}

// ---------------------------------------------------------------------------
// PII redaction
// ---------------------------------------------------------------------------

const PII_PATTERNS: [RegExp, string][] = [
  // Full SSN with dashes (e.g. 123-45-6789) — only this form is specific enough
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]"],
  // Bearer / Authorization header values
  [/Bearer\s+\S+/gi, "Bearer [REDACTED]"],
  // URL query-string parameters that carry secrets
  [
    /([?&])(token|key|secret|signature|access_token|api_key|webhook|authorization)=[^&\s#]*/gi,
    "$1$2=[REDACTED]",
  ],
];

export function redactPii(value: string): string {
  let out = value;
  for (const [pattern, replacement] of PII_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core logger
// ---------------------------------------------------------------------------

export function logEvent(event: TelemetryEvent): void {
  const payload = {
    ts: new Date().toISOString(),
    level: event.outcome === "success" ? "info" : "error",
    correlationId: event.correlationId,
    route: event.route,
    operation: event.operation,
    ...(event.integration != null && { integration: event.integration }),
    ...(event.durationMs != null && { durationMs: event.durationMs }),
    outcome: event.outcome,
    ...(event.statusCode != null && { statusCode: event.statusCode }),
    ...(event.serverError != null && { serverError: redactPii(event.serverError) }),
    ...(event.serverStack != null && { serverStack: redactPii(event.serverStack) }),
    ...(event.counts != null && { counts: event.counts }),
  };
  if (event.outcome === "success") {
    console.info(JSON.stringify(payload));
  } else {
    console.error(JSON.stringify(payload));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Classify a caught Error into an outcome category. */
export function classifyError(err: unknown): OutcomeCategory {
  if (!(err instanceof Error)) return "unexpected";
  const msg = err.message.toLowerCase();
  const name = err.name.toLowerCase();
  // AbortError is a client-initiated cancel, not a server-side timeout.
  if (name === "aborterror") return "unexpected";
  if (
    name === "timeouterror" ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  ) {
    return "timeout";
  }
  if (
    msg.includes("connection") ||
    msg.includes("database") ||
    msg.includes("neon") ||
    msg.includes("postgres")
  ) {
    return "db_error";
  }
  return "unexpected";
}

/** Derive an outcome from an upstream HTTP status code. */
export function httpOutcome(status: number): OutcomeCategory {
  if (status >= 200 && status < 300) return "success";
  if (status >= 300 && status < 400) return "upstream_4xx";
  if (status >= 400 && status < 500) return "upstream_4xx";
  return "upstream_5xx";
}

/** Pull or generate a correlation ID for an inbound request. */
export function correlationId(req: NextRequest): string {
  return (
    req.headers.get("x-request-id") ??
    req.headers.get("x-correlation-id") ??
    crypto.randomUUID()
  );
}
