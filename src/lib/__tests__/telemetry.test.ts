import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  redactPii,
  logEvent,
  classifyError,
  httpOutcome,
  type TelemetryEvent,
} from "../telemetry";

// ---------------------------------------------------------------------------
// redactPii
// ---------------------------------------------------------------------------
describe("redactPii", () => {
  it("masks full SSN with dashes", () => {
    expect(redactPii("SSN is 123-45-6789 on record")).toBe("SSN is [SSN] on record");
  });

  it("does NOT mask bare 9-digit numbers (too broad — masks legitimate IDs)", () => {
    // 9-digit numbers like Chronicle client IDs must not be redacted
    expect(redactPii("id=112221000")).toBe("id=112221000");
  });

  it("masks Bearer token", () => {
    expect(redactPii("Authorization: Bearer abc123xyz")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
  });

  it("masks URL token query param", () => {
    const url = "https://example.com/doc?token=super-secret&foo=bar";
    expect(redactPii(url)).toBe("https://example.com/doc?token=[REDACTED]&foo=bar");
  });

  it("masks URL key query param", () => {
    const url = "https://api.example.com/v1?key=SECRETKEY123";
    expect(redactPii(url)).toBe("https://api.example.com/v1?key=[REDACTED]");
  });

  it("leaves unrelated text untouched", () => {
    const msg = "case imported successfully: 5 of 6";
    expect(redactPii(msg)).toBe(msg);
  });
});

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------
describe("classifyError", () => {
  it("returns 'timeout' for TimeoutError", () => {
    const err = new Error("Request timed out");
    err.name = "TimeoutError";
    expect(classifyError(err)).toBe("timeout");
  });

  it("returns 'timeout' for message containing 'timeout'", () => {
    expect(classifyError(new Error("upstream timeout after 30s"))).toBe("timeout");
  });

  it("returns 'unexpected' for AbortError (client cancel, not a timeout)", () => {
    const err = new DOMException("The user aborted a request", "AbortError");
    expect(classifyError(err)).toBe("unexpected");
  });

  it("returns 'db_error' for connection errors", () => {
    expect(classifyError(new Error("connection refused to postgres"))).toBe("db_error");
  });

  it("returns 'unexpected' for generic errors", () => {
    expect(classifyError(new Error("something went wrong"))).toBe("unexpected");
  });

  it("returns 'unexpected' for non-Error values", () => {
    expect(classifyError("some string")).toBe("unexpected");
    expect(classifyError(null)).toBe("unexpected");
  });
});

// ---------------------------------------------------------------------------
// httpOutcome
// ---------------------------------------------------------------------------
describe("httpOutcome", () => {
  it("maps 2xx to success", () => {
    expect(httpOutcome(200)).toBe("success");
    expect(httpOutcome(201)).toBe("success");
  });

  it("maps 4xx to upstream_4xx", () => {
    expect(httpOutcome(400)).toBe("upstream_4xx");
    expect(httpOutcome(404)).toBe("upstream_4xx");
  });

  it("maps 3xx to upstream_4xx (redirects treated as upstream errors)", () => {
    expect(httpOutcome(301)).toBe("upstream_4xx");
    expect(httpOutcome(302)).toBe("upstream_4xx");
  });

  it("maps 5xx to upstream_5xx", () => {
    expect(httpOutcome(500)).toBe("upstream_5xx");
    expect(httpOutcome(503)).toBe("upstream_5xx");
  });
});

// ---------------------------------------------------------------------------
// logEvent
// ---------------------------------------------------------------------------
describe("logEvent", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("calls console.info for success outcome", () => {
    const event: TelemetryEvent = {
      correlationId: "req-1",
      route: "/api/test",
      operation: "test.op",
      outcome: "success",
    };
    logEvent(event);
    expect(infoSpy).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("info");
    expect(parsed.outcome).toBe("success");
    expect(parsed.correlationId).toBe("req-1");
  });

  it("calls console.error for non-success outcomes", () => {
    logEvent({
      correlationId: "req-2",
      route: "/api/test",
      operation: "test.op",
      outcome: "timeout",
    });
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(infoSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("error");
  });

  it("calls console.error for 'partial' outcome", () => {
    logEvent({
      correlationId: "req-2b",
      route: "/api/chronicle/import",
      operation: "chronicle.import",
      outcome: "partial",
      counts: { attempted: 5, succeeded: 2, failed: 3 },
    });
    expect(errorSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(parsed.outcome).toBe("partial");
    expect(parsed.level).toBe("error");
  });

  it("redacts PII in serverStack before logging", () => {
    logEvent({
      correlationId: "req-sk",
      route: "/api/test",
      operation: "test.op",
      outcome: "unexpected",
      serverError: "something failed",
      serverStack: "Error: ssn=123-45-6789 failed\n  at route.ts:42",
    });
    const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(parsed.serverStack).not.toContain("123-45-6789");
    expect(parsed.serverStack).toContain("[SSN]");
    expect(parsed.serverStack).toContain("at route.ts:42");
  });

  it("redacts PII in serverError before logging", () => {
    logEvent({
      correlationId: "req-3",
      route: "/api/test",
      operation: "test.op",
      outcome: "unexpected",
      serverError: "ssn=123-45-6789 caused an error",
    });
    const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(parsed.serverError).not.toContain("123-45-6789");
    expect(parsed.serverError).toContain("[SSN]");
  });

  it("includes optional fields when provided", () => {
    logEvent({
      correlationId: "req-4",
      route: "/api/chronicle/import",
      operation: "chronicle.import",
      integration: "chronicle",
      durationMs: 1200,
      outcome: "success",
      counts: { attempted: 3, succeeded: 2, failed: 1 },
    });
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed.integration).toBe("chronicle");
    expect(parsed.durationMs).toBe(1200);
    expect(parsed.counts).toEqual({ attempted: 3, succeeded: 2, failed: 1 });
  });

  it("omits undefined optional fields", () => {
    logEvent({
      correlationId: "req-5",
      route: "/api/test",
      operation: "test.op",
      outcome: "success",
    });
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed).not.toHaveProperty("integration");
    expect(parsed).not.toHaveProperty("durationMs");
    expect(parsed).not.toHaveProperty("serverError");
    expect(parsed).not.toHaveProperty("counts");
  });
});
