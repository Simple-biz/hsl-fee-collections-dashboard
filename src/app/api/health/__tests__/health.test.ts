import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecute = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...args: unknown[]) => mockExecute(...args) } }));
vi.mock("@/lib/telemetry", () => ({ logEvent: vi.fn() }));

import { GET } from "@/app/api/health/route";
import { logEvent } from "@/lib/telemetry";

beforeEach(() => {
  mockExecute.mockReset();
  vi.mocked(logEvent).mockReset();
});

describe("GET /api/health", () => {
  it("returns 200 with status ok and database connected when DB responds", async () => {
    mockExecute.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", database: "connected" });
  });

  it("does not include totalCases or any business data in the response", async () => {
    mockExecute.mockResolvedValue([]);
    const res = await GET();
    const body = await res.json();
    expect(body).not.toHaveProperty("totalCases");
  });

  it("returns 503 with generic status on DB failure", async () => {
    mockExecute.mockRejectedValue(new Error("connect ETIMEDOUT"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ status: "error" });
  });

  it("does not leak raw error message on DB failure", async () => {
    mockExecute.mockRejectedValue(new Error("connect ETIMEDOUT — secret connection string"));
    const res = await GET();
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("secret connection string");
  });

  it("logs diagnostic detail to telemetry on DB failure", async () => {
    const err = new Error("connect ETIMEDOUT");
    mockExecute.mockRejectedValue(err);
    await GET();
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "db_error",
        serverError: "connect ETIMEDOUT",
      }),
    );
  });
});
