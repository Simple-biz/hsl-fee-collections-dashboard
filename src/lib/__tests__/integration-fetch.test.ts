import { describe, it, expect, vi, beforeEach } from "vitest";
import { integrationFetch, IntegrationError } from "../integration-fetch";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

const makeResponse = (
  status: number,
  body: unknown,
  ok?: boolean,
): Response =>
  ({
    ok: ok ?? (status >= 200 && status < 300),
    status,
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    json: () =>
      typeof body === "string"
        ? Promise.reject(new SyntaxError("Unexpected token"))
        : Promise.resolve(body),
  }) as unknown as Response;

const identity = <T>(v: unknown) => v as T;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("integrationFetch", () => {
  it("returns the validated value on success", async () => {
    mockFetch.mockResolvedValue(makeResponse(200, [{ id: 1 }]));
    const result = await integrationFetch(
      "https://example.com/api",
      { timeoutMs: 5_000 },
      identity,
    );
    expect(result).toEqual([{ id: 1 }]);
  });

  it("returns an empty array when the server legitimately returns []", async () => {
    mockFetch.mockResolvedValue(makeResponse(200, []));
    const result = await integrationFetch(
      "https://example.com/api",
      { timeoutMs: 5_000 },
      (body) => {
        if (!Array.isArray(body)) throw new Error("expected array");
        return body as unknown[];
      },
    );
    expect(result).toEqual([]);
  });

  it("throws IntegrationError(timeout) on AbortSignal timeout", async () => {
    const timeoutError = new DOMException("signal timed out", "TimeoutError");
    mockFetch.mockRejectedValue(timeoutError);

    await expect(
      integrationFetch("https://example.com/api", { timeoutMs: 5_000 }, identity),
    ).rejects.toMatchObject({
      name: "IntegrationError",
      outcome: "timeout",
    });
  });

  it("throws IntegrationError(upstream_5xx) on 500", async () => {
    mockFetch.mockResolvedValue(makeResponse(500, "Internal Server Error"));

    await expect(
      integrationFetch("https://example.com/api", { timeoutMs: 5_000 }, identity),
    ).rejects.toMatchObject({
      name: "IntegrationError",
      outcome: "upstream_5xx",
      status: 500,
    });
  });

  it("throws IntegrationError(upstream_4xx) on 422", async () => {
    mockFetch.mockResolvedValue(makeResponse(422, "Unprocessable Entity"));

    await expect(
      integrationFetch("https://example.com/api", { timeoutMs: 5_000 }, identity),
    ).rejects.toMatchObject({
      name: "IntegrationError",
      outcome: "upstream_4xx",
      status: 422,
    });
  });

  it("throws IntegrationError(invalid_payload) when body is not JSON", async () => {
    const res = {
      ok: true,
      status: 200,
      text: () => Promise.resolve("not-json"),
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as unknown as Response;
    mockFetch.mockResolvedValue(res);

    await expect(
      integrationFetch("https://example.com/api", { timeoutMs: 5_000 }, identity),
    ).rejects.toMatchObject({
      name: "IntegrationError",
      outcome: "invalid_payload",
    });
  });

  it("throws IntegrationError(invalid_payload) when validate rejects the shape", async () => {
    mockFetch.mockResolvedValue(makeResponse(200, { unexpected: true }));

    await expect(
      integrationFetch("https://example.com/api", { timeoutMs: 5_000 }, (body) => {
        if (!Array.isArray(body)) throw new Error("expected array");
        return body;
      }),
    ).rejects.toMatchObject({
      name: "IntegrationError",
      outcome: "invalid_payload",
      message: expect.stringContaining("expected array"),
    });
  });

  it("throws IntegrationError(upstream_5xx) on network error", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      integrationFetch("https://example.com/api", { timeoutMs: 5_000 }, identity),
    ).rejects.toMatchObject({
      name: "IntegrationError",
      outcome: "upstream_5xx",
    });
  });
});

describe("IntegrationError", () => {
  it("carries outcome and optional status", () => {
    const err = new IntegrationError("upstream_4xx", "HTTP 404: not found", 404);
    expect(err.outcome).toBe("upstream_4xx");
    expect(err.status).toBe(404);
    expect(err.message).toBe("HTTP 404: not found");
    expect(err instanceof Error).toBe(true);
  });
});
