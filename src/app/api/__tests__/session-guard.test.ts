// Regression test for GHSA-8fpg-xm3f-6cx3 (next-auth fail-open advisory).
//
// Auth.js v5 beta <=31 could return a truthy non-null value in certain server
// configuration error states. Routes guarded with bare `if (!session)` would
// pass that check and serve authenticated data to an unauthenticated caller.
// The fix is to check `session?.user` — a truthy session with no user must
// still be treated as unauthenticated.

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ leftJoin: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{}]) }) }) }),
    execute: vi.fn().mockResolvedValue([{}]),
  },
}));

import { GET } from "@/app/api/dashboard/route";

beforeEach(() => {
  mockAuth.mockReset();
});

describe("session guard — GHSA-8fpg-xm3f-6cx3 regression", () => {
  it("returns 401 when auth() returns null", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  // The advisory scenario: auth() returns a truthy object that is not a real
  // session (e.g. an error envelope). `if (!session)` passes; `if (!session?.user)` catches it.
  it("returns 401 when auth() returns a truthy object with no user", async () => {
    mockAuth.mockResolvedValue({});
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 when auth() returns a session with user: null", async () => {
    mockAuth.mockResolvedValue({ user: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("passes the guard when auth() returns a valid session", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "member" } });
    const res = await GET();
    // Guard passed — may succeed or fail on the DB mock, but not 401.
    expect(res.status).not.toBe(401);
  });
});
