/**
 * Regression guard for the inbound-calls auth hardening (issue #392).
 *
 * GET /api/inbound-calls is consumed cross-page (notifications backlog tab)
 * so it stays auth-only. POST/PATCH/DELETE are only used by the inbound_calls
 * page and must be gated on inbound_calls page access — any authenticated
 * user without that page should get 403, not be able to mutate call records.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";
import type { PageKey } from "@/lib/access/pages";
import type { CapabilityKey } from "@/lib/access/capabilities";

// ---- mocks ----

vi.mock("server-only", () => ({}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/auth-helpers", () => ({
  requirePageAccess: vi.fn(),
  requireCapability: vi.fn(),
  guardStatus: vi.fn((e: "Unauthenticated" | "Forbidden") => (e === "Unauthenticated" ? 401 : 403)),
  sessionHasPageAccess: vi.fn(),
  sessionHasCapability: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 1, weekStart: "2024-01-01", callDate: "2024-01-01", createdAt: new Date(), number: null, transcript: null, caseLink: null, specialistAssigned: null, calledBackResolved: false }]) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 1, weekStart: "2024-01-01", callDate: "2024-01-01", createdAt: new Date(), number: null, transcript: null, caseLink: null, specialistAssigned: null, calledBackResolved: false }]) })) })) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  inboundCallRecords: { weekStart: "weekStart", createdAt: "createdAt", callDate: "callDate", id: "id" },
}));

vi.mock("@/lib/formatters", () => ({
  getMondayOfDate: vi.fn((d: string) => d),
}));

import { auth } from "@/auth";
import { requirePageAccess, requireCapability } from "@/lib/auth-helpers";
import { GET, POST } from "@/app/api/inbound-calls/route";
import { PATCH, DELETE } from "@/app/api/inbound-calls/[id]/route";

const mockAuth = vi.mocked(auth);
const mockRequirePage = vi.mocked(requirePageAccess);
const mockRequireCap = vi.mocked(requireCapability);

const memberSession: Session = {
  user: {
    id: "2",
    name: "Member",
    email: "member@example.com",
    role: "member",
    mustChangePassword: false,
    pages: [] as PageKey[],
    capabilities: [] as CapabilityKey[],
  },
  expires: "9999",
};

const allowedSession: Session = {
  user: {
    id: "3",
    name: "Allowed",
    email: "allowed@example.com",
    role: "lead",
    mustChangePassword: false,
    pages: ["inbound_calls"] as PageKey[],
    capabilities: [] as CapabilityKey[],
  },
  expires: "9999",
};

const pageOnlySession: Session = {
  user: {
    id: "4",
    name: "PageOnly",
    email: "pageonly@example.com",
    role: "lead",
    mustChangePassword: false,
    pages: ["inbound_calls"] as PageKey[],
    capabilities: [] as CapabilityKey[],
  },
  expires: "9999",
};

const deleteCapSession: Session = {
  user: {
    id: "5",
    name: "Admin",
    email: "admin@example.com",
    role: "admin",
    mustChangePassword: false,
    pages: ["inbound_calls"] as PageKey[],
    capabilities: ["inboundCalls.delete"] as CapabilityKey[],
  },
  expires: "9999",
};

type PageGuardResult =
  | { ok: true; session: Session }
  | { ok: false; error: "Unauthenticated" | "Forbidden" };

const setGuard = (result: PageGuardResult) => {
  mockRequirePage.mockResolvedValue(result as Awaited<ReturnType<typeof requirePageAccess>>);
};

const makePostReq = (body: Record<string, unknown> = { callDate: "2024-01-15" }) =>
  new Request("http://localhost/api/inbound-calls", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const makePatchReq = (body: Record<string, unknown> = {}) =>
  new Request("http://localhost/api/inbound-calls/1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const makeDeleteReq = () =>
  new Request("http://localhost/api/inbound-calls/1", { method: "DELETE" });

const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) });

// ---- GET /api/inbound-calls (auth-only) ----

describe("GET /api/inbound-calls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 — unauthenticated", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue(null as any);
    const req = new Request("http://localhost/api/inbound-calls?week=2024-01-15");
    const res = await GET(req as never);
    expect(res.status).toBe(401);
  });

  it("200 — any authenticated user (cross-page consumer)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAuth.mockResolvedValue(memberSession as any);
    const req = new Request("http://localhost/api/inbound-calls?week=2024-01-15");
    const res = await GET(req as never);
    expect(res.status).toBe(200);
    expect(mockRequirePage).not.toHaveBeenCalled();
  });
});

// ---- POST /api/inbound-calls ----

describe("POST /api/inbound-calls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 — unauthenticated", async () => {
    setGuard({ ok: false, error: "Unauthenticated" });
    const res = await POST(makePostReq() as never);
    expect(res.status).toBe(401);
    expect(mockRequirePage).toHaveBeenCalledWith("inbound_calls");
  });

  it("403 — authenticated but lacks inbound_calls page access", async () => {
    setGuard({ ok: false, error: "Forbidden" });
    const res = await POST(makePostReq() as never);
    expect(res.status).toBe(403);
  });

  it("201 — inbound_calls page access granted", async () => {
    setGuard({ ok: true, session: allowedSession });
    const res = await POST(makePostReq() as never);
    expect(res.status).toBe(201);
  });
});

// ---- PATCH /api/inbound-calls/[id] ----

describe("PATCH /api/inbound-calls/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 — unauthenticated", async () => {
    setGuard({ ok: false, error: "Unauthenticated" });
    const res = await PATCH(makePatchReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(401);
    expect(mockRequirePage).toHaveBeenCalledWith("inbound_calls");
  });

  it("403 — authenticated but lacks inbound_calls page access", async () => {
    setGuard({ ok: false, error: "Forbidden" });
    const res = await PATCH(makePatchReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(403);
  });

  it("200 — inbound_calls page access granted", async () => {
    setGuard({ ok: true, session: allowedSession });
    const res = await PATCH(makePatchReq({ callDate: "2024-02-01", number: "555-1234" }) as never, makeCtx("1") as never);
    expect(res.status).toBe(200);
  });
});

type CapGuardResult =
  | { ok: true; session: Session }
  | { ok: false; error: "Unauthenticated" | "Forbidden" };

const setCapGuard = (result: CapGuardResult) => {
  mockRequireCap.mockResolvedValue(result as Awaited<ReturnType<typeof requireCapability>>);
};

// ---- DELETE /api/inbound-calls/[id] ----

describe("DELETE /api/inbound-calls/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 — unauthenticated", async () => {
    setGuard({ ok: false, error: "Unauthenticated" });
    const res = await DELETE(makeDeleteReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(401);
    expect(mockRequirePage).toHaveBeenCalledWith("inbound_calls");
  });

  it("403 — authenticated but lacks inbound_calls page access", async () => {
    setGuard({ ok: false, error: "Forbidden" });
    const res = await DELETE(makeDeleteReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(403);
    expect(mockRequireCap).not.toHaveBeenCalled();
  });

  it("403 — has page access but lacks inboundCalls.delete capability", async () => {
    setGuard({ ok: true, session: pageOnlySession });
    setCapGuard({ ok: false, error: "Forbidden" });
    const res = await DELETE(makeDeleteReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(403);
    expect(mockRequireCap).toHaveBeenCalledWith("inboundCalls.delete");
  });

  it("200 — has page access and inboundCalls.delete capability", async () => {
    setGuard({ ok: true, session: deleteCapSession });
    setCapGuard({ ok: true, session: deleteCapSession });
    const res = await DELETE(makeDeleteReq() as never, makeCtx("1") as never);
    expect(res.status).toBe(200);
  });
});
